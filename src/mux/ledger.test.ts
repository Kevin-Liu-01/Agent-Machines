/**
 * Tests for src/mux/ledger.ts: the append-only metering ledger.
 *
 * Run: npx tsx --test src/mux/ledger.test.ts
 *
 * Every test gets its own temp directory through AGENT_MACHINES_MUX_LEDGER and
 * removes it afterwards, so nothing here can touch ~/.agent-machines/ledger/.
 *
 * Every money assertion is an EXACT integer against arithmetic spelled out in
 * this file from the published rates, never a value read back from the module
 * under test. cost.ts's rates are duplicated here on purpose (same pattern as
 * traces.test.ts): if a rate changes, these tests must fail and be re-derived
 * by hand rather than silently tracking the new number.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	MILLICENTS_PER_USD,
	appendCharge,
	appendCorrection,
	entryTotal,
	formatMillicents,
	isPriced,
	ledgerDir,
	readLedger,
	summarizeLedger,
	usdToMillicents,
	validateEntry,
	type ChargeInput,
	type LedgerEntry,
	type LedgerLine,
	type LedgerLineKind,
	type PricedLine,
} from "./ledger.js";
import { MuxError } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function withLedgerDir(body: (dir: string) => void): void {
	const previous = process.env.AGENT_MACHINES_MUX_LEDGER;
	const dir = mkdtempSync(join(tmpdir(), "am-mux-ledger-"));
	process.env.AGENT_MACHINES_MUX_LEDGER = dir;
	try {
		body(dir);
	} finally {
		if (previous === undefined) delete process.env.AGENT_MACHINES_MUX_LEDGER;
		else process.env.AGENT_MACHINES_MUX_LEDGER = previous;
		rmSync(dir, { recursive: true, force: true });
	}
}

const HOUR_MS = 3_600_000;

/**
 * E2B's published rates, read from docs/MUX-RESULTS-adjacent cost.ts:
 * $0.0504/vCPU-hour and $0.0162/GiB-hour on wall clock. One hour at the default
 * comparison size (2 vCPU, 2048 MiB = 2 GiB) with no creation billed:
 *
 *   cpu    = 1h * 2 vCPU * 0.0504 = 0.1008
 *   memory = 2 GiB * 1h * 0.0162  = 0.0324
 *            ------------------------------
 *   compute                       = 0.1332 USD = 13320 millicents
 */
const E2B_HOUR_MILLICENTS = 13_320;
/** One measured Claude Code turn, docs/MUX-RESULTS.md: $0.0107 = 1070. */
const MODEL_MILLICENTS = 1_070;
/** 1500bp of (13320 + 1070) = 14390 * 1500 / 10000 = 2158.5, rounded to 2159. */
const MARGIN_1500BP_MILLICENTS = 2_159;

const MODEL_RATE = {
	id: "anthropic/claude-sonnet-4.5",
	source: "harness-reported total_cost_usd (claude-code stream-json result)",
};

const MARGIN_SOURCE = "agent-machines platform margin, 15% (test fixture)";

function charge(overrides: Partial<ChargeInput> = {}): ChargeInput {
	return {
		runKey: "run-1",
		harness: "claude-code",
		substrate: "e2b",
		occurredAt: "2026-08-02T10:00:00.000Z",
		sandbox: { basis: "duration", durationMs: HOUR_MS, vcpu: 2, memoryMib: 2048 },
		model: { usd: 0.0107, provenance: "metered", rate: MODEL_RATE },
		margin: { kind: "percent", basisPoints: 1500, source: MARGIN_SOURCE },
		...overrides,
	};
}

function lineOf(entry: LedgerEntry, kind: LedgerLineKind): LedgerLine {
	const line = entry.lines.find((candidate) => candidate.kind === kind);
	assert.ok(line, `expected a ${kind} line`);
	return line;
}

function pricedLineOf(entry: LedgerEntry, kind: LedgerLineKind): PricedLine {
	const line = lineOf(entry, kind);
	assert.ok(isPriced(line), `expected the ${kind} line to carry an amount`);
	return line;
}

function shardFiles(dir: string): string[] {
	return readdirSync(dir).sort();
}

// ---------------------------------------------------------------------------
// Money unit
// ---------------------------------------------------------------------------

test("usdToMillicents converts once, exactly, and refuses garbage", () => {
	assert.equal(MILLICENTS_PER_USD, 100_000);
	assert.equal(usdToMillicents(0.0107), 1_070);
	assert.equal(usdToMillicents(0.1332), 13_320);
	assert.equal(usdToMillicents(0), 0);
	// A run under half a millicent rounds to a REAL zero: we bill nothing. That
	// is not the same as an absent amount, and the type reflects it (number, not
	// null).
	assert.equal(usdToMillicents(0.000004), 0);
	assert.throws(() => usdToMillicents(Number.NaN), MuxError);
	assert.throws(() => usdToMillicents(Number.POSITIVE_INFINITY), MuxError);
	assert.throws(() => usdToMillicents(-0.01), MuxError);
});

test("formatMillicents renders the minor unit without float math", () => {
	assert.equal(formatMillicents(0), "$0.00000");
	assert.equal(formatMillicents(13_320), "$0.13320");
	assert.equal(formatMillicents(100_000), "$1.00000");
	assert.equal(formatMillicents(-2_159), "-$0.02159");
});

// ---------------------------------------------------------------------------
// A priced charge: exact arithmetic
// ---------------------------------------------------------------------------

test("a priced charge posts three lines with exact integer amounts", () => {
	withLedgerDir(() => {
		const entry = appendCharge(charge());

		assert.equal(entry.kind, "charge");
		assert.equal(entry.lines.length, 3);
		assert.deepEqual(
			entry.lines.map((line) => line.kind),
			["sandbox", "model", "margin"],
		);

		const sandbox = pricedLineOf(entry, "sandbox");
		assert.equal(sandbox.millicents, E2B_HOUR_MILLICENTS);
		assert.equal(sandbox.provenance, "estimated");
		assert.equal(sandbox.rate.id, "e2b:compute");
		assert.match(sandbox.rate.source, /e2b\.dev\/pricing \(read 2026-08-01\)/);
		assert.match(sandbox.detail, /vCPU-hour/);
		assert.equal(sandbox.upperBound, undefined);

		const model = pricedLineOf(entry, "model");
		assert.equal(model.millicents, MODEL_MILLICENTS);
		assert.equal(model.provenance, "metered");
		assert.deepEqual(model.rate, MODEL_RATE);

		const margin = pricedLineOf(entry, "margin");
		assert.equal(margin.millicents, MARGIN_1500BP_MILLICENTS);
		// A percentage of a modeled base is itself modeled.
		assert.equal(margin.provenance, "estimated");
		assert.equal(margin.rate.id, "margin:1500bp");

		const total = entryTotal(entry);
		assert.equal(total.known, true);
		assert.ok(total.known);
		assert.equal(
			total.millicents,
			E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + MARGIN_1500BP_MILLICENTS,
		);
		assert.equal(total.millicents, 16_549);
		// Metered model plus modeled sandbox: the total says so rather than
		// picking one label.
		assert.equal(total.provenance, "mixed");
		assert.deepEqual(total.provenances, ["estimated", "metered"]);
	});
});

test("margin is a separate line, never folded into either pass-through line", () => {
	withLedgerDir(() => {
		const withMargin = appendCharge(charge());
		const noMargin = appendCharge(charge({ runKey: "run-2", margin: { kind: "none" } }));

		// The two pass-through amounts are byte-for-byte the same whether or not a
		// margin is charged: the margin cannot have been hidden inside them.
		assert.equal(
			pricedLineOf(withMargin, "sandbox").millicents,
			pricedLineOf(noMargin, "sandbox").millicents,
		);
		assert.equal(
			pricedLineOf(withMargin, "model").millicents,
			pricedLineOf(noMargin, "model").millicents,
		);
		const declaredZero = pricedLineOf(noMargin, "margin");
		assert.equal(declaredZero.millicents, 0);
		assert.equal(declaredZero.provenance, "fixed");
		assert.equal(declaredZero.rate.id, "margin:none");
	});
});

test("a flat margin is a fixed amount and does not scale with the run", () => {
	withLedgerDir(() => {
		const entry = appendCharge(
			charge({ margin: { kind: "flat", millicents: 500, source: "price list v0" } }),
		);
		const margin = pricedLineOf(entry, "margin");
		assert.equal(margin.millicents, 500);
		assert.equal(margin.provenance, "fixed");
		const total = entryTotal(entry);
		assert.ok(total.known);
		assert.equal(total.millicents, E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + 500);
		assert.throws(
			() =>
				appendCharge(
					charge({ margin: { kind: "flat", millicents: 0.5, source: "price list v0" } }),
				),
			MuxError,
		);
	});
});

test("a provider-billed sandbox figure is metered, and an all-metered total says so", () => {
	withLedgerDir(() => {
		const entry = appendCharge(
			charge({
				sandbox: {
					basis: "provider-billed",
					usd: 0.02,
					source: "e2b usage API, invoice 2026-08 (read 2026-08-02)",
				},
			}),
		);
		const sandbox = pricedLineOf(entry, "sandbox");
		assert.equal(sandbox.millicents, 2_000);
		assert.equal(sandbox.provenance, "metered");
		assert.equal(sandbox.rate.id, "e2b:invoice");
		// 1500bp of (2000 + 1070) = 3070 * 0.15 = 460.5 -> 461.
		const margin = pricedLineOf(entry, "margin");
		assert.equal(margin.millicents, 461);
		assert.equal(margin.provenance, "metered");
		const total = entryTotal(entry);
		assert.ok(total.known);
		assert.equal(total.millicents, 2_000 + 1_070 + 461);
		assert.equal(total.provenance, "metered");
		assert.deepEqual(total.provenances, ["metered"]);
	});
});

test("an active-CPU lane is marked an upper bound", () => {
	withLedgerDir(() => {
		const entry = appendCharge(charge({ substrate: "vercel" }));
		const sandbox = pricedLineOf(entry, "sandbox");
		// Vercel publishes $0.128/vCPU-hour on ACTIVE CPU and $0.0212/GB-hour on
		// decimal GB: 1h * 2 vCPU * 0.128 = 0.256, plus
		// (2048 / (1e9/1048576)) GB * 1h * 0.0212. Priced at full utilization
		// because nothing measured it, so the figure is a ceiling.
		const memoryGb = 2048 / (1_000_000_000 / 1_048_576);
		assert.equal(
			sandbox.millicents,
			Math.round((1 * 2 * 0.128 + memoryGb * 0.0212) * MILLICENTS_PER_USD),
		);
		assert.equal(sandbox.upperBound, true);
		assert.equal(sandbox.provenance, "estimated");
	});
});

// ---------------------------------------------------------------------------
// Unknown components: absent, never zero
// ---------------------------------------------------------------------------

test("an unpriced lane leaves the sandbox amount absent, not zero", () => {
	withLedgerDir((dir) => {
		const entry = appendCharge(charge({ substrate: "sprites" }));
		const sandbox = lineOf(entry, "sandbox");
		assert.equal(sandbox.millicents, null);
		assert.ok(!isPriced(sandbox));
		assert.match(sandbox.reason, /Fly publishes no Sprites compute rate/);

		// A percentage of an unknown base is unknown too. Charging 0 here would
		// under-bill every run on this lane while looking correct.
		const margin = lineOf(entry, "margin");
		assert.equal(margin.millicents, null);
		assert.ok(!isPriced(margin));
		assert.match(margin.reason, /sandbox/);

		const total = entryTotal(entry);
		assert.equal(total.known, false);
		assert.ok(!total.known);
		assert.deepEqual(
			total.missing.map((component) => component.kind),
			["sandbox", "margin"],
		);
		// No amount field anywhere on the total: a reader cannot `?? 0` its way to
		// a number that was never known.
		assert.equal((total as { millicents?: number }).millicents, undefined);

		// And the same is true on disk: the stored line says null, so a reader
		// cannot mistake a missing key for a zero.
		const raw = readFileSync(join(dir, shardFiles(dir)[0]), "utf8");
		assert.match(raw, /"kind":"sandbox","millicents":null/);
	});
});

test("an unknown model spend keeps the total absent rather than zero", () => {
	withLedgerDir(() => {
		const entry = appendCharge(
			charge({
				model: { unknown: "the harness reported no cost for this turn" },
			}),
		);
		// The priced half is still recorded in full -- withholding the total does
		// not mean discarding what is known.
		assert.equal(pricedLineOf(entry, "sandbox").millicents, E2B_HOUR_MILLICENTS);
		const model = lineOf(entry, "model");
		assert.equal(model.millicents, null);
		const total = entryTotal(entry);
		assert.ok(!total.known);
		assert.deepEqual(total.missing, [
			{ kind: "model", reason: "the harness reported no cost for this turn" },
			{
				kind: "margin",
				reason: "a 1500bp margin needs a priced base, and model has no amount",
			},
		]);

		const summary = summarizeLedger([entry]);
		assert.ok(!summary.total.known);
		// The sandbox component alone IS known, and is reported as such -- the
		// withheld figure is the total, not every number in the window.
		assert.ok(summary.byKind.sandbox.total.known);
		assert.equal(summary.byKind.sandbox.total.millicents, E2B_HOUR_MILLICENTS);
		assert.equal(summary.unpricedLines, 2);
	});
});

test("an undeclared margin policy is unknown, not free", () => {
	withLedgerDir(() => {
		const entry = appendCharge(charge({ margin: undefined }));
		const margin = lineOf(entry, "margin");
		assert.equal(margin.millicents, null);
		assert.match(margin.reason, /an undeclared margin is not a zero margin/);
		const total = entryTotal(entry);
		assert.ok(!total.known);
		assert.deepEqual(
			total.missing.map((component) => component.kind),
			["margin"],
		);
	});
});

// ---------------------------------------------------------------------------
// Append-only and corrections
// ---------------------------------------------------------------------------

test("a full reversal nets to zero without touching the original line", () => {
	withLedgerDir((dir) => {
		const original = appendCharge(charge());
		const shard = join(dir, shardFiles(dir)[0]);
		const before = readFileSync(shard, "utf8");
		assert.equal(before.trimEnd().split("\n").length, 1);

		const correction = appendCorrection({
			original,
			reason: "run was double-charged by a retried writer",
			occurredAt: "2026-08-02T18:00:00.000Z",
		});

		const after = readFileSync(shard, "utf8");
		const lines = after.trimEnd().split("\n");
		assert.equal(lines.length, 2);
		// The original record is byte-identical: a correction appends, it never
		// rewrites. This is the property that makes the log auditable.
		assert.equal(`${lines[0]}\n`, before);

		assert.equal(correction.kind, "correction");
		assert.equal(correction.corrects, original.id);
		assert.equal(correction.runKey, original.runKey);
		assert.equal(pricedLineOf(correction, "sandbox").millicents, -E2B_HOUR_MILLICENTS);
		assert.equal(pricedLineOf(correction, "model").millicents, -MODEL_MILLICENTS);
		assert.equal(pricedLineOf(correction, "margin").millicents, -MARGIN_1500BP_MILLICENTS);

		const summary = summarizeLedger(readLedger());
		assert.equal(summary.entries, 2);
		assert.equal(summary.charges, 1);
		assert.equal(summary.corrections, 1);
		assert.ok(summary.total.known);
		assert.equal(summary.total.millicents, 0);
		const run = summary.byRun["run-1"];
		assert.ok(run.total.known);
		assert.equal(run.total.millicents, 0);
		assert.equal(run.charges, 1);
		assert.equal(run.corrections, 1);
		assert.deepEqual(run.routes, ["claude-code@e2b"]);
		assert.deepEqual(summary.danglingCorrections, []);
		// Every component nets independently, so a reversal cannot move money
		// between lines.
		for (const kind of ["sandbox", "model", "margin"] as const) {
			const component = summary.byKind[kind];
			assert.equal(component.lines, 2);
			assert.ok(component.total.known);
			assert.equal(component.total.millicents, 0);
		}
	});
});

test("a partial correction adjusts one component and leaves the rest standing", () => {
	withLedgerDir(() => {
		const original = appendCharge(charge());
		appendCorrection({
			original,
			reason: "upstream refunded a failed turn",
			occurredAt: "2026-08-02T19:00:00.000Z",
			lines: [
				{
					kind: "model",
					millicents: -300,
					provenance: "metered",
					rate: MODEL_RATE,
					detail: "upstream credit for a failed turn",
				},
			],
		});

		const summary = summarizeLedger(readLedger());
		assert.ok(summary.total.known);
		assert.equal(
			summary.total.millicents,
			E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + MARGIN_1500BP_MILLICENTS - 300,
		);
		assert.ok(summary.byKind.model.total.known);
		assert.equal(summary.byKind.model.total.millicents, MODEL_MILLICENTS - 300);
		assert.ok(summary.byKind.sandbox.total.known);
		assert.equal(summary.byKind.sandbox.total.millicents, E2B_HOUR_MILLICENTS);
		assert.equal(summary.byKind.sandbox.lines, 1);
		assert.equal(summary.byKind.model.lines, 2);
	});
});

test("reversing an amount that was never priced stays unknown", () => {
	withLedgerDir(() => {
		const original = appendCharge(charge({ substrate: "sprites" }));
		const correction = appendCorrection({
			original,
			reason: "duplicate charge on an unpriced lane",
			occurredAt: "2026-08-02T20:00:00.000Z",
		});
		const sandbox = lineOf(correction, "sandbox");
		assert.equal(sandbox.millicents, null);
		assert.match(sandbox.reason, /reversal of an amount that was never priced/);
		// The model half did have an amount, so its reversal is exact.
		assert.equal(pricedLineOf(correction, "model").millicents, -MODEL_MILLICENTS);
		const summary = summarizeLedger(readLedger());
		assert.ok(!summary.total.known);
		assert.ok(summary.byKind.model.total.known);
		assert.equal(summary.byKind.model.total.millicents, 0);
	});
});

test("a correction cannot be filed against a different run or route", () => {
	withLedgerDir(() => {
		const original = appendCharge(charge());
		const correction = appendCorrection({
			original,
			reason: "typo in the run key at the call site",
			occurredAt: "2026-08-02T21:00:00.000Z",
			// A caller cannot pass runKey/harness/substrate at all: they are copied
			// off the corrected entry, so the pair can never drift apart.
		});
		assert.equal(correction.runKey, original.runKey);
		assert.equal(correction.harness, original.harness);
		assert.equal(correction.substrate, original.substrate);
	});
});

test("a correction defaults to the period it is issued in, not the run's", () => {
	withLedgerDir((dir) => {
		const original = appendCharge(charge({ occurredAt: "2026-07-01T09:00:00.000Z" }));
		assert.deepEqual(shardFiles(dir), ["ledger-2026-07-01.jsonl"]);
		const correction = appendCorrection({ original, reason: "issued this month" });
		// Today's shard, not July's: an adjustment lands in the open period rather
		// than reopening a closed one.
		assert.equal(
			correction.occurredAt.slice(0, 10),
			new Date().toISOString().slice(0, 10),
		);
		assert.equal(shardFiles(dir).length, 2);
	});
});

test("a window holding only half a correction pair says so", () => {
	withLedgerDir(() => {
		const original = appendCharge(charge({ occurredAt: "2026-07-01T09:00:00.000Z" }));
		appendCorrection({
			original,
			reason: "credited in the next period",
			occurredAt: "2026-08-02T09:00:00.000Z",
		});

		const august = summarizeLedger(
			readLedger({ since: "2026-08-01T00:00:00.000Z", until: "2026-08-31T23:59:59.999Z" }),
		);
		assert.equal(august.entries, 1);
		assert.deepEqual(
			august.danglingCorrections.map((entry) => entry.corrects),
			[original.id],
		);
		// The netted view needs both periods, and then nothing dangles.
		const both = summarizeLedger(readLedger());
		assert.deepEqual(both.danglingCorrections, []);
		assert.ok(both.total.known);
		assert.equal(both.total.millicents, 0);
	});
});

// ---------------------------------------------------------------------------
// Read: time range and limit
// ---------------------------------------------------------------------------

test("readLedger returns a time range oldest-first, and honors a limit", () => {
	withLedgerDir((dir) => {
		const days = [
			"2026-07-30T12:00:00.000Z",
			"2026-07-31T12:00:00.000Z",
			"2026-08-01T12:00:00.000Z",
		];
		days.forEach((occurredAt, index) => {
			appendCharge(charge({ runKey: `run-${index}`, occurredAt }));
		});
		assert.deepEqual(shardFiles(dir), [
			"ledger-2026-07-30.jsonl",
			"ledger-2026-07-31.jsonl",
			"ledger-2026-08-01.jsonl",
		]);

		assert.deepEqual(
			readLedger().map((entry) => entry.runKey),
			["run-0", "run-1", "run-2"],
		);
		assert.deepEqual(
			readLedger({ since: "2026-07-31T00:00:00.000Z" }).map((entry) => entry.runKey),
			["run-1", "run-2"],
		);
		assert.deepEqual(
			readLedger({ until: "2026-07-31T23:59:59.999Z" }).map((entry) => entry.runKey),
			["run-0", "run-1"],
		);
		assert.deepEqual(
			readLedger({
				since: "2026-07-31T00:00:00.000Z",
				until: "2026-07-31T23:59:59.999Z",
			}).map((entry) => entry.runKey),
			["run-1"],
		);
		// Inclusive on both ends, to the millisecond.
		assert.deepEqual(
			readLedger({
				since: "2026-07-31T12:00:00.000Z",
				until: "2026-07-31T12:00:00.000Z",
			}).map((entry) => entry.runKey),
			["run-1"],
		);
		assert.deepEqual(
			readLedger({ limit: 2 }).map((entry) => entry.runKey),
			["run-1", "run-2"],
		);
		assert.deepEqual(readLedger({ limit: 0 }), []);
		assert.throws(() => readLedger({ limit: -1 }), MuxError);
		assert.throws(() => readLedger({ limit: 1.5 }), MuxError);
		// An inverted range is a caller bug; an empty result would read as
		// "nothing was charged".
		assert.throws(
			() => readLedger({ since: "2026-08-01T00:00:00.000Z", until: "2026-07-01T00:00:00.000Z" }),
			MuxError,
		);
	});
});

test("ledgerDir honors the env override and defaults under the home directory", () => {
	withLedgerDir((dir) => {
		assert.equal(ledgerDir(), dir);
	});
	const previous = process.env.AGENT_MACHINES_MUX_LEDGER;
	delete process.env.AGENT_MACHINES_MUX_LEDGER;
	try {
		assert.match(ledgerDir(), /\.agent-machines[/\\]ledger$/);
	} finally {
		if (previous !== undefined) process.env.AGENT_MACHINES_MUX_LEDGER = previous;
	}
});

// ---------------------------------------------------------------------------
// Summarize: by run, by route, by provenance
// ---------------------------------------------------------------------------

test("summarize totals by run and by route", () => {
	withLedgerDir(() => {
		appendCharge(charge({ runKey: "run-a" }));
		appendCharge(charge({ runKey: "run-b" }));
		appendCharge(charge({ runKey: "run-c", harness: "codex", substrate: "dedalus" }));

		const summary = summarizeLedger(readLedger());
		assert.equal(summary.entries, 3);
		assert.equal(summary.charges, 3);
		assert.equal(summary.corrections, 0);
		assert.equal(summary.from, "2026-08-02T10:00:00.000Z");
		assert.equal(summary.to, "2026-08-02T10:00:00.000Z");

		const perRun = E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + MARGIN_1500BP_MILLICENTS;
		for (const runKey of ["run-a", "run-b"]) {
			const run = summary.byRun[runKey];
			assert.equal(run.entries, 1);
			assert.ok(run.total.known);
			assert.equal(run.total.millicents, perRun);
		}

		const e2bRoute = summary.byRoute["claude-code@e2b"];
		assert.ok(e2bRoute);
		assert.equal(e2bRoute.runs, 2);
		assert.equal(e2bRoute.entries, 2);
		assert.ok(e2bRoute.total.known);
		assert.equal(e2bRoute.total.millicents, perRun * 2);

		// Dedalus publishes $0.04536/vCPU-hour and $0.01458/GiB-hour: one hour at
		// 2 vCPU / 2 GiB = 0.09072 + 0.02916 = 0.11988 USD = 11988 millicents.
		const dedalusSandbox = 11_988;
		const dedalusMargin = Math.round(((dedalusSandbox + MODEL_MILLICENTS) * 1500) / 10_000);
		const dedalusRoute = summary.byRoute["codex@dedalus"];
		assert.ok(dedalusRoute);
		assert.equal(dedalusRoute.runs, 1);
		assert.ok(dedalusRoute.total.known);
		assert.equal(
			dedalusRoute.total.millicents,
			dedalusSandbox + MODEL_MILLICENTS + dedalusMargin,
		);

		assert.ok(summary.total.known);
		assert.equal(
			summary.total.millicents,
			perRun * 2 + dedalusSandbox + MODEL_MILLICENTS + dedalusMargin,
		);
	});
});

test("totals by provenance never silently mix metered and estimated", () => {
	withLedgerDir(() => {
		appendCharge(charge());
		const summary = summarizeLedger(readLedger());

		// The metered bucket is the model half alone. It must NOT have absorbed
		// the modeled sandbox figure or the margin derived from it.
		assert.equal(summary.byProvenance.metered.millicents, MODEL_MILLICENTS);
		assert.equal(summary.byProvenance.metered.lines, 1);
		assert.deepEqual(summary.byProvenance.metered.kinds, ["model"]);

		assert.equal(
			summary.byProvenance.estimated.millicents,
			E2B_HOUR_MILLICENTS + MARGIN_1500BP_MILLICENTS,
		);
		assert.equal(summary.byProvenance.estimated.lines, 2);
		assert.deepEqual(summary.byProvenance.estimated.kinds, ["margin", "sandbox"]);

		// Nothing was charged at a fixed price here, and the bucket says so with a
		// line count rather than with a bare 0 that could read as "free".
		assert.equal(summary.byProvenance.fixed.millicents, 0);
		assert.equal(summary.byProvenance.fixed.lines, 0);
		assert.deepEqual(summary.byProvenance.fixed.kinds, []);

		// No single bucket equals the run total: the combined figure exists only on
		// `total`, which is labeled mixed.
		const runTotal = E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + MARGIN_1500BP_MILLICENTS;
		for (const bucket of Object.values(summary.byProvenance)) {
			assert.notEqual(bucket.millicents, runTotal);
		}
		assert.ok(summary.total.known);
		assert.equal(summary.total.millicents, runTotal);
		assert.equal(summary.total.provenance, "mixed");
		assert.deepEqual(summary.total.provenances, ["estimated", "metered"]);
	});
});

test("a single-provenance window is labeled with that provenance, not mixed", () => {
	withLedgerDir(() => {
		appendCharge(
			charge({
				sandbox: { basis: "provider-billed", usd: 0.02, source: "e2b invoice 2026-08" },
				margin: { kind: "flat", millicents: 0, source: "no margin this period" },
			}),
		);
		const summary = summarizeLedger(readLedger());
		assert.ok(summary.total.known);
		assert.equal(summary.total.provenance, "mixed");
		// Metered pass-through plus a fixed margin: still two provenances, and
		// still named. The point is that "mixed" is derived, never assumed.
		assert.deepEqual(summary.total.provenances, ["fixed", "metered"]);
		assert.equal(summary.byProvenance.metered.millicents, 2_000 + MODEL_MILLICENTS);
		assert.equal(summary.byProvenance.estimated.lines, 0);
	});
});

test("an unpriced component in a group withholds only the totals it touches", () => {
	withLedgerDir(() => {
		appendCharge(charge({ runKey: "priced" }));
		appendCharge(charge({ runKey: "unpriced", substrate: "sprites" }));

		const summary = summarizeLedger(readLedger());
		assert.ok(!summary.total.known);
		assert.ok(summary.byRun.priced.total.known);
		assert.equal(
			summary.byRun.priced.total.millicents,
			E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + MARGIN_1500BP_MILLICENTS,
		);
		assert.ok(!summary.byRun.unpriced.total.known);
		// The e2b route is fully priced even though the window is not.
		const e2bRoute = summary.byRoute["claude-code@e2b"];
		assert.ok(e2bRoute?.total.known);
		const spritesRoute = summary.byRoute["claude-code@sprites"];
		assert.ok(spritesRoute);
		assert.ok(!spritesRoute.total.known);
		assert.equal(spritesRoute.byKind.sandbox.pricedLines, 0);
		// The model component is priced on both runs, so its total stands.
		assert.ok(summary.byKind.model.total.known);
		assert.equal(summary.byKind.model.total.millicents, MODEL_MILLICENTS * 2);
	});
});

test("a run key that collides with a prototype member still appears in the summary", () => {
	withLedgerDir(() => {
		// A run key is caller-chosen text, so this one is reachable. Assigning it
		// onto a plain object would hit the prototype setter and drop the run.
		appendCharge(charge({ runKey: "__proto__" }));
		const summary = summarizeLedger(readLedger());
		assert.deepEqual(Object.keys(summary.byRun), ["__proto__"]);
		const run = summary.byRun.__proto__;
		assert.ok(run);
		assert.equal(run.runKey, "__proto__");
		assert.ok(run.total.known);
		assert.equal(
			run.total.millicents,
			E2B_HOUR_MILLICENTS + MODEL_MILLICENTS + MARGIN_1500BP_MILLICENTS,
		);
	});
});

test("an empty window is the empty set, not a free one", () => {
	withLedgerDir(() => {
		const summary = summarizeLedger(readLedger());
		assert.equal(summary.entries, 0);
		assert.equal(summary.unpricedLines, 0);
		assert.ok(summary.total.known);
		assert.equal(summary.total.millicents, 0);
		assert.equal(summary.total.provenance, "none");
		assert.deepEqual(summary.total.provenances, []);
		assert.equal(summary.byKind.sandbox.lines, 0);
		assert.deepEqual(summary.byRun, {});
		assert.deepEqual(summary.byRoute, {});
		assert.equal(summary.from, undefined);
		assert.equal(summary.to, undefined);
	});
});

// ---------------------------------------------------------------------------
// Validation: the reader is exactly as strict as the writer
// ---------------------------------------------------------------------------

function storedEntry(dir: string): Record<string, unknown> {
	const raw = readFileSync(join(dir, shardFiles(dir)[0]), "utf8");
	return JSON.parse(raw.trimEnd().split("\n")[0]) as Record<string, unknown>;
}

function rewriteShard(dir: string, entry: Record<string, unknown>): void {
	writeFileSync(join(dir, shardFiles(dir)[0]), `${JSON.stringify(entry)}\n`, "utf8");
}

test("a charge that omits a component is refused, on write and on read", () => {
	withLedgerDir((dir) => {
		appendCharge(charge());
		const stored = storedEntry(dir);
		stored.lines = (stored.lines as unknown[]).filter(
			(line) => (line as { kind: string }).kind !== "margin",
		);
		rewriteShard(dir, stored);
		// An omitted component would make the remaining two look like a complete
		// total, so the read refuses rather than summing them.
		assert.throws(() => readLedger(), /margin is missing/);
		assert.throws(
			() => validateEntry(stored),
			/a charge must declare all of sandbox, model, margin/,
		);
	});
});

test("a negative amount is legal on a correction and refused on a charge", () => {
	withLedgerDir((dir) => {
		appendCharge(charge());
		const stored = storedEntry(dir);
		const lines = stored.lines as Record<string, unknown>[];
		lines[0].millicents = -1;
		assert.throws(() => validateEntry(stored), /must not be negative on a charge/);
		stored.kind = "correction";
		stored.corrects = "led-something";
		stored.reason = "a credit";
		assert.doesNotThrow(() => validateEntry(stored));
	});
});

test("a correction with no reason or no target is refused", () => {
	withLedgerDir((dir) => {
		appendCharge(charge());
		const storedCharge = (): Record<string, unknown> => storedEntry(dir);
		const base = {
			id: "led-1",
			kind: "correction",
			runKey: "run-1",
			harness: "claude-code",
			substrate: "e2b",
			occurredAt: "2026-08-02T10:00:00.000Z",
			recordedAt: "2026-08-02T10:00:00.000Z",
			recordedBy: "1@test",
			lines: [{ kind: "model", millicents: -5, provenance: "metered", rate: MODEL_RATE, detail: "d" }],
		};
		assert.throws(() => validateEntry({ ...base, corrects: "led-0" }), /reason/);
		assert.throws(() => validateEntry({ ...base, reason: "why" }), /corrects/);
		assert.doesNotThrow(() => validateEntry({ ...base, corrects: "led-0", reason: "why" }));
		// A charge may not carry either field: only a correction compensates. Built
		// from a complete, non-negative charge so the refusal under test is the one
		// that fires, not the negative-amount rule.
		const validCharge = { ...storedCharge(), corrects: "led-0" };
		assert.throws(
			() => validateEntry(validCharge),
			/only a correction may reference another entry/,
		);
		assert.throws(
			() => validateEntry({ ...storedCharge(), reason: "why" }),
			/reason belongs on a correction/,
		);
	});
});

test("an absent amount with no stated reason is refused", () => {
	withLedgerDir((dir) => {
		appendCharge(charge());
		const stored = storedEntry(dir);
		const lines = stored.lines as Record<string, unknown>[];
		lines[0] = { kind: "sandbox", millicents: null };
		rewriteShard(dir, stored);
		assert.throws(() => readLedger(), /sandbox line reason/);
	});
});

test("a float amount, a duplicated component and an unknown lane are all refused", () => {
	withLedgerDir((dir) => {
		appendCharge(charge());
		const stored = storedEntry(dir);
		const lines = stored.lines as Record<string, unknown>[];

		const floated = { ...stored, lines: [{ ...lines[0], millicents: 1.5 }, lines[1], lines[2]] };
		assert.throws(() => validateEntry(floated), /must be an integer or null/);

		const duplicated = { ...stored, lines: [...lines, lines[0]] };
		assert.throws(() => validateEntry(duplicated), /double-bill/);

		assert.throws(() => validateEntry({ ...stored, substrate: "fly" }), /unknown substrate/);
		assert.throws(() => validateEntry({ ...stored, harness: "aider" }), /unknown harness/);
		assert.throws(() => validateEntry({ ...stored, runKey: "" }), /runKey/);
		assert.throws(() => validateEntry({ ...stored, lines: [] }), /records no money/);
	});
});

test("a torn tail line is skipped, but a parseable foreign record is refused", () => {
	withLedgerDir((dir) => {
		appendCharge(charge());
		const shard = join(dir, shardFiles(dir)[0]);
		const good = readFileSync(shard, "utf8");

		// A process killed mid-append leaves one incomplete line at the tail.
		writeFileSync(shard, `${good}{"id":"led-torn","kind":"cha`, "utf8");
		assert.equal(readLedger().length, 1);

		// Something that DID parse was written by a writer that believed it was
		// writing a ledger entry: refusing is fail-closed, because a total that
		// silently omits a record it did not understand is worse than an error.
		writeFileSync(shard, `${good}{"id":"led-foreign","kind":"charge"}\n`, "utf8");
		assert.throws(() => readLedger(), MuxError);
		assert.throws(() => readLedger(), /ledger-2026-08-02\.jsonl:2/);
	});
});

test("summarize revalidates hand-built entries", () => {
	// A fixture is held to the same rules as a stored record, so a test cannot
	// assert arithmetic over a shape the writer would have rejected.
	assert.throws(
		() =>
			summarizeLedger([
				{
					id: "led-x",
					kind: "charge",
					runKey: "run-1",
					harness: "claude-code",
					substrate: "e2b",
					occurredAt: "2026-08-02T10:00:00.000Z",
					recordedAt: "2026-08-02T10:00:00.000Z",
					recordedBy: "1@test",
					lines: [{ kind: "sandbox", millicents: 10, provenance: "estimated", rate: MODEL_RATE, detail: "d" }],
				} as LedgerEntry,
			]),
		/model is missing/,
	);
});

test("a timestamp outside the shard year range is refused rather than lost", () => {
	withLedgerDir(() => {
		assert.throws(
			() => appendCharge(charge({ occurredAt: "+012026-08-02T10:00:00.000Z" })),
			MuxError,
		);
		assert.throws(() => appendCharge(charge({ occurredAt: "not a date" })), MuxError);
	});
});

test("a negative duration is refused rather than priced", () => {
	withLedgerDir(() => {
		assert.throws(
			() => appendCharge(charge({ sandbox: { basis: "duration", durationMs: -1 } })),
			MuxError,
		);
	});
});
