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
import {
	DEFAULT_SELECTION_TUNING,
	SELECTION_POLICY_VERSION,
	SelectionPolicy,
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
