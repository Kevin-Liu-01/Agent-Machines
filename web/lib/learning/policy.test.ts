import { describe, expect, it } from "vitest";

import { buildPolicyFromTraces, shouldRecomputePolicy, type TraceRow } from "./policy";
import { buildTraceLanePrice } from "@/lib/learning/trace-price";
import { buildTraceOutcome } from "@/lib/learning/route-outcomes";
import { armKey } from "@/lib/learning/types";
import { sandboxCostMillicents } from "@/lib/metrics/prices";

describe("shouldRecomputePolicy", () => {
	it("skips a rebuild when no trace is newer than the active snapshot", () => {
		expect(
			shouldRecomputePolicy(
				"2026-07-23T12:00:00.000Z",
				"2026-07-23T11:59:59.000Z",
			),
		).toBe(false);
		expect(shouldRecomputePolicy("2026-07-23T12:00:00.000Z", null)).toBe(false);
	});

	it("rebuilds for a new trace or when no policy exists", () => {
		expect(
			shouldRecomputePolicy(
				"2026-07-23T12:00:00.000Z",
				"2026-07-23T12:00:01.000Z",
			),
		).toBe(true);
		expect(shouldRecomputePolicy(null, null)).toBe(true);
	});
});

const RUN = { durationMs: 60_000, vcpu: 2, memoryMib: 4096 };
/** 276 -- E2B's published rate for the shared fixture run. */
const E2B_COST = sandboxCostMillicents("e2b", RUN) as number;

/** A row on an unpriced lane, shaped exactly as today's ingest writes one. */
function row(over: Partial<TraceRow> & { substrate: string }): TraceRow {
	return {
		task_class: "test",
		runtime: "claude-code",
		model: "claude-opus-4-8",
		router_id: null,
		success: true,
		cost_millicents: null,
		latency_ms: 60_000,
		extra: {
			outcome: buildTraceOutcome({ sandboxCostMillicents: null }),
			price: buildTraceLanePrice({
				substrate: over.substrate,
				rateBasis: "unknown",
				unknownReason: "unpriced fixture",
			}),
		},
		...over,
	};
}

/** A row written by today's ingest on a lane with a published rate. */
function pricedRow(
	substrate: string,
	millicents: number,
	latencyMs: number | null = 60_000,
): TraceRow {
	return row({
		substrate,
		cost_millicents: millicents,
		latency_ms: latencyMs,
		extra: {
			outcome: buildTraceOutcome({ sandboxCostMillicents: millicents }),
			price: buildTraceLanePrice({ substrate, rateBasis: "published" }),
		},
	});
}

function key(substrate: string): string {
	return armKey({
		runtime: "claude-code",
		substrate: substrate as never,
		model: "claude-opus-4-8",
		routerId: null,
	});
}

describe("buildPolicyFromTraces -- what may enter the cost posterior", () => {
	it("admits a published-rate row at exactly the figure it carries", () => {
		const built = buildPolicyFromTraces([pricedRow("e2b", E2B_COST)]);
		const agg = built.artifact.global[key("e2b")];
		expect(agg.n).toBe(1);
		expect(agg.cost.n).toBe(1);
		expect(agg.cost.mean).toBe(276);
		expect(built.costObservations).toBe(1);
		expect(built.weights.costRange).toEqual({ min: 0, max: 276 });
	});

	it("keeps an unpriced lane routable but out of the cost statistics", () => {
		const built = buildPolicyFromTraces([
			pricedRow("e2b", E2B_COST),
			row({ substrate: "sprites", success: false }),
			row({ substrate: "sprites" }),
		]);
		const sprites = built.artifact.global[key("sprites")];
		// The lane still learns: two runs, one success, both latencies.
		expect(sprites.n).toBe(2);
		expect(sprites.successes).toBe(1);
		expect(sprites.latency.n).toBe(2);
		// ...and contributes nothing to cost. Not a zero -- nothing.
		expect(sprites.cost.n).toBe(0);
		expect(built.costSkipped.not_cost_ranked).toBe(2);
		expect(built.costObservations).toBe(1);
		// One unpriced lane cannot stretch the scale the priced lanes are judged on.
		expect(built.weights.costRange.max).toBe(276);
	});

	it("refuses a legacy row written by the retired single-table estimator", () => {
		// Same lane, same shape, but no extra.price block: this row's 1 millicent
		// came from metrics/cost.ts, and averaging it with a 276 from the
		// published rate would describe neither.
		const legacy: TraceRow = {
			...pricedRow("e2b", 1),
			extra: { cronId: "cron-1" },
		};
		const built = buildPolicyFromTraces([legacy, pricedRow("e2b", E2B_COST)]);
		const agg = built.artifact.global[key("e2b")];
		expect(agg.n).toBe(2);
		expect(agg.cost.n).toBe(1);
		expect(agg.cost.mean).toBe(276);
		expect(built.costSkipped.legacy_estimate).toBe(1);
	});

	it("refuses a row whose lane was priced then but is unpriced now", () => {
		// The block says published; today's table says sprites is not. Lanes are
		// compared under ONE table, so today's table wins.
		const built = buildPolicyFromTraces([pricedRow("sprites", 999)]);
		expect(built.artifact.global[key("sprites")].cost.n).toBe(0);
		expect(built.costSkipped.lane_unpriced_now).toBe(1);
	});

	it("refuses a published-lane row that the run itself made unpriceable", () => {
		// E2B with no usable wall clock: rate published, row not cost-ranked. It
		// must land in not_cost_ranked, NOT in lane_unpriced_now -- the lane is
		// fine and a report that said otherwise would send someone chasing E2B.
		const noWindow = row({
			substrate: "e2b",
			latency_ms: null,
			extra: {
				outcome: buildTraceOutcome({ sandboxCostMillicents: null }),
				price: buildTraceLanePrice({
					substrate: "e2b",
					rateBasis: "published",
					unknownReason: "run window is unusable",
				}),
			},
		});
		const built = buildPolicyFromTraces([noWindow]);
		expect(built.costSkipped.not_cost_ranked).toBe(1);
		expect(built.costSkipped.lane_unpriced_now).toBe(0);
	});

	it("counts a cost-ranked row carrying no figure separately", () => {
		const built = buildPolicyFromTraces([
			{ ...pricedRow("e2b", 0), cost_millicents: null },
		]);
		expect(built.costSkipped).toEqual({
			legacy_estimate: 0,
			not_cost_ranked: 0,
			lane_unpriced_now: 0,
			no_figure: 1,
		});
	});

	it("turns the cost term off entirely when nothing could be priced", () => {
		const built = buildPolicyFromTraces([row({ substrate: "sprites" })]);
		// max 1 (the old fallback) made a one-millicent run absorb the whole
		// penalty; a degenerate range is what normalize() reads as "term off".
		expect(built.weights.costRange).toEqual({ min: 0, max: 0 });
		expect(built.costObservations).toBe(0);
	});

	it("never advances the latency Welford for a row that reported none", () => {
		const built = buildPolicyFromTraces([
			pricedRow("e2b", E2B_COST, null),
			pricedRow("e2b", E2B_COST, 1_000),
		]);
		const agg = built.artifact.global[key("e2b")];
		expect(agg.n).toBe(2);
		expect(agg.latency.n).toBe(1);
		expect(agg.latency.mean).toBe(1_000);
		expect(built.weights.latRange).toEqual({ min: 0, max: 1_000 });
	});

	it("applies the same gates to the per-task-class cells", () => {
		const built = buildPolicyFromTraces([
			pricedRow("e2b", E2B_COST),
			row({ substrate: "sprites" }),
		]);
		const byClass = built.artifact.byClass.test;
		expect(byClass[key("e2b")].cost.n).toBe(1);
		expect(byClass[key("sprites")].cost.n).toBe(0);
		expect(byClass[key("sprites")].n).toBe(1);
	});

	it("ignores a row with no recorded success, as before", () => {
		const built = buildPolicyFromTraces([{ ...pricedRow("e2b", E2B_COST), success: null }]);
		expect(built.artifact.global).toEqual({});
	});
});
