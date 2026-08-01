/**
 * Per-substrate sandbox compute prices, as a ROUTING input (roadmap 4.1).
 *
 * The rates come from `web/data/benchmarks.json` (`profiles[].pricing`), which
 * already carries per-provider figures WITH provenance and until now only fed
 * the display matrix. This module is the reader that promotes them to a routing
 * input, and it promotes only what the seed calls `basis: "published"`.
 *
 * WHY THE REFUSAL IS THE POINT. Two of the four lanes publish no compute rate
 * (sprites, dedalus in today's seed). The retired path in `./cost.ts` handed
 * those lanes one hard-coded rate table written for Dedalus, which made an
 * unpriced lane look precisely priced -- the worst of the three options, since
 * a router cannot tell a wrong number from a right one. Here an unpriced lane
 * gets no figure at all: `sandboxMillicents` is absent (never 0, which would
 * rank it cheapest), `known` is false, and `unknownReason` names the seed field
 * that came back empty so a caller can say why the lane is unranked. The lane
 * stays perfectly routable; it is only unranked ON PRICE.
 *
 * VOCABULARY. Deliberately the same as `src/mux/cost.ts` so the hosted half and
 * the mux half of one product stay comparable: `known`/`reason` per lane,
 * memory metered in `GiB` or decimal `GB` per vendor, `MIB_PER_GB` for the
 * decimal lanes, and unpriced lanes sorted LAST rather than compared. Two
 * differences, both forced by the source:
 *
 *   - Money is millicents (1/1000 cent) here, USD there. Millicents is the unit
 *     every hosted cost column already uses (`run_traces.cost_millicents`,
 *     `machine_costs.*`), and mixing units in one table is how a 100000x error
 *     ships. `MILLICENTS_PER_USD` is the only conversion.
 *   - The seed has no `cpuBasis` and no creation fee, so neither is modeled.
 *     `src/mux/cost.ts` records Vercel as `active-cpu` (model wait is unbilled
 *     there) plus $0.0000006 per creation; a lane billed on active CPU is
 *     therefore priced here as an UPPER bound. Scaling by a utilization the
 *     seed cannot cite would be a guess, so it is not done -- see the return
 *     notes for the seed fields that would fix it.
 *
 * Storage is out of scope, matching `src/mux/cost.ts`: it is metered per
 * account over time rather than per run, so charging it to a run double-counts
 * it across concurrent machines. Every `storagePerGibHour` in today's seed is
 * `unknown` anyway.
 */

import benchmarksSeed from "@/data/benchmarks.json";
import { PROVIDER_KINDS, type ProviderKind } from "@/lib/user-config/schema";

/** 1 USD = 100 cents = 100_000 millicents. Matches `formatMillicents`. */
export const MILLICENTS_PER_USD = 100_000;

/** Vendors that meter memory in decimal GB, not GiB, bill more units. */
export const MIB_PER_GB = 1_000_000_000 / 1_048_576;

const MS_PER_HOUR = 3_600_000;

/** The seed's own provenance vocabulary (`PriceRate.basis`). */
export type RateBasis = "published" | "estimate" | "unknown";

export type MemoryUnit = "GiB" | "GB";

export type KnownSubstratePrice = {
	known: true;
	vcpuHourUsd: number;
	memoryHourUsd: number;
	memoryUnit: MemoryUnit;
	/** Only ever "published": nothing else may price a route. */
	rateBasis: "published";
	/** The seed's caveat for this lane, verbatim. */
	note: string | null;
};

export type UnknownSubstratePrice = {
	known: false;
	/** The seed basis that disqualified the lane, when it had one. */
	rateBasis: RateBasis;
	/** What was checked and why it came back empty. Surfaced to the caller. */
	reason: string;
};

export type SubstratePrice = KnownSubstratePrice | UnknownSubstratePrice;

export type PriceTable = Record<ProviderKind, SubstratePrice>;

type SeedRate = { value: number | null; unit: string; basis: string };

const SEED_PATH = "web/data/benchmarks.json";

function seedProfilePricing(provider: string): Record<string, unknown> | null {
	const profiles = (benchmarksSeed as { profiles?: unknown }).profiles;
	if (!Array.isArray(profiles)) return null;
	for (const entry of profiles) {
		if (!entry || typeof entry !== "object") continue;
		const profile = entry as { provider?: unknown; pricing?: unknown };
		if (profile.provider !== provider) continue;
		if (!profile.pricing || typeof profile.pricing !== "object") return null;
		return profile.pricing as Record<string, unknown>;
	}
	return null;
}

function readRate(pricing: Record<string, unknown>, key: string): SeedRate | null {
	const raw = pricing[key];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const rate = raw as { value?: unknown; unit?: unknown; basis?: unknown };
	if (typeof rate.unit !== "string" || typeof rate.basis !== "string") return null;
	if (rate.value !== null && typeof rate.value !== "number") return null;
	return { value: rate.value, unit: rate.unit, basis: rate.basis };
}

function asBasis(basis: string): RateBasis {
	return basis === "published" || basis === "estimate" ? basis : "unknown";
}

/**
 * Read the memory unit off the seed's `unit` string rather than off the field
 * NAME: the key is `memoryPerGibHour` for every provider, but Vercel's unit is
 * "$/GB-hr" -- decimal GB, ~4.9% more billed units per MiB. Trusting the name
 * would under-bill that lane by exactly that margin.
 */
function memoryUnitFrom(unit: string): MemoryUnit | null {
	if (unit.includes("GiB")) return "GiB";
	if (unit.includes("GB")) return "GB";
	return null;
}

function seedNote(pricing: Record<string, unknown>): string | null {
	const note = pricing.note;
	return typeof note === "string" && note.length > 0 ? note : null;
}

function unpriced(reason: string, rateBasis: RateBasis = "unknown"): UnknownSubstratePrice {
	return { known: false, rateBasis, reason };
}

/**
 * One lane's price from a seed pricing block. Fail closed at every step: a
 * missing profile, a malformed rate, a basis that is not "published", a
 * non-positive value, or an unrecognized memory unit all produce an unpriced
 * lane naming the field, never a substituted number.
 *
 * Exported for the parser tests: the committed seed exercises only two of these
 * branches, and the ones it does not exercise are exactly the ones that would
 * quietly admit a bad rate.
 */
export function priceFromPricingBlock(
	provider: string,
	pricing: Record<string, unknown> | null,
): SubstratePrice {
	if (!pricing) {
		return unpriced(`${SEED_PATH} has no profiles[${provider}].pricing block`);
	}
	const note = seedNote(pricing);
	const suffix = note ? `: ${note}` : "";
	const cpu = readRate(pricing, "cpuPerVcpuHour");
	const memory = readRate(pricing, "memoryPerGibHour");
	if (!cpu || !memory) {
		return unpriced(
			`${SEED_PATH} profiles[${provider}].pricing is missing a readable cpuPerVcpuHour/memoryPerGibHour rate`,
		);
	}
	for (const [key, rate] of [
		["cpuPerVcpuHour", cpu],
		["memoryPerGibHour", memory],
	] as const) {
		if (rate.basis !== "published") {
			return unpriced(
				`${SEED_PATH} profiles[${provider}].pricing.${key}.basis is "${rate.basis}", not "published"${suffix}`,
				asBasis(rate.basis),
			);
		}
		if (typeof rate.value !== "number" || !Number.isFinite(rate.value) || rate.value <= 0) {
			return unpriced(
				`${SEED_PATH} profiles[${provider}].pricing.${key} is marked published with no usable value${suffix}`,
				"published",
			);
		}
	}
	const memoryUnit = memoryUnitFrom(memory.unit);
	if (!memoryUnit) {
		return unpriced(
			`${SEED_PATH} profiles[${provider}].pricing.memoryPerGibHour.unit "${memory.unit}" names neither GiB nor GB`,
			"published",
		);
	}
	return {
		known: true,
		vcpuHourUsd: cpu.value as number,
		memoryHourUsd: memory.value as number,
		memoryUnit,
		rateBasis: "published",
		note,
	};
}

function buildPriceTable(): PriceTable {
	const table = {} as PriceTable;
	for (const provider of PROVIDER_KINDS) {
		table[provider] = priceFromPricingBlock(provider, seedProfilePricing(provider));
	}
	return table;
}

/** The live routing price table, read once from the committed seed. */
export const SUBSTRATE_PRICES: PriceTable = buildPriceTable();

/**
 * Price for one substrate name. Accepts a plain string because the substrate on
 * a trace row is unvalidated free text from an arm snapshot; an unrecognized
 * value is unpriced with a reason, never coerced to a lane that has a rate.
 */
export function substratePrice(
	substrate: string,
	table: PriceTable = SUBSTRATE_PRICES,
): SubstratePrice {
	if ((PROVIDER_KINDS as ReadonlyArray<string>).includes(substrate)) {
		return table[substrate as ProviderKind];
	}
	return unpriced(`"${substrate}" is not a known provider kind, so it has no price entry`);
}

/** True when this lane's sandbox cost may rank it against another lane. */
export function isCostRankable(
	substrate: string,
	table: PriceTable = SUBSTRATE_PRICES,
): boolean {
	return substratePrice(substrate, table).known;
}

export type SandboxRunShape = {
	/** Wall clock the sandbox was up, harness install included. */
	durationMs: number;
	vcpu: number;
	memoryMib: number;
};

export type PriceLine = {
	label: "cpu" | "memory";
	millicents: number;
	/** The arithmetic, so a dashboard can show its work. */
	detail: string;
};

/**
 * A sandbox-compute quote. SANDBOX COMPUTE ONLY -- model tokens are priced by
 * the upstream and are never added in here, so no field on this type can be
 * mistaken for a run total.
 */
export type SandboxPriceQuote = {
	substrate: string;
	known: boolean;
	/** Absent when the lane is unpriced. Absent, never 0. */
	sandboxMillicents?: number;
	rateBasis?: "published";
	lines: PriceLine[];
	/** Set only when the lane has no published rate. */
	unknownReason?: string;
	/**
	 * True when the figure is an upper bound. Set for a decimal-GB lane, which
	 * `src/mux/cost.ts` records as active-CPU billed: the seed carries no
	 * cpuBasis, so idle model wait is priced here as if it were busy CPU.
	 */
	upperBound?: boolean;
	note?: string;
};

/**
 * Price one run's sandbox compute off the published rates.
 *
 * `vcpu`/`memoryMib` are the machine's REQUESTED spec, which is not proof of
 * the granted size -- a `resources` request was measured ignored on E2B's
 * current plan (docs/MUX-RESULTS.md finding 10). That is why a figure from this
 * function stays `estimated` provenance and is never reported as metered.
 */
export function priceSandboxRun(
	substrate: string,
	shape: SandboxRunShape,
	table: PriceTable = SUBSTRATE_PRICES,
): SandboxPriceQuote {
	const price = substratePrice(substrate, table);
	if (!price.known) {
		return {
			substrate,
			known: false,
			lines: [],
			unknownReason: price.reason,
		};
	}
	if (!Number.isFinite(shape.durationMs) || shape.durationMs < 0) {
		return {
			substrate,
			known: false,
			lines: [],
			unknownReason: `durationMs ${shape.durationMs} is not a usable window, so this run has no priceable sandbox time`,
		};
	}
	const hours = shape.durationMs / MS_PER_HOUR;
	const cpuUsd = hours * shape.vcpu * price.vcpuHourUsd;
	const memoryUnits = shape.memoryMib / (price.memoryUnit === "GiB" ? 1024 : MIB_PER_GB);
	const memoryUsd = memoryUnits * hours * price.memoryHourUsd;
	const lines: PriceLine[] = [
		{
			label: "cpu",
			millicents: cpuUsd * MILLICENTS_PER_USD,
			detail: `${hours * shape.vcpu} vCPU-hours x $${price.vcpuHourUsd}/vCPU-hour`,
		},
		{
			label: "memory",
			millicents: memoryUsd * MILLICENTS_PER_USD,
			detail: `${memoryUnits} ${price.memoryUnit} x ${hours} hours x $${price.memoryHourUsd}/${price.memoryUnit}-hour`,
		},
	];
	const quote: SandboxPriceQuote = {
		substrate,
		known: true,
		sandboxMillicents: (cpuUsd + memoryUsd) * MILLICENTS_PER_USD,
		rateBasis: "published",
		lines,
	};
	if (price.memoryUnit === "GB") quote.upperBound = true;
	if (price.note) quote.note = price.note;
	return quote;
}

/**
 * Sandbox compute in whole millicents, or null when the lane is unpriced.
 *
 * The integer is for the `*_millicents` columns; null is the honest value for
 * an unpriced lane and is what keeps it out of the cost posterior entirely.
 */
export function sandboxCostMillicents(
	substrate: string,
	shape: SandboxRunShape,
	table: PriceTable = SUBSTRATE_PRICES,
): number | null {
	const quote = priceSandboxRun(substrate, shape, table);
	return quote.sandboxMillicents === undefined ? null : Math.round(quote.sandboxMillicents);
}

/**
 * Order lanes cheapest-first, unpriced lanes LAST.
 *
 * Array#sort is stable per spec, so equal totals -- and every unpriced lane,
 * which all compare equal to each other -- keep the caller's order. That order
 * is the operator's stated preference, and reshuffling it on a tie would
 * silently override an explicit route. Same rule as `cheapestFirst` in
 * `src/mux/cost.ts`; an unknown price is never mistaken for a cheap one.
 */
export function rankByPrice(
	candidates: readonly string[],
	shape: SandboxRunShape,
	table: PriceTable = SUBSTRATE_PRICES,
): SandboxPriceQuote[] {
	const quotes = candidates.map((substrate) => priceSandboxRun(substrate, shape, table));
	return quotes.sort((left, right) => {
		const leftUnknown = left.sandboxMillicents === undefined;
		const rightUnknown = right.sandboxMillicents === undefined;
		// Compared as booleans rather than by subtracting Infinities, which would
		// hand the comparator a NaN and forfeit the stability above.
		if (leftUnknown !== rightUnknown) return leftUnknown ? 1 : -1;
		if (leftUnknown) return 0;
		return (left.sandboxMillicents as number) - (right.sandboxMillicents as number);
	});
}

export type CostRankingReport = {
	/** Lanes whose published rate may order a route. */
	ranked: ProviderKind[];
	/** Lanes that are routable but not cost-ranked, each with the reason. */
	unpriced: Array<{ substrate: ProviderKind; rateBasis: RateBasis; reason: string }>;
};

/**
 * Which lanes price optimization can and cannot speak for.
 *
 * Carried on the active policy so any caller -- a recommendation endpoint, a
 * dashboard panel, a routing decision -- can state that a lane was chosen
 * without a price rather than implying the price was competitive.
 */
export function costRankingReport(table: PriceTable = SUBSTRATE_PRICES): CostRankingReport {
	const report: CostRankingReport = { ranked: [], unpriced: [] };
	for (const substrate of PROVIDER_KINDS) {
		const price = table[substrate];
		if (price.known) report.ranked.push(substrate);
		else {
			report.unpriced.push({
				substrate,
				rateBasis: price.rateBasis,
				reason: price.reason,
			});
		}
	}
	return report;
}
