/**
 * Price optimization as a routing input.
 *
 * Every rate in `SUBSTRATE_PRICES` is a published list price, with the source
 * URL and the date it was read in the comment above it. A rate that is not
 * published is `known: false` -- never a guess. Routing on an invented number
 * is worse than routing on an admitted gap, so `cheapestFirst` puts unpriced
 * lanes LAST: an unknown price is never mistaken for a cheap one.
 *
 * TOTAL COST TO SUCCESSFUL RESULT. The unit this model exists to optimize is
 * one completed agent run, not one sandbox minute. Three consequences:
 *
 *   1. A failed lane still bills. Failover walks primary -> backups, and
 *      every attempt that provisioned a sandbox spent money before it was
 *      torn down. `costToSuccessfulResult` sums the whole walk and reports
 *      what the failures cost, because that is the number a cheaper-per-hour
 *      lane with a worse success rate loses on.
 *   2. Install time is part of the run. A cold harness install measured 6-29s
 *      for the npm harnesses and past 15 minutes for hermes
 *      (docs/MUX-RESULTS.md), all of it on the clock. Pass the full sandbox
 *      wall-clock in `durationMs`, not just the agent turn.
 *   3. Model tokens usually dominate compute. Ten minutes of a 2 vCPU sandbox
 *      is around a cent on every priced lane here, while a single Claude Code
 *      turn measured $0.0107. Pass `modelCostUsd` so substrate choice is
 *      compared against the number it actually moves.
 *
 * Storage is deliberately out of scope: it is metered per account over time
 * rather than per run, so charging it to a run would double-count it across
 * concurrent machines.
 */

import type { SubstrateKind } from "./types.js";

/** Vendors that meter memory in decimal GB, not GiB, bill more units. */
export const MIB_PER_GB = 1_000_000_000 / 1_048_576;

const MS_PER_HOUR = 3_600_000;

export type MemoryUnit = "GiB" | "GB";

/**
 * "wall-clock" bills for every second the sandbox is up. "active-cpu" bills
 * only CPU actually consumed, which is why a lane with a higher headline vCPU
 * rate can still win an agent run: most of an agent turn is spent waiting on
 * the model, and that wait is unbilled CPU there.
 */
export type CpuBasis = "wall-clock" | "active-cpu";

export type KnownPrice = {
	known: true;
	vcpuHourUsd: number;
	memoryHourUsd: number;
	memoryUnit: MemoryUnit;
	cpuBasis: CpuBasis;
	/** Charged once per create(), where the substrate meters creations. */
	creationUsd?: number;
	/** Floor on billed memory time, where the vendor rounds up to it. */
	memoryMinimumMs?: number;
	/** Source URL plus the date the rate was read. */
	source: string;
	/** Caveats a reader needs before trusting the number. */
	note?: string;
};

export type UnknownPrice = {
	known: false;
	/** What was checked and why it came back empty; surfaced to the user. */
	reason: string;
};

export type SubstratePrice = KnownPrice | UnknownPrice;

export type PriceTable = Record<SubstrateKind, SubstratePrice>;

export const SUBSTRATE_PRICES: PriceTable = {
	// https://e2b.dev/pricing (read 2026-08-01): "$0.000014/s" per vCPU (the
	// tier list is linear -- 1 vCPU $0.000014/s, 2 vCPUs $0.000028/s, 8 vCPUs
	// $0.000112/s) and "$0.0000045/GiB/s" for memory, charged "per second of a
	// running sandbox". Converted to hours here: 0.000014 * 3600 = 0.0504 and
	// 0.0000045 * 3600 = 0.0162.
	e2b: {
		known: true,
		vcpuHourUsd: 0.0504,
		memoryHourUsd: 0.0162,
		memoryUnit: "GiB",
		cpuBasis: "wall-clock",
		source: "https://e2b.dev/pricing (read 2026-08-01)",
		note: "Monthly plan fees (Hobby $0/mo, Pro $150/mo) are not included; this is marginal usage only.",
	},
	// NOT PUBLISHED by Fly anywhere we can retrieve. Checked 2026-08-01:
	// https://fly.io/sprites and https://sprites.dev (redirects there) serve
	// only CLI instructions, https://fly.io/docs/about/pricing/ covers Machines
	// with no Sprites section, https://fly.io/docs/sprites/pricing/ and
	// https://sprites.dev/pricing are 404. Fly does publish Sprites STORAGE --
	// https://community.fly.io/t/cheaper-sprites-storage/26889 (2026-01-20):
	// storage in Tigris "$0.02/GB-month" plus "hot" NVMe "$0.5/GB-month" -- and
	// subscription tiers $20-$2000/mo
	// (https://community.fly.io/t/more-sprites-plans/26857, 2026-01-16), but
	// neither is a compute rate. Third-party comparisons quote $0.07/CPU-hour
	// and $0.04375/GB-hour; that is not a vendor page, so it stays out of the
	// table and this lane sorts last until Fly publishes the rate.
	sprites: {
		known: false,
		reason:
			"Fly publishes no Sprites compute rate: fly.io/sprites and sprites.dev serve only CLI docs, fly.io/docs/about/pricing has no Sprites section, and both /pricing paths 404 (checked 2026-08-01). Only storage ($0.02/GB-month, hot $0.5/GB-month) and $20-$2000/mo plan tiers are published.",
	},
	// https://vercel.com/docs/sandbox/pricing (page last_updated 2026-06-16,
	// read 2026-08-01): Sandbox Active CPU "$0.128/hour" per vCPU, Provisioned
	// Memory "$0.0212/GB-hour", Sandbox Creations "$0.60/1M" ("$0.0000006 per
	// creation"), and memory "billed in 1 minute minimum increments". Active
	// CPU excludes I/O wait: "Time spent waiting for I/O ... does not count
	// toward Active CPU". Cross-checked against the page's own worked example
	// (30 min, 4 vCPU, 8 GB): 0.5 * 4 * 0.128 = $0.256 against its "$0.26",
	// and 8 * 0.5 * 0.0212 = $0.0848 against its "$0.08".
	vercel: {
		known: true,
		vcpuHourUsd: 0.128,
		memoryHourUsd: 0.0212,
		memoryUnit: "GB",
		cpuBasis: "active-cpu",
		creationUsd: 0.0000006,
		memoryMinimumMs: 60_000,
		source: "https://vercel.com/docs/sandbox/pricing (read 2026-08-01)",
		note: "Pro/Enterprise rates; Hobby includes 5 CPU-hours and 420 GB-hours per month at no cost. Data transfer out ($0.15/GB) is not modeled.",
	},
	// https://www.dedaluslabs.ai/pricing (read 2026-08-01): "$0.04536 per vCPU
	// - hour" and "$0.01458 per GiB - hour", billed per second while running,
	// "$0/hr idle". Cross-checked against the page's own tier examples: 1 vCPU
	// + 2 GiB = 0.04536 + 0.02916 = $0.0745/hr against its "~$0.075/hr", and 2
	// vCPU + 4 GiB = $0.149/hr against its "~$0.149/hr".
	dedalus: {
		known: true,
		vcpuHourUsd: 0.04536,
		memoryHourUsd: 0.01458,
		memoryUnit: "GiB",
		cpuBasis: "wall-clock",
		source: "https://www.dedaluslabs.ai/pricing (read 2026-08-01)",
		note: "Idle time is not billed, so a parked always-on machine costs nothing until it runs.",
	},
};

/** Substrate defaults converge on 2 vCPU, so that is the comparison size. */
export const DEFAULT_VCPU = 2;
export const DEFAULT_MEMORY_MIB = 2048;

export type RunShape = {
	/** Wall-clock the sandbox is up, harness install included. */
	durationMs: number;
	vcpu?: number;
	memoryMib?: number;
	/**
	 * Share of `durationMs` the CPU is actually busy, 0..1. Ignored on
	 * wall-clock lanes, which bill idle seconds too.
	 */
	cpuUtilization?: number;
	/** create() calls to bill; 1 by default, 0 when reusing a machine. */
	creations?: number;
	/** Model spend for this run, added verbatim (RunResult.costUsd). */
	modelCostUsd?: number;
};

/**
 * A 10-minute run at the shared 2 vCPU / 2 GiB default: long enough that a
 * cold install is included, and identical across lanes so the comparison is
 * about price rather than about sizing.
 */
export const DEFAULT_RUN_SHAPE: RunShape = {
	durationMs: 600_000,
	vcpu: DEFAULT_VCPU,
	memoryMib: DEFAULT_MEMORY_MIB,
};

export type CostLine = {
	label: string;
	usd: number;
	/** The arithmetic, so a dashboard can show its work. */
	detail: string;
};

export type CostEstimate = {
	substrate: SubstrateKind;
	known: boolean;
	/** Compute plus creation charges; absent when the price is unknown. */
	computeUsd?: number;
	/** Passed through from the run shape, priced lane or not. */
	modelUsd?: number;
	/** compute + model. Absent when the price is unknown, never zero-filled. */
	totalUsd?: number;
	lines: CostLine[];
	/** Set only when the substrate has no published price. */
	unknownReason?: string;
	/**
	 * True when compute is an upper bound: an active-cpu lane charged at full
	 * utilization bills less in practice, since model wait is not CPU time.
	 */
	upperBound?: boolean;
	source?: string;
};

function modelLine(usd: number): CostLine {
	return { label: "model", usd, detail: `reported model spend $${usd}` };
}

/** Cost of one run on one substrate. Pure arithmetic over list prices. */
export function estimate(
	substrate: SubstrateKind,
	shape: RunShape,
	prices: PriceTable = SUBSTRATE_PRICES,
): CostEstimate {
	const price = prices[substrate];
	const modelUsd = shape.modelCostUsd;
	if (!price.known) {
		// No compute figure and no total: a caller that reads totalUsd must
		// get `undefined` here, never a model-only number that would rank
		// this lane as the cheapest available.
		return {
			substrate,
			known: false,
			modelUsd,
			lines: modelUsd === undefined ? [] : [modelLine(modelUsd)],
			unknownReason: price.reason,
		};
	}

	const hours = shape.durationMs / MS_PER_HOUR;
	const vcpu = shape.vcpu ?? DEFAULT_VCPU;
	const memoryMib = shape.memoryMib ?? DEFAULT_MEMORY_MIB;
	const utilization =
		price.cpuBasis === "active-cpu" ? (shape.cpuUtilization ?? 1) : 1;
	const creations = shape.creations ?? 1;

	const cpuHours = hours * vcpu * utilization;
	const cpuUsd = cpuHours * price.vcpuHourUsd;
	const memoryUnits =
		memoryMib / (price.memoryUnit === "GiB" ? 1024 : MIB_PER_GB);
	const memoryHours =
		Math.max(shape.durationMs, price.memoryMinimumMs ?? 0) / MS_PER_HOUR;
	const memoryUsd = memoryUnits * memoryHours * price.memoryHourUsd;
	const creationUsd = creations * (price.creationUsd ?? 0);

	const lines: CostLine[] = [
		{
			label: "cpu",
			usd: cpuUsd,
			detail: `${cpuHours} ${price.cpuBasis} vCPU-hours x $${price.vcpuHourUsd}/vCPU-hour`,
		},
		{
			label: "memory",
			usd: memoryUsd,
			detail: `${memoryUnits} ${price.memoryUnit} x ${memoryHours} hours x $${price.memoryHourUsd}/${price.memoryUnit}-hour`,
		},
	];
	if (creationUsd > 0) {
		lines.push({
			label: "creations",
			usd: creationUsd,
			detail: `${creations} x $${price.creationUsd}/creation`,
		});
	}
	if (modelUsd !== undefined) lines.push(modelLine(modelUsd));

	const computeUsd = cpuUsd + memoryUsd + creationUsd;
	return {
		substrate,
		known: true,
		computeUsd,
		modelUsd,
		totalUsd: computeUsd + (modelUsd ?? 0),
		lines,
		upperBound: price.cpuBasis === "active-cpu" && utilization === 1,
		source: price.source,
	};
}

/**
 * Order a route by estimated total, unpriced lanes last.
 *
 * Array#sort is stable per spec, so equal totals -- and every unknown-price
 * lane, which all compare equal to each other -- keep the caller's order.
 * That order is the primary -> backups preference, and reshuffling it on a
 * tie would silently override an operator's explicit route.
 */
export function cheapestFirst(
	candidates: readonly SubstrateKind[],
	shape: RunShape = DEFAULT_RUN_SHAPE,
	prices: PriceTable = SUBSTRATE_PRICES,
): CostEstimate[] {
	const estimates = candidates.map((substrate) =>
		estimate(substrate, shape, prices),
	);
	return estimates.sort((left, right) => {
		const leftUnknown = left.totalUsd === undefined;
		const rightUnknown = right.totalUsd === undefined;
		// Compared as booleans rather than by subtracting Infinities, which
		// would hand the comparator a NaN and forfeit the stability above.
		if (leftUnknown !== rightUnknown) return leftUnknown ? 1 : -1;
		if (leftUnknown) return 0;
		return (left.totalUsd as number) - (right.totalUsd as number);
	});
}

export type RunLeg = {
	substrate: SubstrateKind;
	shape: RunShape;
	/** Did this leg produce the completed run? */
	succeeded: boolean;
};

export type RunCostToResult = {
	/** Sum of the legs that could be priced. See `complete`. */
	knownUsd: number;
	/** Priced spend on legs that did not produce the result. */
	wastedUsd: number;
	/** False when any leg is unpriced, so `knownUsd` is a floor. */
	complete: boolean;
	/** Lanes with no published price, named so the gap is visible. */
	unpriced: SubstrateKind[];
	legs: CostEstimate[];
};

/**
 * What one completed run cost end to end, failed failover legs included.
 *
 * This is the routing objective: a lane that is 30% cheaper per hour and
 * fails one attempt in three is more expensive per result than the lane it
 * undercuts.
 */
export function costToSuccessfulResult(
	legs: readonly RunLeg[],
	prices: PriceTable = SUBSTRATE_PRICES,
): RunCostToResult {
	const estimates = legs.map((leg) => estimate(leg.substrate, leg.shape, prices));
	let knownUsd = 0;
	let wastedUsd = 0;
	const unpriced: SubstrateKind[] = [];
	estimates.forEach((leg, index) => {
		if (leg.totalUsd === undefined) {
			unpriced.push(leg.substrate);
			return;
		}
		knownUsd += leg.totalUsd;
		if (!legs[index].succeeded) wastedUsd += leg.totalUsd;
	});
	return {
		knownUsd,
		wastedUsd,
		complete: unpriced.length === 0,
		unpriced,
		legs: estimates,
	};
}
