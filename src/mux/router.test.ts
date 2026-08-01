/**
 * Tests for src/mux/router.ts: routing, failover, upstream gating,
 * end-to-end streamed runs, harness installation and named-machine
 * state, all against in-memory fakes of the SandboxProvider and
 * SandboxHandle contracts.
 *
 * Run: tsx --test src/mux/router.test.ts
 *
 * router.ts statically imports the harness and provider registries,
 * whose leaf modules are built alongside this suite. The router (and
 * harness registry) are therefore imported lazily through a variable
 * specifier: when those modules are not on disk yet the tests skip
 * instead of erroring, and this file still compiles alone against the
 * fixed contract (types.ts, events.ts, config.ts, state.ts).
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { resolveMuxConfig, type MuxConfig, type MuxConfigInput } from "./config.js";
import { SubstrateHealth } from "./health.js";
import {
	SELECTION_POLICY_VERSION,
	SelectionPolicy,
	type LaneScore,
} from "./selection.js";
import type { RunTrace } from "./traces.js";
import type { MuxAgentEvent, RunResult } from "./events.js";
import {
	MuxError,
	type CreateSandboxOptions,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type HarnessAdapter,
	type HarnessKind,
	type MachineState,
	type PtyHandle,
	type PtyOptions,
	type SandboxCapabilities,
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
	type SubstrateKind,
} from "./types.js";

/** Unique suffix so parallel test runs never collide on env var names. */
const UNIQUE = `${process.pid}_${Date.now()}`;

// ---------------------------------------------------------------------------
// Isolate machine state: point state.ts at a temp file before any test runs
// so named-machine writes never touch ~/.agent-machines/mux-state.json.
//
// The trace store is redirected for the same reason plus a sharper one: the
// router's default selection policy READS it to order a route, so a suite that
// left it pointing at the home directory would rank lanes from whatever this
// developer ran yesterday and the route assertions below would pass or fail by
// accident. Tests that need their own traces still override it per test.
// ---------------------------------------------------------------------------

const previousStatePath = process.env.AGENT_MACHINES_MUX_STATE;
const stateDir = mkdtempSync(join(tmpdir(), "am-mux-router-"));
const stateFile = join(stateDir, "mux-state.json");
process.env.AGENT_MACHINES_MUX_STATE = stateFile;

const previousTracesPath = process.env.AGENT_MACHINES_MUX_TRACES;
const suiteTracesDir = mkdtempSync(join(tmpdir(), "am-mux-router-traces-"));
process.env.AGENT_MACHINES_MUX_TRACES = suiteTracesDir;

after(() => {
	if (previousStatePath === undefined) {
		delete process.env.AGENT_MACHINES_MUX_STATE;
	} else {
		process.env.AGENT_MACHINES_MUX_STATE = previousStatePath;
	}
	if (previousTracesPath === undefined) {
		delete process.env.AGENT_MACHINES_MUX_TRACES;
	} else {
		process.env.AGENT_MACHINES_MUX_TRACES = previousTracesPath;
	}
	rmSync(stateDir, { recursive: true, force: true });
	rmSync(suiteTracesDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Structural views of the router module. Declared locally (rather than
// `typeof import("./router.js")`) so this file typechecks alone even while
// the router's own harness/provider imports are still being written; the
// shapes mirror the fixed contract in router.ts.
// ---------------------------------------------------------------------------

type RouteAttemptLike = {
	substrate: SubstrateKind;
	outcome: "ok" | "skipped" | "failed";
	reason?: string;
	durationMs?: number;
	health?: "healthy" | "degraded" | "open";
	constraint?: string;
	estimatedUsd?: number;
	selectionScore?: number;
	selectionSamples?: number;
	selectionPolicy?: string;
};

type RunStreamLike = AsyncIterable<MuxAgentEvent> & {
	result(): Promise<RunResult>;
};

type MuxCreateOptionsLike = {
	agent?: HarnessKind;
	sandbox?: SubstrateKind | "auto";
	name?: string;
	model?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	install?: boolean;
};

type MuxMachineLike = {
	readonly sandbox: SandboxHandle;
	readonly harness: HarnessAdapter;
	readonly name?: string;
	readonly attempts: RouteAttemptLike[];
	readonly selection: LaneScore[];
	readonly substrate: SubstrateKind;
	readonly agent: HarnessKind;
	ensureInstalled(options?: { timeoutMs?: number; pollMs?: number }): Promise<void>;
	run(prompt: string, options?: { runKey?: string }): RunStreamLike;
	destroy(): Promise<void>;
};

type MuxLike = {
	readonly config: MuxConfig;
	registerProvider(kind: SubstrateKind, provider: SandboxProvider): void;
	routeFor(
		sandbox?: SubstrateKind | "auto",
		options?: {
			constraints?: Record<string, unknown>;
			optimize?: "cost";
			agent?: HarnessKind;
		},
	): {
		candidates: SubstrateKind[];
		skipped: RouteAttemptLike[];
		selection?: LaneScore[];
	};
	create(options?: MuxCreateOptionsLike): Promise<MuxMachineLike>;
	connect(name: string, agent?: HarnessKind): Promise<MuxMachineLike>;
	/** No-wake status read; connect() resumes on e2b and vercel. */
	describe(name: string): Promise<{ state: string; rawPhase: string | null }>;
	/** Teardown that does not resume first, reporting when it had to. */
	remove(name: string): Promise<{ removed: boolean; resumed: boolean }>;
	park(name: string): Promise<void>;
};

type MuxOptionsLike = {
	health?: SubstrateHealth;
	persistHealth?: boolean;
	selection?: SelectionPolicy | null;
};

type RouterModule = {
	createMux(config?: string | MuxConfigInput, options?: MuxOptionsLike): MuxLike;
	MuxMachine: new (input: {
		sandbox: SandboxHandle;
		harness: HarnessAdapter;
		config: MuxConfig;
		name?: string;
		model?: string;
		attempts?: RouteAttemptLike[];
	}) => MuxMachineLike;
};

type HarnessesModule = {
	getHarness(kind: HarnessKind): HarnessAdapter;
};

type Loaded<T> = { module: T | null; error?: string };

/**
 * Every mux in this suite gets its own circuit breaker and an evidence-free
 * selection policy. Without the breaker, a transient failure recorded by one
 * test opens a circuit that reorders the route in a later one. Without the
 * empty policy, a trace written by an earlier test in this file would order a
 * later test's route -- so assertions would depend on test order twice over.
 * The tests that are ABOUT selection supply their own evidence.
 */
function makeMux(router: RouterModule, config: MuxConfigInput): MuxLike {
	return router.createMux(config, {
		health: new SubstrateHealth(),
		persistHealth: false,
		selection: new SelectionPolicy({ traces: [] }),
	});
}

/** A finished run on one lane, as the trace store would have recorded it. */
let traceSequence = 0;
function laneTrace(input: {
	substrate: SubstrateKind;
	harness?: HarnessKind;
	ok?: boolean;
	firstOutputMs?: number;
}): RunTrace {
	traceSequence += 1;
	const ok = input.ok ?? true;
	const record: RunTrace = {
		runKey: `router-fixture-${traceSequence}`,
		harness: input.harness ?? "claude-code",
		substrate: input.substrate,
		attempts: [],
		startedAt: "2026-08-01T00:00:00.000Z",
		durationMs: 10_000,
		exitCode: ok ? 0 : 1,
		truncated: false,
		events: 3,
		modelCostUsd: 0.01,
	};
	if (input.firstOutputMs !== undefined) record.timeToFirstEventMs = input.firstOutputMs;
	if (!ok) record.error = "the harness exited non-zero";
	return record;
}

/**
 * Evidence that makes sprites the clearly better lane for claude-code: 20 runs
 * with every one finishing, against 20 e2b runs where only 4 did.
 */
function spritesIsBetter(): RunTrace[] {
	return [
		...Array.from({ length: 20 }, (_unused, i) =>
			laneTrace({ substrate: "e2b", ok: i < 4, firstOutputMs: 1_000 }),
		),
		...Array.from({ length: 20 }, () =>
			laneTrace({ substrate: "sprites", firstOutputMs: 2_000 }),
		),
	];
}

async function importOptional<T>(specifier: string): Promise<Loaded<T>> {
	try {
		const module = (await import(specifier)) as T;
		return { module };
	} catch (error) {
		return {
			module: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

let routerLoad: Promise<Loaded<RouterModule>> | undefined;
function loadRouter(): Promise<Loaded<RouterModule>> {
	routerLoad ??= importOptional<RouterModule>("./router.js");
	return routerLoad;
}

let harnessesLoad: Promise<Loaded<HarnessesModule>> | undefined;
function loadHarnesses(): Promise<Loaded<HarnessesModule>> {
	harnessesLoad ??= importOptional<HarnessesModule>("./harnesses/index.js");
	return harnessesLoad;
}

// ---------------------------------------------------------------------------
// In-memory fakes implementing the SandboxProvider / SandboxHandle contracts.
// ---------------------------------------------------------------------------

type ScriptedExec = { exitCode?: number; stdout?: string; stderr?: string };

const FAKE_CAPABILITIES: SandboxCapabilities = {
	pty: "none",
	persistence: "none",
	reattach: true,
	publicUrl: false,
	streamingExec: true,
	detachedWork: "reliable",
};

class FakeSandboxHandle implements SandboxHandle {
	readonly id: string;
	readonly substrate: SubstrateKind;
	readonly capabilities: SandboxCapabilities = FAKE_CAPABILITIES;
	readonly execCalls: string[] = [];
	readonly streamCalls: Array<{
		command: string;
		env?: Record<string, string>;
	}> = [];
	/** Scripted results consumed one per exec() call; default exit 0. */
	execScript: ScriptedExec[] = [];
	/** Events yielded by execStream(); default is an immediate clean exit. */
	streamScript: ExecStreamEvent[] = [{ type: "exit", exitCode: 0 }];
	destroyed = false;

	constructor(id: string, substrate: SubstrateKind) {
		this.id = id;
		this.substrate = substrate;
	}

	async exec(command: string, _options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push(command);
		// The detached-install flow polls `cat <done>` and tails the log;
		// answer those from simulated state instead of the exec script so
		// scripts stay readable.
		if (command.startsWith("cat /tmp/am-install-")) {
			return {
				stdout: this.installExitCode ?? "",
				stderr: "",
				exitCode: 0,
				durationMs: 1,
			};
		}
		if (command.startsWith("tail -c")) {
			return {
				stdout: this.installLog,
				stderr: "",
				exitCode: 0,
				durationMs: 1,
			};
		}
		const scripted = this.execScript.shift() ?? {};
		return {
			stdout: scripted.stdout ?? "",
			stderr: scripted.stderr ?? "",
			exitCode: scripted.exitCode ?? 0,
			durationMs: 1,
		};
	}

	/**
	 * Pause before the LAST scripted event. Lets a run's total duration
	 * outlast its first event by a known margin, which is the only way to
	 * prove time-to-first-output is measured at the first event.
	 */
	tailDelayMs = 0;

	async *execStream(
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		this.streamCalls.push({ command, env: options?.env });
		const last = this.streamScript.length - 1;
		for (const [index, event] of this.streamScript.entries()) {
			if (this.tailDelayMs > 0 && index === last) {
				await new Promise((resolve) => setTimeout(resolve, this.tailDelayMs));
			}
			yield event;
		}
	}

	/** Written files, keyed by path (the install script lands here). */
	readonly files = new Map<string, string>();
	/** Sentinel value the polled `cat <done>` should report. */
	installExitCode: string | null = "0";
	/** Text returned by the install log tail. */
	installLog = "";
	/** Commands passed to execBackground(). */
	readonly backgroundCalls: string[] = [];

	async execBackground(command: string): Promise<void> {
		this.backgroundCalls.push(command);
	}

	async openPty(_options?: PtyOptions): Promise<PtyHandle> {
		throw new MuxError("not_supported", "FakeSandboxHandle has no PTY");
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		this.files.set(
			path,
			typeof content === "string" ? content : new TextDecoder().decode(content),
		);
	}

	async publicUrl(_port: number): Promise<string | null> {
		return null;
	}

	async state(): Promise<MachineState> {
		return "ready";
	}

	async sleep(): Promise<void> {}

	async wake(): Promise<void> {}

	async destroy(): Promise<void> {
		this.destroyed = true;
	}
}

class FakeProvider implements SandboxProvider {
	readonly kind: SubstrateKind;
	readonly capabilities: SandboxCapabilities = FAKE_CAPABILITIES;
	/** Non-empty means ready() reports { ok: false, missing }. */
	missing: string[] = [];
	/** When set, create() throws this instead of returning a handle. */
	createError: unknown;
	/** When set, create() returns this handle instead of a fresh one. */
	handleFactory: (() => FakeSandboxHandle) | null = null;
	readyCalls = 0;
	createCalls = 0;
	readonly createOptions: Array<CreateSandboxOptions | undefined> = [];
	readonly connectCalls: string[] = [];
	lastCreated: FakeSandboxHandle | null = null;
	lastConnected: FakeSandboxHandle | null = null;

	constructor(kind: SubstrateKind) {
		this.kind = kind;
	}

	ready(): { ok: boolean; missing: string[] } {
		this.readyCalls += 1;
		return this.missing.length === 0
			? { ok: true, missing: [] }
			: { ok: false, missing: [...this.missing] };
	}

	async create(options?: CreateSandboxOptions): Promise<SandboxHandle> {
		this.createCalls += 1;
		this.createOptions.push(options);
		if (this.createError) throw this.createError;
		const handle =
			this.handleFactory?.() ??
			new FakeSandboxHandle(`${this.kind}-sbx-${this.createCalls}`, this.kind);
		this.lastCreated = handle;
		return handle;
	}

	async connect(id: string): Promise<SandboxHandle> {
		this.connectCalls.push(id);
		const handle = new FakeSandboxHandle(id, this.kind);
		this.lastConnected = handle;
		return handle;
	}

	async list(): Promise<SandboxInfo[]> {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function withEnv<T>(
	overrides: Record<string, string | undefined>,
	fn: () => T,
): T {
	const saved = new Map<string, string | undefined>();
	for (const [name, value] of Object.entries(overrides)) {
		saved.set(name, process.env[name]);
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	try {
		return fn();
	} finally {
		for (const [name, value] of saved) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

function eventsOf<K extends MuxAgentEvent["type"]>(
	events: MuxAgentEvent[],
	type: K,
): Extract<MuxAgentEvent, { type: K }>[] {
	return events.filter(
		(event): event is Extract<MuxAgentEvent, { type: K }> =>
			event.type === type,
	);
}

/**
 * cost.ts's compute arithmetic for one e2b run at the default comparison size,
 * duplicated step by step rather than by calling estimate(), so the assertion
 * is that the trace figure was derived from THIS run's duration and not merely
 * that some number showed up. $0.0504/vCPU-hour and $0.0162/GiB-hour on wall
 * clock, at 2 vCPU and 2 GiB, with no creation charged to a run.
 */
function e2bComputeUsd(durationMs: number): number {
	const hours = durationMs / 3_600_000;
	return hours * 2 * 0.0504 + 2 * hours * 0.0162;
}

const isMuxError =
	(kind: string, pattern?: RegExp) =>
	(error: unknown): boolean =>
		error instanceof MuxError &&
		error.kind === kind &&
		(pattern === undefined || pattern.test(error.message));

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test("routeFor skips uncredentialed providers and orders primary then backups", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}

	const mux = makeMux(router, {
		keys: { anthropic: "test-anthropic-key" },
		sandboxes: { primary: "e2b", backups: ["sprites", "vercel", "dedalus"] },
	});
	const sprites = new FakeProvider("sprites");
	sprites.missing = ["SPRITES_TOKEN"];
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", sprites);
	mux.registerProvider("vercel", new FakeProvider("vercel"));
	mux.registerProvider("dedalus", new FakeProvider("dedalus"));

	const route = mux.routeFor("auto");
	assert.deepEqual(route.candidates, ["e2b", "vercel", "dedalus"]);
	assert.equal(route.skipped.length, 1);
	assert.equal(route.skipped[0].substrate, "sprites");
	assert.equal(route.skipped[0].outcome, "skipped");
	assert.match(route.skipped[0].reason ?? "", /SPRITES_TOKEN/);

	// An explicit substrate bypasses the primary -> backups chain.
	assert.deepEqual(mux.routeFor("vercel").candidates, ["vercel"]);

	// Primary-first ordering follows the configured route, not kind order.
	const reordered = makeMux(router, {
		keys: { anthropic: "test-anthropic-key" },
		sandboxes: { primary: "dedalus", backups: ["vercel", "e2b"] },
	});
	reordered.registerProvider("dedalus", new FakeProvider("dedalus"));
	reordered.registerProvider("vercel", new FakeProvider("vercel"));
	reordered.registerProvider("e2b", new FakeProvider("e2b"));
	assert.deepEqual(reordered.routeFor().candidates, ["dedalus", "vercel", "e2b"]);
});

test("create() fails over from a transient primary to the backup", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}

	const mux = makeMux(router, {
		keys: { anthropic: "test-anthropic-key" },
		sandboxes: { primary: "e2b", backups: ["sprites"] },
	});
	const e2b = new FakeProvider("e2b");
	e2b.createError = new MuxError("transient", "e2b is out of capacity");
	const sprites = new FakeProvider("sprites");
	mux.registerProvider("e2b", e2b);
	mux.registerProvider("sprites", sprites);

	const machine = await mux.create({ install: false });
	assert.equal(machine.substrate, "sprites");
	assert.equal(e2b.createCalls, 1);
	assert.equal(sprites.createCalls, 1);
	assert.deepEqual(
		machine.attempts.map((a) => `${a.substrate}:${a.outcome}`),
		["e2b:failed", "sprites:ok"],
	);
	assert.match(machine.attempts[0].reason ?? "", /out of capacity/);
});

test("create() does not retry a missing_credentials error from a provider", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}

	const mux = makeMux(router, {
		keys: { anthropic: "test-anthropic-key" },
		sandboxes: { primary: "e2b", backups: ["sprites"] },
	});
	const e2b = new FakeProvider("e2b");
	e2b.createError = new MuxError(
		"missing_credentials",
		"e2b rejected the API key",
	);
	const sprites = new FakeProvider("sprites");
	mux.registerProvider("e2b", e2b);
	mux.registerProvider("sprites", sprites);

	// isRoutableError(missing_credentials) is false: the error propagates
	// immediately and the backup is never attempted.
	await assert.rejects(
		mux.create({ install: false }),
		isMuxError("missing_credentials", /rejected the API key/),
	);
	assert.equal(e2b.createCalls, 1);
	assert.equal(sprites.createCalls, 0);
});

test("create() gates on the harness upstream key before any provider call", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}

	// keys.anthropic points at an unset variable and the bare fallback is
	// cleared, so the resolved config genuinely has no anthropic key.
	const unset = `AM_TEST_UNSET_ANTHROPIC_${UNIQUE}`;
	const mux = withEnv({ ANTHROPIC_API_KEY: undefined, [unset]: undefined }, () =>
		makeMux(router, {
			keys: { anthropic: `env:${unset}` },
			sandboxes: { primary: "e2b", backups: [] },
		}),
	);
	const e2b = new FakeProvider("e2b");
	mux.registerProvider("e2b", e2b);

	await assert.rejects(
		mux.create({ agent: "claude-code", install: false }),
		isMuxError("missing_credentials", /Anthropic/i),
	);
	assert.equal(e2b.readyCalls, 0, "provider readiness must not be probed");
	assert.equal(e2b.createCalls, 0, "no sandbox may be provisioned");
});

test("machine.run() streams normalized events end-to-end", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const { module: harnesses, error: harnessError } = await loadHarnesses();
	if (!harnesses) {
		t.skip(`harnesses/index.js not importable yet (${harnessError ?? "unknown"})`);
		return;
	}

	// Claude Code stream-json wire format: system init, an assistant text
	// message, and a final result envelope. One line is split across two
	// stdout chunks (with stderr noise interleaved) to exercise reassembly.
	const initLine = JSON.stringify({
		type: "system",
		subtype: "init",
		cwd: "/workspace",
		session_id: "sess-123",
		model: "claude-sonnet-4-5",
		tools: [],
	});
	const textLine = JSON.stringify({
		type: "assistant",
		message: {
			id: "msg_01",
			type: "message",
			role: "assistant",
			model: "claude-sonnet-4-5",
			content: [{ type: "text", text: "Hello from the sandbox." }],
			stop_reason: "end_turn",
		},
		session_id: "sess-123",
	});
	const resultLine = JSON.stringify({
		type: "result",
		subtype: "success",
		is_error: false,
		duration_ms: 1200,
		duration_api_ms: 900,
		num_turns: 1,
		result: "Hello from the sandbox.",
		session_id: "sess-123",
		total_cost_usd: 0.0123,
	});

	const handle = new FakeSandboxHandle("e2b-run-1", "e2b");
	handle.streamScript = [
		{ type: "stdout", data: `${initLine}\n${textLine.slice(0, 40)}` },
		{ type: "stderr", data: "harness noise on stderr\n" },
		{ type: "stdout", data: `${textLine.slice(40)}\n` },
		{ type: "stdout", data: `${resultLine}\n` },
		{ type: "exit", exitCode: 0 },
	];
	const provider = new FakeProvider("e2b");
	provider.handleFactory = () => handle;

	const mux = makeMux(router, {
		keys: { anthropic: "test-anthropic-key" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);

	const machine = await mux.create({ agent: "claude-code", install: false });
	assert.equal(machine.substrate, "e2b");

	const stream = machine.run("say hello");
	const events: MuxAgentEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}

	assert.equal(handle.streamCalls.length, 1);
	assert.ok(handle.streamCalls[0].command.length > 0);

	const started = eventsOf(events, "started");
	assert.equal(started.length, 1, "system init should map to one started event");
	assert.equal(started[0].harness, "claude-code");

	const text = eventsOf(events, "text")
		.map((event) => event.delta)
		.join("");
	assert.ok(
		text.includes("Hello from the sandbox."),
		`assistant text should surface as text deltas, got: ${JSON.stringify(text)}`,
	);

	const results = eventsOf(events, "result");
	assert.equal(results.length, 1);
	assert.equal(results[0].text, "Hello from the sandbox.");
	assert.equal(results[0].sessionId, "sess-123");

	assert.equal(eventsOf(events, "error").length, 0);
	assert.deepEqual(events[events.length - 1], { type: "done", exitCode: 0 });

	const result = await stream.result();
	assert.equal(result.text, "Hello from the sandbox.");
	assert.equal(result.exitCode, 0);
	assert.equal(result.sessionId, "sess-123");
	assert.equal(result.substrate, "e2b");
	assert.equal(result.harness, "claude-code");
	// eventCount excludes the synthetic done event the router appends.
	assert.equal(result.events, events.length - 1);
	assert.ok(result.durationMs >= 0);
	if (result.costUsd !== undefined) {
		assert.ok(Math.abs(result.costUsd - 0.0123) < 1e-9);
	}
});

test("ensureInstalled probes, installs on a miss, and fails closed", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const { module: harnesses, error: harnessError } = await loadHarnesses();
	if (!harnesses) {
		t.skip(`harnesses/index.js not importable yet (${harnessError ?? "unknown"})`);
		return;
	}

	const harness = harnesses.getHarness("claude-code");
	const config = resolveMuxConfig({ keys: { anthropic: "test-anthropic-key" } });

	// Probe exits 0: already installed, install command never runs.
	const installed = new FakeSandboxHandle("e2b-installed", "e2b");
	installed.execScript = [{ exitCode: 0, stdout: "1.0.0" }];
	const machineA = new router.MuxMachine({ sandbox: installed, harness, config });
	await machineA.ensureInstalled();
	assert.deepEqual(installed.execCalls, [harness.isInstalledCommand()]);

	// Probe exits 1: the install script is written, detached, and polled.
	const missing = new FakeSandboxHandle("e2b-missing", "e2b");
	missing.execScript = [{ exitCode: 1 }];
	const machineB = new router.MuxMachine({ sandbox: missing, harness, config });
	await machineB.ensureInstalled({ pollMs: 1, timeoutMs: 5_000 });
	assert.equal(missing.execCalls[0], harness.isInstalledCommand());
	const script = [...missing.files.keys()].find((path) =>
		path.startsWith("/tmp/am-install-"),
	);
	assert.ok(script, "install script is written to the sandbox");
	assert.ok(
		missing.files.get(script)?.includes(harness.installCommand()),
		"script carries the harness install command",
	);
	assert.equal(missing.backgroundCalls.length, 1);
	assert.ok(
		missing.backgroundCalls[0].includes("echo $? >"),
		"background command records an exit sentinel",
	);
	assert.ok(
		missing.execCalls.some((call) => call.startsWith("cat /tmp/am-install-")),
		"install completion is polled",
	);

	// Nonzero sentinel: MuxError fatal carrying the install log tail.
	const broken = new FakeSandboxHandle("e2b-broken", "e2b");
	broken.execScript = [{ exitCode: 1 }];
	broken.installExitCode = "1";
	broken.installLog = "npm exploded";
	const machineC = new router.MuxMachine({ sandbox: broken, harness, config });
	await assert.rejects(
		machineC.ensureInstalled({ pollMs: 1, timeoutMs: 5_000 }),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "fatal" &&
			error.message.includes("npm exploded"),
	);

	// Sentinel never appears: transient, so the router can fail over.
	const stalled = new FakeSandboxHandle("e2b-stalled", "e2b");
	stalled.execScript = [{ exitCode: 1 }];
	stalled.installExitCode = null;
	const machineD = new router.MuxMachine({ sandbox: stalled, harness, config });
	await assert.rejects(
		machineD.ensureInstalled({ pollMs: 1, timeoutMs: 40 }),
		(error: unknown) => error instanceof MuxError && error.kind === "transient",
	);
});

test("named create remembers the machine and connect() reads it back", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}

	const mux = makeMux(router, {
		keys: { anthropic: "test-anthropic-key" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	const provider = new FakeProvider("e2b");
	mux.registerProvider("e2b", provider);

	const name = "router-test-worker";
	const machine = await mux.create({ name, install: false });
	assert.equal(machine.substrate, "e2b");
	assert.equal(provider.createOptions[0]?.name, name);

	// The machine landed in the temp state file, not the real home dir.
	const persisted = JSON.parse(readFileSync(stateFile, "utf8")) as {
		machines: Record<
			string,
			{ substrate: string; sandboxId: string; agent: string; updatedAt: string }
		>;
	};
	const remembered = persisted.machines[name];
	assert.ok(remembered, "state file should remember the named machine");
	assert.equal(remembered.substrate, "e2b");
	assert.equal(remembered.sandboxId, machine.sandbox.id);
	assert.equal(remembered.agent, "claude-code");
	assert.ok(remembered.updatedAt.length > 0);

	const connected = await mux.connect(name);
	assert.equal(connected.sandbox.id, machine.sandbox.id);
	assert.equal(connected.substrate, "e2b");
	assert.equal(connected.agent, "claude-code");
	assert.deepEqual(provider.connectCalls, [machine.sandbox.id]);

	// destroy() tears down the sandbox and forgets the name.
	await connected.destroy();
	assert.equal(provider.lastConnected?.destroyed, true);
	const afterDestroy = JSON.parse(readFileSync(stateFile, "utf8")) as {
		machines: Record<string, unknown>;
	};
	assert.ok(!(name in afterDestroy.machines));
	await assert.rejects(mux.connect(name), isMuxError("fatal", /No remembered machine/));
});

test("a gateway-only config routes when the gateway serves the wire format", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// This test previously asserted the opposite. The native-key-only rule
	// was wrong: OpenRouter serves an Anthropic-Messages endpoint, verified
	// live (docs/UPSTREAMS.md), so an openrouter key genuinely drives
	// claude-code. Config resolution falls back to the ambient environment,
	// so native keys are cleared to make the gateway path the only one.
	const saved = {
		anthropic: process.env.ANTHROPIC_API_KEY,
		openai: process.env.OPENAI_API_KEY,
	};
	delete process.env.ANTHROPIC_API_KEY;
	delete process.env.OPENAI_API_KEY;
	t.after(() => {
		if (saved.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = saved.anthropic;
		if (saved.openai !== undefined) process.env.OPENAI_API_KEY = saved.openai;
	});

	const provider = new FakeProvider("e2b");
	const mux = makeMux(router, {
		keys: { openrouter: "sk-or-v1-test" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);

	const machine = await mux.create({ agent: "claude-code", install: false });
	assert.equal(machine.substrate, "e2b");
	assert.equal(provider.createCalls, 1);

	// The harness must receive the gateway base URL, not a native key.
	const { env } = machine.harness.runCommand("hi", { openrouter: "sk-or-v1-test" });
	assert.equal(env.ANTHROPIC_BASE_URL, "https://openrouter.ai/api");
	assert.equal(env.ANTHROPIC_AUTH_TOKEN, "sk-or-v1-test");
});

test("a harness with no usable upstream still fails before provisioning", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const saved = {
		anthropic: process.env.ANTHROPIC_API_KEY,
		openai: process.env.OPENAI_API_KEY,
	};
	delete process.env.ANTHROPIC_API_KEY;
	delete process.env.OPENAI_API_KEY;
	t.after(() => {
		if (saved.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = saved.anthropic;
		if (saved.openai !== undefined) process.env.OPENAI_API_KEY = saved.openai;
	});

	const provider = new FakeProvider("e2b");
	const mux = makeMux(router, {
		keys: {},
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	await assert.rejects(
		mux.create({ agent: "claude-code", install: false }),
		(thrown: unknown) =>
			thrown instanceof MuxError && thrown.kind === "missing_credentials",
	);
	assert.equal(provider.createCalls, 0, "no sandbox may be provisioned");
});

// ---------------------------------------------------------------------------
// Wiring tests. The modules below have their own unit suites; these assert the
// router actually CALLS them, which is the part that was dead code before.
// ---------------------------------------------------------------------------

test("an open circuit sends a lane to the back of the route", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const health = new SubstrateHealth();
	const mux = router.createMux(
		{
			keys: { anthropic: "k" },
			sandboxes: { primary: "e2b", backups: ["sprites"] },
		},
		{ health, persistHealth: false, selection: new SelectionPolicy({ traces: [] }) },
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	assert.deepEqual(mux.routeFor().candidates, ["e2b", "sprites"]);

	// Trip e2b's breaker with transport failures.
	for (let i = 0; i < 12; i += 1) health.record("e2b", "transient", 10);
	assert.equal(health.state("e2b"), "open");
	assert.deepEqual(
		mux.routeFor().candidates,
		["sprites", "e2b"],
		"an open lane is demoted, not removed -- a global blip must not make create() impossible",
	);
});

test("a transport failure feeds the breaker but a credential failure does not", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const health = new SubstrateHealth();
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{ health, persistHealth: false, selection: new SelectionPolicy({ traces: [] }) },
	);
	const e2b = new FakeProvider("e2b");
	e2b.createError = new MuxError("transient", "e2b had a wobble");
	mux.registerProvider("e2b", e2b);
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	const machine = await mux.create({ install: false });
	assert.equal(machine.substrate, "sprites");
	assert.ok(
		health.stats("e2b").failures >= 1,
		"a transient provisioning error is a health signal",
	);

	// A credential failure says nothing about substrate health.
	const health2 = new SubstrateHealth();
	const mux2 = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: [] } },
		{
			health: health2,
			persistHealth: false,
			selection: new SelectionPolicy({ traces: [] }),
		},
	);
	const denied = new FakeProvider("e2b");
	denied.createError = new MuxError("missing_credentials", "bad key");
	mux2.registerProvider("e2b", denied);
	await assert.rejects(mux2.create({ install: false }));
	assert.equal(
		health2.stats("e2b").failures,
		0,
		"a credential error must not open a circuit",
	);
});

test("constraints skip a lane and name the dimension that failed", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "vercel", backups: ["e2b"] },
	});
	// FakeProvider declares pty: "none"; ask for a native PTY and both lanes
	// must be skipped with the reason naming the constraint.
	mux.registerProvider("vercel", new FakeProvider("vercel"));
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	const route = mux.routeFor("auto", { constraints: { pty: "native" } });
	assert.equal(route.candidates.length, 0);
	assert.ok(route.skipped.length >= 1);
	const skip = route.skipped[0];
	assert.equal(skip.outcome, "skipped");
	assert.equal(skip.constraint, "pty");
	assert.match(skip.reason ?? "", /pty/i);
});

test("a keyed run replays instead of executing the agent twice", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const { module: harnesses } = await loadHarnesses();
	if (!harnesses) {
		t.skip("harness registry not importable");
		return;
	}
	const tracesDir = mkdtempSync(join(tmpdir(), "am-mux-traces-"));
	const savedTraces = process.env.AGENT_MACHINES_MUX_TRACES;
	process.env.AGENT_MACHINES_MUX_TRACES = tracesDir;
	t.after(() => {
		if (savedTraces === undefined) delete process.env.AGENT_MACHINES_MUX_TRACES;
		else process.env.AGENT_MACHINES_MUX_TRACES = savedTraces;
		rmSync(tracesDir, { recursive: true, force: true });
	});

	const handle = new FakeSandboxHandle("e2b-idem", "e2b");
	handle.streamScript = [
		{
			type: "stdout",
			data: `${JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "once", session_id: "s1", total_cost_usd: 0.01, duration_ms: 5 })}\n`,
		},
		{ type: "exit", exitCode: 0 },
	];
	const provider = new FakeProvider("e2b");
	provider.handleFactory = () => handle;
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	const machine = await mux.create({ agent: "claude-code", install: false });

	const runKey = "job-42";
	const first = await machine.run("do it", { runKey }).result();
	assert.equal(first.text, "once");
	assert.equal(handle.streamCalls.length, 1);

	// Same key again: the stored result comes back and the agent is NOT re-run.
	const second = await machine.run("do it", { runKey }).result();
	assert.equal(second.text, "once");
	assert.equal(
		handle.streamCalls.length,
		1,
		"a replayed run must not execute the agent a second time",
	);
});

test("every run leaves a trace, keyed or not", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const dir = mkdtempSync(join(tmpdir(), "am-mux-traces2-"));
	const saved = process.env.AGENT_MACHINES_MUX_TRACES;
	process.env.AGENT_MACHINES_MUX_TRACES = dir;
	t.after(() => {
		if (saved === undefined) delete process.env.AGENT_MACHINES_MUX_TRACES;
		else process.env.AGENT_MACHINES_MUX_TRACES = saved;
		rmSync(dir, { recursive: true, force: true });
	});
	const traces = await import("./traces.js");

	const handle = new FakeSandboxHandle("e2b-trace", "e2b");
	handle.streamScript = [{ type: "exit", exitCode: 0 }];
	const provider = new FakeProvider("e2b");
	provider.handleFactory = () => handle;
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	const machine = await mux.create({ agent: "claude-code", install: false });
	await machine.run("unkeyed").result();

	const written = traces.readTraces({ limit: 10 });
	assert.equal(written.length, 1, "an unkeyed run is still observable");
	assert.equal(written[0].substrate, "e2b");
	assert.equal(written[0].harness, "claude-code");
	assert.ok(written[0].runKey.startsWith("run-claude-code-e2b-"));
	assert.ok(written[0].attempts.length >= 1, "the placement decision is recorded");
	// This stream carried no agent event at all, so there is no first output
	// and no model cost. Both stay absent; a 0 would claim an instant answer
	// and a free one.
	assert.equal(written[0].events, 0);
	assert.equal("timeToFirstEventMs" in written[0], false);
	assert.equal("modelCostUsd" in written[0], false);
	assert.equal("costUsd" in written[0], false);
});

test("a run records time to first output and both halves of its cost", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const { module: harnesses } = await loadHarnesses();
	if (!harnesses) {
		t.skip("harness registry not importable");
		return;
	}
	const dir = mkdtempSync(join(tmpdir(), "am-mux-traces3-"));
	const saved = process.env.AGENT_MACHINES_MUX_TRACES;
	process.env.AGENT_MACHINES_MUX_TRACES = dir;
	t.after(() => {
		if (saved === undefined) delete process.env.AGENT_MACHINES_MUX_TRACES;
		else process.env.AGENT_MACHINES_MUX_TRACES = saved;
		rmSync(dir, { recursive: true, force: true });
	});
	const traces = await import("./traces.js");

	const resultLine = JSON.stringify({
		type: "result",
		subtype: "success",
		is_error: false,
		result: "MUX-OK",
		session_id: "s1",
		duration_ms: 5,
		total_cost_usd: 0.0123,
	});
	const script: ExecStreamEvent[] = [
		{ type: "stdout", data: `${resultLine}\n` },
		{ type: "exit", exitCode: 0 },
	];

	// e2b: a published compute rate plus a harness that reports its spend, so
	// every field is available and the total is the sum of the two halves.
	const priced = new FakeSandboxHandle("e2b-ttfo", "e2b");
	priced.streamScript = script;
	// The run keeps going for 80ms after its first (and only) event, so a
	// number captured at the end of the stream cannot pass as first output.
	priced.tailDelayMs = 80;
	const pricedProvider = new FakeProvider("e2b");
	pricedProvider.handleFactory = () => priced;
	const pricedMux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	pricedMux.registerProvider("e2b", pricedProvider);
	const pricedMachine = await pricedMux.create({ agent: "claude-code", install: false });
	const pricedResult = await pricedMachine.run("say hello").result();

	assert.notEqual(pricedResult.timeToFirstEventMs, undefined);
	const firstOutputMs = pricedResult.timeToFirstEventMs as number;
	assert.ok(firstOutputMs >= 0, "time to first output is a real elapsed measure");
	assert.ok(
		pricedResult.durationMs - firstOutputMs >= 40,
		`first output ${firstOutputMs}ms must precede the run end ${pricedResult.durationMs}ms`,
	);

	// sprites: Fly publishes no compute rate, so the sandbox half is unknown.
	const unpriced = new FakeSandboxHandle("sprites-ttfo", "sprites");
	unpriced.streamScript = script;
	const unpricedProvider = new FakeProvider("sprites");
	unpricedProvider.handleFactory = () => unpriced;
	const unpricedMux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "sprites", backups: [] },
	});
	unpricedMux.registerProvider("sprites", unpricedProvider);
	const unpricedMachine = await unpricedMux.create({
		agent: "claude-code",
		install: false,
	});
	await unpricedMachine.run("say hello").result();

	const written = traces.readTraces({ limit: 10 });
	assert.equal(written.length, 2);
	const [e2bTrace, spritesTrace] = written;

	assert.equal(e2bTrace.substrate, "e2b");
	assert.equal(
		e2bTrace.timeToFirstEventMs,
		firstOutputMs,
		"the trace carries the same measurement the caller saw",
	);
	assert.equal(e2bTrace.modelCostUsd, 0.0123);
	assert.equal(
		e2bTrace.sandboxCostUsd,
		e2bComputeUsd(e2bTrace.durationMs),
		"sandbox cost is derived from this run's own wall clock",
	);
	assert.ok((e2bTrace.sandboxCostUsd ?? 0) > 0);
	assert.equal(e2bTrace.costUsd, (e2bTrace.sandboxCostUsd as number) + 0.0123);

	// The unpriced lane records what it knows and nothing more.
	assert.equal(spritesTrace.substrate, "sprites");
	assert.equal(spritesTrace.modelCostUsd, 0.0123);
	assert.equal("sandboxCostUsd" in spritesTrace, false);
	assert.equal(
		"costUsd" in spritesTrace,
		false,
		"a total built from the model half alone would under-report the run",
	);
	assert.notEqual(spritesTrace.timeToFirstEventMs, undefined);

	// The route table reads both back, per harness x substrate.
	const summary = traces.summarize({ limit: 10 });
	assert.deepEqual(Object.keys(summary.byRoute), [
		"claude-code@e2b",
		"claude-code@sprites",
	]);
	const e2bRoute = summary.byRoute["claude-code@e2b"];
	assert.equal(e2bRoute?.runs, 1);
	assert.equal(e2bRoute?.successRate, 1);
	assert.equal(e2bRoute?.truncationRate, 0);
	assert.equal(e2bRoute?.firstOutputP50Ms, firstOutputMs);
	assert.equal(e2bRoute?.cost.perSuccessUsd, e2bRoute?.cost.knownUsd);
	assert.equal(e2bRoute?.cost.complete, true);
	const spritesRoute = summary.byRoute["claude-code@sprites"];
	assert.equal(spritesRoute?.cost.complete, false);
	assert.deepEqual(spritesRoute?.cost.unpricedSubstrates, ["sprites"]);
	assert.equal("knownUsd" in (spritesRoute?.cost ?? {}), false);
});

// ---------------------------------------------------------------------------
// Automatic selection (roadmap 3.4). The scoring rule has its own suite in
// selection.test.ts; these assert the ROUTER consults it in the right place --
// after the filters, before health, and only for an "auto" route.
// ---------------------------------------------------------------------------

test("an auto route is ordered by the learned policy, not the config", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health: new SubstrateHealth(),
			persistHealth: false,
			selection: new SelectionPolicy({ traces: spritesIsBetter() }),
		},
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	const route = mux.routeFor("auto");
	assert.deepEqual(
		route.candidates,
		["sprites", "e2b"],
		"the configured primary loses its slot to the lane that actually finishes runs",
	);
	assert.ok(route.selection, "the ranking is returned so the route is explainable");
	assert.equal(route.selection?.[0].substrate, "sprites");
	assert.equal(route.selection?.[0].samples, 20);
	assert.equal(route.selection?.[0].ok, 20);
	assert.equal(route.selection?.[1].substrate, "e2b");
	assert.equal(route.selection?.[1].samples, 20);
	assert.equal(route.selection?.[1].ok, 4);
	assert.equal(route.selection?.length, 2, "no lane is dropped by scoring");
});

test("with no traces an auto route keeps the configured order", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// The DEFAULT policy, reading a real (empty) trace store: turning selection
	// on must not change behavior before it has evidence, or every existing
	// deployment's route would move on upgrade for no measured reason.
	const dir = mkdtempSync(join(tmpdir(), "am-mux-router-empty-"));
	const saved = process.env.AGENT_MACHINES_MUX_TRACES;
	process.env.AGENT_MACHINES_MUX_TRACES = dir;
	t.after(() => {
		if (saved === undefined) delete process.env.AGENT_MACHINES_MUX_TRACES;
		else process.env.AGENT_MACHINES_MUX_TRACES = saved;
		rmSync(dir, { recursive: true, force: true });
	});

	const mux = router.createMux(
		{
			keys: { anthropic: "k" },
			sandboxes: { primary: "dedalus", backups: ["e2b", "sprites"] },
		},
		{ health: new SubstrateHealth(), persistHealth: false },
	);
	for (const kind of ["dedalus", "e2b", "sprites"] as SubstrateKind[]) {
		mux.registerProvider(kind, new FakeProvider(kind));
	}
	const route = mux.routeFor("auto");
	assert.deepEqual(route.candidates, ["dedalus", "e2b", "sprites"]);
	assert.equal(route.selection?.length, 3);
	for (const lane of route.selection ?? []) {
		assert.equal(lane.samples, 0, "an empty store is zero evidence, not bad evidence");
	}
});

test("an explicitly pinned substrate is never reordered or scored", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const traces = spritesIsBetter();
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health: new SubstrateHealth(),
			persistHealth: false,
			selection: new SelectionPolicy({ traces }),
		},
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	// Same evidence that moves an auto route leaves a pinned one alone.
	assert.deepEqual(mux.routeFor("auto").candidates, ["sprites", "e2b"]);
	const pinned = mux.routeFor("e2b");
	assert.deepEqual(pinned.candidates, ["e2b"]);
	assert.equal(
		pinned.selection,
		undefined,
		"pinning is the escape hatch; the policy did not make this choice and must not appear to have",
	);

	// An explicit price objective is also the caller's, not the policy's.
	const cheapest = mux.routeFor("auto", { optimize: "cost" });
	assert.deepEqual(
		cheapest.candidates,
		["e2b", "sprites"],
		"cheapest-first puts the priced lane ahead of the one Fly does not publish a rate for",
	);
	assert.equal(cheapest.selection, undefined);
});

test("health still wins as the final ordering stage", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const health = new SubstrateHealth();
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health,
			persistHealth: false,
			selection: new SelectionPolicy({ traces: spritesIsBetter() }),
		},
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	assert.deepEqual(mux.routeFor("auto").candidates, ["sprites", "e2b"]);

	// A lane that is down right now goes last however good its record is:
	// health answers a more urgent question than expected value.
	for (let i = 0; i < 12; i += 1) health.record("sprites", "transient", 10);
	assert.equal(health.state("sprites"), "open");
	assert.deepEqual(mux.routeFor("auto").candidates, ["e2b", "sprites"]);
	// Demoted, not removed, and still scored -- the explanation survives.
	assert.equal(mux.routeFor("auto").selection?.[0].substrate, "sprites");
});

test("the learned order runs after the constraint filter", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// sprites is the lane the policy prefers, and it is the lane the declared
	// need eliminates. Scoring must not resurrect it: feasibility is a filter,
	// value is only an ordering over what survives.
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health: new SubstrateHealth(),
			persistHealth: false,
			selection: new SelectionPolicy({ traces: spritesIsBetter() }),
		},
	);
	const e2b = new FakeProvider("e2b");
	const sprites = new FakeProvider("sprites");
	(sprites as { capabilities: SandboxCapabilities }).capabilities = {
		...FAKE_CAPABILITIES,
		streamingExec: false,
	};
	mux.registerProvider("e2b", e2b);
	mux.registerProvider("sprites", sprites);

	const route = mux.routeFor("auto", { constraints: { streamingExec: true } });
	assert.deepEqual(route.candidates, ["e2b"]);
	assert.equal(route.skipped.length, 1);
	assert.equal(route.skipped[0].substrate, "sprites");
	assert.equal(
		route.selection,
		undefined,
		"one surviving lane is not a choice, so nothing is scored",
	);
});

test("create() records the score and sample count on every attempt it made", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health: new SubstrateHealth(),
			persistHealth: false,
			selection: new SelectionPolicy({ traces: spritesIsBetter() }),
		},
	);
	// The policy puts sprites first; it then fails over to e2b, so both lanes
	// were decided on by the policy and both attempts must say so.
	const sprites = new FakeProvider("sprites");
	sprites.createError = new MuxError("transient", "sprites had a wobble");
	mux.registerProvider("sprites", sprites);
	mux.registerProvider("e2b", new FakeProvider("e2b"));

	const machine = await mux.create({ install: false });
	assert.equal(machine.substrate, "e2b");
	assert.deepEqual(
		machine.attempts.map((a) => `${a.substrate}:${a.outcome}`),
		["sprites:failed", "e2b:ok"],
	);
	for (const attempt of machine.attempts) {
		assert.equal(typeof attempt.selectionScore, "number", attempt.substrate);
		assert.equal(attempt.selectionSamples, 20, attempt.substrate);
		assert.equal(attempt.selectionPolicy, SELECTION_POLICY_VERSION);
	}
	const [failed, chosen] = machine.attempts;
	assert.ok(
		(failed.selectionScore as number) > (chosen.selectionScore as number),
		"the recorded scores explain why the loser was tried first",
	);
	// The full breakdown hangs off the machine, so the arithmetic is inspectable.
	assert.equal(machine.selection.length, 2);
	assert.equal(machine.selection[0].substrate, "sprites");
	assert.ok(machine.selection[0].terms.success > machine.selection[1].terms.success);
});

test("a pinned create() carries no selection annotation at all", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health: new SubstrateHealth(),
			persistHealth: false,
			selection: new SelectionPolicy({ traces: spritesIsBetter() }),
		},
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	const machine = await mux.create({ sandbox: "e2b", install: false });
	assert.equal(machine.substrate, "e2b");
	assert.deepEqual(machine.selection, []);
	const attempt = machine.attempts.find((a) => a.outcome === "ok");
	assert.ok(attempt);
	assert.equal(attempt?.selectionScore, undefined);
	assert.equal(attempt?.selectionSamples, undefined);
	assert.equal(attempt?.selectionPolicy, undefined);
});

test("a lane is scored for the harness being run, not the configured default", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// All the evidence is claude-code's. Routing codex must not inherit it:
	// hermes on E2B is the live counterexample (docs/MUX-RESULTS.md finding 10).
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{
			health: new SubstrateHealth(),
			persistHealth: false,
			selection: new SelectionPolicy({ traces: spritesIsBetter() }),
		},
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	assert.deepEqual(mux.routeFor("auto", { agent: "claude-code" }).candidates, [
		"sprites",
		"e2b",
	]);
	const other = mux.routeFor("auto", { agent: "codex" });
	assert.deepEqual(other.candidates, ["e2b", "sprites"]);
	for (const lane of other.selection ?? []) {
		assert.equal(lane.harness, "codex");
		assert.equal(lane.samples, 0);
	}
});

test("a selection policy that throws costs the ordering, never the create", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// A corrupt or unreadable trace store is an observability failure. Routing
	// has to degrade to the configured order rather than refuse to place work.
	const broken = new SelectionPolicy({
		traces: () => {
			throw new Error("trace store is unreadable");
		},
	});
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{ health: new SubstrateHealth(), persistHealth: false, selection: broken },
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));

	const route = mux.routeFor("auto");
	assert.deepEqual(route.candidates, ["e2b", "sprites"]);
	assert.equal(route.selection, undefined);
	const machine = await mux.create({ install: false });
	assert.equal(machine.substrate, "e2b");
});

test("selection can be turned off entirely", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const mux = router.createMux(
		{ keys: { anthropic: "k" }, sandboxes: { primary: "e2b", backups: ["sprites"] } },
		{ health: new SubstrateHealth(), persistHealth: false, selection: null },
	);
	mux.registerProvider("e2b", new FakeProvider("e2b"));
	mux.registerProvider("sprites", new FakeProvider("sprites"));
	const route = mux.routeFor("auto");
	assert.deepEqual(route.candidates, ["e2b", "sprites"]);
	assert.equal(route.selection, undefined);
});

test("a substrate that throttles detached work installs in the foreground", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// Detaching is a workaround for request budgets, not a goal. On Sprites a
	// detached install is throttled so badly it never finishes, so that lane
	// must run the install on the open connection instead.
	const handle = new FakeSandboxHandle("sprites-fg", "sprites");
	(handle as { capabilities: { detachedWork: string } }).capabilities = {
		...handle.capabilities,
		detachedWork: "throttled",
	};
	handle.execScript = [{ exitCode: 1 }, { exitCode: 0 }]; // probe miss, then install
	const provider = new FakeProvider("sprites");
	provider.handleFactory = () => handle;
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "sprites", backups: [] },
	});
	mux.registerProvider("sprites", provider);

	const machine = await mux.create({ agent: "claude-code", install: false });
	await machine.ensureInstalled();

	assert.ok(
		!handle.execCalls.some((call) => call.includes("am-install-")),
		"a throttled substrate must not use the detach-and-poll sentinel path",
	);
	assert.equal(handle.files.size, 0, "no install script is staged");
});

// ---------------------------------------------------------------------------
// No-wake lifecycle. connect() resumes on e2b and vercel, so anything that
// only needs to READ or DESTROY must not go through it -- a parked sandbox
// woken just to be looked at is billed, and one whose snapshot cannot resume
// becomes undestroyable (POSTMORTEM-2026-05-18 item 5).
// ---------------------------------------------------------------------------

test("describe() reads status without connecting", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const provider = new FakeProvider("e2b");
	let described: string | null = null;
	(provider as unknown as { describe: (id: string) => Promise<unknown> }).describe = async (
		id,
	) => {
		described = id;
		return { state: "sleeping", rawPhase: "paused" };
	};
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	const machine = await mux.create({ agent: "claude-code", name: "parked", install: false });
	const createdId = machine.sandbox.id;
	const connectsBefore = provider.connectCalls.length;

	const info = await mux.describe("parked");
	assert.equal(info.state, "sleeping");
	assert.equal(described, createdId);
	assert.equal(
		provider.connectCalls.length,
		connectsBefore,
		"reading status must not connect -- connect resumes on e2b and vercel",
	);
});

test("describe() refuses rather than resuming when a substrate cannot read no-wake", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// FakeProvider has no describe(): the honest answer is not_supported, not a
	// silent resume behind the caller's back.
	const provider = new FakeProvider("e2b");
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	await mux.create({ agent: "claude-code", name: "opaque", install: false });
	const connectsBefore = provider.connectCalls.length;

	await assert.rejects(
		mux.describe("opaque"),
		(thrown: unknown) =>
			thrown instanceof MuxError && thrown.kind === "not_supported",
	);
	assert.equal(provider.connectCalls.length, connectsBefore, "and it must not connect anyway");
});

test("remove() destroys without resuming, and forgets either way", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	const provider = new FakeProvider("e2b");
	let removed: string | null = null;
	(provider as unknown as { remove: (id: string) => Promise<void> }).remove = async (id) => {
		removed = id;
	};
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	const doomed = await mux.create({ agent: "claude-code", name: "doomed", install: false });
	const createdId = doomed.sandbox.id;
	const connectsBefore = provider.connectCalls.length;

	const outcome = await mux.remove("doomed");
	assert.deepEqual(outcome, { removed: true, resumed: false });
	assert.equal(removed, createdId);
	assert.equal(provider.connectCalls.length, connectsBefore, "teardown must not resume first");

	const traces = await import("./state.js");
	assert.equal(
		traces.readMuxState().machines.doomed,
		undefined,
		"the placement is forgotten so a reaped sandbox cannot leave a permanent entry",
	);
});

test("remove() reports when it had to resume because the substrate offers no no-wake path", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// No remove() on this provider, so the fallback runs -- and must SAY that a
	// paid resume happened rather than hiding it.
	const provider = new FakeProvider("e2b");
	const mux = makeMux(router, {
		keys: { anthropic: "k" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	await mux.create({ agent: "claude-code", name: "legacy", install: false });

	const outcome = await mux.remove("legacy");
	assert.deepEqual(outcome, { removed: true, resumed: true });
	assert.ok(provider.connectCalls.length > 0, "the fallback is the resuming path");
});
