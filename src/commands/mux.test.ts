/**
 * Tests for the read-only mux commands: `am mux stats`, `am mux health` and
 * `am mux routes`.
 *
 * Run: tsx --test src/commands/mux.test.ts
 *
 * These assert the RENDERED TEXT, not the underlying summary, because the
 * defect they exist to prevent is a rendering one: a route whose cost nobody
 * can compute must print "unknown", and a 0 or a dash in that cell would
 * report an unpriced lane as a free one. traces.ts and health.ts already have
 * their own arithmetic tests; this file only cares what reaches the terminal.
 *
 * Every test gets a private traces directory and a private state file through
 * AGENT_MACHINES_MUX_TRACES and AGENT_MACHINES_MUX_STATE, and runs with every
 * substrate credential cleared, so nothing here touches ~/.agent-machines and
 * a developer's real keys cannot change the expected output.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { HEALTH_SNAPSHOT_VERSION, type SubstrateHealthSnapshot } from "../mux/health.js";
import type { ScoredRouteAttempt } from "../mux/router.js";
import { appendTrace, type RunTrace } from "../mux/traces.js";
import { mux } from "./mux.js";

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

/**
 * Everything config.ts reads from the environment for the four substrates. All
 * of it is cleared: with a real E2B key exported, `routes` would report a
 * credentialed lane and every expectation below would depend on whose laptop
 * ran the suite.
 */
const CREDENTIAL_VARS = [
	"E2B_API_KEY",
	"SPRITES_TOKEN",
	"SPRITES_API_KEY",
	"VERCEL_TOKEN",
	"VERCEL_TEAM_ID",
	"VERCEL_PROJECT_ID",
	"VERCEL_OIDC_TOKEN",
	"DEDALUS_API_KEY",
	"DEDALUS_BASE_URL",
];

const ISOLATED_VARS = [
	"AGENT_MACHINES_MUX_TRACES",
	"AGENT_MACHINES_MUX_STATE",
	...CREDENTIAL_VARS,
];

type Box = {
	dir: string;
	/** AGENT_MACHINES_MUX_TRACES for this test. */
	traces: string;
	/** AGENT_MACHINES_MUX_STATE for this test. */
	state: string;
	/** Write a config file and return the path, for hermetic credentials. */
	config(input: unknown): string;
};

async function withMux(
	body: (box: Box) => Promise<void> | void,
	env: Record<string, string> = {},
): Promise<void> {
	const saved = new Map(ISOLATED_VARS.map((name) => [name, process.env[name]] as const));
	const dir = mkdtempSync(join(tmpdir(), "am-mux-cli-"));
	for (const name of CREDENTIAL_VARS) delete process.env[name];
	process.env.AGENT_MACHINES_MUX_TRACES = join(dir, "traces");
	process.env.AGENT_MACHINES_MUX_STATE = join(dir, "mux-state.json");
	for (const [name, value] of Object.entries(env)) process.env[name] = value;
	let counter = 0;
	try {
		await body({
			dir,
			traces: join(dir, "traces"),
			state: join(dir, "mux-state.json"),
			config(input: unknown): string {
				counter += 1;
				const path = join(dir, `config-${counter}.json`);
				writeFileSync(path, JSON.stringify(input), "utf8");
				return path;
			},
		});
	} finally {
		for (const [name, value] of saved) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Collect stdout lines. The commands under test write only through console.log. */
async function capture(run: () => Promise<void>): Promise<string[]> {
	const lines: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]): void => {
		lines.push(args.map((arg) => String(arg)).join(" "));
	};
	try {
		await run();
	} finally {
		console.log = original;
	}
	return lines;
}

/**
 * The cells of one table row, found by its label. Columns are 2+ spaces apart,
 * and rows may be indented (a right-aligned first column, or a nested list).
 */
function cells(lines: string[], label: string): string[] {
	const line = lines.map((candidate) => candidate.trim()).find((candidate) => candidate.startsWith(label));
	assert.ok(line !== undefined, `no row for "${label}" in:\n${lines.join("\n")}`);
	return line.split(/\s{2,}/);
}

function has(lines: string[], needle: string): boolean {
	return lines.some((line) => line.includes(needle));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = "2026-08-01";

function fixtureTrace(input: {
	runKey: string;
	harness: RunTrace["harness"];
	substrate: RunTrace["substrate"];
	durationMs: number;
	exitCode?: number;
	truncated?: boolean;
	timeToFirstEventMs?: number;
	modelCostUsd?: number;
	startedAt?: string;
	/** Annotate the winning attempt the way Mux.create() does when the policy ran. */
	placedByPolicy?: { score: number; samples: number; policy: string };
}): void {
	// A RouteAttempt IS a ScoredRouteAttempt with the three annotations absent,
	// so the fixture writes exactly the record shape the router writes.
	const attempt: ScoredRouteAttempt = {
		substrate: input.substrate,
		outcome: "ok",
		durationMs: 300,
	};
	if (input.placedByPolicy) {
		attempt.selectionScore = input.placedByPolicy.score;
		attempt.selectionSamples = input.placedByPolicy.samples;
		attempt.selectionPolicy = input.placedByPolicy.policy;
	}
	const trace: RunTrace = {
		runKey: input.runKey,
		harness: input.harness,
		substrate: input.substrate,
		attempts: [attempt],
		startedAt: input.startedAt ?? `${DAY}T12:00:00.000Z`,
		durationMs: input.durationMs,
		exitCode: input.exitCode ?? 0,
		truncated: input.truncated ?? false,
		events: 7,
		timeToFirstEventMs: input.timeToFirstEventMs,
		modelCostUsd: input.modelCostUsd,
	};
	appendTrace(trace);
}

/**
 * Three claude-code runs on e2b (two clean, one truncated) and two codex runs
 * on sprites (one clean, one exit 1).
 *
 * Every run is 10 minutes long, which is cost.ts's comparison shape, so the
 * modeled compute is exactly $0.0222 per run on e2b -- and nothing at all on
 * sprites, whose vendor publishes no compute rate. That asymmetry is the point
 * of the fixture: one lane must render a number and the other must render
 * "unknown" in the same column.
 */
function fixtureRuns(): void {
	fixtureTrace({
		runKey: "e2b-1",
		harness: "claude-code",
		substrate: "e2b",
		durationMs: 600_000,
		timeToFirstEventMs: 400,
		modelCostUsd: 0.01,
		// Two of the five runs were placed by the policy; the other three were
		// pinned or price-ordered, which is what the count in `stats` reports.
		placedByPolicy: { score: 0.586, samples: 1, policy: "test-policy-1" },
	});
	fixtureTrace({
		runKey: "e2b-2",
		harness: "claude-code",
		substrate: "e2b",
		durationMs: 600_000,
		timeToFirstEventMs: 500,
		modelCostUsd: 0.01,
		placedByPolicy: { score: 0.612, samples: 2, policy: "test-policy-1" },
	});
	fixtureTrace({
		runKey: "e2b-3",
		harness: "claude-code",
		substrate: "e2b",
		durationMs: 600_000,
		timeToFirstEventMs: 900,
		modelCostUsd: 0.01,
		truncated: true,
	});
	fixtureTrace({
		runKey: "sprites-1",
		harness: "codex",
		substrate: "sprites",
		durationMs: 300_000,
		timeToFirstEventMs: 300,
		modelCostUsd: 0.02,
	});
	fixtureTrace({
		runKey: "sprites-2",
		harness: "codex",
		substrate: "sprites",
		durationMs: 300_000,
		exitCode: 1,
	});
}

// ---------------------------------------------------------------------------
// am mux stats
// ---------------------------------------------------------------------------

test("stats on a fresh install prints an explained empty table and does not throw", async () => {
	await withMux(async () => {
		const lines = await capture(() => mux(["stats"]));
		const overall = cells(lines, "overall");
		assert.deepEqual(overall, [
			"overall",
			"0",
			"0",
			"unknown",
			"unknown",
			"unknown",
			"unknown",
			"unknown",
		]);
		assert.ok(has(lines, "no run traces in this window"));
		// The columns are still described, so an empty install teaches what
		// will appear once something runs.
		assert.ok(has(lines, "cost/ok"));
		// Outside the two count columns, nothing was measured: no rate, no cost,
		// and no dash that could be read as either.
		for (const cell of overall.slice(3)) {
			assert.equal(cell, "unknown", `an empty window rendered "${cell}"`);
		}
	});
});

test("stats reports the four numbers per route, and an unpriced lane as unknown", async () => {
	await withMux(async () => {
		fixtureRuns();
		const lines = await capture(() => mux(["stats"]));

		// success rate, time to first output, cost to a successful result, and
		// the truncation rate -- all four, per harness x substrate lane.
		assert.deepEqual(cells(lines, "claude-code@e2b"), [
			"claude-code@e2b",
			"3",
			"2",
			"67%",
			"500ms",
			"900ms",
			"$0.0483",
			"33%",
		]);
		// Fly publishes no Sprites compute rate, so cost/ok on this lane is
		// unknown. This is the assertion the whole file exists for: it must not
		// be "$0.0000", and it must not be a dash.
		const sprites = cells(lines, "codex@sprites");
		assert.deepEqual(sprites, [
			"codex@sprites",
			"2",
			"1",
			"50%",
			"300ms",
			"300ms",
			"unknown",
			"0%",
		]);
		assert.ok(!sprites.some((cell) => cell.includes("$")));
		assert.ok(!sprites.includes("-"));
		// Mixed priced and unpriced runs make the overall figure a floor, and it
		// says so rather than presenting a total it cannot back.
		assert.deepEqual(cells(lines, "overall"), [
			"overall",
			"5",
			"3",
			"60%",
			"400ms",
			"900ms",
			">=$0.0322",
			"20%",
		]);
		assert.ok(has(lines, ">= marks a floor"));
		// The gap is named, with the vendor evidence behind it.
		assert.ok(has(lines, "Fly publishes no Sprites compute rate"));
		assert.ok(has(lines, "1 of 5 runs reported no model spend"));
		// Busiest lane first, deterministically.
		const order = lines.filter((line) => /^(claude-code@e2b|codex@sprites)/.test(line));
		assert.deepEqual(
			order.map((line) => line.split(" ")[0]),
			["claude-code@e2b", "codex@sprites"],
		);
	});
});

test("stats --since keeps only runs inside the window", async () => {
	await withMux(async () => {
		fixtureRuns();
		fixtureTrace({
			runKey: "old-1",
			harness: "openclaw",
			substrate: "e2b",
			durationMs: 600_000,
			startedAt: "2026-07-20T09:00:00.000Z",
		});
		const all = await capture(() => mux(["stats"]));
		assert.equal(cells(all, "overall")[1], "6");

		const recent = await capture(() => mux(["stats", "--since", "2026-08-01"]));
		assert.equal(cells(recent, "overall")[1], "5");
		assert.ok(!has(recent, "openclaw@e2b"));
		assert.ok(has(recent, "since 2026-08-01T00:00:00.000Z"));

		// A relative age is what a human types, and it resolves to an instant
		// that is printed rather than implied.
		const relative = await capture(() => mux(["stats", "--since", "48h"]));
		assert.ok(has(relative, "last 48h (since "));
	});
});

test("stats rejects a --since it cannot parse instead of silently reporting all time", async () => {
	await withMux(async () => {
		await assert.rejects(() => mux(["stats", "--since", "last tuesday"]), /--since wants an instant/);
		// A flag with no value must not read as "flag absent" either.
		await assert.rejects(() => mux(["stats", "--since"]), /--since requires a value/);
		await assert.rejects(() => mux(["stats", "--limit", "-2"]), /--limit wants a non-negative integer/);
	});
});

test("a flag with no value is refused rather than read as the flag being absent", async () => {
	await withMux(async () => {
		// A dropped --sandbox would mean "auto", a dropped --name would silently
		// create a throwaway machine, and a dropped --config would fall back to
		// whatever config the working directory happens to hold. All three are the
		// wrong answer to a shell that ate an argument.
		await assert.rejects(() => mux(["routes", "--sandbox"]), /--sandbox requires a value/);
		await assert.rejects(() => mux(["routes", "--config"]), /--config requires a value/);
		await assert.rejects(() => mux(["run", "--name"]), /--name requires a value/);
		await assert.rejects(() => mux(["run", "--model"]), /--model requires a value/);
	});
});

test("stats --json reports unknown as null, never as 0", async () => {
	await withMux(async () => {
		const empty = JSON.parse((await capture(() => mux(["stats", "--json"]))).join("\n")) as {
			overall: { runs: number; successRate: number | null; costToSuccessUsd: number | null };
			routes: unknown[];
		};
		assert.equal(empty.overall.runs, 0);
		assert.equal(empty.overall.successRate, null);
		assert.equal(empty.overall.costToSuccessUsd, null);
		assert.deepEqual(empty.routes, []);

		fixtureRuns();
		const filled = JSON.parse((await capture(() => mux(["stats", "--json"]))).join("\n")) as {
			overall: { successRate: number; costToSuccessIsFloor: boolean };
			routes: {
				route: string;
				successRate: number;
				costToSuccessUsd: number | null;
				timeToFirstOutputP50Ms: number | null;
				unpricedSubstrates: string[];
			}[];
		};
		assert.equal(filled.overall.successRate, 0.6);
		assert.equal(filled.overall.costToSuccessIsFloor, true);
		const sprites = filled.routes.find((route) => route.route === "codex@sprites");
		assert.ok(sprites);
		assert.equal(sprites.costToSuccessUsd, null);
		assert.equal(sprites.timeToFirstOutputP50Ms, 300);
		assert.deepEqual(sprites.unpricedSubstrates, ["sprites"]);
	});
});

test("stats counts the runs the learned policy placed, and never averages their scores", async () => {
	await withMux(async () => {
		fixtureRuns();
		const lines = await capture(() => mux(["stats"]));
		assert.ok(has(lines, "2 of 5 runs were placed by the learned policy (test-policy-1)"));
		// Two of the three terms behind a score are relative to the candidate set
		// of one request, so an average across requests would be meaningless. The
		// output has to say that, not quietly print a mean.
		assert.ok(has(lines, "never averaged"));
		// And the score must not appear as a column in the route table.
		assert.ok(!has(lines, "0.586"));
		assert.ok(!has(lines, "0.599"));

		const json = JSON.parse((await capture(() => mux(["stats", "--json"]))).join("\n")) as {
			selection: { placedRuns: number; policies: string[] };
		};
		assert.equal(json.selection.placedRuns, 2);
		assert.deepEqual(json.selection.policies, ["test-policy-1"]);
	});
});

test("stats on an empty window reports no policy placements rather than omitting the field", async () => {
	await withMux(async () => {
		const json = JSON.parse((await capture(() => mux(["stats", "--json"]))).join("\n")) as {
			selection: { placedRuns: number; policies: string[] };
		};
		assert.equal(json.selection.placedRuns, 0);
		assert.deepEqual(json.selection.policies, []);
	});
});

// ---------------------------------------------------------------------------
// am mux health
// ---------------------------------------------------------------------------

test("health on a fresh install lists every lane as having no samples, and exits 0", async () => {
	await withMux(async () => {
		const lines = await capture(() => mux(["health"]));
		for (const kind of ["e2b", "sprites", "vercel", "dedalus"]) {
			assert.deepEqual(cells(lines, kind), [
				kind,
				"no samples",
				"0",
				"0",
				"0",
				"0",
				"none",
				"unknown",
			]);
		}
		assert.ok(has(lines, "no provisioning outcomes recorded yet"));
		// An untried lane routes normally; saying "healthy" would be a claim
		// with no evidence behind it.
		assert.ok(has(lines, "routed as healthy"));
	});
});

test("health renders circuit state, sample counts and the cooldown that is left", async () => {
	await withMux(async (box) => {
		const now = Date.now();
		const snapshot: SubstrateHealthSnapshot = {
			version: HEALTH_SNAPSHOT_VERSION,
			substrates: {
				e2b: {
					samples: [
						{ at: now - 3000, outcome: "transient", latencyMs: 1000 },
						{ at: now - 2000, outcome: "transient", latencyMs: 1200 },
						{ at: now - 1000, outcome: "transient", latencyMs: 1400 },
					],
					openedAt: now - 1000,
				},
				sprites: {
					samples: [
						{ at: now - 5000, outcome: "ok", latencyMs: 400 },
						{ at: now - 4000, outcome: "fatal" },
					],
				},
			},
		};
		writeFileSync(box.state, JSON.stringify({ machines: {}, health: snapshot }), "utf8");

		const lines = await capture(() => mux(["health"]));
		const e2b = cells(lines, "e2b");
		assert.deepEqual(e2b.slice(0, 6), ["e2b", "open", "3", "3", "0", "3"]);
		// Roughly 29s of a 30s cooldown remain; the exact figure moves with the
		// clock, so the shape is what is asserted.
		assert.match(e2b[6], /^\d+\.\d+s$/);
		assert.ok(Number.parseFloat(e2b[6]) > 0 && Number.parseFloat(e2b[6]) <= 30);
		assert.equal(e2b[7], "1200ms");
		// A fatal is a credential or capability gap. It is counted and it never
		// opens a circuit, so this lane is still healthy with one on record.
		assert.deepEqual(cells(lines, "sprites"), [
			"sprites",
			"healthy",
			"2",
			"0",
			"1",
			"0",
			"none",
			"400ms",
		]);
		assert.deepEqual(cells(lines, "vercel").slice(0, 2), ["vercel", "no samples"]);
		assert.ok(has(lines, box.state));

		const json = JSON.parse((await capture(() => mux(["health", "--json"]))).join("\n")) as {
			substrates: {
				substrate: string;
				state: string | null;
				routedAs: string;
				cooldownRemainingMs: number | null;
				avgLatencyMs: number | null;
			}[];
		};
		const jsonE2b = json.substrates.find((entry) => entry.substrate === "e2b");
		assert.ok(jsonE2b);
		assert.equal(jsonE2b.state, "open");
		assert.ok((jsonE2b.cooldownRemainingMs ?? 0) > 0);
		const jsonVercel = json.substrates.find((entry) => entry.substrate === "vercel");
		assert.ok(jsonVercel);
		// Never measured is null, and the routing consequence is stated
		// separately rather than being invented as a state.
		assert.equal(jsonVercel.state, null);
		assert.equal(jsonVercel.routedAs, "healthy");
		assert.equal(jsonVercel.avgLatencyMs, null);
	});
});

test("health says so when the stored snapshot is a version it will not read", async () => {
	await withMux(async (box) => {
		writeFileSync(
			box.state,
			JSON.stringify({
				machines: {},
				health: { version: HEALTH_SNAPSHOT_VERSION + 1, substrates: {} },
			}),
			"utf8",
		);
		const lines = await capture(() => mux(["health"]));
		assert.ok(has(lines, "was discarded rather than coerced"));
		assert.deepEqual(cells(lines, "e2b").slice(0, 2), ["e2b", "no samples"]);
	});
});

// ---------------------------------------------------------------------------
// am mux routes
// ---------------------------------------------------------------------------

test("routes with no credentials explains the empty route and does not throw", async () => {
	await withMux(async (box) => {
		const config = box.config({});
		const lines = await capture(() => mux(["routes", "--config", config]));
		assert.ok(has(lines, "route:     (none"));
		assert.ok(has(lines, "skipped, no credentials:"));
		assert.deepEqual(cells(lines, "e2b"), ["e2b", "missing credentials: E2B_API_KEY"]);
		assert.ok(has(lines, "missing credentials: SPRITES_TOKEN"));
		assert.ok(has(lines, "DEDALUS_API_KEY"));
		assert.ok(has(lines, "create() would fail closed"));
	});
});

test("routes shows the order it would try, with health and modeled price per lane", async () => {
	await withMux(async (box) => {
		const config = box.config({
			providers: { e2b: "test-key", sprites: "test-token" },
			sandboxes: { primary: "e2b", backups: ["sprites", "vercel", "dedalus"] },
		});
		const lines = await capture(() => mux(["routes", "--config", config, "--optimize", "cost"]));
		assert.ok(has(lines, "route:     e2b -> sprites"));
		assert.deepEqual(cells(lines, "1  e2b"), [
			"1",
			"e2b",
			"healthy",
			"$0.0222",
			"native",
			"memory-snapshot",
			"true",
		]);
		// An unpriced lane sorts last and says why, rather than sorting first
		// on an implied price of zero.
		assert.deepEqual(cells(lines, "2  sprites"), [
			"2",
			"sprites",
			"healthy",
			"unknown",
			"native",
			"always-on",
			"true",
		]);
		assert.ok(has(lines, "sorts the lane LAST under --optimize cost"));
		assert.ok(has(lines, "applied: cheapest modeled total first"));
		assert.ok(has(lines, "Fly publishes no Sprites compute rate"));
	});
});

test("routes names the dimension a lane failed when a need is declared", async () => {
	await withMux(async (box) => {
		const config = box.config({
			providers: { e2b: "test-key", sprites: "test-token" },
			sandboxes: { primary: "e2b", backups: ["sprites", "vercel", "dedalus"] },
		});
		const lines = await capture(() =>
			mux(["routes", "--config", config, "--needs", '{"persistence":"memory-snapshot"}']),
		);
		assert.ok(has(lines, "route:     e2b"));
		assert.ok(has(lines, "skipped, cannot satisfy a declared need:"));
		assert.deepEqual(cells(lines, "sprites"), [
			"sprites",
			"persistence",
			'persistence: requires "memory-snapshot", sprites provides "always-on"',
		]);
	});
});

/**
 * Eight clean claude-code runs on sprites and nothing on e2b, so the learned
 * policy has real evidence for one lane and none for the other. Chosen because
 * sprites is also the UNPRICED lane: its cost term stays at the neutral prior,
 * which proves the lane won on measured success and speed rather than on an
 * unknown price being read as a cheap one.
 */
function fixtureLearnedSprites(): void {
	for (let index = 0; index < 8; index += 1) {
		fixtureTrace({
			runKey: `learn-${index}`,
			harness: "claude-code",
			substrate: "sprites",
			durationMs: 300_000,
			timeToFirstEventMs: 250,
			modelCostUsd: 0.02,
		});
	}
}

test("routes reports the score and sample count that chose a lane, and 0 samples as the prior", async () => {
	await withMux(async (box) => {
		fixtureLearnedSprites();
		const config = box.config({
			providers: { e2b: "test-key", sprites: "test-token" },
			sandboxes: { primary: "e2b", backups: ["sprites"] },
			agents: { default: "claude-code" },
		});
		const lines = await capture(() => mux(["routes", "--config", config]));

		// Measured evidence moved sprites ahead of the configured primary.
		assert.ok(has(lines, "route:     sprites -> e2b"));
		assert.deepEqual(cells(lines, "1  sprites"), [
			"1",
			"sprites",
			"healthy",
			"0.729",
			"8",
			"unknown",
			"native",
			"always-on",
			"true",
		]);
		// An unexplored lane is scored at the prior with 0 runs behind it. 0 runs
		// is a real count, not an unknown; the score is not "unknown" either,
		// because the policy did produce one -- it just has no evidence in it.
		assert.deepEqual(cells(lines, "2  e2b"), [
			"2",
			"e2b",
			"healthy",
			"0.500",
			"0",
			"$0.0222",
			"native",
			"memory-snapshot",
			"true",
		]);
		// The stage is named, with the policy version, the harness it scored for
		// and the window -- rendered as a duration a human reads, not 604800000ms.
		assert.ok(has(lines, "selection    applied: policy "));
		assert.ok(has(lines, "scored for claude-code over"));
		assert.ok(has(lines, "in the last 7d from "));
		assert.ok(has(lines, "a lane is never removed for a low score"));
		// The per-lane account comes from selection.ts's own explainLane, so the
		// CLI cannot drift from the dashboard's wording.
		assert.ok(has(lines, "why this order:"));
		assert.ok(has(lines, "claude-code@sprites, score 0.729, 8/8 runs ok"));
		assert.ok(has(lines, "claude-code@e2b, score 0.500, 0/0 runs ok"));
		// The score's blast radius is stated: it is not a cross-route number.
		assert.ok(has(lines, "comparable only within THIS table"));

		const json = JSON.parse(
			(await capture(() => mux(["routes", "--config", config, "--json"]))).join("\n"),
		) as {
			agent: string;
			selection: { policy: string; windowMs: number; lanes: { substrate: string; score: number; samples: number }[] } | null;
			candidates: { substrate: string; selectionScore: number | null; selectionSamples: number | null }[];
		};
		assert.equal(json.agent, "claude-code");
		assert.ok(json.selection);
		assert.equal(json.selection.windowMs, 604_800_000);
		assert.deepEqual(
			json.selection.lanes.map((lane) => lane.substrate),
			["sprites", "e2b"],
		);
		const e2b = json.candidates.find((candidate) => candidate.substrate === "e2b");
		assert.ok(e2b);
		assert.equal(e2b.selectionSamples, 0);
		// The prior, reached by three weighted terms that sum in binary floating
		// point, so it is compared with a tolerance rather than for equality.
		assert.ok(e2b.selectionScore !== null && Math.abs(e2b.selectionScore - 0.5) < 1e-9);
	});
});

test("routes scores the lane for --agent, not for whatever the config defaults to", async () => {
	await withMux(async (box) => {
		fixtureLearnedSprites();
		const config = box.config({
			providers: { e2b: "test-key", sprites: "test-token" },
			sandboxes: { primary: "e2b", backups: ["sprites"] },
			agents: { default: "codex" },
		});

		// A lane is harness x substrate: claude-code's record on sprites is no
		// evidence about codex there, so the configured order stands for codex.
		const codex = await capture(() => mux(["routes", "--config", config]));
		assert.ok(has(codex, "route:     e2b -> sprites"));
		assert.ok(has(codex, "agent:     codex (config default)"));
		assert.ok(has(codex, "codex@sprites, score 0.500, 0/0 runs ok"));

		const claude = await capture(() =>
			mux(["routes", "--config", config, "--agent", "claude-code"]),
		);
		assert.ok(has(claude, "route:     sprites -> e2b"));
		assert.ok(has(claude, "agent:     claude-code (--agent)"));
		assert.ok(has(claude, "claude-code@sprites, score 0.729, 8/8 runs ok"));
	});
});

test("routes refuses an --agent it does not know instead of scoring a lane nothing matches", async () => {
	await withMux(async (box) => {
		const config = box.config({ providers: { e2b: "test-key" } });
		// A typo would otherwise match no trace, leave every lane at the prior,
		// and read as "this route has no evidence yet".
		await assert.rejects(
			() => mux(["routes", "--config", config, "--agent", "claud-code"]),
			/--agent wants one of/,
		);
		await assert.rejects(() => mux(["routes", "--config", config, "--agent"]), /--agent requires a value/);
	});
});

test("routes says why the policy did not order the route, for each reason it did not", async () => {
	await withMux(async (box) => {
		fixtureLearnedSprites();
		const config = box.config({
			providers: { e2b: "test-key", sprites: "test-token" },
			sandboxes: { primary: "e2b", backups: ["sprites"] },
			agents: { default: "claude-code" },
		});

		// A pinned lane is the caller's escape hatch and comes back as asked.
		const pinned = await capture(() => mux(["routes", "--config", config, "--sandbox", "sprites"]));
		assert.ok(has(pinned, "selection    not applied -- --sandbox pins the lane"));
		assert.ok(!has(pinned, "why this order:"));
		// No score columns at all rather than a column of placeholders.
		assert.deepEqual(cells(pinned, "1  sprites"), [
			"1",
			"sprites",
			"healthy",
			"unknown",
			"native",
			"always-on",
			"true",
		]);

		const priced = await capture(() =>
			mux(["routes", "--config", config, "--optimize", "cost"]),
		);
		assert.ok(has(priced, "selection    not applied -- --optimize cost is an explicit objective"));

		// One surviving lane is not an order to choose.
		const single = await capture(() =>
			mux(["routes", "--config", config, "--needs", '{"persistence":"memory-snapshot"}']),
		);
		assert.ok(has(single, "selection    not applied -- 1 lane survived the filters above"));

		const json = JSON.parse(
			(await capture(() => mux(["routes", "--config", config, "--sandbox", "sprites", "--json"]))).join(
				"\n",
			),
		) as { selection: unknown; candidates: { selectionScore: number | null }[] };
		// null, because the policy did not run. Not an empty array, and above all
		// not a score of 0 -- which would read as a lane the policy rated
		// worthless rather than one it never looked at.
		assert.equal(json.selection, null);
		assert.equal(json.candidates[0].selectionScore, null);
	});
});

test("routes with nothing credentialed still names the selection stage and exits without throwing", async () => {
	await withMux(async (box) => {
		const config = box.config({});
		const lines = await capture(() => mux(["routes", "--config", config]));
		assert.ok(has(lines, "selection    not applied -- 0 lanes survived the filters above"));
		assert.ok(has(lines, "create() would fail closed"));
	});
});

test("routes refuses a need it does not know instead of filtering on nothing", async () => {
	await withMux(async (box) => {
		const config = box.config({ providers: { e2b: "test-key" } });
		await assert.rejects(
			() => mux(["routes", "--config", config, "--needs", '{"ptty":"native"}']),
			/--needs does not know "ptty"/,
		);
		await assert.rejects(
			() => mux(["routes", "--config", config, "--needs", '{"pty":"nativve"}']),
			/--needs pty must be one of/,
		);
		await assert.rejects(
			() => mux(["routes", "--config", config, "--needs", "not json"]),
			/--needs is not valid JSON/,
		);
		await assert.rejects(
			() => mux(["routes", "--config", config, "--optimize", "latency"]),
			/--optimize only understands/,
		);
		await assert.rejects(
			() => mux(["routes", "--config", config, "--sandbox", "fly"]),
			/--sandbox wants one of/,
		);
	});
});

// ---------------------------------------------------------------------------
// am mux switch / am mux migrate -- flag validation
// ---------------------------------------------------------------------------

test("switch refuses missing or unknown flags before building a router", async () => {
	await withMux(async () => {
		await assert.rejects(() => mux(["switch", "--agent", "codex"]), /requires --name/);
		await assert.rejects(() => mux(["switch", "--name", "m"]), /requires --agent/);
		// A typo'd agent must be refused, not resolved to "no such machine
		// state" later -- the same rationale as parseAgent on `routes`.
		await assert.rejects(
			() => mux(["switch", "--name", "m", "--agent", "claud-code"]),
			/--agent wants one of/,
		);
		await assert.rejects(() => mux(["switch", "--name", "m", "--agent"]), /--agent requires a value/);
	});
});

test("migrate refuses auto, unknown substrates and bad dispositions with the fix named", async () => {
	await withMux(async () => {
		await assert.rejects(() => mux(["migrate", "--to", "sprites"]), /requires --name/);
		await assert.rejects(() => mux(["migrate", "--name", "m"]), /requires --to/);
		// "auto" is valid for --sandbox and deliberately NOT for --to: a
		// migration destroys the source by default, so the destination must
		// be the operator's decision, not a routing policy's.
		await assert.rejects(
			() => mux(["migrate", "--name", "m", "--to", "auto"]),
			/migrate wants an explicit substrate/,
		);
		await assert.rejects(() => mux(["migrate", "--name", "m", "--to", "fly"]), /--to wants one of/);
		await assert.rejects(
			() => mux(["migrate", "--name", "m", "--to", "sprites", "--source", "sometimes"]),
			/--source wants one of/,
		);
		await assert.rejects(() => mux(["migrate", "--name", "m", "--to"]), /--to requires a value/);
	});
});

// ---------------------------------------------------------------------------
// Exit codes, through the real dispatcher
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("all three commands exit 0 on a machine with no traces, no state and no keys", () => {
	const dir = mkdtempSync(join(tmpdir(), "am-mux-cli-exit-"));
	try {
		const env: Record<string, string> = {
			...process.env,
			AGENT_MACHINES_MUX_TRACES: join(dir, "traces"),
			AGENT_MACHINES_MUX_STATE: join(dir, "mux-state.json"),
		};
		for (const name of CREDENTIAL_VARS) delete env[name];
		for (const subcommand of ["stats", "health", "routes"]) {
			const run = spawnSync(
				join(REPO_ROOT, "node_modules", ".bin", "tsx"),
				["src/cli.ts", "mux", subcommand],
				{ cwd: REPO_ROOT, env, encoding: "utf8" },
			);
			assert.equal(
				run.status,
				0,
				`am mux ${subcommand} exited ${String(run.status)}: ${run.stderr}`,
			);
			assert.ok(run.stdout.length > 0, `am mux ${subcommand} printed nothing`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
