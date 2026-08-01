import { describe, expect, it } from "vitest";

import {
	buildTraceOutcome,
	isTruncatedExit,
	readTraceOutcome,
	rollupRouteOutcomes,
	routeKey,
	TRACE_OUTCOME_VERSION,
	type RouteOutcomeRow,
} from "./route-outcomes";

type RowInput = Partial<RouteOutcomeRow> & { runtime: string; substrate: string };

function row(input: RowInput): RouteOutcomeRow {
	return {
		source: "cron",
		success: null,
		exit_code: null,
		cost_millicents: null,
		latency_ms: null,
		extra: null,
		...input,
	};
}

/** A row the way ingest writes it today: sandbox cost only, model half null. */
function cronRow(
	input: RowInput & { success: boolean; exit_code: number; latency_ms: number; sandbox: number },
): RouteOutcomeRow {
	return row({
		...input,
		cost_millicents: input.sandbox,
		extra: { cronId: "c1", outcome: buildTraceOutcome({ sandboxCostMillicents: input.sandbox }) },
	});
}

const ROUTE_A: RouteOutcomeRow[] = [
	cronRow({ runtime: "claude-code", substrate: "e2b", success: true, exit_code: 0, latency_ms: 1000, sandbox: 100 }),
	cronRow({ runtime: "claude-code", substrate: "e2b", success: true, exit_code: 0, latency_ms: 3000, sandbox: 300 }),
	cronRow({ runtime: "claude-code", substrate: "e2b", success: false, exit_code: 1, latency_ms: 2000, sandbox: 200 }),
	cronRow({ runtime: "claude-code", substrate: "e2b", success: false, exit_code: 137, latency_ms: 500, sandbox: 50 }),
];

function find(report: ReturnType<typeof rollupRouteOutcomes>, runtime: string, substrate: string) {
	const route = report.routes.find(
		(r) => r.runtime === runtime && r.substrate === substrate,
	);
	if (!route) throw new Error(`no route ${routeKey({ runtime, substrate })}`);
	return route;
}

describe("rollupRouteOutcomes -- task success and truncation", () => {
	it("reports exact rates from the fixture", () => {
		const report = rollupRouteOutcomes(ROUTE_A);
		const a = find(report, "claude-code", "e2b");
		expect(report.totalRuns).toBe(4);
		expect(a.runs).toBe(4);
		expect(a.recognized).toBe(true);
		expect(a.taskSuccess).toEqual({
			status: "available",
			value: { rate: 0.5, count: 2, observed: 4 },
		});
		// exit 137 = 128 + SIGKILL: the run was stopped, not answered.
		expect(a.resume.truncated).toEqual({
			status: "available",
			value: { rate: 0.25, count: 1, observed: 4 },
		});
	});

	it("classifies only timeout and signal exits as truncated", () => {
		expect(isTruncatedExit(0)).toBe(false);
		expect(isTruncatedExit(1)).toBe(false);
		expect(isTruncatedExit(123)).toBe(false);
		expect(isTruncatedExit(124)).toBe(true);
		expect(isTruncatedExit(127)).toBe(false);
		expect(isTruncatedExit(128)).toBe(true);
		expect(isTruncatedExit(143)).toBe(true);
	});

	it("counts only rows that recorded an outcome, not all rows", () => {
		const report = rollupRouteOutcomes([
			row({ runtime: "hermes", substrate: "sprites", success: true, exit_code: 0 }),
			row({ runtime: "hermes", substrate: "sprites", success: null, exit_code: null }),
		]);
		const r = find(report, "hermes", "sprites");
		expect(r.runs).toBe(2);
		expect(r.taskSuccess).toEqual({
			status: "available",
			value: { rate: 1, count: 1, observed: 1 },
		});
	});
});

describe("rollupRouteOutcomes -- wall clock vs time to first output", () => {
	it("uses the lower of two middles for an even sample count", () => {
		const report = rollupRouteOutcomes(ROUTE_A);
		const a = find(report, "claude-code", "e2b");
		// samples [500, 1000, 2000, 3000] -> nearest-rank p50 = 1000, mean = 1625
		expect(a.wallClock).toEqual({
			status: "available",
			value: { p50Ms: 1000, meanMs: 1625, observed: 4 },
		});
	});

	it("never substitutes wall clock for the missing first-output number", () => {
		const a = find(rollupRouteOutcomes(ROUTE_A), "claude-code", "e2b");
		expect(a.timeToFirstOutput).toEqual({
			status: "unavailable",
			reason: "not_captured_by_source",
		});
	});

	it("reports a first-output number once the source records one", () => {
		const outcome = {
			...buildTraceOutcome({ sandboxCostMillicents: 10 }),
			timeToFirstOutputMs: 750,
		};
		const report = rollupRouteOutcomes([
			row({
				runtime: "codex",
				substrate: "e2b",
				success: true,
				exit_code: 0,
				extra: { outcome },
			}),
		]);
		expect(find(report, "codex", "e2b").timeToFirstOutput).toEqual({
			status: "available",
			value: { p50Ms: 750, meanMs: 750, observed: 1 },
		});
	});
});

describe("rollupRouteOutcomes -- cost, split and never conflated", () => {
	it("averages sandbox cost over successful runs only", () => {
		const a = find(rollupRouteOutcomes(ROUTE_A), "claude-code", "e2b");
		// successful sandbox samples [100, 300] -> mean 200. The 200 and 50 from
		// the failed runs must not be in there.
		expect(a.cost.sandbox).toEqual({
			status: "available",
			value: { meanMillicents: 200, observed: 2, basis: "estimated" },
		});
	});

	it("keeps the model half and the total unavailable, never 0", () => {
		const a = find(rollupRouteOutcomes(ROUTE_A), "claude-code", "e2b");
		expect(a.cost.model).toEqual({
			status: "unavailable",
			reason: "not_captured_by_source",
		});
		expect(a.cost.total).toEqual({
			status: "unavailable",
			reason: "not_captured_by_source",
		});
		expect(JSON.stringify(a.cost)).not.toContain('"meanMillicents":0');
	});

	it("sums a total only when both halves are present", () => {
		const outcome = {
			...buildTraceOutcome({ sandboxCostMillicents: 120 }),
			modelCostMillicents: 380,
		};
		const report = rollupRouteOutcomes([
			row({
				runtime: "openclaw",
				substrate: "sprites",
				success: true,
				exit_code: 0,
				extra: { outcome },
			}),
		]);
		expect(find(report, "openclaw", "sprites").cost.total).toEqual({
			status: "available",
			value: { meanMillicents: 500, observed: 1, basis: "estimated" },
		});
	});

	it("reads a legacy row's cost_millicents as the sandbox half", () => {
		const report = rollupRouteOutcomes([
			row({
				runtime: "hermes",
				substrate: "sprites",
				success: true,
				exit_code: 0,
				cost_millicents: 400,
				extra: { cronId: "legacy" },
			}),
		]);
		expect(find(report, "hermes", "sprites").cost.sandbox).toEqual({
			status: "available",
			value: { meanMillicents: 400, observed: 1, basis: "estimated" },
		});
	});

	it("refuses a legacy cost from a source that is not the cron estimator", () => {
		const report = rollupRouteOutcomes([
			row({
				runtime: "openclaw",
				substrate: "vercel",
				source: "interactive",
				success: true,
				exit_code: 0,
				cost_millicents: 999,
			}),
		]);
		const r = find(report, "openclaw", "vercel");
		expect(r.cost.sandbox).toEqual({ status: "unavailable", reason: "no_samples" });
		expect(JSON.stringify(r.cost.sandbox)).not.toContain("999");
	});

	it("has no cost per success when nothing succeeded", () => {
		const report = rollupRouteOutcomes([
			cronRow({ runtime: "hermes", substrate: "e2b", success: false, exit_code: 1, latency_ms: 900, sandbox: 90 }),
		]);
		const r = find(report, "hermes", "e2b");
		expect(r.cost.sandbox).toEqual({
			status: "unavailable",
			reason: "no_successful_run",
		});
		expect(r.cost.total).toEqual({
			status: "unavailable",
			reason: "no_successful_run",
		});
	});
});

describe("rollupRouteOutcomes -- resume", () => {
	it("reports no resume path rather than a 0% resume rate", () => {
		const a = find(rollupRouteOutcomes(ROUTE_A), "claude-code", "e2b");
		expect(a.resume.resumed).toEqual({
			status: "unavailable",
			reason: "no_resume_path",
		});
	});

	it("reports a rate once a writer records resume attempts", () => {
		const resumedOutcome = {
			...buildTraceOutcome({ sandboxCostMillicents: 10 }),
			resumed: true,
		};
		const notResumed = {
			...buildTraceOutcome({ sandboxCostMillicents: 10 }),
			resumed: false,
		};
		const report = rollupRouteOutcomes([
			row({ runtime: "codex", substrate: "sprites", success: true, exit_code: 0, extra: { outcome: resumedOutcome } }),
			row({ runtime: "codex", substrate: "sprites", success: false, exit_code: 137, extra: { outcome: notResumed } }),
		]);
		expect(find(report, "codex", "sprites").resume.resumed).toEqual({
			status: "available",
			value: { rate: 0.5, count: 1, observed: 2 },
		});
	});
});

describe("rollupRouteOutcomes -- shape and ordering", () => {
	it("orders by run count then route name, deterministically", () => {
		const report = rollupRouteOutcomes([
			...ROUTE_A,
			row({ runtime: "hermes", substrate: "sprites", success: true, exit_code: 0 }),
			row({ runtime: "codex", substrate: "e2b", success: true, exit_code: 0 }),
		]);
		expect(report.routes.map((r) => routeKey(r))).toEqual([
			"claude-code|e2b",
			"codex|e2b",
			"hermes|sprites",
		]);
	});

	it("surfaces an unrecognized arm axis instead of dropping or coercing it", () => {
		const report = rollupRouteOutcomes([
			row({ runtime: "gpt-cli", substrate: "e2b", success: true, exit_code: 0 }),
		]);
		const r = find(report, "gpt-cli", "e2b");
		expect(r.recognized).toBe(false);
		expect(r.runs).toBe(1);
	});

	it("skips rows with no route axis at all", () => {
		const report = rollupRouteOutcomes([
			row({ runtime: "", substrate: "e2b", success: true, exit_code: 0 }),
		]);
		expect(report.routes).toEqual([]);
		expect(report.totalRuns).toBe(0);
	});

	it("lists every reason a metric is fleet-wide unavailable", () => {
		const report = rollupRouteOutcomes([
			...ROUTE_A,
			cronRow({ runtime: "hermes", substrate: "e2b", success: false, exit_code: 1, latency_ms: 900, sandbox: 90 }),
		]);
		const byMetric = new Map(report.gaps.map((g) => [g.metric, g.reasons]));
		expect(byMetric.get("timeToFirstOutput")).toEqual(["not_captured_by_source"]);
		expect(byMetric.get("resumed")).toEqual(["no_resume_path"]);
		// claude-code|e2b has successes (model half missing); hermes|e2b has none.
		expect(byMetric.get("costTotal")).toEqual([
			"no_successful_run",
			"not_captured_by_source",
		]);
		// Available somewhere, so not a gap.
		expect(byMetric.has("taskSuccess")).toBe(false);
		expect(byMetric.has("costSandbox")).toBe(false);
	});

	it("returns an empty report for no rows", () => {
		expect(rollupRouteOutcomes([])).toEqual({ routes: [], totalRuns: 0, gaps: [] });
	});
});

describe("readTraceOutcome", () => {
	it("round-trips what ingest writes", () => {
		const outcome = buildTraceOutcome({ sandboxCostMillicents: 42 });
		expect(readTraceOutcome({ cronId: "c", outcome })).toEqual({
			v: TRACE_OUTCOME_VERSION,
			sandboxCostMillicents: 42,
			sandboxCostBasis: "estimated",
			modelCostMillicents: null,
			timeToFirstOutputMs: null,
			resumed: null,
		});
	});

	it("rejects anything it does not fully understand", () => {
		const good = buildTraceOutcome({ sandboxCostMillicents: 1 });
		expect(readTraceOutcome(null)).toBeNull();
		expect(readTraceOutcome({})).toBeNull();
		expect(readTraceOutcome({ outcome: { ...good, v: 2 } })).toBeNull();
		expect(readTraceOutcome({ outcome: { ...good, sandboxCostBasis: "guess" } })).toBeNull();
		expect(readTraceOutcome({ outcome: { ...good, sandboxCostMillicents: "100" } })).toBeNull();
		expect(readTraceOutcome({ outcome: { ...good, modelCostMillicents: Number.NaN } })).toBeNull();
		expect(readTraceOutcome({ outcome: { ...good, resumed: "yes" } })).toBeNull();
	});

	it("drops a malformed cost block rather than counting it as zero", () => {
		const report = rollupRouteOutcomes([
			row({
				runtime: "codex",
				substrate: "e2b",
				source: "interactive",
				success: true,
				exit_code: 0,
				cost_millicents: 500,
				extra: { outcome: { v: 99, sandboxCostMillicents: 500 } },
			}),
		]);
		expect(find(report, "codex", "e2b").cost.sandbox).toEqual({
			status: "unavailable",
			reason: "no_samples",
		});
	});
});
