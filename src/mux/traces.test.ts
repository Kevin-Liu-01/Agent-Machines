/**
 * Tests for src/mux/traces.ts: the append-only run log, its exact
 * summary arithmetic, and the run-key registry that keeps a retry from
 * paying for a second agent turn.
 *
 * Run: tsx --test src/mux/traces.test.ts
 *
 * Every test gets its own temp directory through AGENT_MACHINES_MUX_TRACES
 * and removes it afterwards, so nothing here can touch
 * ~/.agent-machines/traces/.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { RunResult } from "./events.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";
import {
	STALE_CLAIM_MS,
	appendTrace,
	claim,
	completeClaim,
	heartbeatClaim,
	isSuccessfulTrace,
	percentile,
	readClaim,
	readTraces,
	releaseClaim,
	summarize,
	traceFromRun,
	tracesDir,
	type RunTrace,
} from "./traces.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Run a body against a private traces directory, then delete it. */
function withTracesDir(body: (dir: string) => void): void {
	const previous = process.env.AGENT_MACHINES_MUX_TRACES;
	const dir = mkdtempSync(join(tmpdir(), "am-mux-traces-"));
	process.env.AGENT_MACHINES_MUX_TRACES = dir;
	try {
		body(dir);
	} finally {
		if (previous === undefined) {
			delete process.env.AGENT_MACHINES_MUX_TRACES;
		} else {
			process.env.AGENT_MACHINES_MUX_TRACES = previous;
		}
		rmSync(dir, { recursive: true, force: true });
	}
}

function trace(overrides: Partial<RunTrace> = {}): RunTrace {
	return {
		runKey: "run-1",
		harness: "claude-code",
		substrate: "e2b",
		attempts: [{ substrate: "e2b", outcome: "ok", durationMs: 328 }],
		startedAt: "2026-08-01T12:00:00.000Z",
		durationMs: 1000,
		exitCode: 0,
		truncated: false,
		events: 12,
		...overrides,
	};
}

/** A trace with just the fields the summary reads, for fixture tables. */
function sample(input: {
	substrate: SubstrateKind;
	harness: HarnessKind;
	durationMs: number;
	ok?: boolean;
	exitCode?: number;
	truncated?: boolean;
	error?: string;
	costUsd?: number;
	startedAt?: string;
}): RunTrace {
	return trace({
		runKey: `${input.substrate}-${input.harness}-${input.durationMs}`,
		substrate: input.substrate,
		harness: input.harness,
		durationMs: input.durationMs,
		exitCode: input.exitCode ?? (input.ok === false ? 1 : 0),
		truncated: input.truncated ?? false,
		error: input.error,
		costUsd: input.costUsd,
		startedAt: input.startedAt ?? "2026-08-01T12:00:00.000Z",
	});
}

function runResult(overrides: Partial<RunResult> = {}): RunResult {
	return {
		text: "MUX-OK",
		exitCode: 0,
		costUsd: 0.0107,
		durationMs: 3615,
		sessionId: "session-abc",
		events: 9,
		substrate: "e2b",
		harness: "claude-code",
		truncated: false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Traces: append and read
// ---------------------------------------------------------------------------

test("appendTrace round-trips records through a JSONL day shard", () => {
	withTracesDir((dir) => {
		const first = appendTrace(trace({ runKey: "a" }));
		const second = appendTrace(
			trace({
				runKey: "b",
				substrate: "sprites",
				durationMs: 7165,
				costUsd: 0.0107,
				events: 31,
			}),
		);

		assert.deepEqual(readdirSync(dir), ["runs-2026-08-01.jsonl"]);
		const raw = readFileSync(join(dir, "runs-2026-08-01.jsonl"), "utf8");
		// Append-only: one whole line per record, newline terminated.
		assert.equal(raw.endsWith("\n"), true);
		const lines = raw.split("\n").filter((line) => line.length > 0);
		assert.equal(lines.length, 2);
		assert.deepEqual(JSON.parse(lines[0]), first);
		assert.deepEqual(JSON.parse(lines[1]), second);

		assert.deepEqual(readTraces(), [first, second]);
		// Optional fields stay absent rather than serializing as null.
		assert.equal("costUsd" in first, false);
		assert.equal("error" in first, false);
		assert.equal(second.costUsd, 0.0107);
	});
});

test("appendTrace normalizes startedAt to UTC and shards by UTC day", () => {
	withTracesDir((dir) => {
		// 2026-08-02T08:30+09:00 is 2026-08-01T23:30Z: the record must land
		// in the shard its own normalized timestamp names, or `since`
		// pruning by day would skip it.
		const record = appendTrace(trace({ startedAt: "2026-08-02T08:30:00+09:00" }));
		assert.equal(record.startedAt, "2026-08-01T23:30:00.000Z");
		assert.deepEqual(readdirSync(dir), ["runs-2026-08-01.jsonl"]);
		assert.deepEqual(readTraces(), [record]);
	});
});

test("appendTrace fails closed on input a summary could not trust", () => {
	withTracesDir((dir) => {
		assert.throws(() => appendTrace(trace({ runKey: "" })), (error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			return true;
		});
		assert.throws(
			() => appendTrace(trace({ startedAt: "not a timestamp" })),
			MuxError,
		);
		assert.throws(() => appendTrace(trace({ durationMs: -1 })), MuxError);
		assert.throws(() => appendTrace(trace({ durationMs: Number.NaN })), MuxError);
		assert.throws(() => appendTrace(trace({ events: -1 })), MuxError);
		// An expanded-year timestamp ("+012026-08-01...") would name a shard
		// readTraces cannot find, so the record would be written and lost.
		assert.throws(
			() => appendTrace(trace({ startedAt: "+012026-08-01T12:00:00.000Z" })),
			MuxError,
		);
		// Nothing was written, so a rejected trace cannot skew a summary.
		assert.deepEqual(readdirSync(dir), []);
		assert.deepEqual(readTraces(), []);
	});
});

test("readTraces returns an empty list when nothing has been written", () => {
	withTracesDir(() => {
		assert.deepEqual(readTraces(), []);
		assert.deepEqual(readTraces({ limit: 5 }), []);
		assert.deepEqual(readTraces({ since: "2026-01-01T00:00:00.000Z" }), []);
	});
});

test("readTraces honors limit, keeping the most recent N oldest-first", () => {
	withTracesDir(() => {
		const written = [1, 2, 3, 4, 5].map((n) =>
			appendTrace(
				trace({
					runKey: `run-${n}`,
					startedAt: `2026-08-01T12:0${n}:00.000Z`,
					durationMs: n * 100,
				}),
			),
		);

		assert.deepEqual(readTraces({ limit: 2 }), [written[3], written[4]]);
		assert.deepEqual(readTraces({ limit: 1 }), [written[4]]);
		assert.deepEqual(readTraces({ limit: 0 }), []);
		assert.deepEqual(readTraces({ limit: 99 }), written);
		assert.throws(() => readTraces({ limit: -1 }), MuxError);
		assert.throws(() => readTraces({ limit: 1.5 }), MuxError);
	});
});

test("readTraces honors since across day shards, inclusive", () => {
	withTracesDir((dir) => {
		const older = appendTrace(
			trace({ runKey: "older", startedAt: "2026-07-30T10:00:00.000Z" }),
		);
		const boundary = appendTrace(
			trace({ runKey: "boundary", startedAt: "2026-07-31T09:00:00.000Z" }),
		);
		const newer = appendTrace(
			trace({ runKey: "newer", startedAt: "2026-08-01T08:00:00.000Z" }),
		);
		assert.deepEqual(readdirSync(dir).sort(), [
			"runs-2026-07-30.jsonl",
			"runs-2026-07-31.jsonl",
			"runs-2026-08-01.jsonl",
		]);

		assert.deepEqual(readTraces(), [older, boundary, newer]);
		// The bound is inclusive: a run at exactly `since` is in the window.
		assert.deepEqual(readTraces({ since: "2026-07-31T09:00:00.000Z" }), [
			boundary,
			newer,
		]);
		assert.deepEqual(readTraces({ since: "2026-07-31T09:00:00.001Z" }), [newer]);
		assert.deepEqual(readTraces({ since: new Date("2026-08-02T00:00:00.000Z") }), []);
		assert.deepEqual(readTraces({ since: Date.parse("2026-07-30T00:00:00.000Z") }), [
			older,
			boundary,
			newer,
		]);
		// limit applies after since, and still counts from the newest end.
		assert.deepEqual(
			readTraces({ since: "2026-07-30T00:00:00.000Z", limit: 2 }),
			[boundary, newer],
		);
		assert.throws(() => readTraces({ since: "nonsense" }), MuxError);
	});
});

test("readTraces survives a torn line, losing only what it swallowed", () => {
	withTracesDir((dir) => {
		const good = appendTrace(trace({ runKey: "good" }));
		const shard = join(dir, "runs-2026-08-01.jsonl");
		// What a process killed mid-append leaves behind: a fragment with no
		// terminating newline.
		writeFileSync(shard, `${readFileSync(shard, "utf8")}{"runKey":"torn","dur`, "utf8");

		// The very next append concatenates onto that fragment, so the two
		// are lost together. That is the whole blast radius, and it is
		// asserted rather than hidden.
		appendTrace(trace({ runKey: "swallowed", startedAt: "2026-08-01T13:00:00.000Z" }));
		assert.deepEqual(
			readTraces().map((entry) => entry.runKey),
			["good"],
		);

		// Everything appended after that newline reads normally again.
		const recovered = appendTrace(
			trace({ runKey: "recovered", startedAt: "2026-08-01T14:00:00.000Z" }),
		);
		const read = readTraces();
		assert.deepEqual(
			read.map((entry) => entry.runKey),
			["good", "recovered"],
		);
		assert.deepEqual(read[0], good);
		assert.deepEqual(read[1], recovered);
	});
});

test("readTraces ignores files that are not day shards", () => {
	withTracesDir((dir) => {
		const good = appendTrace(trace({ runKey: "good" }));
		writeFileSync(join(dir, "runs-2026-08-01.jsonl.bak"), "ignored\n", "utf8");
		writeFileSync(join(dir, "notes.txt"), '{"runKey":"x"}\n', "utf8");
		writeFileSync(join(dir, "runs-not-a-date.jsonl"), '{"runKey":"x"}\n', "utf8");
		writeFileSync(join(dir, "runs-2026-8-1.jsonl"), '{"runKey":"x"}\n', "utf8");
		assert.deepEqual(readTraces(), [good]);
	});
});

test("readTraces drops records missing the fields a summary reads", () => {
	withTracesDir((dir) => {
		const good = appendTrace(trace({ runKey: "good" }));
		const shard = join(dir, "runs-2026-08-01.jsonl");
		const partial = JSON.stringify({ runKey: "no-duration", harness: "codex" });
		const wrongType = JSON.stringify({ ...good, durationMs: "1000" });
		writeFileSync(shard, `${readFileSync(shard, "utf8")}${partial}\n${wrongType}\n`, "utf8");
		assert.deepEqual(readTraces(), [good]);
	});
});

test("traceFromRun maps a RunResult onto a trace record", () => {
	withTracesDir(() => {
		const built = traceFromRun({
			runKey: "review-pr-42",
			result: runResult(),
			attempts: [
				{ substrate: "e2b", outcome: "failed", reason: "rate limited", durationMs: 40 },
				{ substrate: "sprites", outcome: "ok", durationMs: 401 },
			],
			startedAt: "2026-08-01T12:00:00.000Z",
		});
		assert.deepEqual(built, {
			runKey: "review-pr-42",
			harness: "claude-code",
			substrate: "e2b",
			attempts: [
				{ substrate: "e2b", outcome: "failed", reason: "rate limited", durationMs: 40 },
				{ substrate: "sprites", outcome: "ok", durationMs: 401 },
			],
			startedAt: "2026-08-01T12:00:00.000Z",
			durationMs: 3615,
			exitCode: 0,
			truncated: false,
			events: 9,
			costUsd: 0.0107,
		});
		assert.deepEqual(appendTrace(built), built);

		// Without an explicit startedAt the start is derived from duration.
		const before = Date.now();
		const derived = traceFromRun({
			runKey: "no-start",
			result: runResult({ durationMs: 1000, costUsd: undefined }),
			error: "harness exited 1",
		});
		const startedMs = Date.parse(derived.startedAt);
		assert.ok(startedMs >= before - 1000 - 50 && startedMs <= before - 1000 + 50);
		assert.equal("costUsd" in derived, false);
		assert.equal(derived.error, "harness exited 1");
		assert.equal(derived.attempts.length, 0);
	});
});

// ---------------------------------------------------------------------------
// Percentiles: the exact index rule
// ---------------------------------------------------------------------------

test("percentile picks the nearest rank without interpolating", () => {
	// Rank is ceil(p * n / 100), 1-based, over the ascending sample.
	// n = 4: p50 -> ceil(200/100) = 2 -> the lower middle, not 25.
	assert.equal(percentile([10, 20, 30, 40], 50), 20);
	// n = 4: p95 -> ceil(380/100) = 4 -> the largest.
	assert.equal(percentile([10, 20, 30, 40], 95), 40);
	// n = 3: p50 -> ceil(150/100) = 2, p95 -> ceil(285/100) = 3.
	assert.equal(percentile([1000, 2000, 3000], 50), 2000);
	assert.equal(percentile([1000, 2000, 3000], 95), 3000);
	// n = 20: p95 -> ceil(1900/100) = 19 -> the 19th of 20, NOT the max.
	// This is the case that distinguishes the rule from "just take the
	// top sample", so it is asserted directly.
	const twenty = Array.from({ length: 20 }, (_unused, index) => (index + 1) * 100);
	assert.equal(percentile(twenty, 95), 1900);
	assert.equal(percentile(twenty, 50), 1000);
	assert.equal(percentile(twenty, 100), 2000);
	assert.equal(percentile(twenty, 1), 100);
	// Unsorted and duplicated input sorts numerically, not lexically.
	assert.equal(percentile([300, 9, 1000, 90], 50), 90);
	assert.equal(percentile([5, 5, 5, 5000], 50), 5);
	// A single sample is every percentile of itself.
	assert.equal(percentile([42], 50), 42);
	assert.equal(percentile([42], 95), 42);
});

test("percentile refuses an empty sample and out-of-range ranks", () => {
	assert.throws(() => percentile([], 50), (error: unknown) => {
		assert.ok(error instanceof MuxError);
		assert.equal(error.kind, "fatal");
		return true;
	});
	assert.throws(() => percentile([1], 0), MuxError);
	assert.throws(() => percentile([1], 101), MuxError);
	assert.throws(() => percentile([1], 95.5), MuxError);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

test("isSuccessfulTrace counts only clean, complete, error-free runs", () => {
	assert.equal(isSuccessfulTrace(trace()), true);
	assert.equal(isSuccessfulTrace(trace({ exitCode: 1 })), false);
	assert.equal(isSuccessfulTrace(trace({ truncated: true })), false);
	assert.equal(isSuccessfulTrace(trace({ error: "boom" })), false);
	// A run that never reached the harness records -1 plus an error.
	assert.equal(isSuccessfulTrace(trace({ exitCode: -1, error: "no route" })), false);
});

test("summarize computes exact success rates and percentiles per group", () => {
	const traces: RunTrace[] = [
		// e2b: 4 runs, 3 successful (one truncated), durations 100..400.
		sample({ substrate: "e2b", harness: "claude-code", durationMs: 100, costUsd: 0.01 }),
		sample({ substrate: "e2b", harness: "claude-code", durationMs: 200, costUsd: 0.02 }),
		sample({ substrate: "e2b", harness: "codex", durationMs: 300 }),
		sample({ substrate: "e2b", harness: "codex", durationMs: 400, truncated: true }),
		// sprites: 3 runs, 1 successful (one non-zero exit, one error).
		sample({ substrate: "sprites", harness: "claude-code", durationMs: 1000 }),
		sample({ substrate: "sprites", harness: "claude-code", durationMs: 2000, ok: false }),
		sample({
			substrate: "sprites",
			harness: "codex",
			durationMs: 3000,
			error: "install did not finish",
		}),
	];

	const summary = summarize(traces);

	// Overall: 7 runs, 4 ok. Durations sorted:
	// [100,200,300,400,1000,2000,3000]; p50 -> ceil(350/100)=4 -> 400,
	// p95 -> ceil(665/100)=7 -> 3000.
	assert.equal(summary.runs, 7);
	assert.equal(summary.ok, 4);
	assert.equal(summary.failed, 3);
	assert.equal(summary.successRate, 4 / 7);
	assert.equal(summary.p50Ms, 400);
	assert.equal(summary.p95Ms, 3000);
	// ok-only durations: [100,200,300,1000]; p50 -> rank 2 -> 200,
	// p95 -> rank 4 -> 1000.
	assert.equal(summary.okP50Ms, 200);
	assert.equal(summary.okP95Ms, 1000);
	// Cost is a sum over the two runs that reported one, never an average
	// over runs whose cost is unknown.
	assert.equal(summary.costUsd, 0.01 + 0.02);
	assert.equal(summary.costKnownRuns, 2);

	assert.deepEqual(summary.bySubstrate.e2b, {
		runs: 4,
		ok: 3,
		failed: 1,
		successRate: 0.75,
		p50Ms: 200,
		p95Ms: 400,
		okP50Ms: 200,
		okP95Ms: 300,
		costUsd: 0.01 + 0.02,
		costKnownRuns: 2,
	});
	assert.deepEqual(summary.bySubstrate.sprites, {
		runs: 3,
		ok: 1,
		failed: 2,
		successRate: 1 / 3,
		p50Ms: 2000,
		p95Ms: 3000,
		okP50Ms: 1000,
		okP95Ms: 1000,
		costUsd: 0,
		costKnownRuns: 0,
	});
	// Substrates with no runs in the window are absent, not zero-filled:
	// zero runs is not a measurement of zero success.
	assert.equal(summary.bySubstrate.vercel, undefined);
	assert.equal(summary.bySubstrate.dedalus, undefined);

	// claude-code: [100,200,1000,2000], 3 ok. p50 -> rank 2 -> 200,
	// p95 -> rank 4 -> 2000. ok-only [100,200,1000] -> 200 / 1000.
	assert.deepEqual(summary.byHarness["claude-code"], {
		runs: 4,
		ok: 3,
		failed: 1,
		successRate: 0.75,
		p50Ms: 200,
		p95Ms: 2000,
		okP50Ms: 200,
		okP95Ms: 1000,
		costUsd: 0.01 + 0.02,
		costKnownRuns: 2,
	});
	// codex: [300,400,3000], 1 ok. p50 -> rank 2 -> 400, p95 -> rank 3.
	assert.deepEqual(summary.byHarness.codex, {
		runs: 3,
		ok: 1,
		failed: 2,
		successRate: 1 / 3,
		p50Ms: 400,
		p95Ms: 3000,
		okP50Ms: 300,
		okP95Ms: 300,
		costUsd: 0,
		costKnownRuns: 0,
	});
	assert.equal(summary.byHarness.openclaw, undefined);
});

test("summarize omits ok-only percentiles for a group that never succeeded", () => {
	const summary = summarize([
		sample({ substrate: "dedalus", harness: "hermes", durationMs: 50, ok: false }),
		sample({ substrate: "dedalus", harness: "hermes", durationMs: 150, error: "oom" }),
	]);
	assert.equal(summary.runs, 2);
	assert.equal(summary.ok, 0);
	assert.equal(summary.successRate, 0);
	assert.equal(summary.p50Ms, 50);
	assert.equal(summary.p95Ms, 150);
	assert.equal("okP50Ms" in summary, false);
	assert.equal("okP95Ms" in summary, false);
	assert.equal("okP50Ms" in (summary.bySubstrate.dedalus ?? {}), false);
});

test("summarize reports the window it covered and zeros on an empty set", () => {
	const summary = summarize([
		sample({
			substrate: "e2b",
			harness: "codex",
			durationMs: 10,
			startedAt: "2026-08-01T12:00:00.000Z",
		}),
		sample({
			substrate: "e2b",
			harness: "codex",
			durationMs: 20,
			startedAt: "2026-07-30T01:00:00.000Z",
		}),
	]);
	assert.equal(summary.from, "2026-07-30T01:00:00.000Z");
	assert.equal(summary.to, "2026-08-01T12:00:00.000Z");

	const empty = summarize([]);
	assert.deepEqual(empty, {
		runs: 0,
		ok: 0,
		failed: 0,
		successRate: 0,
		p50Ms: 0,
		p95Ms: 0,
		costUsd: 0,
		costKnownRuns: 0,
		bySubstrate: {},
		byHarness: {},
	});
});

test("summarize reads the log itself and honors the same window options", () => {
	withTracesDir(() => {
		appendTrace(
			sample({
				substrate: "e2b",
				harness: "codex",
				durationMs: 100,
				startedAt: "2026-07-29T12:00:00.000Z",
			}),
		);
		appendTrace(
			sample({
				substrate: "sprites",
				harness: "codex",
				durationMs: 900,
				ok: false,
				startedAt: "2026-08-01T12:00:00.000Z",
			}),
		);

		const all = summarize();
		assert.equal(all.runs, 2);
		assert.equal(all.successRate, 0.5);
		assert.deepEqual(Object.keys(all.bySubstrate).sort(), ["e2b", "sprites"]);

		const recent = summarize({ since: "2026-08-01T00:00:00.000Z" });
		assert.equal(recent.runs, 1);
		assert.equal(recent.ok, 0);
		assert.equal(recent.successRate, 0);
		assert.equal(recent.p50Ms, 900);
		assert.equal(recent.bySubstrate.e2b, undefined);
		assert.equal(recent.bySubstrate.sprites?.runs, 1);

		const lastOne = summarize({ limit: 1 });
		assert.equal(lastOne.runs, 1);
		assert.equal(lastOne.bySubstrate.sprites?.runs, 1);
	});
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("claim takes a free run key and reports a duplicate as in_flight", () => {
	withTracesDir(() => {
		assert.equal(claim("deploy/web#7"), "claimed");
		assert.equal(claim("deploy/web#7"), "in_flight");
		assert.equal(claim("deploy/web#7"), "in_flight");
		// A different key is unaffected.
		assert.equal(claim("deploy/web#8"), "claimed");

		const record = readClaim("deploy/web#7");
		assert.ok(record);
		assert.equal(record.runKey, "deploy/web#7");
		assert.equal(record.status, "in_flight");
		assert.equal(record.owner.startsWith(`${process.pid}@`), true);
		assert.equal(record.result, undefined);
		// A key with path separators must not escape the claims directory.
		assert.deepEqual(readdirSync(join(tracesDir(), "claims")).length, 2);

		assert.throws(() => claim(""), MuxError);
	});
});

test("claim returns the stored result once the run completes", () => {
	withTracesDir(() => {
		assert.equal(claim("run/once"), "claimed");
		const result = runResult({ text: "done once", substrate: "sprites" });
		completeClaim("run/once", result);

		const outcome = claim("run/once");
		assert.notEqual(outcome, "claimed");
		assert.notEqual(outcome, "in_flight");
		assert.deepEqual(outcome, { done: result });
		// Repeated retries keep replaying the same result, not re-running.
		assert.deepEqual(claim("run/once"), { done: result });
		// Even far past the stale timeout: a finished run never re-opens.
		assert.deepEqual(claim("run/once", { staleMs: 0 }), { done: result });

		const record = readClaim("run/once");
		assert.equal(record?.status, "done");
		assert.ok(record?.completedAt);
		// A failed-but-finished run is stored verbatim: it happened, and it
		// may have had side effects. releaseClaim is the retry path.
		const failed = runResult({ exitCode: 1, truncated: true, text: "" });
		completeClaim("run/failed", failed);
		assert.deepEqual(claim("run/failed"), { done: failed });
	});
});

test("claim frees a stale in_flight claim once the heartbeat ages out", () => {
	withTracesDir(() => {
		assert.equal(claim("crashed/run"), "claimed");
		const held = readClaim("crashed/run");
		assert.ok(held);

		// Simulate the holder dying: rewind the heartbeat past the default
		// timeout. Rewriting the file keeps the test deterministic instead
		// of sleeping for a real interval.
		const claimFile = join(
			tracesDir(),
			"claims",
			readdirSync(join(tracesDir(), "claims"))[0],
		);
		const stale = new Date(Date.now() - STALE_CLAIM_MS - 60_000).toISOString();
		writeFileSync(
			claimFile,
			JSON.stringify({ ...held, heartbeatAt: stale }, null, 2),
			"utf8",
		);

		// A live heartbeat resets the clock, so the holder is not evicted.
		assert.equal(heartbeatClaim("crashed/run"), true);
		assert.equal(claim("crashed/run"), "in_flight");

		// Age it out again and the key is takeable, with a fresh record.
		writeFileSync(
			claimFile,
			JSON.stringify({ ...held, heartbeatAt: stale }, null, 2),
			"utf8",
		);
		assert.equal(claim("crashed/run"), "claimed");
		const taken = readClaim("crashed/run");
		assert.equal(taken?.status, "in_flight");
		assert.ok(Date.parse(taken?.heartbeatAt ?? "") > Date.parse(stale));
		// And the new holder is now the one protected.
		assert.equal(claim("crashed/run"), "in_flight");
	});
});

test("claim ages out a corrupt claim file instead of blocking forever", () => {
	withTracesDir(() => {
		assert.equal(claim("corrupt/run"), "claimed");
		const claimFile = join(
			tracesDir(),
			"claims",
			readdirSync(join(tracesDir(), "claims"))[0],
		);
		// A crash mid-write leaves a half-written record. An unreadable
		// heartbeat is treated as infinitely old, so the key is takeable.
		writeFileSync(claimFile, '{"runKey":"corrupt/run","status":"in_fl', "utf8");
		assert.equal(readClaim("corrupt/run"), null);
		assert.equal(claim("corrupt/run"), "claimed");
		assert.equal(readClaim("corrupt/run")?.status, "in_flight");
	});
});

test("heartbeatClaim reports lost ownership and releaseClaim reopens a key", () => {
	withTracesDir(() => {
		assert.equal(heartbeatClaim("never/claimed"), false);

		assert.equal(claim("retryable/run"), "claimed");
		assert.equal(heartbeatClaim("retryable/run"), true);
		releaseClaim("retryable/run");
		assert.equal(readClaim("retryable/run"), null);
		assert.equal(heartbeatClaim("retryable/run"), false);
		// Released, so the run can legitimately be executed again.
		assert.equal(claim("retryable/run"), "claimed");

		// A completed key is terminal: heartbeating it is not ownership.
		completeClaim("finished/run", runResult());
		assert.equal(heartbeatClaim("finished/run"), false);
		// releaseClaim on an absent key is a no-op, not an error.
		releaseClaim("absent/run");
	});
});

test("completeClaim stores a result even when no claim file exists", () => {
	withTracesDir(() => {
		// Losing a result is worse than a missing claim, so the terminal
		// record is written either way.
		const result = runResult({ text: "recovered" });
		const record = completeClaim("unclaimed/run", result);
		assert.equal(record.status, "done");
		assert.equal(record.claimedAt, record.completedAt);
		assert.deepEqual(claim("unclaimed/run"), { done: result });
	});
});

test("claims live under the traces directory so one env var relocates both", () => {
	withTracesDir((dir) => {
		assert.equal(tracesDir(), dir);
		appendTrace(trace());
		claim("colocated");
		assert.deepEqual(readdirSync(dir).sort(), ["claims", "runs-2026-08-01.jsonl"]);
	});
});
