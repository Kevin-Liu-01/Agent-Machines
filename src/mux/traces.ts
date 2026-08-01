/**
 * Run traces and the run-key registry.
 *
 * Two jobs, one small local store, no daemon (same posture as state.ts):
 *
 *   traces -- one append-only JSONL record per run, sharded by UTC day.
 *             This is the measured reward signal a future router
 *             recommender needs: which substrate x harness pair actually
 *             finished, how long it took, what it cost.
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
	if (result.costUsd !== undefined) trace.costUsd = result.costUsd;
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

export type GroupStats = {
	runs: number;
	ok: number;
	failed: number;
	/** ok / runs. Meaningless when runs is 0, where it reports 0. */
	successRate: number;
	/** Nearest-rank percentiles over every run in the group. */
	p50Ms: number;
	p95Ms: number;
	/** Same, over successful runs only; absent when ok is 0. */
	okP50Ms?: number;
	okP95Ms?: number;
	/** Sum of reported costs, with how many runs reported one at all. */
	costUsd: number;
	costKnownRuns: number;
};

export type TraceSummary = GroupStats & {
	bySubstrate: Partial<Record<SubstrateKind, GroupStats>>;
	byHarness: Partial<Record<HarnessKind, GroupStats>>;
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
	runs: number;
	ok: number;
	costUsd: number;
	costKnownRuns: number;
};

function newBucket(): Bucket {
	return { durations: [], okDurations: [], runs: 0, ok: 0, costUsd: 0, costKnownRuns: 0 };
}

function absorb(bucket: Bucket, trace: RunTrace): void {
	bucket.runs += 1;
	bucket.durations.push(trace.durationMs);
	if (isSuccessfulTrace(trace)) {
		bucket.ok += 1;
		bucket.okDurations.push(trace.durationMs);
	}
	if (typeof trace.costUsd === "number" && Number.isFinite(trace.costUsd)) {
		bucket.costUsd += trace.costUsd;
		bucket.costKnownRuns += 1;
	}
}

function finish(bucket: Bucket): GroupStats {
	const stats: GroupStats = {
		runs: bucket.runs,
		ok: bucket.ok,
		failed: bucket.runs - bucket.ok,
		successRate: bucket.runs === 0 ? 0 : bucket.ok / bucket.runs,
		p50Ms: bucket.runs === 0 ? 0 : percentile(bucket.durations, 50),
		p95Ms: bucket.runs === 0 ? 0 : percentile(bucket.durations, 95),
		costUsd: bucket.costUsd,
		costKnownRuns: bucket.costKnownRuns,
	};
	if (bucket.ok > 0) {
		stats.okP50Ms = percentile(bucket.okDurations, 50);
		stats.okP95Ms = percentile(bucket.okDurations, 95);
	}
	return stats;
}

/**
 * Success rate and duration percentiles overall, per substrate and per
 * harness. Pass a trace list to summarize it directly, or read options to
 * pull the window off disk first.
 *
 * With runs === 0 every aggregate reads 0: that is the empty set, not a
 * measurement, so check `runs` before believing a rate.
 */
export function summarize(input?: RunTrace[] | ReadTracesOptions): TraceSummary {
	const traces = Array.isArray(input) ? input : readTraces(input);
	const overall = newBucket();
	const substrates = new Map<SubstrateKind, Bucket>();
	const harnesses = new Map<HarnessKind, Bucket>();
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
		// Compared as strings: normalized UTC ISO 8601 sorts chronologically.
		if (from === undefined || trace.startedAt < from) from = trace.startedAt;
		if (to === undefined || trace.startedAt > to) to = trace.startedAt;
	}

	const summary: TraceSummary = {
		...finish(overall),
		bySubstrate: {},
		byHarness: {},
	};
	for (const [kind, bucket] of substrates) summary.bySubstrate[kind] = finish(bucket);
	for (const [kind, bucket] of harnesses) summary.byHarness[kind] = finish(bucket);
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
