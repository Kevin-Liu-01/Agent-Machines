/**
 * Roadmap 1.3 (hosted half) -- the four owed numbers, per route.
 *
 * "Route" here is the arm's agent x substrate pair, which is the axis the YC
 * table promises: task success, time to first output, total cost to a
 * successful result, and resume/truncation outcome.
 *
 * Only three of the four are measurable from the hosted trace table today, and
 * this module refuses to paper over the fourth. What the source can and cannot
 * give us, precisely:
 *
 * - task success -- available. `run_traces.success` (exit code 0).
 * - time to first output -- NOT captured. The authoritative source is the
 *   on-box cron log `~/.agent-machines/cron/runs.jsonl`, written by
 *   `buildCronCommand` (web/lib/crons/service.ts), which records only
 *   startedAt/finishedAt/exitCode. No first-output timestamp exists to read,
 *   so every row reports `not_captured_by_source` rather than 0.
 * - cost to a successful result -- HALF available, and deliberately not summed.
 *   The sandbox-compute half is an estimate (`estimateCost` on the machine
 *   spec); the model half is never persisted on the hosted path. A total would
 *   be the exact conflation roadmap 1.2 exists to stop, so `total` stays
 *   unavailable until the model half lands.
 * - resume/truncation -- HALF available. Truncation is derivable from the
 *   recorded exit code (128+signal, or 124 from timeout(1)) on every row
 *   including historical ones. Resume is not: nothing in the hosted control
 *   plane retries or replays a run, so there is no outcome to report.
 *
 * The split cost fields ride in `run_traces.extra.outcome` (jsonb), so no
 * Supabase migration is required for this to work. Promoting them to typed
 * columns is a separate, optional human call -- see the return notes.
 */

import { AGENT_KINDS, PROVIDER_KINDS } from "@/lib/user-config/schema";

/** Schema version of the `extra.outcome` block ingest writes. */
export const TRACE_OUTCOME_VERSION = 1;

/**
 * Provenance of a cost figure. `estimated` is a rate-table guess against the
 * machine spec; `metered` is a real provider-billed number. Nothing produces
 * `metered` today -- the member exists so a future metered row is
 * distinguishable instead of silently averaged in with estimates.
 */
export type CostBasis = "estimated" | "metered";

const COST_BASES: ReadonlyArray<CostBasis> = ["estimated", "metered"];

/**
 * The per-run outcome block ingest attaches to `run_traces.extra`.
 *
 * A `null` field means "this writer ran, and the source had no value" --
 * distinct from an absent block, which means the row predates instrumentation.
 * Both render as unknown; neither renders as 0.
 */
export type TraceOutcome = {
	v: typeof TRACE_OUTCOME_VERSION;
	/** Sandbox compute only. Never the model half, never a sum. */
	sandboxCostMillicents: number | null;
	sandboxCostBasis: CostBasis;
	/** Model tokens. Always null on the cron path -- the box logs no token usage. */
	modelCostMillicents: number | null;
	/** Always null: runs.jsonl records no first-output timestamp. */
	timeToFirstOutputMs: number | null;
	/** Always null: no hosted run is resumed or replayed. */
	resumed: boolean | null;
};

/** Build the outcome block for one ingested run. Kept honest about nulls. */
export function buildTraceOutcome(input: {
	sandboxCostMillicents: number | null;
}): TraceOutcome {
	return {
		v: TRACE_OUTCOME_VERSION,
		sandboxCostMillicents: input.sandboxCostMillicents,
		sandboxCostBasis: "estimated",
		modelCostMillicents: null,
		timeToFirstOutputMs: null,
		resumed: null,
	};
}

/** Why a number is missing. The UI maps each to copy; none of them mean 0. */
export type UnavailableReason =
	/** No run at all on this route in the window. */
	| "no_runs"
	/** Runs exist, but none carried a usable value for this metric. */
	| "no_samples"
	/** Runs exist and none succeeded, so a per-success figure has no basis. */
	| "no_successful_run"
	/** The trace source does not record this value at all yet. */
	| "not_captured_by_source"
	/** Nothing resumes a hosted run, so there is no resume outcome to report. */
	| "no_resume_path";

export type Metric<T> =
	| { status: "available"; value: T }
	| { status: "unavailable"; reason: UnavailableReason };

function available<T>(value: T): Metric<T> {
	return { status: "available", value };
}

function unavailable<T>(reason: UnavailableReason): Metric<T> {
	return { status: "unavailable", reason };
}

export type RateValue = { rate: number; count: number; observed: number };
export type DurationValue = { p50Ms: number; meanMs: number; observed: number };
export type CostValue = { meanMillicents: number; observed: number; basis: CostBasis };

export type RouteOutcome = {
	runtime: string;
	substrate: string;
	/**
	 * False when either axis is not a known AgentKind/ProviderKind. The arm
	 * snapshot in the run log is unvalidated free text, so an unrecognized
	 * value is surfaced, not dropped and not coerced.
	 */
	recognized: boolean;
	/** Trace rows on this route in the window. */
	runs: number;
	/** Task success rate over rows with a recorded success value. */
	taskSuccess: Metric<RateValue>;
	/** Time from dispatch to the agent's first output. Not captured today. */
	timeToFirstOutput: Metric<DurationValue>;
	/** Total wall clock, which is NOT time-to-first-output. Reported so the
	 *  panel has an honest latency number while the real one is missing. */
	wallClock: Metric<DurationValue>;
	cost: {
		/** Sandbox compute for successful runs. Estimated, per `basis`. */
		sandbox: Metric<CostValue>;
		/** Model tokens for successful runs. Not persisted on the hosted path. */
		model: Metric<CostValue>;
		/** sandbox + model. Unavailable while either half is, by design. */
		total: Metric<CostValue>;
	};
	resume: {
		/** Runs killed rather than returning a result (exit 124 or >= 128). */
		truncated: Metric<RateValue>;
		/** Runs that were resumed after truncation. Nothing resumes today. */
		resumed: Metric<RateValue>;
	};
};

export type RouteOutcomesReport = {
	routes: RouteOutcome[];
	totalRuns: number;
	/**
	 * Metrics unavailable on every route, so the panel can say so once. Every
	 * distinct reason is listed -- collapsing them to one would misreport the
	 * routes that were unavailable for a different reason.
	 */
	gaps: Array<{ metric: string; reasons: UnavailableReason[] }>;
};

/** The trace columns the rollup reads. Mirrors the route's Supabase select. */
export type RouteOutcomeRow = {
	runtime: string;
	substrate: string;
	source: string | null;
	success: boolean | null;
	exit_code: number | null;
	cost_millicents: number | null;
	latency_ms: number | null;
	extra: unknown;
};

/**
 * GNU `timeout` reports 124; a shell reports 128+N for a process killed by
 * signal N. Either way the agent was stopped instead of returning a result,
 * which is the truncation half of the resume metric.
 */
const TIMEOUT_EXIT = 124;
const SIGNAL_EXIT_FLOOR = 128;

export function isTruncatedExit(exitCode: number): boolean {
	return exitCode === TIMEOUT_EXIT || exitCode >= SIGNAL_EXIT_FLOOR;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown): number | null | undefined {
	if (value === null) return null;
	return isFiniteNumber(value) ? value : undefined;
}

/**
 * Strictly read the outcome block out of untyped jsonb. Anything malformed or
 * from an unknown schema version is rejected outright: a half-understood block
 * would put invented numbers in a cost column.
 */
export function readTraceOutcome(extra: unknown): TraceOutcome | null {
	if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
	const block = (extra as { outcome?: unknown }).outcome;
	if (!block || typeof block !== "object" || Array.isArray(block)) return null;
	const o = block as Record<string, unknown>;
	if (o.v !== TRACE_OUTCOME_VERSION) return null;
	const basis = o.sandboxCostBasis;
	if (typeof basis !== "string" || !COST_BASES.includes(basis as CostBasis)) return null;
	const sandbox = nullableNumber(o.sandboxCostMillicents);
	const model = nullableNumber(o.modelCostMillicents);
	const tto = nullableNumber(o.timeToFirstOutputMs);
	if (sandbox === undefined || model === undefined || tto === undefined) return null;
	const resumed = o.resumed === null || typeof o.resumed === "boolean" ? o.resumed : undefined;
	if (resumed === undefined) return null;
	return {
		v: TRACE_OUTCOME_VERSION,
		sandboxCostMillicents: sandbox,
		sandboxCostBasis: basis as CostBasis,
		modelCostMillicents: model,
		timeToFirstOutputMs: tto,
		resumed,
	};
}

type Sample = { value: number; basis: CostBasis };

/**
 * Sandbox cost for one row.
 *
 * Legacy rows have no outcome block, but `cost_millicents` on a cron trace has
 * only ever been `estimateCost(machine.spec, ...)` -- sandbox compute alone --
 * so reading it as the sandbox half conflates nothing. Any other source is
 * refused rather than assumed.
 */
function sandboxSample(row: RouteOutcomeRow): Sample | null {
	const outcome = readTraceOutcome(row.extra);
	if (outcome) {
		return outcome.sandboxCostMillicents === null
			? null
			: { value: outcome.sandboxCostMillicents, basis: outcome.sandboxCostBasis };
	}
	if (row.source === "cron" && isFiniteNumber(row.cost_millicents)) {
		return { value: row.cost_millicents, basis: "estimated" };
	}
	return null;
}

function modelSample(row: RouteOutcomeRow): Sample | null {
	const outcome = readTraceOutcome(row.extra);
	if (!outcome || outcome.modelCostMillicents === null) return null;
	return { value: outcome.modelCostMillicents, basis: outcome.sandboxCostBasis };
}

type Acc = {
	runtime: string;
	substrate: string;
	runs: number;
	successObserved: number;
	successes: number;
	tto: number[];
	wall: number[];
	sandbox: Sample[];
	model: Sample[];
	exitObserved: number;
	truncated: number;
	resumeObserved: number;
	resumed: number;
};

function emptyAcc(runtime: string, substrate: string): Acc {
	return {
		runtime,
		substrate,
		runs: 0,
		successObserved: 0,
		successes: 0,
		tto: [],
		wall: [],
		sandbox: [],
		model: [],
		exitObserved: 0,
		truncated: 0,
		resumeObserved: 0,
		resumed: 0,
	};
}

function round(value: number, places: number): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
	let total = 0;
	for (const v of values) total += v;
	return total / values.length;
}

/**
 * Nearest-rank median: the ceil(n/2)-th smallest. For an even count this is
 * the lower of the two middles -- a real observation rather than an
 * interpolated value that no run ever produced.
 */
function p50(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length / 2) - 1];
}

function durationMetric(
	samples: number[],
	emptyReason: UnavailableReason,
): Metric<DurationValue> {
	if (samples.length === 0) return unavailable(emptyReason);
	return available({
		p50Ms: round(p50(samples), 2),
		meanMs: round(mean(samples), 2),
		observed: samples.length,
	});
}

/**
 * Cost metric over successful runs. Mixed provenance is refused rather than
 * averaged: an estimate and a metered figure are not the same unit of truth.
 */
function costMetric(
	samples: Sample[],
	successObserved: number,
	successes: number,
	emptyReason: UnavailableReason,
): Metric<CostValue> {
	if (successObserved > 0 && successes === 0) return unavailable("no_successful_run");
	if (samples.length === 0) return unavailable(emptyReason);
	const bases = new Set(samples.map((s) => s.basis));
	if (bases.size > 1) return unavailable("no_samples");
	return available({
		meanMillicents: round(mean(samples.map((s) => s.value)), 2),
		observed: samples.length,
		basis: samples[0].basis,
	});
}

function rateMetric(count: number, observed: number): Metric<RateValue> {
	if (observed === 0) return unavailable("no_samples");
	return available({ rate: round(count / observed, 4), count, observed });
}

function totalCost(
	sandbox: Metric<CostValue>,
	model: Metric<CostValue>,
): Metric<CostValue> {
	// A total that silently means "sandbox only" is the conflation roadmap 1.2
	// exists to end, so both halves must be present or there is no total.
	if (model.status === "unavailable") return unavailable(model.reason);
	if (sandbox.status === "unavailable") return unavailable(sandbox.reason);
	if (sandbox.value.basis !== model.value.basis) return unavailable("no_samples");
	return available({
		meanMillicents: round(sandbox.value.meanMillicents + model.value.meanMillicents, 2),
		observed: Math.min(sandbox.value.observed, model.value.observed),
		basis: sandbox.value.basis,
	});
}

const KNOWN_AGENTS = new Set<string>(AGENT_KINDS as ReadonlyArray<string>);
const KNOWN_PROVIDERS = new Set<string>(PROVIDER_KINDS as ReadonlyArray<string>);

function finish(acc: Acc): RouteOutcome {
	const sandbox = costMetric(
		acc.sandbox,
		acc.successObserved,
		acc.successes,
		"no_samples",
	);
	const model = costMetric(
		acc.model,
		acc.successObserved,
		acc.successes,
		"not_captured_by_source",
	);
	return {
		runtime: acc.runtime,
		substrate: acc.substrate,
		recognized: KNOWN_AGENTS.has(acc.runtime) && KNOWN_PROVIDERS.has(acc.substrate),
		runs: acc.runs,
		taskSuccess: rateMetric(acc.successes, acc.successObserved),
		timeToFirstOutput: durationMetric(acc.tto, "not_captured_by_source"),
		wallClock: durationMetric(acc.wall, "no_samples"),
		cost: { sandbox, model, total: totalCost(sandbox, model) },
		resume: {
			truncated: rateMetric(acc.truncated, acc.exitObserved),
			resumed:
				acc.resumeObserved === 0
					? unavailable("no_resume_path")
					: rateMetric(acc.resumed, acc.resumeObserved),
		},
	};
}

/** Metric ids used in the `gaps` list and by the panel's column keys. */
const GAP_METRICS = [
	"taskSuccess",
	"timeToFirstOutput",
	"costSandbox",
	"costModel",
	"costTotal",
	"truncated",
	"resumed",
] as const;

function metricFor(route: RouteOutcome, id: (typeof GAP_METRICS)[number]): Metric<unknown> {
	switch (id) {
		case "taskSuccess":
			return route.taskSuccess;
		case "timeToFirstOutput":
			return route.timeToFirstOutput;
		case "costSandbox":
			return route.cost.sandbox;
		case "costModel":
			return route.cost.model;
		case "costTotal":
			return route.cost.total;
		case "truncated":
			return route.resume.truncated;
		case "resumed":
			return route.resume.resumed;
	}
}

/**
 * Roll trace rows up per agent x substrate route.
 *
 * Pure: no Supabase, no auth, no clock. Rows arrive already scoped to one
 * tenant by the caller.
 */
export function rollupRouteOutcomes(rows: RouteOutcomeRow[]): RouteOutcomesReport {
	const byRoute = new Map<string, Acc>();
	for (const row of rows) {
		if (typeof row.runtime !== "string" || typeof row.substrate !== "string") continue;
		if (row.runtime === "" || row.substrate === "") continue;
		const key = `${row.runtime}|${row.substrate}`;
		const acc = byRoute.get(key) ?? emptyAcc(row.runtime, row.substrate);
		byRoute.set(key, acc);
		acc.runs += 1;
		if (row.success !== null) {
			acc.successObserved += 1;
			if (row.success) acc.successes += 1;
		}
		if (isFiniteNumber(row.exit_code)) {
			acc.exitObserved += 1;
			if (isTruncatedExit(row.exit_code)) acc.truncated += 1;
		}
		if (isFiniteNumber(row.latency_ms) && row.latency_ms >= 0) acc.wall.push(row.latency_ms);
		const outcome = readTraceOutcome(row.extra);
		if (outcome?.timeToFirstOutputMs !== null && outcome?.timeToFirstOutputMs !== undefined) {
			acc.tto.push(outcome.timeToFirstOutputMs);
		}
		if (outcome && outcome.resumed !== null) {
			acc.resumeObserved += 1;
			if (outcome.resumed) acc.resumed += 1;
		}
		// Cost is "cost to a successful result", so only successful runs count.
		if (row.success === true) {
			const sandbox = sandboxSample(row);
			if (sandbox) acc.sandbox.push(sandbox);
			const model = modelSample(row);
			if (model) acc.model.push(model);
		}
	}

	const routes = [...byRoute.values()]
		.map(finish)
		.sort(
			(a, b) =>
				b.runs - a.runs ||
				a.runtime.localeCompare(b.runtime) ||
				a.substrate.localeCompare(b.substrate),
		);

	const gaps: RouteOutcomesReport["gaps"] = [];
	if (routes.length > 0) {
		for (const id of GAP_METRICS) {
			const metrics = routes.map((r) => metricFor(r, id));
			if (metrics.every((m) => m.status === "unavailable")) {
				const reasons = new Set(
					metrics.map((m) => (m as { reason: UnavailableReason }).reason),
				);
				gaps.push({ metric: id, reasons: [...reasons].sort() });
			}
		}
	}

	return {
		routes,
		totalRuns: routes.reduce((sum, r) => sum + r.runs, 0),
		gaps,
	};
}

/** Stable identity for one route, used as a React key and in tests. */
export function routeKey(route: { runtime: string; substrate: string }): string {
	return `${route.runtime}|${route.substrate}`;
}
