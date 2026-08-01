/**
 * Run traces and the run-key registry.
 *
 * Two jobs, one small local store, no daemon (same posture as state.ts):
 *
 *   traces -- one append-only JSONL record per run, sharded by UTC day.
 *             This is the measured reward signal a future router
 *             recommender needs: which substrate x harness pair actually
 *             finished, how long it took, how long until its first output,
 *             and what it cost -- sandbox compute and model spend kept
 *             apart, because they move for different reasons and a
 *             conflated total cannot be attributed to either.
 *   claims -- a run-key registry so the same logical run is not executed
 *             twice. An agent run costs money and can have side effects,
 *             so a client that crashed and retried must be handed the
 *             prior result instead of a second run.
 *
 * Location: ~/.agent-machines/traces/, overridable with
 * AGENT_MACHINES_MUX_TRACES exactly as state.ts overrides its own path
 * with AGENT_MACHINES_MUX_STATE. That variable names a file; this one
 * names a directory, because traces shard by day and claims are one file
 * per key.
 *
 * Nothing here talks to a substrate or a harness: it is pure logic plus
 * local file IO, so it is safe to call from any surface (SDK, CLI, dev
 * server) and from several processes at once.
 */

import { createHash } from "node:crypto";
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { costToSuccessfulResult, estimate, type RunLeg } from "./cost.js";
import type { RunResult } from "./events.js";
import type { RouteAttempt } from "./types.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type RunTrace = {
	/** Caller-chosen identity of the logical run; also the claim key. */
	runKey: string;
	harness: HarnessKind;
	substrate: SubstrateKind;
	/** The routing decision that produced this placement, verbatim. */
	attempts: RouteAttempt[];
	/** UTC ISO 8601. appendTrace normalizes it and rejects unparseable input. */
	startedAt: string;
	durationMs: number;
	/**
	 * The harness's own exit status. A run that died before the harness ran
	 * has none: record a non-zero code (-1 by convention) together with
	 * `error`, never 0, so a summary cannot read it as a success.
	 */
	exitCode: number;
	/** Stream ended early; `text` was partial. Never counted as success. */
	truncated: boolean;
	/**
	 * Milliseconds from the run() call to the first normalized agent event --
	 * time to first output, one of the four numbers reported per route. See
	 * RunResult.timeToFirstEventMs for why the first normalized event and not
	 * the first raw byte. Absent when the run produced no event.
	 */
	timeToFirstEventMs?: number;
	/**
	 * Modeled sandbox compute for this run, from cost.ts published rates and
	 * the run's own wall clock. Absent on a lane whose price the vendor does
	 * not publish (sprites today) -- absent, not 0, so an unpriced lane is
	 * never mistaken for a free one.
	 */
	sandboxCostUsd?: number;
	/**
	 * Model spend the harness reported for the turn. Absent when it reported
	 * none; a harness that says nothing is unknown, not free.
	 */
	modelCostUsd?: number;
	/**
	 * sandboxCostUsd + modelCostUsd, and present ONLY when both halves are
	 * known.
	 *
	 * Summing one known half with an absent one would under-report the run by
	 * an unknown amount, and a summary built on that would rank the lane whose
	 * price nobody publishes as the cheapest. Absent forces a reader to say
	 * "unknown" instead, which is the honest answer.
	 */
	costUsd?: number;
	/** Count of normalized MuxAgentEvents observed on the run. */
	events: number;
	error?: string;
};

export type ReadTracesOptions = {
	/** Keep only the most recent N records. Result stays oldest-first. */
	limit?: number;
	/** Inclusive lower bound on startedAt. */
	since?: string | number | Date;
};

/**
 * A run counts as successful only when the harness exited 0, the stream
 * was not truncated, and no error was recorded. Anything looser would
 * report an aborted run as a win and teach a recommender the wrong thing.
 */
export function isSuccessfulTrace(trace: RunTrace): boolean {
	return trace.exitCode === 0 && !trace.truncated && !trace.error;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SHARD_PREFIX = "runs-";
const SHARD_SUFFIX = ".jsonl";
const SHARD_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function tracesDir(): string {
	return (
		process.env.AGENT_MACHINES_MUX_TRACES ??
		join(homedir(), ".agent-machines", "traces")
	);
}

function claimsDir(): string {
	return join(tracesDir(), "claims");
}

/** Day shard for a UTC ISO timestamp: runs-YYYY-MM-DD.jsonl. */
function shardName(startedAt: string): string {
	return `${SHARD_PREFIX}${startedAt.slice(0, 10)}${SHARD_SUFFIX}`;
}

function epochMs(value: string | number | Date, label: string): number {
	let ms: number;
	if (value instanceof Date) ms = value.getTime();
	else if (typeof value === "number") ms = value;
	else ms = Date.parse(value);
	if (!Number.isFinite(ms)) {
		throw new MuxError("fatal", `unparseable ${label}: ${String(value)}`);
	}
	return ms;
}

/** Last instant a record in this day shard can carry, in epoch ms. */
function dayEndMs(date: string): number {
	return Date.parse(`${date}T23:59:59.999Z`);
}

// ---------------------------------------------------------------------------
// Traces: append and read
// ---------------------------------------------------------------------------

/**
 * Reject an optional measurement that is present but not a usable number.
 * A NaN or a negative would propagate through every sum and percentile in a
 * summary, so it is refused at the write rather than averaged in later.
 */
function checkOptionalAmount(value: number | undefined, label: string): void {
	if (value === undefined) return;
	if (!Number.isFinite(value) || value < 0) {
		throw new MuxError(
			"fatal",
			`trace ${label} must be a non-negative number when present, got ${String(value)}`,
		);
	}
}

function normalizeTrace(trace: RunTrace): RunTrace {
	if (typeof trace.runKey !== "string" || trace.runKey.length === 0) {
		throw new MuxError("fatal", "a run trace needs a non-empty runKey");
	}
	const startedMs = Date.parse(trace.startedAt);
	if (Number.isNaN(startedMs)) {
		throw new MuxError(
			"fatal",
			`unparseable trace startedAt: ${String(trace.startedAt)}`,
		);
	}
	if (!Number.isFinite(trace.durationMs) || trace.durationMs < 0) {
		throw new MuxError(
			"fatal",
			`trace durationMs must be a non-negative number, got ${String(trace.durationMs)}`,
		);
	}
	if (!Number.isFinite(trace.events) || trace.events < 0) {
		throw new MuxError(
			"fatal",
			`trace events must be a non-negative number, got ${String(trace.events)}`,
		);
	}
	checkOptionalAmount(trace.timeToFirstEventMs, "timeToFirstEventMs");
	checkOptionalAmount(trace.sandboxCostUsd, "sandboxCostUsd");
	checkOptionalAmount(trace.modelCostUsd, "modelCostUsd");
	checkOptionalAmount(trace.costUsd, "costUsd");
	// Normalized to UTC so the shard a record lands in always matches the
	// day its own timestamp reports, whatever offset the caller used.
	// `since` pruning by day relies on that being true.
	const startedAt = new Date(startedMs).toISOString();
	// Outside years 0000-9999 toISOString() switches to the expanded
	// "+012026-..." form, which would name a shard listShards cannot
	// recognize: the record would be written and then never readable.
	// Fail closed instead of logging into a black hole.
	if (!SHARD_DATE.test(startedAt.slice(0, 10))) {
		throw new MuxError(
			"fatal",
			`trace startedAt is outside the supported year range: ${startedAt}`,
		);
	}
	const record: RunTrace = {
		runKey: trace.runKey,
		harness: trace.harness,
		substrate: trace.substrate,
		attempts: [...(trace.attempts ?? [])],
		startedAt,
		durationMs: trace.durationMs,
		exitCode: trace.exitCode,
		truncated: trace.truncated,
		events: trace.events,
	};
	if (trace.timeToFirstEventMs !== undefined) {
		record.timeToFirstEventMs = trace.timeToFirstEventMs;
	}
	if (trace.sandboxCostUsd !== undefined) record.sandboxCostUsd = trace.sandboxCostUsd;
	if (trace.modelCostUsd !== undefined) record.modelCostUsd = trace.modelCostUsd;
	if (trace.costUsd !== undefined) record.costUsd = trace.costUsd;
	if (trace.error) record.error = trace.error;
	return record;
}

/** Append one run record. Returns the normalized record as written. */
export function appendTrace(trace: RunTrace): RunTrace {
	const record = normalizeTrace(trace);
	const dir = tracesDir();
	mkdirSync(dir, { recursive: true });
	// One O_APPEND write per record is all the coordination an append-only
	// log needs: concurrent writers interleave whole lines rather than
	// corrupting each other's, so no lock and no daemon.
	appendFileSync(
		join(dir, shardName(record.startedAt)),
		`${JSON.stringify(record)}\n`,
		"utf8",
	);
	return record;
}

/** Build a trace from a finished run; the router only has to add a key. */
/**
 * Stable-enough id for a run the caller did not key. Includes the harness,
 * substrate and finish time so two runs cannot collide in practice, and so a
 * human reading traces can tell what it was.
 */
function syntheticRunKey(result: RunResult): string {
	const finishedAt = Date.now().toString(36);
	const rand = createHash("sha256")
		.update(`${result.harness}:${result.substrate}:${finishedAt}:${result.events}:${result.durationMs}`)
		.digest("hex")
		.slice(0, 8);
	return `run-${result.harness}-${result.substrate}-${finishedAt}-${rand}`;
}

/**
 * Sandbox compute attributable to one run, priced off the run's wall clock.
 *
 * `creations: 0` because run() executes on a machine that already exists:
 * create() is the event that bills a creation, and charging one per turn would
 * bill the same provisioning twice on a machine that takes two turns.
 *
 * Priced at cost.ts's default comparison size rather than at any `resources`
 * the caller asked for. Measured on E2B (docs/MUX-RESULTS.md finding 10) a
 * resources request can be ignored outright on the current plan, so the
 * requested size is not evidence of the billed size, and pricing a size the
 * substrate never granted would overstate the bill.
 *
 * `estimate()` returns no computeUsd on a lane whose rate the vendor does not
 * publish, and that undefined is passed through untouched.
 */
function sandboxCostFor(result: RunResult): number | undefined {
	return estimate(result.substrate, {
		durationMs: result.durationMs,
		creations: 0,
	}).computeUsd;
}

export function traceFromRun(input: {
	/**
	 * Idempotency key when the caller set one. Absent for fire-and-forget
	 * runs, which still deserve a trace, so a synthetic id is generated --
	 * traces are observability and must not require opting into replay.
	 */
	runKey?: string;
	result: RunResult;
	attempts?: RouteAttempt[];
	startedAt?: string | number | Date;
	error?: string;
}): RunTrace {
	const { result } = input;
	const startedMs =
		input.startedAt === undefined
			? Date.now() - result.durationMs
			: epochMs(input.startedAt, "startedAt");
	const trace: RunTrace = {
		// A trace always has an id: reuse the caller's idempotency key when
		// present, otherwise mint one so untracked runs are still queryable.
		runKey: input.runKey ?? syntheticRunKey(input.result),
		harness: result.harness,
		substrate: result.substrate,
		attempts: [...(input.attempts ?? [])],
		startedAt: new Date(startedMs).toISOString(),
		durationMs: result.durationMs,
		exitCode: result.exitCode,
		truncated: result.truncated,
		events: result.events,
	};
	if (result.timeToFirstEventMs !== undefined) {
		trace.timeToFirstEventMs = result.timeToFirstEventMs;
	}
	const sandboxCostUsd = sandboxCostFor(result);
	if (sandboxCostUsd !== undefined) trace.sandboxCostUsd = sandboxCostUsd;
	if (result.costUsd !== undefined) trace.modelCostUsd = result.costUsd;
	// The sum only where both halves are real. See RunTrace.costUsd: half a
	// total reported as a total is worse than no total.
	if (sandboxCostUsd !== undefined && result.costUsd !== undefined) {
		trace.costUsd = sandboxCostUsd + result.costUsd;
	}
	if (input.error) trace.error = input.error;
	return trace;
}

function isRunTrace(value: unknown): value is RunTrace {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.runKey === "string" &&
		typeof record.harness === "string" &&
		typeof record.substrate === "string" &&
		typeof record.startedAt === "string" &&
		typeof record.durationMs === "number" &&
		typeof record.exitCode === "number" &&
		typeof record.events === "number" &&
		typeof record.truncated === "boolean" &&
		Array.isArray(record.attempts)
	);
}

function readShard(path: string): RunTrace[] {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return [];
	}
	const traces: RunTrace[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			// A process killed mid-append leaves one torn line. Skipping it
			// keeps the rest of that day readable instead of losing the day.
			// The damage is bounded at two records: a torn tail carries no
			// newline, so the next append concatenates onto it and is lost
			// with it, and every append after that parses normally.
			continue;
		}
		if (isRunTrace(parsed)) traces.push(parsed);
	}
	return traces;
}

function listShards(): { date: string; path: string }[] {
	const dir = tracesDir();
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const shards: { date: string; path: string }[] = [];
	for (const entry of entries) {
		if (!entry.startsWith(SHARD_PREFIX) || !entry.endsWith(SHARD_SUFFIX)) continue;
		const date = entry.slice(SHARD_PREFIX.length, entry.length - SHARD_SUFFIX.length);
		if (!SHARD_DATE.test(date)) continue;
		shards.push({ date, path: join(dir, entry) });
	}
	// ISO dates sort lexicographically, so name order is day order.
	shards.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	return shards;
}

/**
 * Read run records oldest-first: day shards in date order, and within a
 * shard the order they were appended in. `limit` keeps the most recent N
 * and still returns them oldest-first.
 */
export function readTraces(options: ReadTracesOptions = {}): RunTrace[] {
	const { limit } = options;
	if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
		throw new MuxError(
			"fatal",
			`readTraces limit must be a non-negative integer, got ${String(limit)}`,
		);
	}
	if (limit === 0) return [];
	const sinceMs =
		options.since === undefined ? undefined : epochMs(options.since, "since");

	const newestFirst: RunTrace[][] = [];
	let total = 0;
	const shards = listShards();
	for (let index = shards.length - 1; index >= 0; index -= 1) {
		const shard = shards[index];
		// Shards are whole UTC days walked newest-first, so once one ends
		// before `since` every remaining shard does too.
		if (sinceMs !== undefined && dayEndMs(shard.date) < sinceMs) break;
		const records = readShard(shard.path).filter(
			(trace) => sinceMs === undefined || Date.parse(trace.startedAt) >= sinceMs,
		);
		newestFirst.push(records);
		total += records.length;
		if (limit !== undefined && total >= limit) break;
	}
	const ascending = newestFirst.reverse().flat();
	return limit === undefined ? ascending : ascending.slice(-limit);
}

// ---------------------------------------------------------------------------
// Summary: the measured input a recommender reads
// ---------------------------------------------------------------------------

/**
 * Total cost to a successful result, over a group of runs.
 *
 * Priced through cost.ts `costToSuccessfulResult`, so failed runs count: a
 * lane that is cheaper per hour and fails one attempt in three costs more per
 * result than the lane it undercuts, and that is the comparison this exists
 * to make.
 *
 * Every number here can be absent, and absent means unknown. `knownUsd` is a
 * FLOOR whenever `complete` is false -- some component of some run in the
 * group could not be priced -- and it is omitted entirely when nothing in the
 * group could be priced at all, because a $0 there would read as free.
 *
 * Runs are repriced from today's price table rather than from the
 * sandboxCostUsd stored on each record, so every lane in a comparison is
 * priced under one table. The stored figure is what the table said the day the
 * run happened; the aggregate below is what it says now.
 */
export type CostToSuccess = {
	/** Priced spend over the whole group, failed runs included. */
	knownUsd?: number;
	/** knownUsd / ok. Absent when nothing succeeded: no result, no cost per result. */
	perSuccessUsd?: number;
	/** Priced spend on runs that produced no result. */
	wastedUsd?: number;
	/** True when every run in the group had both halves priced. Vacuous at runs 0. */
	complete: boolean;
	/** Runs whose compute could be priced. knownUsd covers exactly these. */
	pricedRuns: number;
	/** Runs where the harness reported no model spend -- counted, never guessed. */
	modelUnknownRuns: number;
	/** Lanes in the group with no published compute rate, named once each. */
	unpricedSubstrates: SubstrateKind[];
};

export type GroupStats = {
	runs: number;
	ok: number;
	failed: number;
	/** ok / runs. Meaningless when runs is 0, where it reports 0. */
	successRate: number;
	/**
	 * Runs whose stream ended early, and truncated / runs. This is the
	 * resume-reliability proxy: the mux does not replay a broken run, so a
	 * truncated run is exactly a run that would have needed a resume.
	 */
	truncatedRuns: number;
	truncationRate: number;
	/** Nearest-rank percentiles over every run in the group. */
	p50Ms: number;
	p95Ms: number;
	/** Same, over successful runs only; absent when ok is 0. */
	okP50Ms?: number;
	okP95Ms?: number;
	/**
	 * Time to first output: nearest-rank percentiles of timeToFirstEventMs
	 * over the runs that reported one. Absent when none did, since a run that
	 * emitted no event has no first output and 0 would claim an instant one.
	 */
	firstOutputP50Ms?: number;
	firstOutputP95Ms?: number;
	firstOutputKnownRuns: number;
	/**
	 * Component sums as recorded, each absent when no run in the group
	 * reported that component. `costUsd` covers only the runs that carried a
	 * full total (see RunTrace.costUsd), so costKnownRuns can be lower than
	 * both component counts.
	 */
	sandboxCostUsd?: number;
	sandboxCostKnownRuns: number;
	modelCostUsd?: number;
	modelCostKnownRuns: number;
	costUsd?: number;
	costKnownRuns: number;
	/** Total cost to a successful result for this group. */
	cost: CostToSuccess;
};

/** harness x substrate -- one lane of the route table. */
export type RouteKey = `${HarnessKind}@${SubstrateKind}`;

export function routeKey(harness: HarnessKind, substrate: SubstrateKind): RouteKey {
	return `${harness}@${substrate}`;
}

/** A route's stats, with the pair named so an entry stands alone. */
export type RouteStats = GroupStats & {
	harness: HarnessKind;
	substrate: SubstrateKind;
};

export type TraceSummary = GroupStats & {
	bySubstrate: Partial<Record<SubstrateKind, GroupStats>>;
	byHarness: Partial<Record<HarnessKind, GroupStats>>;
	/** The route table: one entry per harness x substrate pair observed. */
	byRoute: Partial<Record<RouteKey, RouteStats>>;
	/** startedAt of the earliest and latest run counted; absent when none. */
	from?: string;
	to?: string;
};

/**
 * Nearest-rank percentile, no interpolation: the value at 1-based rank
 * ceil(rank * n / 100) of the ascending sample. So p50 of an even count
 * is the lower of the two middles, p95 of 3 samples is the largest, and
 * every number reported is a duration that was actually measured rather
 * than one synthesized between two of them.
 *
 * The rank is derived by integer comparison ((k * 100) vs (rank * n)) so
 * which sample gets picked never depends on how rank/100 rounds in
 * binary. A recommender compares these numbers across substrates, so the
 * rule has to be exact and stated, not approximately right.
 */
export function percentile(values: number[], rank: number): number {
	const n = values.length;
	if (n === 0) {
		throw new MuxError("fatal", "percentile of an empty sample is not a measurement");
	}
	if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
		throw new MuxError(
			"fatal",
			`percentile rank must be an integer in 1..100, got ${String(rank)}`,
		);
	}
	const sorted = [...values].sort((a, b) => a - b);
	const scaled = rank * n;
	let k = Math.floor(scaled / 100);
	if (k * 100 < scaled) k += 1;
	if (k < 1) k = 1;
	if (k > n) k = n;
	return sorted[k - 1];
}

type Bucket = {
	durations: number[];
	okDurations: number[];
	firstOutputs: number[];
	/** One leg per run, in observed order, for costToSuccessfulResult. */
	legs: RunLeg[];
	runs: number;
	ok: number;
	truncatedRuns: number;
	sandboxCostUsd: number;
	sandboxCostKnownRuns: number;
	modelCostUsd: number;
	modelCostKnownRuns: number;
	costUsd: number;
	costKnownRuns: number;
};

function newBucket(): Bucket {
	return {
		durations: [],
		okDurations: [],
		firstOutputs: [],
		legs: [],
		runs: 0,
		ok: 0,
		truncatedRuns: 0,
		sandboxCostUsd: 0,
		sandboxCostKnownRuns: 0,
		modelCostUsd: 0,
		modelCostKnownRuns: 0,
		costUsd: 0,
		costKnownRuns: 0,
	};
}

/**
 * A recorded measurement, or undefined when the field cannot be trusted.
 *
 * appendTrace refuses a negative or non-finite amount on write, so anything
 * like that in a shard is a hand-edited or corrupt line. Treating it as
 * unreported keeps one bad line from producing a negative bill or a NaN
 * percentile that would silently poison every comparison in the summary.
 */
function amount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function absorb(bucket: Bucket, trace: RunTrace): void {
	bucket.runs += 1;
	bucket.durations.push(trace.durationMs);
	const succeeded = isSuccessfulTrace(trace);
	if (succeeded) {
		bucket.ok += 1;
		bucket.okDurations.push(trace.durationMs);
	}
	if (trace.truncated) bucket.truncatedRuns += 1;
	const firstOutput = amount(trace.timeToFirstEventMs);
	if (firstOutput !== undefined) bucket.firstOutputs.push(firstOutput);
	const sandboxCost = amount(trace.sandboxCostUsd);
	if (sandboxCost !== undefined) {
		bucket.sandboxCostUsd += sandboxCost;
		bucket.sandboxCostKnownRuns += 1;
	}
	const modelCost = amount(trace.modelCostUsd);
	if (modelCost !== undefined) {
		bucket.modelCostUsd += modelCost;
		bucket.modelCostKnownRuns += 1;
	}
	const totalCost = amount(trace.costUsd);
	if (totalCost !== undefined) {
		bucket.costUsd += totalCost;
		bucket.costKnownRuns += 1;
	}
	// One leg per run, failures included: what a route cost to produce a result
	// has to carry the attempts that produced nothing. Priced on the same terms
	// as the stored figure, with no creation charged to a turn -- see
	// sandboxCostFor for why.
	bucket.legs.push({
		substrate: trace.substrate,
		shape: {
			durationMs: trace.durationMs,
			creations: 0,
			modelCostUsd: modelCost,
		},
		succeeded,
	});
}

/** Roll a bucket's legs into the cost-to-result numbers. */
function costOf(bucket: Bucket): CostToSuccess {
	const rolled = costToSuccessfulResult(bucket.legs);
	// A leg with no reported model spend is priced on compute alone, so the
	// group total is a floor. Counted rather than filled with 0, because a
	// zero-filled model cost is exactly how a summary under-reports a run.
	const modelUnknownRuns = bucket.legs.filter(
		(leg) => leg.shape.modelCostUsd === undefined,
	).length;
	// costToSuccessfulResult pushes one entry per unpriced leg; the same lane
	// therefore repeats, and a reader only needs it named once.
	const unpricedSubstrates = [...new Set(rolled.unpriced)];
	const pricedRuns = bucket.legs.length - rolled.unpriced.length;
	const cost: CostToSuccess = {
		complete: rolled.complete && modelUnknownRuns === 0,
		pricedRuns,
		modelUnknownRuns,
		unpricedSubstrates,
	};
	if (pricedRuns > 0) {
		cost.knownUsd = rolled.knownUsd;
		cost.wastedUsd = rolled.wastedUsd;
		if (bucket.ok > 0) cost.perSuccessUsd = rolled.knownUsd / bucket.ok;
	}
	return cost;
}

function finish(bucket: Bucket): GroupStats {
	const stats: GroupStats = {
		runs: bucket.runs,
		ok: bucket.ok,
		failed: bucket.runs - bucket.ok,
		successRate: bucket.runs === 0 ? 0 : bucket.ok / bucket.runs,
		truncatedRuns: bucket.truncatedRuns,
		truncationRate: bucket.runs === 0 ? 0 : bucket.truncatedRuns / bucket.runs,
		p50Ms: bucket.runs === 0 ? 0 : percentile(bucket.durations, 50),
		p95Ms: bucket.runs === 0 ? 0 : percentile(bucket.durations, 95),
		firstOutputKnownRuns: bucket.firstOutputs.length,
		sandboxCostKnownRuns: bucket.sandboxCostKnownRuns,
		modelCostKnownRuns: bucket.modelCostKnownRuns,
		costKnownRuns: bucket.costKnownRuns,
		cost: costOf(bucket),
	};
	if (bucket.ok > 0) {
		stats.okP50Ms = percentile(bucket.okDurations, 50);
		stats.okP95Ms = percentile(bucket.okDurations, 95);
	}
	if (bucket.firstOutputs.length > 0) {
		stats.firstOutputP50Ms = percentile(bucket.firstOutputs, 50);
		stats.firstOutputP95Ms = percentile(bucket.firstOutputs, 95);
	}
	// Each sum is reported only where at least one run reported the component.
	// Absent stays absent all the way out of summarize(): a 0 next to a
	// knownRuns of 0 has been misread as "this route is free" before.
	if (bucket.sandboxCostKnownRuns > 0) stats.sandboxCostUsd = bucket.sandboxCostUsd;
	if (bucket.modelCostKnownRuns > 0) stats.modelCostUsd = bucket.modelCostUsd;
	if (bucket.costKnownRuns > 0) stats.costUsd = bucket.costUsd;
	return stats;
}

/**
 * The route table, plus the same aggregate overall, per substrate and per
 * harness. Pass a trace list to summarize it directly, or read options to
 * pull the window off disk first.
 *
 * `byRoute` is the harness x substrate table the route report owes, and each
 * entry carries all four numbers:
 *
 *   1. task success rate            -- successRate (isSuccessfulTrace)
 *   2. time to first output         -- firstOutputP50Ms / firstOutputP95Ms
 *   3. total cost to a result       -- cost.knownUsd / cost.perSuccessUsd
 *   4. resume reliability (proxy)   -- truncationRate
 *
 * Truncation is the proxy rather than the real thing: the mux does not replay
 * a broken run, so a truncated run is precisely a run that would have needed a
 * resume, and the rate is how often a route leaves one behind. It is not a
 * measurement of resumes that succeeded, and must not be quoted as one.
 *
 * With runs === 0 every rate reads 0 and every cost is absent: that is the
 * empty set, not a measurement, so check `runs` before believing a rate.
 */
export function summarize(input?: RunTrace[] | ReadTracesOptions): TraceSummary {
	const traces = Array.isArray(input) ? input : readTraces(input);
	const overall = newBucket();
	const substrates = new Map<SubstrateKind, Bucket>();
	const harnesses = new Map<HarnessKind, Bucket>();
	const routes = new Map<
		RouteKey,
		{ harness: HarnessKind; substrate: SubstrateKind; bucket: Bucket }
	>();
	let from: string | undefined;
	let to: string | undefined;

	for (const trace of traces) {
		absorb(overall, trace);
		let substrate = substrates.get(trace.substrate);
		if (!substrate) {
			substrate = newBucket();
			substrates.set(trace.substrate, substrate);
		}
		absorb(substrate, trace);
		let harness = harnesses.get(trace.harness);
		if (!harness) {
			harness = newBucket();
			harnesses.set(trace.harness, harness);
		}
		absorb(harness, trace);
		const key = routeKey(trace.harness, trace.substrate);
		let route = routes.get(key);
		if (!route) {
			route = {
				harness: trace.harness,
				substrate: trace.substrate,
				bucket: newBucket(),
			};
			routes.set(key, route);
		}
		absorb(route.bucket, trace);
		// Compared as strings: normalized UTC ISO 8601 sorts chronologically.
		if (from === undefined || trace.startedAt < from) from = trace.startedAt;
		if (to === undefined || trace.startedAt > to) to = trace.startedAt;
	}

	const summary: TraceSummary = {
		...finish(overall),
		bySubstrate: {},
		byHarness: {},
		byRoute: {},
	};
	for (const [kind, bucket] of substrates) summary.bySubstrate[kind] = finish(bucket);
	for (const [kind, bucket] of harnesses) summary.byHarness[kind] = finish(bucket);
	for (const [key, route] of routes) {
		summary.byRoute[key] = {
			...finish(route.bucket),
			harness: route.harness,
			substrate: route.substrate,
		};
	}
	if (from !== undefined) summary.from = from;
	if (to !== undefined) summary.to = to;
	return summary;
}

// ---------------------------------------------------------------------------
// Idempotency: the run-key registry
// ---------------------------------------------------------------------------

export type ClaimStatus = "in_flight" | "done";

export type ClaimRecord = {
	runKey: string;
	status: ClaimStatus;
	/** pid@host of the claiming process. Diagnostics only, never a lock. */
	owner: string;
	claimedAt: string;
	/** Last liveness touch. Staleness is measured from here, not claimedAt. */
	heartbeatAt: string;
	completedAt?: string;
	result?: RunResult;
};

export type ClaimOutcome = "claimed" | "in_flight" | { done: RunResult };

export type ClaimOptions = {
	/** Override the stale-claim timeout for this call. */
	staleMs?: number;
};

/**
 * How long an in-flight claim may go without a heartbeat before another
 * process may take it over.
 *
 * A holder that never heartbeats still has to be covered for its whole
 * worst case, and the router's defaults bound that: a detached harness
 * install budget of 15 minutes (router INSTALL_BUDGET_MS) plus the default
 * run timeout of 5 minutes (MuxConfig.defaults.timeoutMs), plus
 * provisioning, which measured up to 31s for a cold Sprites create. 30
 * minutes covers that with slack and still frees a crashed claim inside
 * one coffee break, which matters because until it frees, the retry gets
 * "in_flight" and the work does not happen at all.
 *
 * Two cases need a larger staleMs passed explicitly: the hermes harness
 * declares a 40-minute install budget, and any config that raises
 * defaults.timeoutMs past 15 minutes. Both are better served by calling
 * heartbeatClaim() on a timer, since a heartbeat resets the clock and a
 * live holder is then never mistaken for a dead one however long it runs.
 */
export const STALE_CLAIM_MS = 1_800_000;

function claimPath(runKey: string): string {
	// Hashed because a run key is caller-chosen text ("org/repo#42", a
	// prompt digest, a URL): it can carry path separators or outrun the
	// filesystem's name limit. The full key is stored inside the file.
	const digest = createHash("sha256").update(runKey).digest("hex").slice(0, 32);
	return join(claimsDir(), `${digest}.json`);
}

function serializeClaim(record: ClaimRecord): string {
	return `${JSON.stringify(record, null, 2)}\n`;
}

/** Replace a claim file atomically; a torn read would lose a RunResult. */
function writeClaimFile(path: string, record: ClaimRecord): void {
	mkdirSync(claimsDir(), { recursive: true });
	const temp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
	writeFileSync(temp, serializeClaim(record), "utf8");
	renameSync(temp, path);
}

function readClaimFile(path: string): ClaimRecord | null {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (typeof parsed !== "object" || parsed === null) return null;
		const record = parsed as ClaimRecord;
		if (typeof record.runKey !== "string") return null;
		if (record.status !== "in_flight" && record.status !== "done") return null;
		if (typeof record.heartbeatAt !== "string") return null;
		return record;
	} catch {
		return null;
	}
}

export function readClaim(runKey: string): ClaimRecord | null {
	return readClaimFile(claimPath(runKey));
}

function freshClaim(runKey: string): ClaimRecord {
	const now = new Date().toISOString();
	return {
		runKey,
		status: "in_flight",
		owner: `${process.pid}@${hostname()}`,
		claimedAt: now,
		heartbeatAt: now,
	};
}

/**
 * Take the run key, or find out who has it.
 *
 * - "claimed": this caller owns the run and must execute it, then call
 *   completeClaim() with the result (or releaseClaim() to make it
 *   runnable again).
 * - "in_flight": someone else holds a live claim. Do not run.
 * - { done }: the run already finished; return that result instead of
 *   paying for a second agent turn with its own side effects.
 *
 * The claim is taken with an exclusive create, which is atomic, so two
 * processes racing on the same key cannot both be told "claimed".
 */
export function claim(runKey: string, options: ClaimOptions = {}): ClaimOutcome {
	if (typeof runKey !== "string" || runKey.length === 0) {
		throw new MuxError("fatal", "claim needs a non-empty runKey");
	}
	const staleMs = options.staleMs ?? STALE_CLAIM_MS;
	const path = claimPath(runKey);
	mkdirSync(claimsDir(), { recursive: true });
	const fresh = freshClaim(runKey);
	try {
		writeFileSync(path, serializeClaim(fresh), { encoding: "utf8", flag: "wx" });
		return "claimed";
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}

	const existing = readClaimFile(path);
	if (existing?.status === "done" && existing.result) {
		return { done: existing.result };
	}
	// A file we cannot parse, or a "done" record with no result in it, is
	// corrupt -- almost certainly a crash mid-write. Blocking every future
	// retry on it forever would be worse than re-running, so it ages out
	// on the same stale clock as any other claim, from an unreadable
	// heartbeat treated as infinitely old.
	const heartbeatMs = existing ? Date.parse(existing.heartbeatAt) : Number.NaN;
	const age = Number.isNaN(heartbeatMs)
		? Number.POSITIVE_INFINITY
		: Date.now() - heartbeatMs;
	if (age <= staleMs) return "in_flight";
	writeClaimFile(path, fresh);
	return "claimed";
}

/**
 * Refresh the claim's liveness. Returns false when there is nothing
 * in-flight to refresh (already completed, released, or taken over), which
 * is the signal that this process no longer owns the run.
 */
export function heartbeatClaim(runKey: string): boolean {
	const path = claimPath(runKey);
	const existing = readClaimFile(path);
	if (!existing || existing.status !== "in_flight") return false;
	writeClaimFile(path, { ...existing, heartbeatAt: new Date().toISOString() });
	return true;
}

/**
 * Store the terminal result for a run key. Later claims return it instead
 * of re-running.
 *
 * The result is stored verbatim, including a failure: a completed run that
 * failed is still a run that happened and may have had side effects. A
 * caller that wants a failure to be retryable must call releaseClaim()
 * instead of completing it. The record is written even when no claim file
 * exists, because losing the result is worse than a missing claim.
 */
export function completeClaim(runKey: string, result: RunResult): ClaimRecord {
	const path = claimPath(runKey);
	const existing = readClaimFile(path);
	const now = new Date().toISOString();
	const record: ClaimRecord = {
		runKey,
		status: "done",
		owner: existing?.owner ?? `${process.pid}@${hostname()}`,
		claimedAt: existing?.claimedAt ?? now,
		heartbeatAt: now,
		completedAt: now,
		result,
	};
	writeClaimFile(path, record);
	return record;
}

/** Drop a claim so the key can be run again. */
export function releaseClaim(runKey: string): void {
	rmSync(claimPath(runKey), { force: true });
}
