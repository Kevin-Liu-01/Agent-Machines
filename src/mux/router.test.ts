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
// ---------------------------------------------------------------------------

const previousStatePath = process.env.AGENT_MACHINES_MUX_STATE;
const stateDir = mkdtempSync(join(tmpdir(), "am-mux-router-"));
const stateFile = join(stateDir, "mux-state.json");
process.env.AGENT_MACHINES_MUX_STATE = stateFile;

after(() => {
	if (previousStatePath === undefined) {
		delete process.env.AGENT_MACHINES_MUX_STATE;
	} else {
		process.env.AGENT_MACHINES_MUX_STATE = previousStatePath;
	}
	rmSync(stateDir, { recursive: true, force: true });
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
	readonly substrate: SubstrateKind;
	readonly agent: HarnessKind;
	ensureInstalled(options?: { timeoutMs?: number; pollMs?: number }): Promise<void>;
	run(prompt: string): RunStreamLike;
	destroy(): Promise<void>;
};

type MuxLike = {
	readonly config: MuxConfig;
	registerProvider(kind: SubstrateKind, provider: SandboxProvider): void;
	routeFor(sandbox?: SubstrateKind | "auto"): {
		candidates: SubstrateKind[];
		skipped: RouteAttemptLike[];
	};
	create(options?: MuxCreateOptionsLike): Promise<MuxMachineLike>;
	connect(name: string, agent?: HarnessKind): Promise<MuxMachineLike>;
};

type RouterModule = {
	createMux(config?: string | MuxConfigInput): MuxLike;
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

	async *execStream(
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		this.streamCalls.push({ command, env: options?.env });
		for (const event of this.streamScript) {
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

	const mux = router.createMux({
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
	const reordered = router.createMux({
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

	const mux = router.createMux({
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

	const mux = router.createMux({
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
		router.createMux({
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

	const mux = router.createMux({
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

	const mux = router.createMux({
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

test("a gateway-only config cannot satisfy a harness that needs a native key", async (t) => {
	const { module: router, error } = await loadRouter();
	if (!router) {
		t.skip(`router.js not importable yet (${error ?? "unknown"})`);
		return;
	}
	// openclaw/hermes declare requiredUpstream "any", but the adapters only
	// inject ANTHROPIC_API_KEY / OPENAI_API_KEY, so a gateway key alone is
	// not usable and must be rejected before a sandbox is provisioned.
	//
	// Config resolution falls back to the ambient environment, so a
	// developer machine with real keys exported would otherwise satisfy the
	// gate and hide the regression. Clear them for this test only.
	const savedAnthropic = process.env.ANTHROPIC_API_KEY;
	const savedOpenai = process.env.OPENAI_API_KEY;
	delete process.env.ANTHROPIC_API_KEY;
	delete process.env.OPENAI_API_KEY;
	t.after(() => {
		if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
		if (savedOpenai !== undefined) process.env.OPENAI_API_KEY = savedOpenai;
	});

	const provider = new FakeProvider("e2b");
	const mux = router.createMux({
		keys: { aiGateway: "vck_gateway_only" },
		sandboxes: { primary: "e2b", backups: [] },
	});
	mux.registerProvider("e2b", provider);
	await assert.rejects(
		mux.create({ agent: "openclaw", install: false }),
		(thrown: unknown) =>
			thrown instanceof MuxError &&
			thrown.kind === "missing_credentials" &&
			/native Anthropic or OpenAI key/.test(thrown.message),
	);
	assert.equal(provider.createCalls, 0, "no sandbox may be provisioned");
});
