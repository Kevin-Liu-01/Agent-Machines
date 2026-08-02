/**
 * Tests for src/mux/selection.ts: scoring candidate lanes from our own run
 * traces, with the cold-start behavior pinned down explicitly.
 *
 * Run: npx tsx --test src/mux/selection.test.ts
 *
 * Every test that exercises scoring passes traces in as an array, so nothing
 * here reads the local trace store and no assertion depends on what this
 * machine happened to run. The one test that does exercise the default disk
 * source points AGENT_MACHINES_MUX_TRACES at a temp directory first.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { estimate } from "./cost.js";
import {
	DEFAULT_SELECTION_TUNING,
	ESTIMATED_EVIDENCE_WEIGHT,
	SELECTION_POLICY_VERSION,
	SelectionPolicy,
	explainLane,
	rankLanes,
	resolveSelectionTuning,
	type LaneScore,
} from "./selection.js";
import { appendTrace, type RunTrace } from "./traces.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";

// ---------------------------------------------------------------------------
// Trace fixtures.
// ---------------------------------------------------------------------------

let sequence = 0;

/**
 * One run record. Only the fields selection reads are parameterized:
 * substrate and harness name the lane, exitCode decides success, durationMs
 * and modelCostUsd are what summarize() reprices the lane from, and
 * timeToFirstEventMs is the time-to-first-output sample.
 */
function trace(input: {
	substrate: SubstrateKind;
	harness?: HarnessKind;
	ok?: boolean;
	durationMs?: number;
	firstOutputMs?: number;
	modelCostUsd?: number;
	startedAt?: string;
}): RunTrace {
	sequence += 1;
	const ok = input.ok ?? true;
	const record: RunTrace = {
		runKey: `fixture-${sequence}`,
		harness: input.harness ?? "claude-code",
		substrate: input.substrate,
		attempts: [],
		startedAt: input.startedAt ?? "2026-08-01T00:00:00.000Z",
		durationMs: input.durationMs ?? 10_000,
		exitCode: ok ? 0 : 1,
		truncated: false,
		events: 3,
	};
	if (input.firstOutputMs !== undefined) {
		record.timeToFirstEventMs = input.firstOutputMs;
	}
	if (input.modelCostUsd !== undefined) record.modelCostUsd = input.modelCostUsd;
	if (!ok) record.error = "the harness exited non-zero";
	return record;
}

function repeat(count: number, make: (index: number) => RunTrace): RunTrace[] {
	return Array.from({ length: count }, (_unused, index) => make(index));
}

function laneOf(scores: LaneScore[], substrate: SubstrateKind): LaneScore {
	const found = scores.find((score) => score.substrate === substrate);
	assert.ok(found, `expected a score for ${substrate}`);
	return found;
}

const ORDER = (scores: LaneScore[]): SubstrateKind[] =>
	scores.map((score) => score.substrate);

/**
 * The prior score is a weighted sum of three equal terms, so binary floating
 * point lands a few ulps off the exact value (0.7*0.5 + 0.2*0.5 + 0.1*0.5 is
 * 0.49999999999999994). The value is what the assertion is about, not the last
 * bit of it -- ordering never depends on that bit, because two lanes with the
 * same evidence take the same code path and get the same float.
 */
function assertClose(actual: number, expected: number, what: string): void {
	assert.ok(
		Math.abs(actual - expected) < 1e-12,
		`${what}: expected ${expected}, got ${actual}`,
	);
}

const HOUR_MS = 3_600_000;

/**
 * The wall clock whose ESTIMATED compute costs `targetUsd` on this substrate.
 *
 * Two lanes can then be put at the same cost per success while differing only
 * in whether that price was metered, which is the comparison the metered-vs-
 * estimated tests are about. Inverting one hour of rate is exact for e2b and
 * dedalus: both price linearly in duration, with no creation charge and no
 * billed-time minimum (src/mux/cost.ts). It would NOT be exact for vercel.
 *
 * summarize() reprices every leg at cost.ts's default size with `creations: 0`,
 * so the same shape is used here rather than a size of our own choosing.
 */
function durationForComputeUsd(substrate: SubstrateKind, targetUsd: number): number {
	const perHour = estimate(substrate, {
		durationMs: HOUR_MS,
		creations: 0,
	}).computeUsd;
	assert.ok(perHour !== undefined, `${substrate} needs a published rate for this test`);
	return (targetUsd / perHour) * HOUR_MS;
}

function assertSamePrice(left: number, right: number): void {
	assert.ok(
		Math.abs(left - right) <= Math.abs(left) * 1e-9,
		`the two lanes must be priced the same: ${left} vs ${right}`,
	);
}

// ---------------------------------------------------------------------------
// Ranking on evidence.
// ---------------------------------------------------------------------------

test("a lane with a strong success record is ordered first", () => {
	// e2b is offered first and is faster and the only priced lane, so every
	// tiebreaker favors it. It still loses, because it fails 4 runs in 5.
	const traces = [
		...repeat(20, (i) =>
			trace({
				substrate: "e2b",
				ok: i < 4,
				firstOutputMs: 1_000,
				modelCostUsd: 0.01,
			}),
		),
		...repeat(20, () =>
			trace({ substrate: "sprites", firstOutputMs: 2_000, modelCostUsd: 0.01 }),
		),
	];

	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
	});
	assert.deepEqual(ORDER(ranked), ["sprites", "e2b"]);
	assert.equal(laneOf(ranked, "sprites").measured.successRate, 1);
	assert.equal(laneOf(ranked, "e2b").measured.successRate, 0.2);
	assert.ok(
		laneOf(ranked, "sprites").score > laneOf(ranked, "e2b").score,
		"task success is the dominant term",
	);
});

test("one lucky run does not outrank a long good record", () => {
	// The pathological cold-start case, stacked as hard as it goes against the
	// honest answer: the 1-sample lane succeeded, is the cheapest lane on offer
	// (the only priced one), is five times faster, and is configured first.
	const traces = [
		trace({ substrate: "e2b", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
		...repeat(50, (i) =>
			trace({
				substrate: "sprites",
				ok: i < 45,
				firstOutputMs: 5_000,
				modelCostUsd: 0.01,
			}),
		),
	];

	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
	});
	assert.deepEqual(ORDER(ranked), ["sprites", "e2b"]);

	const lucky = laneOf(ranked, "e2b");
	const proven = laneOf(ranked, "sprites");
	assert.equal(lucky.samples, 1);
	assert.equal(lucky.measured.successRate, 1, "its raw rate really is 100%");
	assert.equal(proven.samples, 50);
	assert.equal(proven.measured.successRate, 0.9);
	assert.ok(
		lucky.terms.success < proven.terms.success,
		"shrinkage must rate 1-of-1 below 45-of-50",
	);
});

test("a zero-trace lane stays reachable and beats a proven-bad one", () => {
	const traces = [
		// Proven bad: 20 runs, none finished.
		...repeat(20, () => trace({ substrate: "e2b", ok: false, modelCostUsd: 0.01 })),
		// Proven good.
		...repeat(20, () => trace({ substrate: "sprites", firstOutputMs: 2_000 })),
	];

	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites", "vercel"],
		traces,
	});
	assert.deepEqual(
		ORDER(ranked),
		["sprites", "vercel", "e2b"],
		"an unexplored lane sits between a proven-good and a proven-bad one",
	);

	const unexplored = laneOf(ranked, "vercel");
	assert.equal(unexplored.samples, 0);
	assert.equal(unexplored.ok, 0);
	assert.equal(
		unexplored.measured.successRate,
		undefined,
		"no runs means no rate, not a rate of zero",
	);
	assert.equal(unexplored.measured.perSuccessUsd, undefined);
	assert.equal(unexplored.measured.firstOutputP50Ms, undefined);
	// The prior itself: 0.5 on all three terms, with weights summing to 1.
	assertClose(unexplored.score, 0.5, "an unexplored lane scores the prior");
	assert.ok(
		unexplored.score > laneOf(ranked, "e2b").score,
		"an unexplored lane must never be starved below a lane known to fail",
	);
});

test("rank returns a permutation of the candidates, never a filter", () => {
	const traces = repeat(30, () => trace({ substrate: "e2b", modelCostUsd: 0.01 }));
	const candidates: SubstrateKind[] = ["e2b", "sprites", "vercel", "dedalus"];
	const ranked = rankLanes({ harness: "claude-code", candidates, traces });
	assert.equal(ranked.length, candidates.length);
	assert.deepEqual([...ORDER(ranked)].sort(), [...candidates].sort());
});

// ---------------------------------------------------------------------------
// Determinism.
// ---------------------------------------------------------------------------

test("identical input produces an identical ranking", () => {
	const traces = [
		...repeat(7, (i) =>
			trace({ substrate: "e2b", ok: i < 5, firstOutputMs: 900, modelCostUsd: 0.02 }),
		),
		...repeat(11, (i) =>
			trace({ substrate: "sprites", ok: i < 9, firstOutputMs: 1_500 }),
		),
		...repeat(3, () => trace({ substrate: "vercel", firstOutputMs: 400 })),
	];
	const input = {
		harness: "claude-code" as HarnessKind,
		candidates: ["e2b", "sprites", "vercel"] as SubstrateKind[],
		traces,
	};

	const first = rankLanes(input);
	const second = rankLanes(input);
	assert.deepEqual(second, first, "same traces in, same scores and order out");

	// Trace arrival order is not a signal, so it must not move the ranking.
	const shuffled = rankLanes({ ...input, traces: [...traces].reverse() });
	assert.deepEqual(shuffled, first);
});

test("lanes the evidence cannot separate keep the caller's order", () => {
	// Two unexplored lanes score identically, so the configured preference --
	// which encodes cost agreements, region and features -- decides.
	const forward = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces: [],
	});
	assert.deepEqual(ORDER(forward), ["e2b", "sprites"]);
	const reversed = rankLanes({
		harness: "claude-code",
		candidates: ["sprites", "e2b"],
		traces: [],
	});
	assert.deepEqual(ORDER(reversed), ["sprites", "e2b"]);
	assert.equal(forward[0].score, reversed[0].score);
});

test("a score difference inside the deadband does not reorder", () => {
	const traces = repeat(20, () =>
		trace({ substrate: "sprites", firstOutputMs: 2_000 }),
	);
	const candidates: SubstrateKind[] = ["e2b", "sprites"];
	// On the real grid sprites is clearly ahead.
	assert.deepEqual(
		ORDER(rankLanes({ harness: "claude-code", candidates, traces })),
		["sprites", "e2b"],
	);
	// Widen the grid until nothing is distinguishable, and the configured order
	// survives instead of being churned by a difference that is not evidence.
	assert.deepEqual(
		ORDER(
			rankLanes({
				harness: "claude-code",
				candidates,
				traces,
				tuning: { deadband: 1 },
			}),
		),
		["e2b", "sprites"],
	);
});

// ---------------------------------------------------------------------------
// What each term measures.
// ---------------------------------------------------------------------------

test("another harness's runs are not evidence about this lane", () => {
	// hermes is the live counterexample: claude-code succeeding on e2b said
	// nothing about hermes there (docs/MUX-RESULTS.md finding 10).
	const traces = repeat(30, () =>
		trace({ substrate: "e2b", harness: "claude-code", modelCostUsd: 0.01 }),
	);
	const ranked = rankLanes({
		harness: "hermes",
		candidates: ["e2b", "sprites"],
		traces,
	});
	assert.equal(laneOf(ranked, "e2b").samples, 0);
	assertClose(laneOf(ranked, "e2b").score, 0.5, "hermes on e2b is unexplored");
	assert.deepEqual(ORDER(ranked), ["e2b", "sprites"], "no evidence, no reorder");
});

test("an unpriced lane is scored as unknown, never as cheap", () => {
	// Identical success and speed on both lanes; only the price differs, and
	// Fly publishes no Sprites compute rate (cost.ts), so that lane has none.
	const traces = [
		...repeat(10, () =>
			trace({ substrate: "e2b", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
		),
		...repeat(10, () =>
			trace({ substrate: "sprites", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
		),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["sprites", "e2b"],
		traces,
	});

	const unpriced = laneOf(ranked, "sprites");
	const priced = laneOf(ranked, "e2b");
	assert.equal(unpriced.measured.perSuccessUsd, undefined);
	assert.equal(unpriced.terms.cost, 0.5, "an unknown price is the neutral prior");
	assert.ok(priced.measured.perSuccessUsd !== undefined);
	assert.ok(
		priced.terms.cost > unpriced.terms.cost,
		"the lane with a published rate wins the cost term it can actually prove",
	);
	assert.equal(unpriced.terms.success, priced.terms.success);
	assert.equal(unpriced.terms.firstOutput, priced.terms.firstOutput);
	assert.deepEqual(ORDER(ranked), ["e2b", "sprites"]);
});

test("cost per success counts the failed runs on the lane", () => {
	// Same 20 runs and the same per-run price on both lanes; one lane converts
	// half of them into a result and the other converts all of them. Cost per
	// RESULT is what routing optimizes, so the reliable lane must be cheaper.
	const flaky = repeat(20, (i) =>
		trace({ substrate: "e2b", ok: i < 10, firstOutputMs: 1_000, modelCostUsd: 0.01 }),
	);
	const solid = repeat(20, () =>
		trace({ substrate: "vercel", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
	);
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "vercel"],
		traces: [...flaky, ...solid],
	});
	const flakyCost = laneOf(ranked, "e2b").measured.perSuccessUsd as number;
	const solidCost = laneOf(ranked, "vercel").measured.perSuccessUsd as number;
	assert.ok(flakyCost > solidCost, `${flakyCost} should exceed ${solidCost}`);
});

test("a cost figure missing a component is flagged as a floor", () => {
	// The harness reported no model spend, so the lane is priced on compute
	// alone: the figure is a lower bound and must say so, because a floor
	// compared against a complete total is how an unpriced half wins.
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b"],
		traces: repeat(5, () => trace({ substrate: "e2b", firstOutputMs: 500 })),
	});
	const lane = laneOf(ranked, "e2b");
	assert.ok(lane.measured.perSuccessUsd !== undefined);
	assert.equal(lane.measured.costIsFloor, true);

	const complete = rankLanes({
		harness: "claude-code",
		candidates: ["e2b"],
		traces: repeat(5, () =>
			trace({ substrate: "e2b", firstOutputMs: 500, modelCostUsd: 0.01 }),
		),
	});
	assert.equal(laneOf(complete, "e2b").measured.costIsFloor, false);
});

// ---------------------------------------------------------------------------
// Metered cost beats estimated cost (roadmap 4.2).
// ---------------------------------------------------------------------------

test("at the same price, the metered lane outranks the estimated one", () => {
	// Both lanes cost $0.02 per successful result, are 8-for-8 on success and
	// answer in the same time. The ONLY difference is where the price came from:
	// e2b's runs reported model spend, dedalus's were priced from wall clock
	// against a published rate. dedalus is offered first, so nothing but the
	// evidence can put e2b ahead.
	const meteredModelUsd = 0.01;
	const traces = [
		...repeat(8, () =>
			trace({
				substrate: "dedalus",
				durationMs: durationForComputeUsd("dedalus", 0.02),
				firstOutputMs: 1_000,
			}),
		),
		...repeat(8, () =>
			trace({
				substrate: "e2b",
				durationMs: durationForComputeUsd("e2b", 0.02 - meteredModelUsd),
				firstOutputMs: 1_000,
				modelCostUsd: meteredModelUsd,
			}),
		),
	];

	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["dedalus", "e2b"],
		traces,
	});
	const metered = laneOf(ranked, "e2b");
	const estimated = laneOf(ranked, "dedalus");

	assertSamePrice(
		metered.measured.perSuccessUsd as number,
		estimated.measured.perSuccessUsd as number,
	);
	assert.equal(metered.measured.costEvidence.basis, "metered");
	assert.equal(estimated.measured.costEvidence.basis, "estimated");
	assert.equal(metered.terms.success, estimated.terms.success);
	assert.equal(metered.terms.firstOutput, estimated.terms.firstOutput);
	assert.ok(
		metered.terms.cost > estimated.terms.cost,
		`a metered price is stronger evidence: ${metered.terms.cost} vs ${estimated.terms.cost}`,
	);
	assert.deepEqual(ORDER(ranked), ["e2b", "dedalus"]);
	assert.equal(metered.ranking.decidedBy, "cost", "cost is what separated them");
});

test("the metered/estimated split and its sample counts are reported per lane", () => {
	// A lane that reported spend on 3 of its 6 runs is neither: calling it
	// metered would overstate the evidence and calling it estimated would discard
	// half of it, so the split is carried instead of being collapsed.
	const traces = [
		...repeat(3, () => trace({ substrate: "e2b", modelCostUsd: 0.01 })),
		...repeat(3, () => trace({ substrate: "e2b" })),
	];
	const lane = laneOf(
		rankLanes({ harness: "claude-code", candidates: ["e2b"], traces }),
		"e2b",
	);
	const evidence = lane.measured.costEvidence;
	assert.equal(evidence.basis, "mixed");
	assert.equal(evidence.meteredRuns, 3);
	assert.equal(evidence.estimatedRuns, 3);
	assert.equal(lane.measured.costSamples, 6, "six priced runs behind the figure");
	assert.equal(
		evidence.effectiveSamples,
		3 + ESTIMATED_EVIDENCE_WEIGHT * 3,
		"metered runs count in full, estimated ones at the discount",
	);
	assert.equal(
		lane.measured.costIsFloor,
		true,
		"three runs reported no model spend, so the total is a floor",
	);
});

test("no volume of estimated runs buys more than half the distance from neutral", () => {
	// The modeling error is systematic, not noise: pricing a thousand runs at
	// the wrong utilization does not make the utilization right. So estimated
	// evidence is capped, and 400 runs say no more than 24 do.
	const cheapest = (count: number): LaneScore =>
		laneOf(
			rankLanes({
				harness: "claude-code",
				candidates: ["e2b"],
				traces: repeat(count, () => trace({ substrate: "e2b" })),
			}),
			"e2b",
		);

	const some = cheapest(24);
	const many = cheapest(400);
	assert.equal(some.measured.costEvidence.effectiveSamples, 6);
	assert.equal(many.measured.costEvidence.effectiveSamples, 6);
	assert.equal(many.measured.costSamples, 400, "the raw evidence is still reported");
	// The only lane on offer is the cheapest by definition, so the relative cost
	// term is 1 and the ceiling is visible directly: halfway from 0.5 to 1.
	assertClose(some.terms.cost, 0.75, "an estimated lane stops at the midpoint");
	assert.equal(many.terms.cost, some.terms.cost);
});

test("the estimate discount lowers confidence without inverting a real price gap", () => {
	// Guard against the obvious over-correction. An estimated lane that is ten
	// times cheaper must still win the cost term against a metered one: the
	// discount touches how much a price is believed, never the price itself.
	const traces = [
		...repeat(8, () =>
			trace({
				substrate: "dedalus",
				durationMs: durationForComputeUsd("dedalus", 0.002),
				firstOutputMs: 1_000,
			}),
		),
		...repeat(8, () =>
			trace({
				substrate: "e2b",
				durationMs: durationForComputeUsd("e2b", 0.0005),
				firstOutputMs: 1_000,
				modelCostUsd: 0.02,
			}),
		),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "dedalus"],
		traces,
	});
	const cheapEstimated = laneOf(ranked, "dedalus");
	const dearMetered = laneOf(ranked, "e2b");
	assert.equal(cheapEstimated.measured.costEvidence.basis, "estimated");
	assert.ok(
		(cheapEstimated.measured.perSuccessUsd as number) * 5 <
			(dearMetered.measured.perSuccessUsd as number),
		"the estimated lane really is much cheaper",
	);
	assert.ok(cheapEstimated.terms.cost > dearMetered.terms.cost);
	assert.deepEqual(ORDER(ranked), ["dedalus", "e2b"]);
});

test("a cheap lane that fails half its runs loses to a reliable dearer one", () => {
	// Per RUN, e2b is a third cheaper ($0.010 against $0.015). Per RESULT it is
	// more expensive, because the five runs that produced nothing still billed:
	// 10 x $0.010 / 5 results = $0.020, against 10 x $0.015 / 10 = $0.015.
	const traces = [
		...repeat(10, (i) =>
			trace({
				substrate: "e2b",
				ok: i < 5,
				durationMs: durationForComputeUsd("e2b", 0.005),
				firstOutputMs: 1_000,
				modelCostUsd: 0.005,
			}),
		),
		...repeat(10, () =>
			trace({
				substrate: "dedalus",
				durationMs: durationForComputeUsd("dedalus", 0.005),
				firstOutputMs: 1_000,
				modelCostUsd: 0.01,
			}),
		),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "dedalus"],
		traces,
	});
	const flaky = laneOf(ranked, "e2b");
	const reliable = laneOf(ranked, "dedalus");
	assertClose(flaky.measured.perSuccessUsd as number, 0.02, "cost per result");
	assertClose(reliable.measured.perSuccessUsd as number, 0.015, "cost per result");
	assert.ok(
		reliable.terms.cost > flaky.terms.cost,
		"the reliable lane is cheaper per result, so it wins the cost term too",
	);
	assert.deepEqual(ORDER(ranked), ["dedalus", "e2b"]);
	assertClose(
		flaky.measured.costEvidence.wastedUsd as number,
		5 * 0.01,
		"the five failed runs are reported as spend that produced nothing",
	);
});

test("a lane with zero successes divides by nothing and never wins on price", () => {
	// e2b burned real money and produced no result. Cost PER RESULT does not
	// exist there -- it is not 0, and it is not the cheapest price on offer.
	const traces = [
		...repeat(6, () =>
			trace({
				substrate: "e2b",
				ok: false,
				durationMs: durationForComputeUsd("e2b", 0.001),
				modelCostUsd: 0.005,
			}),
		),
		...repeat(6, () =>
			trace({
				substrate: "dedalus",
				durationMs: durationForComputeUsd("dedalus", 0.05),
				modelCostUsd: 0.05,
			}),
		),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "dedalus"],
		traces,
	});
	const barren = laneOf(ranked, "e2b");
	const dear = laneOf(ranked, "dedalus");

	assert.equal(barren.ok, 0);
	assert.equal(barren.measured.perSuccessUsd, undefined, "no result, no cost per result");
	assert.equal(barren.measured.costEvidence.basis, "none");
	assert.equal(barren.measured.costEvidence.absentReason, "no_successes");
	assert.equal(barren.measured.costEvidence.effectiveSamples, 0);
	assertClose(
		barren.measured.costEvidence.wastedUsd as number,
		6 * 0.006,
		"what the lane spent for nothing is known and reported",
	);
	for (const value of [barren.score, barren.terms.cost, dear.terms.cost]) {
		assert.ok(Number.isFinite(value), `a zero-success lane must not produce ${value}`);
	}
	assert.equal(barren.terms.cost, 0.5, "unknown cost is the neutral prior");
	assert.ok(
		dear.terms.cost > barren.terms.cost,
		"a lane 50x dearer per result still wins the cost term against no result at all",
	);
	assert.deepEqual(ORDER(ranked), ["dedalus", "e2b"]);
});

test("a lane with no cost figure at all still ranks on success and latency", () => {
	// Fly publishes no Sprites compute rate (src/mux/cost.ts), so this lane can
	// never hold a price. It must still be rankable on what it CAN prove --
	// dropping it or scoring it zero would make an unpriced vendor unroutable.
	const traces = [
		...repeat(12, () => trace({ substrate: "sprites", firstOutputMs: 500 })),
		...repeat(12, (i) =>
			trace({
				substrate: "e2b",
				ok: i < 6,
				firstOutputMs: 5_000,
				modelCostUsd: 0.01,
			}),
		),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
	});
	const unpriced = laneOf(ranked, "sprites");
	assert.equal(unpriced.measured.costEvidence.basis, "none");
	assert.equal(unpriced.measured.costEvidence.absentReason, "unpriced_substrate");
	assert.equal(unpriced.measured.costEvidence.meteredRuns, 0);
	assert.equal(unpriced.measured.costEvidence.estimatedRuns, 0);
	assert.equal(
		unpriced.measured.costEvidence.wastedUsd,
		undefined,
		"nothing on the lane could be priced, so no spend can be claimed either",
	);
	assert.equal(unpriced.terms.cost, 0.5);
	assert.equal(unpriced.measured.successRate, 1);
	assert.equal(unpriced.measured.firstOutputP50Ms, 500);
	assert.deepEqual(ORDER(ranked), ["sprites", "e2b"]);
	assert.equal(ranked.length, 2, "an unpriced lane is demoted at worst, never dropped");
});

test("a lane with no runs reports no_runs rather than a price of zero", () => {
	const lane = laneOf(
		rankLanes({ harness: "claude-code", candidates: ["e2b"], traces: [] }),
		"e2b",
	);
	assert.equal(lane.measured.costEvidence.basis, "none");
	assert.equal(lane.measured.costEvidence.absentReason, "no_runs");
	assert.equal(lane.measured.costEvidence.wastedUsd, undefined);
	assert.equal(lane.measured.perSuccessUsd, undefined);
});

// ---------------------------------------------------------------------------
// Explainability: every rank says what put it there.
// ---------------------------------------------------------------------------

test("each lane reports the term that decided its position", () => {
	const traces = [
		...repeat(20, (i) =>
			trace({ substrate: "e2b", ok: i < 4, firstOutputMs: 1_000, modelCostUsd: 0.01 }),
		),
		...repeat(20, () =>
			trace({ substrate: "sprites", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
		),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
	});
	const winner = ranked[0];
	const loser = ranked[1];

	assert.equal(winner.substrate, "sprites");
	assert.equal(winner.ranking.rank, 0);
	assert.equal(winner.ranking.bucket, 0);
	assert.equal(winner.ranking.scoreGap, 0);
	assert.equal(winner.ranking.decidedBy, "success");
	assert.ok(winner.ranking.decidedByGap > 0);
	assert.equal(loser.ranking.rank, 1);
	assert.ok(loser.ranking.bucket > 0);
	assertClose(
		loser.ranking.scoreGap,
		winner.score - loser.score,
		"the gap is the score difference",
	);
	assert.equal(loser.ranking.decidedBy, "success", "success is where it lost most");

	// The weighted terms are the score's own arithmetic, so they have to add up.
	for (const lane of ranked) {
		assertClose(
			lane.ranking.weighted.success +
				lane.ranking.weighted.cost +
				lane.ranking.weighted.firstOutput,
			lane.score,
			`${lane.substrate} weighted terms must sum to the score`,
		);
		assertClose(
			lane.ranking.weighted.success,
			DEFAULT_SELECTION_TUNING.successWeight * lane.terms.success,
			`${lane.substrate} weighted success`,
		);
	}
});

test("lanes the evidence cannot separate say so instead of naming a term", () => {
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces: [],
	});
	for (const lane of ranked) {
		assert.equal(lane.ranking.bucket, 0);
		assert.equal(lane.ranking.decidedBy, "configured-order");
		assert.equal(lane.ranking.decidedByGap, 0);
	}
	// A single candidate has nothing to be compared against, and inventing a
	// deciding term for it would be a fiction.
	const only = rankLanes({
		harness: "claude-code",
		candidates: ["e2b"],
		traces: repeat(9, () => trace({ substrate: "e2b", modelCostUsd: 0.01 })),
	});
	assert.equal(only[0].ranking.decidedBy, "configured-order");
	assert.equal(only[0].ranking.decidedByGap, 0);
});

test("rank order, bucket and rank index stay consistent across the result", () => {
	const traces = [
		...repeat(9, (i) => trace({ substrate: "e2b", ok: i < 3, modelCostUsd: 0.01 })),
		...repeat(9, () => trace({ substrate: "sprites", firstOutputMs: 700 })),
		...repeat(4, (i) => trace({ substrate: "vercel", ok: i < 3, modelCostUsd: 0.02 })),
	];
	const input = {
		harness: "claude-code" as HarnessKind,
		candidates: ["e2b", "sprites", "vercel", "dedalus"] as SubstrateKind[],
		traces,
	};
	const ranked = rankLanes(input);
	ranked.forEach((lane, index) => {
		assert.equal(lane.ranking.rank, index);
		if (index > 0) {
			assert.ok(
				lane.ranking.bucket >= ranked[index - 1].ranking.bucket,
				"buckets never decrease down the order",
			);
			assert.ok(lane.ranking.scoreGap >= ranked[index - 1].ranking.scoreGap - 1e-12);
		}
	});
	// The whole explanation, not just the order, has to be reproducible: a route
	// report recorded twice for the same evidence must read the same both times.
	assert.deepEqual(rankLanes({ ...input, traces: [...traces].reverse() }), ranked);
});

test("explainLane states the price, its basis and the deciding term", () => {
	const traces = [
		...repeat(8, () =>
			trace({
				substrate: "dedalus",
				durationMs: durationForComputeUsd("dedalus", 0.02),
				firstOutputMs: 1_000,
			}),
		),
		...repeat(8, () =>
			trace({
				substrate: "e2b",
				durationMs: durationForComputeUsd("e2b", 0.01),
				firstOutputMs: 1_000,
				modelCostUsd: 0.01,
			}),
		),
		...repeat(8, () => trace({ substrate: "sprites", ok: false })),
	];
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["dedalus", "e2b", "sprites"],
		traces,
	});

	const metered = explainLane(laneOf(ranked, "e2b"));
	assert.match(metered, /^claude-code@e2b, score /);
	assert.match(metered, /8\/8 runs ok/);
	assert.match(metered, /basis metered \(8 metered, 0 estimated runs\)/);
	assert.match(metered, /won on cost \(\+[\d.]+ of score\)/);

	const estimated = explainLane(laneOf(ranked, "dedalus"));
	assert.match(estimated, /basis estimated \(0 metered, 8 estimated runs\)/);
	assert.match(estimated, /a floor, some component was unpriced/);
	assert.match(estimated, /lost on cost \(-[\d.]+ of score\)/);

	const unpriced = explainLane(laneOf(ranked, "sprites"));
	assert.match(unpriced, /cost unknown \(unpriced_substrate\)/);
	assert.match(unpriced, /lost on success \(-[\d.]+ of score\)/);
});

test("time to first output breaks a tie on success and cost", () => {
	const traces = [
		...repeat(15, () =>
			trace({ substrate: "e2b", firstOutputMs: 8_000, modelCostUsd: 0.01 }),
		),
		...repeat(15, () =>
			trace({ substrate: "sprites", firstOutputMs: 800, modelCostUsd: 0.01 }),
		),
	];
	// e2b is the only priced lane, so it wins the cost term; sprites is ten
	// times faster to first output. Both are 15-for-15 on success.
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
	});
	assert.equal(laneOf(ranked, "e2b").measured.firstOutputP50Ms, 8_000);
	assert.equal(laneOf(ranked, "sprites").measured.firstOutputP50Ms, 800);
	assert.ok(
		laneOf(ranked, "sprites").terms.firstOutput >
			laneOf(ranked, "e2b").terms.firstOutput,
	);
	assert.equal(laneOf(ranked, "e2b").terms.success, laneOf(ranked, "sprites").terms.success);
});

test("a run that emitted no event contributes no first-output sample", () => {
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b"],
		traces: repeat(4, () => trace({ substrate: "e2b", modelCostUsd: 0.01 })),
	});
	const lane = laneOf(ranked, "e2b");
	assert.equal(lane.measured.firstOutputSamples, 0);
	assert.equal(lane.measured.firstOutputP50Ms, undefined);
	assert.equal(
		lane.terms.firstOutput,
		0.5,
		"no first output means unknown, not instant",
	);
	assert.equal(lane.measured.firstOutputSamples, 0);
});

test("every score carries the policy version that produced it", () => {
	const ranked = rankLanes({
		harness: "claude-code",
		candidates: ["e2b"],
		traces: [],
	});
	assert.equal(ranked[0].policy, SELECTION_POLICY_VERSION);
	assert.equal(new SelectionPolicy().version, SELECTION_POLICY_VERSION);
});

// ---------------------------------------------------------------------------
// Tuning: fail closed on anything that would silently distort a ranking.
// ---------------------------------------------------------------------------

test("tuning fills from the defaults and rejects unusable values", () => {
	assert.deepEqual(resolveSelectionTuning(), DEFAULT_SELECTION_TUNING);
	assert.equal(resolveSelectionTuning({ priorStrength: 20 }).priorStrength, 20);
	assert.equal(
		resolveSelectionTuning({ priorStrength: undefined }).priorStrength,
		DEFAULT_SELECTION_TUNING.priorStrength,
		"an explicit undefined must not erase a default",
	);

	const fatal = (pattern: RegExp) => (error: unknown) =>
		error instanceof MuxError && error.kind === "fatal" && pattern.test(error.message);

	assert.throws(
		() => resolveSelectionTuning({ successWeight: 0.9 }),
		fatal(/weights must sum to 1/),
	);
	assert.throws(
		() => resolveSelectionTuning({ priorStrength: 0 }),
		fatal(/priorStrength/),
	);
	assert.throws(
		() => resolveSelectionTuning({ priorStrength: Number.NaN }),
		fatal(/priorStrength/),
	);
	assert.throws(() => resolveSelectionTuning({ deadband: 0 }), fatal(/deadband/));
	assert.throws(() => resolveSelectionTuning({ deadband: 2 }), fatal(/deadband/));
	assert.throws(() => resolveSelectionTuning({ windowMs: 0 }), fatal(/windowMs/));
	assert.throws(
		() => resolveSelectionTuning({ priorSuccessRate: 1.5 }),
		fatal(/priorSuccessRate/),
	);
	assert.throws(
		() => new SelectionPolicy({ tuning: { costWeight: 0.5 } }),
		fatal(/weights must sum to 1/),
	);
});

test("a stronger prior demands more evidence before it moves a route", () => {
	const traces = [
		trace({ substrate: "sprites", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
		trace({ substrate: "sprites", firstOutputMs: 1_000, modelCostUsd: 0.01 }),
	];
	const weak = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
		tuning: { priorStrength: 1 },
	});
	const strong = rankLanes({
		harness: "claude-code",
		candidates: ["e2b", "sprites"],
		traces,
		tuning: { priorStrength: 200 },
	});
	assert.ok(
		laneOf(weak, "sprites").terms.success > laneOf(strong, "sprites").terms.success,
	);
	assert.deepEqual(ORDER(weak), ["sprites", "e2b"]);
	assert.deepEqual(
		ORDER(strong),
		["e2b", "sprites"],
		"two runs cannot overcome 200 pseudo-runs of prior",
	);
});

// ---------------------------------------------------------------------------
// The policy object: injected evidence, and the default disk source.
// ---------------------------------------------------------------------------

test("an injected trace function is re-read on every rank", () => {
	let traces: RunTrace[] = [];
	const policy = new SelectionPolicy({ traces: () => traces });
	assert.deepEqual(policy.order("claude-code", ["e2b", "sprites"]), [
		"e2b",
		"sprites",
	]);
	traces = repeat(20, () => trace({ substrate: "sprites", firstOutputMs: 2_000 }));
	assert.deepEqual(
		policy.order("claude-code", ["e2b", "sprites"]),
		["sprites", "e2b"],
		"a run that just landed must be visible to the next route",
	);
});

test("the default source reads the trace store inside the tuned window", (t) => {
	const dir = mkdtempSync(join(tmpdir(), "am-mux-selection-"));
	const saved = process.env.AGENT_MACHINES_MUX_TRACES;
	process.env.AGENT_MACHINES_MUX_TRACES = dir;
	t.after(() => {
		if (saved === undefined) delete process.env.AGENT_MACHINES_MUX_TRACES;
		else process.env.AGENT_MACHINES_MUX_TRACES = saved;
		rmSync(dir, { recursive: true, force: true });
	});

	const now = Date.parse("2026-08-01T12:00:00.000Z");
	const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();
	for (const record of repeat(20, () =>
		trace({ substrate: "e2b", ok: false, startedAt: thirtyDaysAgo }),
	)) {
		appendTrace(record);
	}

	// Default 7-day window: the old failures are out of scope, so there is no
	// evidence about either lane and the configured order stands.
	const recent = new SelectionPolicy({ now: () => now });
	assert.deepEqual(recent.order("claude-code", ["e2b", "sprites"]), [
		"e2b",
		"sprites",
	]);
	assert.equal(recent.rank("claude-code", ["e2b", "sprites"])[0].samples, 0);

	// Widen the window past the records and the same store demotes e2b.
	const wide = new SelectionPolicy({
		now: () => now,
		tuning: { windowMs: 60 * 86_400_000 },
	});
	const ranked = wide.rank("claude-code", ["e2b", "sprites"]);
	assert.deepEqual(ORDER(ranked), ["sprites", "e2b"]);
	assert.equal(laneOf(ranked, "e2b").samples, 20);
	assert.equal(laneOf(ranked, "e2b").ok, 0);
});
