/**
 * Guard: the live matrix cannot report a clean run over a leaked sandbox.
 *
 * The defect these tests exist for was measured on the full live run of
 * 2026-08-05: `machine.destroy()` sat inside the same `try` as the agent run in
 * scripts/mux-live-test.ts, so a destroy that threw was caught by the run's
 * catch, which set `row.error` and left the `outcome` a passing run had already
 * written. The cell printed **ok**, `process.exit` saw zero failures, and the
 * sandbox kept billing. A harness that hides teardown failures is worse than no
 * harness, because a green run is never re-read.
 *
 * The accounting lives in scripts/live-matrix-report.ts (imported below) rather
 * than in the script, for one reason: it has to be checkable without
 * provisioning anything. Every string below is a real capture from the
 * 2026-08-05 runs -- the two red cells' error text as the matrix printed it, the
 * dedalus destroy 500 as the vendor sent it, the vercel `list()` refusal under
 * OIDC-only auth, and the sandbox ids a read-only `list()` sweep returned that
 * day. Nothing here is a paraphrase.
 *
 * Run: npx tsx --test src/lib/live-matrix-report.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
	type MatrixRow,
	type SweepLane,
	cellNote,
	cellOutcome,
	classifySweep,
	exitCodeFor,
	matrixLines,
	sweepLines,
	verdictLine,
} from "../../scripts/live-matrix-report.js";

/**
 * A cell that passed everything. The numbers and the sandbox name are the real
 * claude-code-on-vercel measurement of 2026-08-05 (create 1239ms, install
 * 7786ms, first event 1061ms, run 3767ms, `handle.id=am-vercel-live`).
 */
function greenRow(overrides: Partial<MatrixRow> = {}): MatrixRow {
	return {
		agent: "claude-code",
		sandbox: "vercel",
		verdict: "ok",
		teardown: "ok",
		sandboxId: "am-vercel-live",
		createMs: 1239,
		installMs: 7786,
		firstEventMs: 1061,
		runMs: 3767,
		text: "MUX-OK",
		...overrides,
	};
}

/**
 * The vendor's own words when a dedalus teardown fails, captured 2026-08-05.
 * Worth keeping verbatim for a second reason: on that run the machine was
 * DESTROYED anyway (its record went to phase `destroyed`), which is exactly why
 * a teardown failure has to be reported AND then checked against the vendor's
 * inventory instead of being trusted in either direction.
 */
const DEDALUS_DESTROY_500 =
	'dedalus destroy 500: {"title":"Internal Server Error","status":500,"detail":"failed to close storage usage before deleting machine spec","errors":[{"message":"query latest storage bucket: usage ledger query returned 400: column org_metering_buckets.stripe_submitted_at does not exist"}]}';

// ---------------------------------------------------------------------------
// A teardown failure is a red cell
// ---------------------------------------------------------------------------

test("a passing run whose sandbox would not die is NOT ok", () => {
	const row = greenRow({
		sandbox: "dedalus",
		sandboxId: "dm-019fd311-71d0-7572-b001-293525eee808",
		teardown: "failed",
		teardownError: DEDALUS_DESTROY_500,
	});
	assert.equal(row.verdict, "ok");
	// The whole point: the headline the operator reads must not say ok.
	assert.equal(cellOutcome(row), "failed");
	assert.equal(exitCodeFor([row], []), 1);
});

test("the note on such a cell names the leak, the id, and that the run passed", () => {
	const row = greenRow({
		sandbox: "dedalus",
		sandboxId: "dm-019fd311-71d0-7572-b001-293525eee808",
		teardown: "failed",
		teardownError: DEDALUS_DESTROY_500,
	});
	const note = cellNote(row);
	// Which half failed, and which half did not.
	assert.match(note, /run ok/);
	assert.match(note, /TEARDOWN FAILED/);
	// The id, or an operator cannot go and kill it by hand.
	assert.match(note, /dm-019fd311-71d0-7572-b001-293525eee808/);
	assert.match(note, /MAY STILL BE BILLING/);
	// The vendor's own words, not a paraphrase.
	assert.ok(note.includes(DEDALUS_DESTROY_500));
});

test("a teardown failure survives the rendered table", () => {
	// The rendering is where the old defect was visible, so it is asserted on
	// the printed line and not only on the model.
	const lines = matrixLines([
		greenRow(),
		// "fetch failed" is one of the three transport errors MUX-RESULTS.md
		// already records from live sprites runs, so it is what a teardown that
		// dies on the wire actually looks like.
		greenRow({
			agent: "hermes",
			teardown: "failed",
			teardownError: "fetch failed",
		}),
	]);
	assert.match(lines[0], /outcome/);
	assert.match(lines[0], /teardown/);
	assert.match(lines[1], /^claude-code {2}vercel {4}ok {7}ok/);
	assert.match(lines[2], /^hermes {7}vercel {4}failed {3}failed/);
	assert.match(lines[2], /TEARDOWN FAILED/);
});

test("a red run keeps its own diagnosis, and both halves show when both fail", () => {
	// Verbatim from the 2026-08-05 matrix, codex @ dedalus. The trailing ": "
	// with nothing after it is the defect a sibling lane is fixing (the vendor
	// payload is discarded); it is reproduced here rather than tidied, because
	// this test's job is to carry the text through, not to improve it.
	const measured =
		"dedalus writeFile failed for /tmp/am-install-codex-msgdqt1y.sh (exit 1): ";
	const row: MatrixRow = {
		agent: "codex",
		sandbox: "dedalus",
		verdict: "failed",
		teardown: "ok",
		sandboxId: "dm-019fd30c-8294-71b9-9ab0-c1d9038859ba",
		createMs: 4228,
		error: measured,
	};
	assert.equal(cellOutcome(row), "failed");
	assert.equal(cellNote(row), measured);
	const both = cellNote({
		...row,
		teardown: "failed",
		teardownError: DEDALUS_DESTROY_500,
	});
	assert.match(both, /dedalus writeFile failed/);
	assert.match(both, /TEARDOWN FAILED/);
});

test("--keep and a create that never produced a handle are not teardown failures", () => {
	for (const teardown of ["kept", "noMachine", "none"] as const) {
		const row = greenRow({ teardown });
		assert.equal(cellOutcome(row), "ok", `${teardown} must not demote a passing cell`);
		assert.equal(exitCodeFor([row], []), 0);
	}
});

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

test("the sweep only claims ids this run created, and ignores the rest", () => {
	// Real 2026-08-05 read-only list() output for e2b: two sandboxes from June
	// and May, both sleeping, neither ours.
	const lane = classifySweep({
		substrate: "e2b",
		created: ["ixyzcreatedtoday"],
		listed: [
			{ id: "io1h9n5lp3l921tomfjnt", state: "sleeping" },
			{ id: "ijtx3orav1glc11bfv9k2", state: "sleeping" },
		],
		keep: false,
	});
	assert.equal(lane.status, "clean");
	assert.deepEqual(lane.live, []);
	assert.equal(lane.preexisting, 2);
	assert.match(sweepLines([lane])[0], /clean/);
	assert.match(sweepLines([lane])[0], /2 pre-existing/);
	assert.equal(exitCodeFor([], [lane]), 0);
});

test("a sandbox this run created that is still listed is a leak, and fails the run", () => {
	const lane = classifySweep({
		substrate: "e2b",
		created: ["imine1", "imine2"],
		listed: [
			{ id: "imine1", state: "ready" },
			{ id: "io1h9n5lp3l921tomfjnt", state: "sleeping" },
		],
		keep: false,
	});
	assert.equal(lane.status, "leaked");
	assert.deepEqual(lane.live, ["imine1"]);
	assert.match(sweepLines([lane])[0], /LEAKED.*imine1/);
	assert.equal(exitCodeFor([], [lane]), 1);
});

test("a sleeping sandbox still counts as alive; only destroyed and destroying do not", () => {
	// Sprites and dedalus park on their own schedule, so `sleeping` is the state
	// a leaked sandbox is most likely to be found in -- and a parked sandbox
	// still holds quota (and storage) whatever it costs per minute.
	const sleeping = classifySweep({
		substrate: "sprites",
		created: ["am-mux-live-hermes-sprites"],
		listed: [{ id: "am-mux-live-hermes-sprites", state: "sleeping" }],
		keep: false,
	});
	assert.equal(sleeping.status, "leaked");
	for (const state of ["destroyed", "destroying"]) {
		const gone = classifySweep({
			substrate: "sprites",
			created: ["am-mux-live-hermes-sprites"],
			listed: [{ id: "am-mux-live-hermes-sprites", state }],
			keep: false,
		});
		assert.equal(gone.status, "clean", `${state} must not read as a leak`);
	}
	// An ambiguous state fails closed: reported, not assumed away.
	const ambiguous = classifySweep({
		substrate: "sprites",
		created: ["am-mux-live-hermes-sprites"],
		listed: [{ id: "am-mux-live-hermes-sprites", state: "unknown" }],
		keep: false,
	});
	assert.equal(ambiguous.status, "leaked");
});

test("a cell that died before it had an id is a caveat on the lane, not a clean bill", () => {
	// The gap this closes: an id-matched sweep can only ask about ids it has. A
	// create() that threw leaves none, so "clean" would mean "clean for the
	// sandboxes we can name" while reading as "clean".
	const lane = classifySweep({
		substrate: "dedalus",
		created: ["dm-019fd30c-8294-71b9-9ab0-c1d9038859ba"],
		unidentified: 2,
		listed: [{ id: "dm-019ecd0b-e58e-78f8-bc74-c7900517cc3e", state: "sleeping" }],
		keep: false,
	});
	assert.equal(lane.status, "clean");
	assert.equal(lane.unidentified, 2);
	const line = sweepLines([lane])[0];
	assert.match(line, /CAVEAT: 2 cell\(s\) died before a sandbox id existed/);
	assert.match(line, /cannot speak for them/);
	// A lane with nothing unidentified must NOT carry the caveat, or the warning
	// becomes noise and stops being read.
	assert.ok(
		!sweepLines([{ ...lane, unidentified: 0 }])[0].includes("CAVEAT"),
		"the caveat must appear only when a cell really had no id",
	);
});

test("--keep reports what is alive without calling it a leak", () => {
	const lane = classifySweep({
		substrate: "e2b",
		created: ["imine1"],
		listed: [{ id: "imine1", state: "ready" }],
		keep: true,
	});
	assert.equal(lane.status, "kept");
	assert.deepEqual(lane.live, ["imine1"]);
	assert.equal(exitCodeFor([], [lane]), 0);
});

test("a lane whose list() failed is NOT swept, and says so in the vendor's words", () => {
	// Verbatim, measured 2026-08-05 against the live API with only
	// VERCEL_OIDC_TOKEN set: this is why the four vercel sandboxes of that
	// matrix could not be proven gone at the time. Kept as the fixture even
	// though that lane's list() was repaired later the same day -- the rule under
	// test is "an unreadable lane is not a clean lane", which outlives any one
	// vendor's bug, and this is a real message rather than an invented one.
	const message =
		"vercel list failed: Missing credentials parameters to access the Vercel API: token, teamId";
	const lane = classifySweep({
		substrate: "vercel",
		created: ["sbx_abc123"],
		listError: message,
		keep: false,
	});
	assert.equal(lane.status, "unverified");
	// It must NOT be able to report the lane clean, and must not silently
	// promote the created ids to "gone".
	assert.notEqual(lane.status, "clean");
	assert.deepEqual(lane.live, []);
	const line = sweepLines([lane])[0];
	assert.match(line, /NOT SWEPT/);
	assert.match(line, /nothing on this lane is proven gone/);
	assert.match(line, /Missing credentials parameters to access the Vercel API: token, teamId/);
	// Deliberately does not fail the run: every cell's own destroy() already
	// resolved, so this is unconfirmed rather than known-leaking, and a script
	// that exits 1 forever while a vendor's list() is broken trains the operator
	// to ignore the exit code that carries the real money signal.
	assert.equal(exitCodeFor([], [lane]), 0);
});

// ---------------------------------------------------------------------------
// The one line an operator reads
// ---------------------------------------------------------------------------

test("the verdict line reproduces the 2026-08-05 run: 14 of 16, exit 1", () => {
	const rows: MatrixRow[] = [];
	for (const sandbox of ["e2b", "sprites", "vercel", "dedalus"] as const) {
		for (const agent of ["claude-code", "codex", "openclaw", "hermes"] as const) {
			rows.push(greenRow({ agent, sandbox }));
		}
	}
	// The two red cells of that run were codex and openclaw on dedalus, both
	// killed by the same vendor rejection during the install write.
	for (const row of rows) {
		if (row.sandbox !== "dedalus") continue;
		if (row.agent !== "codex" && row.agent !== "openclaw") continue;
		row.verdict = "failed";
		row.error = `dedalus writeFile failed for /tmp/am-install-${row.agent}-msgdqt1y.sh (exit 1): `;
	}
	const lanes: SweepLane[] = [
		{ substrate: "e2b", status: "clean", live: [], preexisting: 2, unidentified: 0 },
		{ substrate: "sprites", status: "clean", live: [], preexisting: 0, unidentified: 0 },
		{ substrate: "dedalus", status: "clean", live: [], preexisting: 2, unidentified: 0 },
		{
			substrate: "vercel",
			status: "unverified",
			live: [],
			preexisting: 0,
			unidentified: 0,
			error: "vercel list failed: Missing credentials parameters to access the Vercel API: token, teamId",
		},
	];
	const line = verdictLine(rows, lanes);
	assert.match(line, /^14 of 16 cells ok/);
	assert.match(line, /NOT swept: vercel/);
	assert.match(line, /exit 1$/);
	assert.equal(exitCodeFor(rows, lanes), 1);
});

test("the verdict line counts a teardown failure as its own headline", () => {
	const rows = [greenRow(), greenRow({ agent: "hermes", teardown: "failed", teardownError: "fetch failed" })];
	const line = verdictLine(rows, []);
	assert.match(line, /^1 of 2 cells ok/);
	assert.match(line, /1 teardown failure\(s\)/);
	assert.match(line, /exit 1$/);
});

test("skipped lanes are excluded from the denominator and reported separately", () => {
	const rows: MatrixRow[] = [
		greenRow(),
		{
			agent: "hermes",
			sandbox: "dedalus",
			verdict: "skipped",
			teardown: "none",
			error: "missing credentials: DEDALUS_API_KEY",
		},
	];
	const line = verdictLine(rows, []);
	assert.match(line, /^1 of 1 cells ok/);
	assert.match(line, /1 skipped for credentials/);
	assert.match(line, /exit 0$/);
});

test("an all-green run with a swept lane exits 0 and says nothing alarming", () => {
	const lanes: SweepLane[] = [
		{ substrate: "e2b", status: "clean", live: [], preexisting: 0, unidentified: 0 },
	];
	const line = verdictLine([greenRow({ sandbox: "e2b" })], lanes);
	assert.equal(line, "1 of 1 cells ok -- exit 0");
	assert.equal(exitCodeFor([greenRow({ sandbox: "e2b" })], lanes), 0);
});

test("nothing to sweep is stated, not implied", () => {
	assert.match(sweepLines([])[0], /nothing to sweep/);
});
