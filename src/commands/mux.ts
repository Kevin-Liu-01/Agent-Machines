/**
 * Terminal surface for the multiplexer.
 *
 *   am mux run    --agent claude-code --sandbox auto "review my repo"
 *   am mux shell  --name reviewer
 *   am mux term   --agent codex --name coder
 *   am mux ls
 *   am mux routes --needs '{"pty":"native"}' --optimize cost
 *   am mux stats  --since 24h
 *   am mux health
 *   am mux rm     --name reviewer
 *
 * Same core the SDK and dashboard use: config from agent-machines.json
 * (or env), route primary -> backups, stream normalized events. `shell`
 * and `term` attach a raw PTY with local echo off, so full-screen TUIs
 * (claude, codex, vim) render correctly.
 *
 * The three read-only commands -- `stats`, `health`, `routes` -- are the
 * terminal half of route-outcome reporting (roadmap 1.3). Two rules hold
 * across all of them:
 *
 *   A number nobody measured renders as "unknown". Not 0, not a dash. A
 *   cost table that prints $0 for a lane whose vendor publishes no rate
 *   reports that lane as the cheapest one available, which is a lie that
 *   would then be acted on.
 *
 *   A fresh install must still work. Zero traces, zero credentials and an
 *   empty state file print an explained-but-empty table and exit 0. An
 *   observability command that crashes on a clean machine is worse than no
 *   command, so `stats` and `health` never construct a router (a config
 *   file with a typo in it must not cost you the ability to read your own
 *   measurements) and `routes` treats "nothing is credentialed" as an
 *   answer rather than an error.
 */

import { createMux, forgetMachine, readMuxState, SUBSTRATE_KINDS } from "../mux/index.js";
import type {
	HarnessKind,
	MuxAgentEvent,
	PtyHandle,
	SandboxCapabilities,
	SubstrateKind,
} from "../mux/index.js";
import type { RouteConstraintKey, RouteConstraints } from "../mux/constraints.js";
import { DEFAULT_RUN_SHAPE, SUBSTRATE_PRICES, estimate } from "../mux/cost.js";
import {
	HEALTH_SNAPSHOT_VERSION,
	SubstrateHealth,
	type HealthState,
	type SubstrateHealthStats,
} from "../mux/health.js";
import { LocalJsonPlacementStore, getPlacementStore } from "../mux/state.js";
import {
	readTraces,
	routeKey,
	summarize,
	tracesDir,
	type GroupStats,
	type RouteStats,
	type TraceSummary,
} from "../mux/traces.js";
import type { EgressPolicy, PersistenceModel, PtySupport, RouteAttempt } from "../mux/types.js";

type Flags = {
	agent?: HarnessKind;
	sandbox?: SubstrateKind | "auto";
	name?: string;
	model?: string;
	config?: string;
	since?: string;
	limit?: string;
	optimize?: string;
	needs?: string;
	pty?: string;
	json: boolean;
	rest: string[];
};

function parseFlags(args: string[]): Flags {
	const flags: Flags = { json: false, rest: [] };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const next = () => args[(index += 1)];
		// A flag whose value is missing must not read as "flag absent": a
		// dropped --since would silently report the whole history as the
		// window the caller asked for.
		const value = (): string => {
			const raw = next();
			if (raw === undefined) throw new Error(`${arg} requires a value`);
			return raw;
		};
		if (arg === "--agent" || arg === "-a") flags.agent = next() as HarnessKind;
		else if (arg === "--sandbox" || arg === "-s")
			flags.sandbox = next() as SubstrateKind | "auto";
		else if (arg === "--name" || arg === "-n") flags.name = next();
		else if (arg === "--model" || arg === "-m") flags.model = next();
		else if (arg === "--config" || arg === "-c") flags.config = next();
		else if (arg === "--since") flags.since = value();
		else if (arg === "--limit") flags.limit = value();
		else if (arg === "--optimize") flags.optimize = value();
		else if (arg === "--needs") flags.needs = value();
		else if (arg === "--pty") flags.pty = value();
		else if (arg === "--json") flags.json = true;
		else flags.rest.push(arg);
	}
	return flags;
}

function renderEvent(event: MuxAgentEvent): void {
	switch (event.type) {
		case "started":
			process.stderr.write(
				`[${event.harness}${event.model ? ` ${event.model}` : ""}] started\n`,
			);
			break;
		case "text":
			process.stdout.write(event.delta);
			break;
		case "thinking":
			process.stderr.write(`\x1b[2m${event.delta}\x1b[0m`);
			break;
		case "tool_call":
			process.stderr.write(`\n\x1b[36m-> ${event.name}\x1b[0m\n`);
			break;
		case "tool_result":
			if (event.isError) process.stderr.write(`\x1b[31m<- error\x1b[0m\n`);
			break;
		case "status":
			process.stderr.write(`\x1b[2m[${event.label}]\x1b[0m\n`);
			break;
		case "error":
			process.stderr.write(`\n\x1b[31m${event.message}\x1b[0m\n`);
			break;
		case "result":
		case "done":
			break;
	}
}

async function attachPty(pty: PtyHandle): Promise<void> {
	const stdin = process.stdin;
	const wasRaw = stdin.isTTY ? stdin.isRaw : false;
	if (stdin.isTTY) stdin.setRawMode(true);
	stdin.resume();

	const onInput = (chunk: Buffer) => {
		// Ctrl-] detaches without killing the remote session.
		if (chunk.length === 1 && chunk[0] === 0x1d) {
			void pty.close().finally(() => process.exit(0));
			return;
		}
		void pty.write(chunk).catch((error: unknown) => {
			process.stderr.write(`\ninput failed: ${String(error)}\n`);
		});
	};
	stdin.on("data", onInput);

	const onResize = () => {
		void pty.resize(process.stdout.columns ?? 100, process.stdout.rows ?? 30);
	};
	process.stdout.on("resize", onResize);
	onResize();

	process.stderr.write("\x1b[2m[attached -- Ctrl-] to detach]\x1b[0m\n");
	try {
		for await (const bytes of pty.output) {
			process.stdout.write(bytes);
		}
	} finally {
		stdin.off("data", onInput);
		process.stdout.off("resize", onResize);
		if (stdin.isTTY) stdin.setRawMode(wasRaw);
		stdin.pause();
	}
}

// ---------------------------------------------------------------------------
// Rendering primitives
// ---------------------------------------------------------------------------

/** See the header: the only rendering of a number nobody measured. */
const UNKNOWN = "unknown";

/**
 * Column-aligned table. The first column is a label and stays left-aligned;
 * `right` picks the columns whose values are numbers, so a reader can compare
 * them down the column instead of scanning for the decimal point.
 */
function renderTable(
	header: readonly string[],
	rows: readonly (readonly string[])[],
	right: readonly boolean[] = [],
): string[] {
	const widths = header.map((cell, index) =>
		rows.reduce((width, row) => Math.max(width, (row[index] ?? "").length), cell.length),
	);
	const line = (cells: readonly string[]): string =>
		header
			.map((_, index) => {
				const cell = cells[index] ?? "";
				return right[index] ? cell.padStart(widths[index]) : cell.padEnd(widths[index]);
			})
			.join("  ")
			.trimEnd();
	return [line(header), ...rows.map(line)];
}

/**
 * A rate as a percentage, with both saturating ends spelled out.
 *
 * One success in three hundred runs rounds to 0% and one failure in three
 * hundred rounds to 100%; both would report the opposite of what happened, so
 * they render as "<1%" and ">99%" instead.
 */
function pct(value: number | undefined): string {
	if (value === undefined) return UNKNOWN;
	if (value > 0 && value < 0.005) return "<1%";
	if (value < 1 && value >= 0.995) return ">99%";
	return `${Math.round(value * 100)}%`;
}

function millis(value: number | undefined): string {
	return value === undefined ? UNKNOWN : `${Math.round(value)}ms`;
}

/**
 * A dollar amount with enough decimals that a real cost is never rendered as
 * zero. One second of an E2B sandbox costs about $0.000037, which at four
 * decimals prints "$0.0000" -- indistinguishable from free -- so the scale
 * follows the magnitude, and an amount too small for even eight decimals falls
 * back to exponential rather than rounding down to nothing.
 */
function usdAmount(value: number): string {
	if (value === 0) return "0.0000";
	if (value < 1e-8) return value.toExponential(2);
	const decimals = Math.min(8, Math.max(4, 1 - Math.floor(Math.log10(value))));
	return value.toFixed(decimals);
}

/**
 * `bound` marks a number that is not exact:
 *   "floor" -- some component of some run in the group could not be priced,
 *              so the true figure is higher.
 *   "upper" -- an active-CPU lane priced at full utilization; the real bill is
 *              lower, because model wait is not billed CPU there.
 */
function usd(value: number | undefined, bound?: "floor" | "upper"): string {
	if (value === undefined) return UNKNOWN;
	const prefix = bound === "floor" ? ">=" : bound === "upper" ? "<=" : "";
	return `${prefix}$${usdAmount(value)}`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	return `${minutes}m${Math.round((ms % 60_000) / 1000)}s`;
}

/**
 * A statistic over an empty group is not 0, it is undefined.
 *
 * summarize() reports 0 for a rate and 0 for a percentile when a group has no
 * runs, and documents that `runs` must be checked first. This is that check,
 * applied once at the rendering boundary so no caller can forget it.
 */
function whenMeasured(runs: number, value: number): number | undefined {
	return runs === 0 ? undefined : value;
}

// ---------------------------------------------------------------------------
// am mux stats -- measured outcomes by route
// ---------------------------------------------------------------------------

const SINCE_UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const RELATIVE_SINCE = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/;

type StatsWindow = { sinceMs?: number; label: string };

function parseSince(value: string | undefined): StatsWindow {
	if (value === undefined) return { label: "all time" };
	const raw = value.trim();
	const relative = RELATIVE_SINCE.exec(raw);
	if (relative) {
		const unit = relative[2] as keyof typeof SINCE_UNITS;
		const sinceMs = Date.now() - Number(relative[1]) * SINCE_UNITS[unit];
		return { sinceMs, label: `last ${raw} (since ${new Date(sinceMs).toISOString()})` };
	}
	const absolute = Date.parse(raw);
	if (Number.isNaN(absolute)) {
		throw new Error(
			`--since wants an instant ("2026-08-01", "2026-08-01T12:00:00Z") or an age ("30m", "24h", "7d"), got: ${raw}`,
		);
	}
	return { sinceMs: absolute, label: `since ${new Date(absolute).toISOString()}` };
}

function parseLimit(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const limit = Number(value);
	if (!Number.isInteger(limit) || limit < 0) {
		throw new Error(`--limit wants a non-negative integer, got: ${value}`);
	}
	return limit;
}

const STATS_HEADER = [
	"route",
	"runs",
	"ok",
	"success",
	"first-out p50",
	"first-out p95",
	"cost/ok",
	"trunc",
] as const;
const STATS_RIGHT = [false, true, true, true, true, true, true, true];

function statsRow(label: string, stats: GroupStats): string[] {
	return [
		label,
		String(stats.runs),
		String(stats.ok),
		pct(whenMeasured(stats.runs, stats.successRate)),
		millis(stats.firstOutputP50Ms),
		millis(stats.firstOutputP95Ms),
		// The floor marker is what keeps a partially priced group from reading
		// as an exact cost; `complete` is vacuously true on an empty group,
		// where the amount is absent anyway.
		usd(stats.cost.perSuccessUsd, stats.cost.complete ? undefined : "floor"),
		pct(whenMeasured(stats.runs, stats.truncationRate)),
	];
}

function sortedRoutes(summary: TraceSummary): RouteStats[] {
	const routes = Object.values(summary.byRoute).filter(
		(entry): entry is RouteStats => entry !== undefined,
	);
	// Busiest lane first, then by name so the same data always renders the
	// same way -- a table whose row order moves between runs cannot be diffed.
	return routes.sort((left, right) => {
		if (right.runs !== left.runs) return right.runs - left.runs;
		const leftKey = routeKey(left.harness, left.substrate);
		const rightKey = routeKey(right.harness, right.substrate);
		return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
	});
}

type StatsJsonRow = {
	route: string | null;
	harness: HarnessKind | null;
	substrate: SubstrateKind | null;
	runs: number;
	ok: number;
	failed: number;
	successRate: number | null;
	timeToFirstOutputP50Ms: number | null;
	timeToFirstOutputP95Ms: number | null;
	firstOutputKnownRuns: number;
	costToSuccessUsd: number | null;
	costToSuccessIsFloor: boolean;
	costKnownUsd: number | null;
	costWastedUsd: number | null;
	pricedRuns: number;
	modelUnknownRuns: number;
	unpricedSubstrates: SubstrateKind[];
	truncatedRuns: number;
	truncationRate: number | null;
	durationP50Ms: number | null;
	durationP95Ms: number | null;
};

/** Unknown is `null` in JSON for the same reason it is "unknown" on screen. */
function statsJsonRow(
	stats: GroupStats,
	route: { harness: HarnessKind; substrate: SubstrateKind } | null,
): StatsJsonRow {
	return {
		route: route ? routeKey(route.harness, route.substrate) : null,
		harness: route?.harness ?? null,
		substrate: route?.substrate ?? null,
		runs: stats.runs,
		ok: stats.ok,
		failed: stats.failed,
		successRate: whenMeasured(stats.runs, stats.successRate) ?? null,
		timeToFirstOutputP50Ms: stats.firstOutputP50Ms ?? null,
		timeToFirstOutputP95Ms: stats.firstOutputP95Ms ?? null,
		firstOutputKnownRuns: stats.firstOutputKnownRuns,
		costToSuccessUsd: stats.cost.perSuccessUsd ?? null,
		costToSuccessIsFloor: !stats.cost.complete,
		costKnownUsd: stats.cost.knownUsd ?? null,
		costWastedUsd: stats.cost.wastedUsd ?? null,
		pricedRuns: stats.cost.pricedRuns,
		modelUnknownRuns: stats.cost.modelUnknownRuns,
		unpricedSubstrates: [...stats.cost.unpricedSubstrates],
		truncatedRuns: stats.truncatedRuns,
		truncationRate: whenMeasured(stats.runs, stats.truncationRate) ?? null,
		durationP50Ms: whenMeasured(stats.runs, stats.p50Ms) ?? null,
		durationP95Ms: whenMeasured(stats.runs, stats.p95Ms) ?? null,
	};
}

function statsCommand(flags: Flags): void {
	const window = parseSince(flags.since);
	const limit = parseLimit(flags.limit);
	const summary = summarize(readTraces({ since: window.sinceMs, limit }));
	const routes = sortedRoutes(summary);

	if (flags.json) {
		console.log(
			JSON.stringify(
				{
					window: {
						label: window.label,
						since: window.sinceMs === undefined ? null : new Date(window.sinceMs).toISOString(),
						limit: limit ?? null,
						from: summary.from ?? null,
						to: summary.to ?? null,
					},
					tracesDir: tracesDir(),
					overall: statsJsonRow(summary, null),
					routes: routes.map((route) =>
						statsJsonRow(route, { harness: route.harness, substrate: route.substrate }),
					),
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(
		`window:   ${window.label}${
			limit === undefined ? "" : `, most recent ${limit} ${limit === 1 ? "run" : "runs"}`
		}`,
	);
	console.log(`traces:   ${tracesDir()}`);
	// Only when something was measured: "measured: unknown .. unknown" on a
	// fresh install is noise, and the empty-set explanation below says it
	// better.
	if (summary.from !== undefined && summary.to !== undefined) {
		console.log(`measured: ${summary.from} .. ${summary.to}`);
	}
	console.log("");
	if (summary.runs === 0) {
		console.log(
			"no run traces in this window: nothing has been measured, so every measured column is unknown.",
		);
		console.log('every "am mux run" appends one trace; until one runs there is nothing to report.');
		console.log("");
	}
	const rows = routes.map((route) => statsRow(routeKey(route.harness, route.substrate), route));
	rows.push(statsRow("overall", summary));
	for (const line of renderTable(STATS_HEADER, rows, STATS_RIGHT)) console.log(line);
	console.log("");
	console.log(`${UNKNOWN} = not measured, and never shown as 0 -- a $0 on an unpriced lane reads as free.`);
	// Explained only when it appears: a legend for a marker that is not in the
	// table above sends the reader looking for one.
	if (rows.some((row) => row.some((cell) => cell.startsWith(">=")))) {
		console.log(
			">= marks a floor: something in that group could not be priced, so the real figure is higher.",
		);
	}
	console.log("cost/ok = priced spend for the group, failed runs included, divided by successful runs.");
	console.log(
		"trunc   = truncated runs / runs. The mux never replays a broken run, so this is the",
	);
	console.log(
		"          resume-reliability proxy, not a count of resumes that worked.",
	);
	const notes: string[] = [];
	for (const substrate of summary.cost.unpricedSubstrates) {
		const price = SUBSTRATE_PRICES[substrate];
		if (!price.known) notes.push(`  ${substrate}: ${price.reason}`);
	}
	if (summary.cost.modelUnknownRuns > 0) {
		notes.push(
			`  ${summary.cost.modelUnknownRuns} of ${summary.runs} runs reported no model spend and are priced on compute alone.`,
		);
	}
	if (notes.length > 0) {
		console.log("");
		console.log("notes:");
		for (const note of notes) console.log(note);
	}
}

// ---------------------------------------------------------------------------
// am mux health -- substrate circuit breakers
// ---------------------------------------------------------------------------

const HEALTH_HEADER = [
	"substrate",
	"state",
	"samples",
	"failures",
	"fatals",
	"streak",
	"cooldown left",
	"avg latency",
] as const;
const HEALTH_RIGHT = [false, false, true, true, true, true, true, true];

/** Where the persisted breaker actually lives, for a reader who wants to look. */
function stateLocation(): string {
	const store = getPlacementStore();
	return store instanceof LocalJsonPlacementStore ? store.path() : `store "${store.kind}"`;
}

function cooldownCell(stats: SubstrateHealthStats, now: number): string {
	if (stats.retryAtMs === undefined) return "none";
	const remaining = stats.retryAtMs - now;
	// A breaker whose cooldown has run out is `degraded`, not `open`: the lane
	// is eligible again and the next real attempt probes it.
	return remaining > 0 ? formatDuration(remaining) : "elapsed";
}

function healthCommand(flags: Flags): void {
	const state = readMuxState();
	const health = SubstrateHealth.fromJSON(state.health);
	const now = health.now();
	const measured = new Map(health.report().map((entry) => [entry.substrate, entry]));
	const { tuning } = health;

	if (flags.json) {
		console.log(
			JSON.stringify(
				{
					stateFile: stateLocation(),
					snapshotVersion: HEALTH_SNAPSHOT_VERSION,
					storedSnapshotVersion: state.health?.version ?? null,
					now: new Date(now).toISOString(),
					tuning,
					substrates: SUBSTRATE_KINDS.map((kind) => {
						const stats = measured.get(kind);
						if (!stats) {
							return {
								substrate: kind,
								state: null,
								routedAs: "healthy" as HealthState,
								samples: 0,
								failures: 0,
								fatals: 0,
								consecutiveFailures: 0,
								openedAt: null,
								cooldownRemainingMs: null,
								avgLatencyMs: null,
							};
						}
						return {
							substrate: kind,
							state: stats.state,
							routedAs: stats.state,
							samples: stats.samples,
							failures: stats.failures,
							fatals: stats.fatals,
							consecutiveFailures: stats.consecutiveFailures,
							openedAt:
								stats.openedAt === undefined ? null : new Date(stats.openedAt).toISOString(),
							cooldownRemainingMs:
								stats.retryAtMs === undefined ? null : Math.max(0, stats.retryAtMs - now),
							avgLatencyMs: stats.avgLatencyMs ?? null,
						};
					}),
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(`state file: ${stateLocation()}`);
	console.log(
		`window:     last ${tuning.windowSize} attempts within ${tuning.windowMs}ms; opens after ${tuning.openAfter} consecutive transport failures; cooldown ${tuning.cooldownMs}ms`,
	);
	if (state.health && state.health.version !== HEALTH_SNAPSHOT_VERSION) {
		console.log(
			`note:       the stored snapshot is version ${String(state.health.version)} and this build reads version ${HEALTH_SNAPSHOT_VERSION}; it was discarded rather than coerced, so every lane below reads as no samples.`,
		);
	}
	console.log("");
	if (measured.size === 0) {
		console.log(
			"no provisioning outcomes recorded yet: no circuit has any evidence, so no lane is",
		);
		console.log('de-prioritized. Samples appear once "am mux run" or the SDK places a machine.');
		console.log("");
	}
	const rows = SUBSTRATE_KINDS.map((kind) => {
		const stats = measured.get(kind);
		if (!stats) return [kind, "no samples", "0", "0", "0", "0", "none", UNKNOWN];
		return [
			kind,
			stats.state,
			String(stats.samples),
			String(stats.failures),
			String(stats.fatals),
			String(stats.consecutiveFailures),
			cooldownCell(stats, now),
			millis(stats.avgLatencyMs),
		];
	});
	for (const line of renderTable(HEALTH_HEADER, rows, HEALTH_RIGHT)) console.log(line);
	console.log("");
	console.log("no samples = never attempted, or aged out of the window; routed as healthy.");
	console.log("healthy    = no transport failure in the window.");
	console.log("degraded   = a recent transport failure, or a cooldown that has elapsed and is");
	console.log("             now probeable. Tried after healthy lanes.");
	console.log("open       = cooling down. Tried LAST, never excluded: a blip that opened every");
	console.log("             circuit must not make create() impossible.");
	console.log("failures   = transport-class outcomes only. A credential or capability failure is");
	console.log("             counted under fatals and never opens a circuit.");
}

// ---------------------------------------------------------------------------
// am mux routes -- what routeFor() would choose right now, and why
// ---------------------------------------------------------------------------

/**
 * `--needs` value kinds.
 *
 * Typed as a total `Record<RouteConstraintKey, ...>` on purpose: it is the
 * only runtime list of constraint keys, and constraints.ts owns the type, so
 * this fails `npm run typecheck` the moment a new dimension is added instead
 * of silently refusing a real constraint. An unknown key is REFUSED rather
 * than ignored -- accepting `{"ptty":"native"}` and filtering on nothing would
 * report a route that satisfied a constraint that was never applied.
 */
const NEEDS_KINDS: Record<
	RouteConstraintKey,
	"pty" | "persistence" | "egress" | "boolean" | "string" | "number"
> = {
	pty: "pty",
	persistence: "persistence",
	reattach: "boolean",
	publicUrl: "boolean",
	streamingExec: "boolean",
	region: "string",
	gpu: "boolean",
	egress: "egress",
	fork: "boolean",
	minVcpu: "number",
	minMemoryMib: "number",
	minDiskGib: "number",
	minPublicPorts: "number",
	minConcurrency: "number",
	maxRuntimeMs: "number",
};

/**
 * Enumerated values, as total records over the unions in types.ts so that a
 * new member cannot be forgotten here. A value outside the union has to be
 * rejected: `{"pty":"nativve"}` would otherwise compare against an undefined
 * rank, fail no lane, and look like every lane satisfied it.
 */
const PTY_VALUES: Record<PtySupport, true> = { native: true, tmux: true, none: true };
const PERSISTENCE_VALUES: Record<PersistenceModel, true> = {
	"memory-snapshot": true,
	"filesystem-snapshot": true,
	"always-on": true,
	none: true,
};
const EGRESS_VALUES: Record<EgressPolicy, true> = { open: true, blocked: true, allowlist: true };

function oneOf(values: Record<string, true>): string {
	return Object.keys(values).join(" | ");
}

function needsValue(key: string, kind: (typeof NEEDS_KINDS)[RouteConstraintKey], value: unknown): unknown {
	switch (kind) {
		case "boolean":
			if (typeof value !== "boolean") throw new Error(`--needs ${key} must be true or false`);
			return value;
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
				throw new Error(`--needs ${key} must be a non-negative number`);
			}
			return value;
		case "string":
			if (typeof value !== "string" || value.length === 0) {
				throw new Error(`--needs ${key} must be a non-empty string`);
			}
			return value;
		case "pty":
			if (typeof value !== "string" || !(value in PTY_VALUES)) {
				throw new Error(`--needs ${key} must be one of: ${oneOf(PTY_VALUES)}`);
			}
			return value;
		case "egress":
			if (typeof value !== "string" || !(value in EGRESS_VALUES)) {
				throw new Error(`--needs ${key} must be one of: ${oneOf(EGRESS_VALUES)}`);
			}
			return value;
		case "persistence": {
			const wanted = Array.isArray(value) ? value : [value];
			for (const entry of wanted) {
				if (typeof entry !== "string" || !(entry in PERSISTENCE_VALUES)) {
					throw new Error(
						`--needs ${key} must be one of: ${oneOf(PERSISTENCE_VALUES)} (or an array of them)`,
					);
				}
			}
			return value;
		}
	}
}

function parseNeeds(flags: Flags): RouteConstraints | undefined {
	const raw: Record<string, unknown> = {};
	if (flags.needs !== undefined) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(flags.needs);
		} catch (error) {
			throw new Error(
				`--needs is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error(`--needs wants a JSON object, e.g. --needs '{"pty":"native"}'`);
		}
		Object.assign(raw, parsed);
	}
	if (flags.pty !== undefined) raw.pty = flags.pty;

	const keys = Object.keys(raw);
	if (keys.length === 0) return undefined;
	const constraints: Record<string, unknown> = {};
	for (const key of keys) {
		const kind = (NEEDS_KINDS as Record<string, (typeof NEEDS_KINDS)[RouteConstraintKey] | undefined>)[key];
		if (kind === undefined) {
			throw new Error(
				`--needs does not know "${key}". Known needs: ${Object.keys(NEEDS_KINDS).join(", ")}`,
			);
		}
		constraints[key] = needsValue(key, kind, raw[key]);
	}
	return constraints as RouteConstraints;
}

function parseOptimize(value: string | undefined): "cost" | undefined {
	if (value === undefined) return undefined;
	if (value !== "cost") throw new Error(`--optimize only understands "cost", got: ${value}`);
	return "cost";
}

function parseSubstrate(value: string | undefined): SubstrateKind | "auto" | undefined {
	if (value === undefined) return undefined;
	if (value === "auto") return "auto";
	if (!SUBSTRATE_KINDS.includes(value as SubstrateKind)) {
		throw new Error(`--sandbox wants one of: ${SUBSTRATE_KINDS.join(" | ")} | auto, got: ${value}`);
	}
	return value as SubstrateKind;
}

const CANDIDATE_HEADER = [
	"try",
	"substrate",
	"health",
	"price (10-min run)",
	"pty",
	"persistence",
	"stream",
] as const;
const CANDIDATE_RIGHT = [true, false, false, true, false, false, false];

/** Modeled price of one create+run on a lane, at cost.ts's comparison shape. */
function priceCell(estimated: ReturnType<typeof estimate>): string {
	return usd(estimated.totalUsd, estimated.upperBound ? "upper" : undefined);
}

function candidateRow(
	position: number,
	kind: SubstrateKind,
	health: HealthState,
	price: string,
	caps: SandboxCapabilities,
): string[] {
	return [
		String(position),
		kind,
		health,
		price,
		caps.pty,
		caps.persistence,
		String(caps.streamingExec),
	];
}

function routesCommand(flags: Flags): void {
	const constraints = parseNeeds(flags);
	const optimize = parseOptimize(flags.optimize);
	const sandbox = parseSubstrate(flags.sandbox);
	const router = createMux(flags.config);
	const requested =
		sandbox && sandbox !== "auto"
			? [sandbox]
			: [router.config.sandboxes.primary, ...router.config.sandboxes.backups];
	const { candidates, skipped } = router.routeFor(sandbox, { constraints, optimize });
	const prices = new Map(
		candidates.map((kind) => [kind, estimate(kind, DEFAULT_RUN_SHAPE)] as const),
	);
	// Structural, not string-sniffing: a constraint rejection carries the
	// dimension that failed, a credential skip does not.
	const isConstraintSkip = (attempt: RouteAttempt): boolean => attempt.constraint !== undefined;

	if (flags.json) {
		console.log(
			JSON.stringify(
				{
					requested,
					constraints: constraints ?? null,
					optimize: optimize ?? null,
					route: candidates,
					skipped: skipped.map((attempt) => ({
						substrate: attempt.substrate,
						stage: isConstraintSkip(attempt) ? "constraints" : "credentials",
						constraint: attempt.constraint ?? null,
						reason: attempt.reason ?? null,
					})),
					candidates: candidates.map((kind, index) => {
						const estimated = prices.get(kind);
						return {
							try: index + 1,
							substrate: kind,
							health: router.health.state(kind),
							estimatedUsd: estimated?.totalUsd ?? null,
							estimateIsUpperBound: estimated?.upperBound === true,
							priceKnown: estimated?.known === true,
							priceUnknownReason: estimated?.unknownReason ?? null,
							capabilities: router.provider(kind).capabilities,
						};
					}),
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(`route:     ${candidates.join(" -> ") || "(none -- nothing survived the filters below)"}`);
	console.log(`requested: ${requested.join(" -> ")}${sandbox && sandbox !== "auto" ? " (pinned)" : " (config primary -> backups)"}`);
	console.log("");
	console.log("how this order was reached:");
	console.log("  credentials  lanes the config cannot authenticate are dropped (fail closed).");
	console.log(
		`  constraints  ${
			constraints
				? `applied: ${JSON.stringify(constraints)}`
				: "none declared (pass --needs '{\"pty\":\"native\"}' to filter on capabilities)"
		}`,
	);
	console.log(
		`  price        ${
			optimize === "cost"
				? "applied: cheapest modeled total first, unpriced lanes last."
				: "not applied -- configured order kept. Pass --optimize cost to order by price."
		}`,
	);
	console.log(
		"  health       applied last: healthy, then degraded, then open. It only reorders --",
	);
	console.log("               a lane is never removed for being unhealthy.");

	const credentialSkips = skipped.filter((attempt) => !isConstraintSkip(attempt));
	const constraintSkips = skipped.filter(isConstraintSkip);
	if (credentialSkips.length > 0) {
		console.log("");
		console.log("skipped, no credentials:");
		for (const line of renderTable(
			["substrate", "reason"],
			credentialSkips.map((attempt) => [attempt.substrate, attempt.reason ?? UNKNOWN]),
		).slice(1)) {
			console.log(`  ${line}`);
		}
	}
	if (constraintSkips.length > 0) {
		console.log("");
		console.log("skipped, cannot satisfy a declared need:");
		for (const line of renderTable(
			["substrate", "need", "reason"],
			constraintSkips.map((attempt) => [
				attempt.substrate,
				attempt.constraint ?? UNKNOWN,
				attempt.reason ?? UNKNOWN,
			]),
		).slice(1)) {
			console.log(`  ${line}`);
		}
	}

	console.log("");
	if (candidates.length === 0) {
		console.log("no lane survives, so create() would fail closed with the reasons above.");
		console.log(
			"credential a substrate (E2B_API_KEY, SPRITES_TOKEN, ...) or relax --needs, and re-run.",
		);
		return;
	}
	console.log("candidates, in the order create() would try them:");
	for (const line of renderTable(
		CANDIDATE_HEADER,
		candidates.map((kind, index) => {
			const estimated = prices.get(kind);
			return candidateRow(
				index + 1,
				kind,
				router.health.state(kind),
				estimated === undefined ? UNKNOWN : priceCell(estimated),
				router.provider(kind).capabilities,
			);
		}),
		CANDIDATE_RIGHT,
	)) {
		console.log(line);
	}
	console.log("");
	console.log(
		`price is modeled from published rates for a ${DEFAULT_RUN_SHAPE.durationMs / 60_000}-minute run at ${DEFAULT_RUN_SHAPE.vcpu} vCPU /`,
	);
	console.log(
		`${DEFAULT_RUN_SHAPE.memoryMib} MiB, model tokens excluded. ${UNKNOWN} means the vendor publishes no rate,`,
	);
	console.log("which sorts the lane LAST under --optimize cost rather than treating it as cheap.");
	if ([...prices.values()].some((estimated) => estimated.upperBound)) {
		console.log("<= marks an upper bound: an active-CPU lane priced at full utilization bills less.");
	}
	const notes: string[] = [];
	for (const [kind, estimated] of prices) {
		if (estimated.unknownReason) notes.push(`  ${kind}: ${estimated.unknownReason}`);
	}
	if (notes.length > 0) {
		console.log("");
		console.log("notes:");
		for (const note of notes) console.log(note);
	}
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function mux(args: string[]): Promise<void> {
	const [subcommand = "help", ...rest] = args;
	const flags = parseFlags(rest);

	// The read-only surfaces come first and build no router: a config file with
	// a typo in it must not cost a user the ability to read their own
	// measurements.
	if (subcommand === "stats") {
		statsCommand(flags);
		return;
	}

	if (subcommand === "health") {
		healthCommand(flags);
		return;
	}

	if (subcommand === "routes") {
		routesCommand(flags);
		return;
	}

	if (subcommand === "ls") {
		const machines = readMuxState().machines;
		const names = Object.keys(machines);
		if (names.length === 0) {
			console.log("no named machines yet (create one with: am mux run --name <name> ...)");
			return;
		}
		for (const name of names) {
			const entry = machines[name];
			console.log(
				`${name.padEnd(20)} ${entry.agent.padEnd(12)} ${entry.substrate.padEnd(9)} ${entry.sandboxId}`,
			);
		}
		return;
	}

	if (subcommand === "rm") {
		if (!flags.name) throw new Error("am mux rm requires --name");
		if (!readMuxState().machines[flags.name]) {
			console.log(`no machine named ${flags.name} (nothing to remove)`);
			return;
		}
		const router = createMux(flags.config);
		// router.remove() takes the substrate's no-wake teardown where one
		// exists. The old connect()+destroy() resumed a parked sandbox first,
		// which billed for the wake and left a sandbox whose snapshot could not
		// resume permanently undestroyable. It also forgets the placement
		// whatever happens, so a machine the substrate already reaped (E2B
		// expires paused sandboxes) cannot leave an entry that never clears.
		try {
			const { resumed } = await router.remove(flags.name);
			console.log(
				resumed
					? `destroyed ${flags.name} (this substrate has no no-wake teardown, so it was resumed first)`
					: `destroyed ${flags.name}`,
			);
		} catch (error) {
			forgetMachine(flags.name);
			console.log(
				`forgot ${flags.name} (its sandbox was already gone: ${
					error instanceof Error ? error.message : String(error)
				})`,
			);
		}
		return;
	}

	if (subcommand === "run") {
		const prompt = flags.rest.join(" ").trim();
		if (!prompt) throw new Error('am mux run requires a prompt: am mux run "..."');
		const router = createMux(flags.config);
		const machine = flags.name
			? await connectOrCreate(router, flags)
			: await router.create({
					agent: flags.agent,
					sandbox: flags.sandbox,
					model: flags.model,
				});
		const stream = machine.run(prompt, { model: flags.model });
		if (flags.json) {
			for await (const event of stream) console.log(JSON.stringify(event));
			return;
		}
		for await (const event of stream) renderEvent(event);
		const result = await stream.result();
		process.stdout.write("\n");
		process.stderr.write(
			`\x1b[2m[${result.harness} on ${result.substrate}: ${result.durationMs}ms${
				result.costUsd !== undefined ? `, $${result.costUsd.toFixed(4)}` : ""
			}]\x1b[0m\n`,
		);
		if (!flags.name) await machine.destroy();
		return;
	}

	if (subcommand === "shell" || subcommand === "term") {
		const router = createMux(flags.config);
		const machine = await connectOrCreate(router, flags);
		const session = flags.name ?? "ammux";
		const pty =
			subcommand === "shell"
				? await machine.shell({ session, cols: process.stdout.columns, rows: process.stdout.rows })
				: await machine.pty({ session, cols: process.stdout.columns, rows: process.stdout.rows });
		await attachPty(pty);
		return;
	}

	console.log("Agent Machines multiplexer");
	console.log("");
	console.log("  am mux run    [--agent <a>] [--sandbox <s|auto>] [--name <n>] [--json] \"prompt\"");
	console.log("  am mux shell  [--name <n>] [--sandbox <s>]        raw PTY on the sandbox");
	console.log("  am mux term   [--agent <a>] [--name <n>]          interactive agent PTY");
	console.log("  am mux ls                                        named machines");
	console.log("  am mux routes [--sandbox <s>] [--needs <json>]   resolved route, and why");
	console.log("                [--pty <p>] [--optimize cost] [--json]");
	console.log("  am mux stats  [--since 24h] [--limit <n>]        measured outcomes by route");
	console.log("                [--json]");
	console.log("  am mux health [--json]                           substrate circuit breakers");
	console.log("  am mux rm     --name <n>                         destroy a named machine");
	console.log("");
	console.log("  agents:    claude-code | codex | openclaw | hermes");
	console.log("  sandboxes: e2b | sprites | vercel | dedalus | auto");
	const needs = Object.keys(NEEDS_KINDS);
	console.log(`  needs:     ${needs.slice(0, 8).join(", ")},`);
	console.log(`             ${needs.slice(8).join(", ")}`);
}

async function connectOrCreate(
	router: ReturnType<typeof createMux>,
	flags: Flags,
) {
	if (flags.name && readMuxState().machines[flags.name]) {
		return router.connect(flags.name, flags.agent);
	}
	return router.create({
		agent: flags.agent,
		sandbox: flags.sandbox,
		name: flags.name,
		model: flags.model,
	});
}
