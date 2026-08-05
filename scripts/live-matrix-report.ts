/**
 * The live matrix's accounting: what a cell's verdict is, what the summary
 * table prints, and what the process exits with.
 *
 * Split out of scripts/mux-live-test.ts so every rule below can be tested
 * without provisioning anything (src/lib/live-matrix-report.test.ts). The
 * defect that forced the split, measured on the full live run of 2026-08-05:
 * `machine.destroy()` was inside the same try as the run, so a destroy that
 * threw landed in the run's catch -- which set `row.error` but never touched
 * the `outcome` already assigned by the passing run. The cell printed **ok**,
 * the exit code stayed 0, and the sandbox kept billing. That is precisely how
 * a live-test harness leaks money: nobody re-reads a green run.
 *
 * So teardown is a first-class verdict here, and it demotes the cell.
 */

import type { HarnessKind, SubstrateKind } from "../src/mux/index.js";

/** How the agent run itself ended. */
export type RunVerdict = "ok" | "skipped" | "failed";

/**
 * What happened to the sandbox afterwards. `noMachine` is NOT a pass: it means
 * `create()` threw before a handle existed, so this script has nothing to
 * destroy by handle and no id to sweep for -- the lane sweep is the only check
 * left, which is why an unsweepable lane can never be called clean.
 */
export type TeardownVerdict =
	| "ok"
	| "kept"
	| "failed"
	| "noMachine"
	/** The lane was skipped for missing credentials; nothing was created. */
	| "none";

export type MatrixRow = {
	agent: HarnessKind;
	sandbox: SubstrateKind;
	verdict: RunVerdict;
	teardown: TeardownVerdict;
	/** Vendor id of the sandbox this cell provisioned, for the final sweep. */
	sandboxId?: string;
	createMs?: number;
	installMs?: number;
	runMs?: number;
	firstEventMs?: number;
	events?: number;
	text?: string;
	error?: string;
	teardownError?: string;
};

/**
 * The cell's headline. A teardown failure demotes a passing run, because the
 * table's `ok` is what an operator reads to decide the run needs no follow-up,
 * and a sandbox that would not die needs follow-up more urgently than a model
 * that answered wrong. The run verdict is not lost: `cellNote` still prints it.
 */
export function cellOutcome(row: MatrixRow): RunVerdict {
	if (row.teardown === "failed") return "failed";
	return row.verdict;
}

/**
 * The last column. On a failed cell the error names which gate failed (exit
 * code, sentinel, or teardown) -- the text alone would make the reader
 * re-derive it.
 */
export function cellNote(row: MatrixRow): string {
	const parts: string[] = [];
	if (row.verdict === "ok" && row.teardown === "failed") {
		// Say the run passed, or the reader debugs the wrong half of the cell.
		parts.push(`run ok: ${JSON.stringify(row.text ?? "")}`);
	} else if (row.verdict === "ok") {
		parts.push(row.text ?? row.error ?? "");
	} else {
		parts.push(row.error ?? row.text ?? "");
	}
	if (row.teardown === "failed") {
		parts.push(
			`TEARDOWN FAILED, sandbox ${row.sandboxId ?? "(id unknown)"} MAY STILL BE BILLING: ${
				row.teardownError ?? "(no message)"
			}`,
		);
	}
	return parts.filter((part) => part.length > 0).join(" -- ");
}

const COLUMNS: [header: string, width: number][] = [
	["agent", 12],
	["sandbox", 9],
	["outcome", 8],
	["teardown", 9],
	["create", 7],
	["install", 8],
	["first-ev", 9],
	["run", 8],
];

/** The summary table: header line, then one line per cell. */
export function matrixLines(rows: readonly MatrixRow[]): string[] {
	const header = COLUMNS.map(([name, width]) => name.padEnd(width))
		.join(" ")
		.concat(" note");
	return [
		header,
		...rows.map((row) =>
			[
				row.agent.padEnd(12),
				row.sandbox.padEnd(9),
				cellOutcome(row).padEnd(8),
				row.teardown.padEnd(9),
				String(row.createMs ?? "-").padEnd(7),
				String(row.installMs ?? "-").padEnd(8),
				String(row.firstEventMs ?? "-").padEnd(9),
				String(row.runMs ?? "-").padEnd(8),
				cellNote(row),
			].join(" "),
		),
	];
}

/**
 * One lane's post-matrix sweep.
 *
 * `unverified` is a distinct status from `clean` on purpose. Measured
 * 2026-08-05: vercel's `list()` answered `Missing credentials parameters to
 * access the Vercel API: token, teamId` under OIDC-only auth (MuxError kind
 * `transient`) for the whole of that day's matrix, so the one lane an operator
 * most wanted to enumerate was the one that could not be. Reporting it as clean
 * would have been the exact false assurance this sweep exists to prevent. That
 * particular bug was fixed later the same day; the status stays, because the
 * next vendor to lose its inventory endpoint must not silently read as clean.
 */
export type SweepLane = {
	substrate: SubstrateKind;
	status: "clean" | "leaked" | "kept" | "unverified";
	/** Ids this run created that the vendor still lists as alive. */
	live: string[];
	/** How many listed sandboxes this run did NOT create. Context, never ours. */
	preexisting: number;
	/**
	 * Cells that ran on this lane and produced no sandbox id, because `create()`
	 * threw before returning a handle. An id-matched sweep cannot speak for
	 * those, and saying "clean" without saying so would be the same overclaim
	 * this whole file exists to stop.
	 */
	unidentified: number;
	/** Why the lane could not be swept, verbatim, when status is unverified. */
	error?: string;
};

/**
 * States that mean the sandbox is gone or going. Everything else counts as
 * alive, including `error` and `unknown`: an ambiguous state on a sandbox this
 * run created is a thing to report, not a thing to assume away.
 */
const GONE = new Set(["destroyed", "destroying"]);

export function classifySweep(input: {
	substrate: SubstrateKind;
	/** Ids this run created on this lane. */
	created: readonly string[];
	/** Cells that ran here without ever yielding a sandbox id. */
	unidentified?: number;
	/** What `list()` returned, when it returned. */
	listed?: readonly { id: string; state: string }[];
	/** The message `list()` threw, if it threw. */
	listError?: string;
	/** True under `--keep`, where a live sandbox is the requested outcome. */
	keep: boolean;
}): SweepLane {
	const unidentified = input.unidentified ?? 0;
	if (input.listError !== undefined || input.listed === undefined) {
		return {
			substrate: input.substrate,
			status: "unverified",
			live: [],
			preexisting: 0,
			unidentified,
			error: input.listError ?? "list() returned nothing",
		};
	}
	const created = new Set(input.created);
	const live = input.listed
		.filter((info) => created.has(info.id) && !GONE.has(info.state))
		.map((info) => info.id);
	const preexisting = input.listed.filter((info) => !created.has(info.id)).length;
	const status = live.length === 0 ? "clean" : input.keep ? "kept" : "leaked";
	return { substrate: input.substrate, status, live, preexisting, unidentified };
}

export function sweepLines(lanes: readonly SweepLane[]): string[] {
	if (lanes.length === 0) {
		return ["no credentialed lane ran, so there was nothing to sweep"];
	}
	return lanes.map((lane) => {
		const tail =
			(lane.preexisting > 0
				? ` (plus ${lane.preexisting} pre-existing sandbox(es) this run did not create)`
				: "") +
			(lane.unidentified > 0
				? ` -- CAVEAT: ${lane.unidentified} cell(s) died before a sandbox id existed, so this check cannot speak for them`
				: "");
		switch (lane.status) {
			case "clean":
				return `${lane.substrate}: clean -- nothing this run created is still listed${tail}`;
			case "kept":
				return `${lane.substrate}: kept (--keep) -- still alive: ${lane.live.join(", ")}${tail}`;
			case "leaked":
				return `${lane.substrate}: LEAKED -- still alive and billing: ${lane.live.join(", ")}${tail}`;
			case "unverified":
				return `${lane.substrate}: NOT SWEPT -- list() failed, so nothing on this lane is proven gone: ${lane.error}`;
		}
	});
}

/**
 * The exit code, and the reasoning behind what does and does not set it.
 *
 * 1 for a red cell OR a leaked sandbox. A single non-zero was chosen over a
 * distinct leak code because every consumer of this script -- a shell, CI, a
 * human reading the last line -- treats non-zero as "look at the output", and a
 * code nobody switches on is a signal nobody sees. The leak is made noticeable
 * by naming it in the row, in the sweep and in the verdict line instead.
 *
 * An `unverified` lane deliberately does NOT set it. Every cell's own
 * `destroy()` already resolved before the sweep runs, so an unsweepable lane is
 * unconfirmed rather than known-leaking; failing on it would make this script
 * exit 1 forever while a vendor's `list()` is broken, and an exit code that is
 * always 1 is one the operator stops reading -- which would cost us the real
 * money signal above. It is reported in words on its own line.
 */
export function exitCodeFor(
	rows: readonly MatrixRow[],
	lanes: readonly SweepLane[],
): number {
	const red = rows.some((row) => cellOutcome(row) === "failed");
	const leaked = lanes.some((lane) => lane.status === "leaked");
	return red || leaked ? 1 : 0;
}

/** The last thing printed: one line an operator can act on without scrolling. */
export function verdictLine(
	rows: readonly MatrixRow[],
	lanes: readonly SweepLane[],
): string {
	const ran = rows.filter((row) => row.verdict !== "skipped");
	const ok = ran.filter((row) => cellOutcome(row) === "ok").length;
	const leakedRows = rows.filter((row) => row.teardown === "failed").length;
	const leakedSweep = lanes.filter((lane) => lane.status === "leaked");
	const unverified = lanes.filter((lane) => lane.status === "unverified");
	const parts = [`${ok} of ${ran.length} cells ok`];
	if (leakedRows > 0) parts.push(`${leakedRows} teardown failure(s)`);
	if (leakedSweep.length > 0) {
		parts.push(
			`sandboxes still alive on ${leakedSweep.map((lane) => lane.substrate).join(", ")}`,
		);
	}
	if (unverified.length > 0) {
		parts.push(
			`NOT swept: ${unverified.map((lane) => lane.substrate).join(", ")}`,
		);
	}
	const skipped = rows.filter((row) => row.verdict === "skipped").length;
	if (skipped > 0) parts.push(`${skipped} skipped for credentials`);
	return `${parts.join("; ")} -- exit ${exitCodeFor(rows, lanes)}`;
}
