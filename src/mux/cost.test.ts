/**
 * Tests for src/mux/cost.ts: the arithmetic is checked against values computed
 * by hand from the cited list prices (including Vercel's own worked example),
 * unknown prices stay unknown and sort last, and cheapestFirst is stable.
 *
 * Run: tsx --test src/mux/cost.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_RUN_SHAPE,
	MIB_PER_GB,
	SUBSTRATE_PRICES,
	cheapestFirst,
	costToSuccessfulResult,
	estimate,
	type PriceTable,
	type RunShape,
} from "./cost.js";
import type { SubstrateKind } from "./types.js";

const HOUR_MS = 3_600_000;

function approx(actual: number | undefined, expected: number, label: string): void {
	assert.ok(actual !== undefined, `${label} was undefined`);
	assert.ok(
		Math.abs(actual - expected) <= 1e-12,
		`${label}: expected ${expected}, got ${actual}`,
	);
}

function order(estimates: { substrate: SubstrateKind }[]): SubstrateKind[] {
	return estimates.map((item) => item.substrate);
}

test("e2b: hand-computed from $0.0504/vCPU-hour and $0.0162/GiB-hour", () => {
	// 1 hour, 2 vCPU, 1 GiB: 1*2*0.0504 = 0.1008 cpu, 1*1*0.0162 = 0.0162 memory.
	const result = estimate("e2b", {
		durationMs: HOUR_MS,
		vcpu: 2,
		memoryMib: 1024,
	});
	assert.equal(result.known, true);
	approx(result.lines[0].usd, 0.1008, "cpu");
	approx(result.lines[1].usd, 0.0162, "memory");
	approx(result.computeUsd, 0.117, "compute");
	approx(result.totalUsd, 0.117, "total");
	// No creation charge is metered on this substrate, so no line for it.
	assert.deepEqual(
		result.lines.map((line) => line.label),
		["cpu", "memory"],
	);
	assert.equal(result.upperBound, false);
	assert.match(result.source ?? "", /^https:\/\/e2b\.dev\/pricing \(read /);
});

test("dedalus: hand-computed from $0.04536/vCPU-hour and $0.01458/GiB-hour", () => {
	// 10 minutes, 1 vCPU, 2 GiB: 0.04536/6 = 0.00756 cpu, 2*0.01458/6 = 0.00486.
	const result = estimate("dedalus", {
		durationMs: 600_000,
		vcpu: 1,
		memoryMib: 2048,
	});
	approx(result.lines[0].usd, 0.00756, "cpu");
	approx(result.lines[1].usd, 0.00486, "memory");
	approx(result.totalUsd, 0.01242, "total");
});

test("vercel: reproduces the vendor's own worked example", () => {
	// vercel.com/docs/sandbox/pricing: 30 min, 4 vCPU, 8 GB -> ~$0.26 CPU and
	// ~$0.08 memory. Memory is expressed in decimal GB there, so the MiB input
	// is converted through MIB_PER_GB to land on exactly 8 GB.
	const result = estimate("vercel", {
		durationMs: 1_800_000,
		vcpu: 4,
		memoryMib: 8 * MIB_PER_GB,
	});
	approx(result.lines[0].usd, 0.256, "cpu");
	approx(result.lines[1].usd, 0.0848, "memory");
	approx(result.lines[2].usd, 0.0000006, "creations");
	approx(result.computeUsd, 0.3408006, "compute");
	// Active-CPU billing at full utilization can only overstate the bill.
	assert.equal(result.upperBound, true);
});

test("active-cpu utilization scales cpu only, and drops the upper-bound flag", () => {
	// 1 hour, 2 vCPU at 25% busy: 1*2*0.128*0.25 = 0.064; memory unaffected.
	const result = estimate("vercel", {
		durationMs: HOUR_MS,
		vcpu: 2,
		memoryMib: 2 * MIB_PER_GB,
		cpuUtilization: 0.25,
	});
	approx(result.lines[0].usd, 0.064, "cpu");
	approx(result.lines[1].usd, 0.0424, "memory");
	approx(result.computeUsd, 0.1064006, "compute");
	assert.equal(result.upperBound, false);
});

test("wall-clock lanes ignore utilization, because idle seconds still bill", () => {
	const shape: RunShape = { durationMs: HOUR_MS, vcpu: 2, memoryMib: 1024 };
	const busy = estimate("e2b", shape);
	const idle = estimate("e2b", { ...shape, cpuUtilization: 0.1 });
	assert.deepEqual(idle.totalUsd, busy.totalUsd);
	approx(idle.totalUsd, 0.117, "total");
});

test("vercel memory honors the published 1-minute minimum increment", () => {
	// A 10-second sandbox is billed 60 seconds of memory: 1 GB * (1/60) h *
	// 0.0212 = 0.000353333..., while cpu still bills only the 10 seconds.
	const result = estimate("vercel", {
		durationMs: 10_000,
		vcpu: 1,
		memoryMib: MIB_PER_GB,
	});
	approx(result.lines[0].usd, (10_000 / HOUR_MS) * 0.128, "cpu");
	approx(result.lines[1].usd, 0.0212 / 60, "memory");
	// e2b publishes no minimum, so the same 10 seconds bills as 10 seconds.
	const e2b = estimate("e2b", { durationMs: 10_000, vcpu: 1, memoryMib: 1024 });
	approx(e2b.lines[1].usd, (10_000 / HOUR_MS) * 0.0162, "e2b memory");
});

test("omitted size falls back to the documented 2 vCPU / 2 GiB comparison shape", () => {
	// 1 hour at the defaults on e2b: 2*0.0504 = 0.1008, 2*0.0162 = 0.0324.
	const result = estimate("e2b", { durationMs: HOUR_MS });
	approx(result.totalUsd, 0.1332, "total");
	assert.deepEqual(
		estimate("e2b", { durationMs: HOUR_MS, vcpu: 2, memoryMib: 2048 }).totalUsd,
		result.totalUsd,
	);
});

test("creations are billed per create() and can be zeroed for a reused machine", () => {
	const shape: RunShape = { durationMs: 600_000, vcpu: 1, memoryMib: MIB_PER_GB };
	const three = estimate("vercel", { ...shape, creations: 3 });
	approx(three.lines[2].usd, 0.0000018, "creations");
	const reused = estimate("vercel", { ...shape, creations: 0 });
	assert.deepEqual(
		reused.lines.map((line) => line.label),
		["cpu", "memory"],
	);
	assert.ok(three.computeUsd !== undefined && reused.computeUsd !== undefined);
	approx(three.computeUsd - reused.computeUsd, 0.0000018, "creation delta");
});

test("model spend is added verbatim and reported as its own line", () => {
	// $0.0107 is the measured cost of one claude-code turn (docs/MUX-RESULTS).
	const result = estimate("e2b", {
		durationMs: HOUR_MS,
		vcpu: 2,
		memoryMib: 1024,
		modelCostUsd: 0.0107,
	});
	approx(result.computeUsd, 0.117, "compute");
	approx(result.modelUsd, 0.0107, "model");
	approx(result.totalUsd, 0.1277, "total");
	assert.deepEqual(
		result.lines.map((line) => line.label),
		["cpu", "memory", "model"],
	);
});

test("an unpublished price stays unknown instead of becoming a number", () => {
	const result = estimate("sprites", { durationMs: HOUR_MS });
	assert.equal(result.known, false);
	assert.equal(result.computeUsd, undefined);
	assert.equal(result.totalUsd, undefined);
	assert.deepEqual(result.lines, []);
	assert.match(result.unknownReason ?? "", /Sprites compute rate/);
	assert.equal(SUBSTRATE_PRICES.sprites.known, false);
});

test("an unpriced lane with known model spend still refuses to report a total", () => {
	const result = estimate("sprites", { durationMs: HOUR_MS, modelCostUsd: 0.5 });
	approx(result.modelUsd, 0.5, "model");
	// A model-only total would rank this lane cheapest on the compute it did
	// not price, so totalUsd stays undefined.
	assert.equal(result.totalUsd, undefined);
	assert.deepEqual(
		result.lines.map((line) => line.label),
		["model"],
	);
});

test("cheapestFirst orders the real route by real prices, unknown last", () => {
	// At the default shape: dedalus 0.01998, e2b 0.0222, vercel ~0.0503.
	const ranked = cheapestFirst(["e2b", "sprites", "vercel", "dedalus"]);
	assert.deepEqual(order(ranked), ["dedalus", "e2b", "vercel", "sprites"]);
	approx(ranked[0].totalUsd, 0.01998, "dedalus total");
	approx(ranked[1].totalUsd, 0.0222, "e2b total");
	assert.equal(ranked[3].totalUsd, undefined);
	assert.deepEqual(DEFAULT_RUN_SHAPE, {
		durationMs: 600_000,
		vcpu: 2,
		memoryMib: 2048,
	});
});

test("cheapestFirst puts unknown last even when it is offered first", () => {
	assert.deepEqual(order(cheapestFirst(["sprites", "e2b"])), ["e2b", "sprites"]);
	assert.deepEqual(order(cheapestFirst(["sprites"])), ["sprites"]);
	assert.deepEqual(cheapestFirst([]), []);
});

test("cheapestFirst leaves the caller's array untouched", () => {
	const route: SubstrateKind[] = ["sprites", "vercel", "e2b"];
	cheapestFirst(route);
	assert.deepEqual(route, ["sprites", "vercel", "e2b"]);
});

test("cheapestFirst is stable: ties keep the offered primary-before-backup order", () => {
	const tied: PriceTable = {
		...SUBSTRATE_PRICES,
		dedalus: { ...SUBSTRATE_PRICES.e2b } as PriceTable["dedalus"],
	};
	const forward = cheapestFirst(["e2b", "dedalus"], DEFAULT_RUN_SHAPE, tied);
	const reverse = cheapestFirst(["dedalus", "e2b"], DEFAULT_RUN_SHAPE, tied);
	assert.deepEqual(forward[0].totalUsd, forward[1].totalUsd);
	assert.deepEqual(order(forward), ["e2b", "dedalus"]);
	assert.deepEqual(order(reverse), ["dedalus", "e2b"]);
});

test("cheapestFirst is stable across several unknown lanes", () => {
	const mostlyUnknown: PriceTable = {
		...SUBSTRATE_PRICES,
		vercel: { known: false, reason: "test lane" },
		dedalus: { known: false, reason: "test lane" },
	};
	assert.deepEqual(
		order(
			cheapestFirst(
				["sprites", "vercel", "e2b", "dedalus"],
				DEFAULT_RUN_SHAPE,
				mostlyUnknown,
			),
		),
		["e2b", "sprites", "vercel", "dedalus"],
	);
});

test("total cost to a successful result includes what the failed legs billed", () => {
	// A 60-second e2b attempt that died, then a 10-minute dedalus run that won.
	const result = costToSuccessfulResult([
		{ substrate: "e2b", shape: { durationMs: 60_000 }, succeeded: false },
		{ substrate: "dedalus", shape: DEFAULT_RUN_SHAPE, succeeded: true },
	]);
	approx(result.wastedUsd, 0.00222, "wasted");
	approx(result.knownUsd, 0.0222, "known total");
	assert.equal(result.complete, true);
	assert.deepEqual(result.unpriced, []);
	assert.deepEqual(order(result.legs), ["e2b", "dedalus"]);
});

test("an unpriced leg makes the run total a floor, and says which lane", () => {
	const result = costToSuccessfulResult([
		{ substrate: "sprites", shape: { durationMs: 60_000 }, succeeded: false },
		{ substrate: "dedalus", shape: DEFAULT_RUN_SHAPE, succeeded: true },
	]);
	assert.equal(result.complete, false);
	assert.deepEqual(result.unpriced, ["sprites"]);
	// Only the priced legs are summed; the unpriced failure is not counted as
	// free, it is named.
	approx(result.knownUsd, 0.01998, "known total");
	approx(result.wastedUsd, 0, "wasted");
});

test("model spend on the winning leg counts toward the result, not toward waste", () => {
	const result = costToSuccessfulResult([
		{ substrate: "e2b", shape: { durationMs: 60_000 }, succeeded: false },
		{
			substrate: "dedalus",
			shape: { ...DEFAULT_RUN_SHAPE, modelCostUsd: 0.0107 },
			succeeded: true,
		},
	]);
	approx(result.knownUsd, 0.0222 + 0.0107, "known total");
	approx(result.wastedUsd, 0.00222, "wasted");
});

test("costToSuccessfulResult of no legs costs nothing and is complete", () => {
	assert.deepEqual(costToSuccessfulResult([]), {
		knownUsd: 0,
		wastedUsd: 0,
		complete: true,
		unpriced: [],
		legs: [],
	});
});

test("every substrate has a price entry, known or explicitly not", () => {
	assert.deepEqual(Object.keys(SUBSTRATE_PRICES).sort(), [
		"dedalus",
		"e2b",
		"sprites",
		"vercel",
	]);
	for (const [substrate, price] of Object.entries(SUBSTRATE_PRICES)) {
		if (price.known) {
			// A rate with no citation is indistinguishable from a guess.
			assert.match(price.source, /^https:\/\/\S+ \(read \d{4}-\d{2}-\d{2}\)$/, substrate);
			assert.ok(price.vcpuHourUsd > 0, substrate);
			assert.ok(price.memoryHourUsd > 0, substrate);
		} else {
			assert.ok(price.reason.length > 40, substrate);
		}
	}
});
