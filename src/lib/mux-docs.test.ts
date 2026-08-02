/**
 * Guard: docs/MUX.md may not describe a mux that does not exist.
 *
 * The architecture doc restates facts that live in code -- which substrates
 * exist, what each one can do, which vendor publishes a rate, how the breaker
 * and the scorer are tuned, and how many live cells have actually passed. Every
 * one of those went stale at least once: the doc shipped for weeks describing
 * `routeFor()` as "primary -> backups" long after constraints, price, learned
 * selection and health ordering had landed, and nothing failed. Markdown cannot
 * derive a number, so the next best thing is a test that reads both sides.
 *
 * Sibling of src/lib/public-claims.test.ts, which does the same job for the
 * registry counts in README.md, and deliberately built the same way:
 *
 *   Every expectation is DERIVED. Nothing below hardcodes a capability, a
 *   price, a tuning value or a cell count -- it reads the adapters, cost.ts,
 *   health.ts, selection.ts and docs/MUX-RESULTS.md, and requires the doc to
 *   agree. Retuning the breaker or losing a vendor's price page therefore
 *   fails here until the prose is corrected, in either direction.
 *
 *   The scanner is itself locked down (last test), so a rewrite that stops
 *   finding the tables cannot make the guard pass vacuously.
 *
 * Run: npx tsx --test src/lib/mux-docs.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HARNESS_KINDS, SUBSTRATE_KINDS, resolveMuxConfig } from "../mux/config.js";
import { DEFAULT_RUN_SHAPE, SUBSTRATE_PRICES, estimate } from "../mux/cost.js";
import { DEFAULT_HEALTH_TUNING } from "../mux/health.js";
import { getProvider } from "../mux/providers/index.js";
import { DEFAULT_SELECTION_TUNING } from "../mux/selection.js";
import type { SandboxCapabilities, SubstrateKind } from "../mux/types.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readText(relative: string): string {
	return readFileSync(resolve(REPO_ROOT, relative), "utf8");
}

const MUX_DOC = "docs/MUX.md";
const RESULTS_DOC = "docs/MUX-RESULTS.md";

/**
 * Capabilities as the router sees them: read off the provider, never restated
 * here. Credentials are irrelevant -- `capabilities` is a static declaration
 * and `ready()` is the separate credential gate -- so an empty config is
 * enough, and this test needs no keys.
 */
function capabilitiesOf(kind: SubstrateKind): SandboxCapabilities {
	return getProvider(kind, resolveMuxConfig({})).capabilities;
}

// ---------------------------------------------------------------------------
// Markdown table reading
// ---------------------------------------------------------------------------

type Table = { headers: string[]; rows: string[][] };

function cellsOf(line: string): string[] {
	return line
		.split("|")
		.slice(1, -1)
		.map((cell) => cell.trim().replace(/\*\*/g, "").replace(/`/g, ""));
}

/** Every pipe table in a document, header row plus body, separators dropped. */
function tablesIn(text: string): Table[] {
	const tables: Table[] = [];
	let current: Table | null = null;
	for (const line of text.split("\n")) {
		if (!line.trimStart().startsWith("|")) {
			current = null;
			continue;
		}
		const cells = cellsOf(line);
		if (current === null) {
			current = { headers: cells, rows: [] };
			tables.push(current);
			continue;
		}
		// The --- separator is structure, not data.
		if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
		current.rows.push(cells);
	}
	return tables;
}

/**
 * The one table whose header carries every named column, and the column index
 * of each. Found by header rather than by position so the doc may add columns
 * or reorder them without silently disabling a check.
 */
function tableWith(text: string, columns: readonly string[]): { table: Table; at: (column: string) => number } {
	for (const table of tablesIn(text)) {
		const indexes = columns.map((column) =>
			table.headers.findIndex((header) => header.toLowerCase() === column.toLowerCase()),
		);
		if (indexes.every((index) => index >= 0)) {
			return {
				table,
				at: (column: string) => indexes[columns.indexOf(column)],
			};
		}
	}
	throw new Error(
		`no table in the doc has all of these columns: ${columns.join(", ")}. Found: ${tablesIn(text)
			.map((table) => `[${table.headers.join(" | ")}]`)
			.join(" ")}`,
	);
}

/** Blank-line-separated blocks, so a wrapped sentence stays one unit. */
function paragraphsIn(text: string): string[] {
	return text.split(/\n\s*\n/);
}

/** The row whose first cell is exactly `label`. */
function rowFor(table: Table, label: string): string[] {
	const row = table.rows.find((cells) => cells[0] === label);
	assert.ok(row, `${MUX_DOC}: no table row labeled "${label}"`);
	return row;
}

// ---------------------------------------------------------------------------
// The rosters
// ---------------------------------------------------------------------------

test("MUX.md names every substrate and harness that exists, and none that does not", () => {
	const doc = readText(MUX_DOC);
	for (const kind of SUBSTRATE_KINDS) {
		assert.ok(doc.includes(kind), `${MUX_DOC} never mentions the substrate "${kind}"`);
	}
	for (const kind of HARNESS_KINDS) {
		assert.ok(doc.includes(kind), `${MUX_DOC} never mentions the harness "${kind}"`);
	}
	// A count in prose is a claim like any other.
	assert.ok(
		doc.includes(`${SUBSTRATE_KINDS.length} substrate`),
		`${MUX_DOC} must say "${SUBSTRATE_KINDS.length} substrate..." -- the registry has that many`,
	);
	assert.ok(
		doc.includes(`${HARNESS_KINDS.length} harness`) ||
			doc.includes(`${HARNESS_KINDS.length} agent harness`),
		`${MUX_DOC} must state the harness count as ${HARNESS_KINDS.length}`,
	);
});

// ---------------------------------------------------------------------------
// The capability matrix
// ---------------------------------------------------------------------------

const CAPABILITY_COLUMNS = [
	"substrate",
	"pty",
	"streamed exec",
	"persistence",
	"detached work",
	"reattach",
	"public url",
] as const;

function yesNo(value: boolean): string {
	return value ? "yes" : "no";
}

test("the MUX.md capability matrix matches what each adapter declares", () => {
	const doc = readText(MUX_DOC);
	const { table, at } = tableWith(doc, CAPABILITY_COLUMNS);
	assert.equal(
		table.rows.length,
		SUBSTRATE_KINDS.length,
		"the capability matrix must have exactly one row per substrate",
	);
	for (const kind of SUBSTRATE_KINDS) {
		const row = rowFor(table, kind);
		const caps = capabilitiesOf(kind);
		const cell = (column: string): string => (row[at(column)] ?? "").toLowerCase();
		// Each cell must CONTAIN the declared value, so prose may qualify it
		// ("native (sandbox.pty)") but never contradict it.
		const expectations: [string, string][] = [
			["pty", caps.pty],
			["persistence", caps.persistence],
			["detached work", caps.detachedWork],
			["streamed exec", yesNo(caps.streamingExec)],
			["reattach", yesNo(caps.reattach)],
			["public url", yesNo(caps.publicUrl)],
		];
		for (const [column, expected] of expectations) {
			assert.ok(
				cell(column).includes(expected),
				`${MUX_DOC}: ${kind} ${column} reads "${row[at(column)]}" but ${kind}.ts declares "${expected}"`,
			);
		}
	}
});

// ---------------------------------------------------------------------------
// Prices: published or admitted, never invented
// ---------------------------------------------------------------------------

const PRICE_COLUMNS = ["substrate", "published rate", "modeled 10-min run"] as const;

test("the MUX.md price table admits exactly the lanes cost.ts cannot price", () => {
	const doc = readText(MUX_DOC);
	const { table, at } = tableWith(doc, PRICE_COLUMNS);
	for (const kind of SUBSTRATE_KINDS) {
		const row = rowFor(table, kind);
		const published = (row[at("published rate")] ?? "").toLowerCase();
		const modeled = row[at("modeled 10-min run")] ?? "";
		const price = SUBSTRATE_PRICES[kind];
		if (!price.known) {
			assert.ok(
				published.startsWith("no"),
				`${MUX_DOC}: ${kind} is priced "${row[at("published rate")]}" but cost.ts has no published rate for it`,
			);
			// The whole point of the fail-closed price model: an unpriced lane
			// must never carry a dollar figure a reader could compare.
			assert.equal(
				modeled,
				"unknown",
				`${MUX_DOC}: ${kind} has no published rate, so its modeled run must read "unknown", not "${modeled}"`,
			);
			assert.ok(!modeled.includes("$"), `${MUX_DOC}: ${kind} must not show a price`);
			continue;
		}
		assert.ok(
			published.startsWith("yes"),
			`${MUX_DOC}: ${kind} must be marked as having a published rate -- cost.ts cites ${price.source}`,
		);
		const total = estimate(kind, DEFAULT_RUN_SHAPE).totalUsd;
		assert.ok(total !== undefined, `cost.ts priced ${kind} with no total`);
		assert.ok(
			modeled.includes(`$${total.toFixed(4)}`),
			`${MUX_DOC}: ${kind} modeled run reads "${modeled}" but cost.ts computes $${total.toFixed(4)} for the default shape`,
		);
	}
});

// ---------------------------------------------------------------------------
// Tuning: the numbers that decide a route
// ---------------------------------------------------------------------------

test("MUX.md quotes the health tuning that health.ts actually uses", () => {
	const doc = readText(MUX_DOC);
	const tuning = DEFAULT_HEALTH_TUNING;
	const required = [
		`${tuning.openAfter} consecutive`,
		`${tuning.cooldownMs / 1000}s`,
		`${tuning.windowSize} attempts`,
		`${tuning.windowMs / 60_000} minutes`,
	];
	for (const phrase of required) {
		assert.ok(
			doc.includes(phrase),
			`${MUX_DOC} must state "${phrase}" -- DEFAULT_HEALTH_TUNING says so`,
		);
	}
});

test("MUX.md quotes the selection tuning that selection.ts actually uses", () => {
	const doc = readText(MUX_DOC);
	const tuning = DEFAULT_SELECTION_TUNING;
	const required = [
		// The objective's weights, in the roadmap's priority order.
		`${tuning.successWeight}`,
		`${tuning.costWeight}`,
		`${tuning.firstOutputWeight}`,
		// Cold-start behavior is the part a reader most needs to trust.
		`${tuning.priorStrength} pseudo-runs`,
		`prior of ${tuning.priorSuccessRate}`,
		`${tuning.deadband} deadband`,
	];
	for (const phrase of required) {
		assert.ok(
			doc.includes(phrase),
			`${MUX_DOC} must state "${phrase}" -- DEFAULT_SELECTION_TUNING says so`,
		);
	}
	// The window is a duration, so the hyphenation is the doc's business and
	// only the number is checked ("7 days" and "7-day window" both pass).
	const days = tuning.windowMs / 86_400_000;
	assert.match(
		doc,
		// Whitespace class rather than a literal space: prose wraps, so the number
		// and its unit legitimately land on two lines.
		new RegExp(`${days}[\\s-]+days?`),
		`${MUX_DOC} must state the selection window as ${days} days`,
	);
	// The cold-start worked example is the part of the doc a reader is most
	// likely to act on, and it depends on the prior in a way no reader will
	// recompute. Both files have to quote the same two figures: retuning the
	// prior changes selection.ts's own example, and this fails until the prose
	// follows. Matched as numbers rather than as a sentence, so the two files
	// may word it differently.
	const source = readText("src/mux/selection.ts");
	const example = [...doc.matchAll(/scores? \*\*?(0\.\d{3})/g)].map((match) => match[1]);
	assert.ok(
		example.length >= 2,
		`${MUX_DOC} must quote selection.ts's cold-start worked example (two scores)`,
	);
	for (const value of example) {
		assert.ok(
			source.includes(value),
			`${MUX_DOC} quotes a score of ${value} that src/mux/selection.ts does not; the prior was probably retuned`,
		);
	}
});

test("MUX.md documents every MuxError kind the contract defines", () => {
	const doc = readText(MUX_DOC);
	const types = readText("src/mux/types.ts");
	const union = /export type MuxErrorKind =([\s\S]*?);/.exec(types);
	assert.ok(union, "types.ts no longer declares MuxErrorKind as a union");
	const kinds = [...union[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
	assert.ok(kinds.length >= 5, `parsed only ${kinds.length} MuxError kinds -- the scanner is broken`);
	for (const kind of kinds) {
		assert.ok(doc.includes(kind), `${MUX_DOC} never mentions the MuxError kind "${kind}"`);
	}
});

// ---------------------------------------------------------------------------
// Live cells: MUX.md may not out-claim MUX-RESULTS.md
// ---------------------------------------------------------------------------

type Cell = { harness: string; substrate: SubstrateKind; result: string };

/** The measured 4x4 matrix, read out of docs/MUX-RESULTS.md. */
function measuredCells(): Cell[] {
	const cells: Cell[] = [];
	for (const table of tablesIn(readText(RESULTS_DOC))) {
		for (const row of table.rows) {
			const [harness, substrate, result] = row;
			if (substrate === undefined || result === undefined) continue;
			if (!SUBSTRATE_KINDS.includes(substrate as SubstrateKind)) continue;
			if (!/^(ok|skipped|fail(ed)?)$/.test(result)) continue;
			cells.push({ harness: harness ?? "", substrate: substrate as SubstrateKind, result });
		}
	}
	return cells;
}

test("the live-matrix claim in MUX.md equals what MUX-RESULTS.md measured", () => {
	const doc = readText(MUX_DOC);
	const cells = measuredCells();
	assert.ok(cells.length > 0, `found no measured cells in ${RESULTS_DOC} -- the scanner is broken`);
	const passing = cells.filter(
		(cell) => cell.result === "ok" && HARNESS_KINDS.includes(cell.harness as never),
	);
	const passingSubstrates = [...new Set(passing.map((cell) => cell.substrate))];
	const skippedSubstrates = [
		...new Set(cells.filter((cell) => cell.result === "skipped").map((cell) => cell.substrate)),
	].filter((kind) => !passingSubstrates.includes(kind));

	// The headline count, derived from the rows rather than trusted. Phrased as
	// MUX-RESULTS.md phrases it, so the two documents cannot disagree about the
	// same sentence.
	const claim = `${passing.length} of ${passing.length} cells pass`;
	assert.ok(
		doc.includes(claim),
		`${MUX_DOC} must state "${claim}" -- ${RESULTS_DOC} records ${passing.length} passing cells`,
	);
	assert.equal(
		passing.length,
		passingSubstrates.length * HARNESS_KINDS.length,
		`${RESULTS_DOC} does not have a full harness sweep per passing substrate; the "N of N" phrasing in ${MUX_DOC} would be misleading`,
	);
	// Checked per paragraph rather than per line: prose wraps, and a claim and
	// the lanes it covers routinely land on two different lines.
	const claimParagraph = paragraphsIn(doc).find((paragraph) => paragraph.includes(claim));
	assert.ok(claimParagraph, `${MUX_DOC} states "${claim}" outside any paragraph`);
	for (const kind of passingSubstrates) {
		assert.ok(
			claimParagraph.includes(kind),
			`${MUX_DOC} must name ${kind} where it claims "${claim}" -- ${RESULTS_DOC} has passing cells for it`,
		);
	}
	// A lane that never ran must be described as such where it is named, so a
	// reader cannot take four coded adapters for four proven lanes.
	for (const kind of skippedSubstrates) {
		const disclosed = paragraphsIn(doc).some(
			(paragraph) =>
				paragraph.includes(kind) && /skipped|uncredentialed|no credential/.test(paragraph),
		);
		assert.ok(
			disclosed,
			`${MUX_DOC} must say ${kind} is uncredentialed and skipped -- ${RESULTS_DOC} has no passing cell for it`,
		);
	}
});

// ---------------------------------------------------------------------------
// Surface honesty: what src/mux has is not what the hosted plane has
// ---------------------------------------------------------------------------

/**
 * docs/ROADMAP.md section 4 forbids a set of claims outright. These are the
 * ones a mux architecture doc is most likely to reach for, checked as literal
 * phrases because that is how they get written.
 */
const FORBIDDEN = [
	"one bill",
	"unified billing",
	"single invoice",
	"no provider accounts",
	"resume reliability is measured",
	"routing is fully automatic",
	"we optimize price across providers",
	"capability-aware selection",
];

test("MUX.md makes none of the claims the roadmap forbids", () => {
	const doc = readText(MUX_DOC).toLowerCase();
	for (const phrase of FORBIDDEN) {
		assert.ok(
			!doc.includes(phrase),
			`${MUX_DOC} contains the forbidden claim "${phrase}" (docs/ROADMAP.md section 4)`,
		);
	}
});

/**
 * Rows the surface-comparison table must carry a negative for on the hosted
 * side. Each is a routing behavior that exists ONLY in src/mux today
 * (docs/ROADMAP.md section 3b: "All of this landed in src/mux/* only"), so a
 * doc that lists it without saying the dashboard lacks it invites a reader to
 * assume the product routes when only the library does.
 */
const MUX_ONLY_ROWS = [/failover/i, /health/i, /constraint/i, /learned/i];

test("MUX.md separates what src/mux does from what the hosted plane does", () => {
	const doc = readText(MUX_DOC);
	const table = tablesIn(doc).find(
		(candidate) =>
			candidate.headers.some((header) => /src\/mux/i.test(header)) &&
			candidate.headers.some((header) => /control plane/i.test(header)),
	);
	assert.ok(
		table,
		`${MUX_DOC} must carry a table comparing src/mux against the hosted control plane`,
	);
	const muxAt = table.headers.findIndex((header) => /src\/mux/i.test(header));
	const hostedAt = table.headers.findIndex((header) => /control plane/i.test(header));
	for (const pattern of MUX_ONLY_ROWS) {
		const row = table.rows.find((cells) => pattern.test(cells[0] ?? ""));
		assert.ok(row, `${MUX_DOC}: the surface table needs a row matching ${String(pattern)}`);
		assert.match(
			row[muxAt] ?? "",
			/^yes/i,
			`${MUX_DOC}: src/mux does have ${row[0]}, so its cell must say yes`,
		);
		// "none", or a qualifier that limits the claim ("advisory ... only").
		assert.match(
			row[hostedAt] ?? "",
			/\bnone\b|\bonly\b/i,
			`${MUX_DOC}: the hosted plane does not have ${row[0]}; its cell reads "${row[hostedAt]}"`,
		);
	}
});

// ---------------------------------------------------------------------------
// The scanner itself
// ---------------------------------------------------------------------------

test("the table scanner reads the shapes these docs actually use", () => {
	const sample = [
		"prose before",
		"| Substrate | PTY | Streamed exec |",
		"| --- | --- | --- |",
		"| `e2b` | native (`sandbox.pty`) | yes |",
		"| **sprites** | native | yes |",
		"",
		"| Agent | Sandbox | Result | create |",
		"| --- | --- | --- | --- |",
		"| claude-code | e2b | ok | 425 |",
		"| all four | vercel | skipped | -- |",
	].join("\n");
	const tables = tablesIn(sample);
	assert.equal(tables.length, 2);
	assert.deepEqual(tables[0].headers, ["Substrate", "PTY", "Streamed exec"]);
	// Backticks and bold markers are stripped, so a row label is comparable.
	assert.deepEqual(tables[0].rows, [
		["e2b", "native (sandbox.pty)", "yes"],
		["sprites", "native", "yes"],
	]);
	assert.equal(tables[1].rows.length, 2);
	const { at } = tableWith(sample, ["substrate", "pty"]);
	assert.equal(at("pty"), 1);
	assert.throws(() => tableWith(sample, ["substrate", "nope"]), /no table in the doc/);
});
