/**
 * switchAgent/migrate ordering against an ASYNCHRONOUS placement store.
 *
 * The correctness property both operations sell is a POINT OF NO RETURN:
 * the placement is written only after the new harness (or the new sandbox's
 * restored load) has been verified, and the old sandbox is touched
 * destructively only after the placement write LANDED. Everything before
 * that point must leave the original placement byte-identical and the
 * original sandbox addressable.
 *
 * The store fake resolves on a LATER MACROTASK (`setTimeout`, not
 * `Promise.resolve`) -- the src/mux/state-async.test.ts idiom, for the same
 * reason: a microtask-only fake passes even when the router awaits nothing,
 * because the microtask queue drains before the caller's next `await`, so
 * the test would prove nothing about the code under test. With a macrotask
 * fake, a dropped `await` on the commit write is visible twice over: the
 * machines map is stale when the call resolves, and the op-trace shows the
 * source teardown starting before the commit landed.
 *
 * Provider and store operations are pushed into ONE shared op log, because
 * the property under test is CROSS-plane ordering (store commit vs sandbox
 * teardown), which neither log alone can show.
 *
 * Run: npx tsx --test src/mux/switch-migrate-async.test.ts
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import type { MuxConfigInput } from "./config.js";
import { SubstrateHealth, type SubstrateHealthSnapshot } from "./health.js";
import { SelectionPolicy } from "./selection.js";
import { createMux, type Mux } from "./router.js";
import {
	setPlacementStore,
	type MachinePlacement,
	type MuxState,
	type PlacementStore,
} from "./state.js";
import { LOST_ALWAYS, MIGRATION_MARKER_PATH, MOVE_ALLOWLIST } from "./statemove.js";
import {
	MuxError,
	type ExecOptions,
	type ExecResult,
	type SandboxProvider,
	type SubstrateKind,
} from "./types.js";

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

// The local placement store must not be reachable, and migrate's claim
// registry (traces.ts) writes real files -- both get a private temp home.
const previousEnv = new Map<string, string | undefined>();
for (const name of [
	"AGENT_MACHINES_MUX_STATE",
	"AGENT_MACHINES_MUX_TRACES",
	// Upstream keys are deleted so requireUpstream is driven ONLY by the
	// config object below: with a developer's real ANTHROPIC_API_KEY
	// exported, the missing-upstream test would depend on whose laptop ran
	// the suite.
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"AI_GATEWAY_API_KEY",
	"AI_GATEWAY_KEY",
	"OPENROUTER_API_KEY",
]) {
	previousEnv.set(name, process.env[name]);
	delete process.env[name];
}
const isolationDir = mkdtempSync(join(tmpdir(), "am-mux-switch-migrate-"));
process.env.AGENT_MACHINES_MUX_STATE = join(isolationDir, "mux-state.json");
process.env.AGENT_MACHINES_MUX_TRACES = join(isolationDir, "traces");

after(() => {
	setPlacementStore(null);
	for (const [name, value] of previousEnv) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	rmSync(isolationDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The async store (macrotask idiom of state-async.test.ts) + shared op log
// ---------------------------------------------------------------------------

/** Resolve on a later macrotask, so an unawaited promise is observable. */
function later<T>(value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), 0));
}

class AsyncStore implements PlacementStore {
	readonly kind = "test-async";
	readonly synchronous = false;
	machines: Record<string, MachinePlacement & { updatedAt: string }> = {};
	health: SubstrateHealthSnapshot | undefined;
	readonly calls: string[] = [];
	readonly trace: string[] = [];
	pending = 0;
	/** Reject the next remember(), for the commit-write-fails paths. */
	failNextRemember = false;

	constructor(private readonly ops: string[]) {}

	private async settle<T>(op: string, value: T): Promise<T> {
		this.pending += 1;
		this.trace.push(`start:${op}`);
		try {
			return await later(value);
		} finally {
			this.pending -= 1;
			this.trace.push(`end:${op}`);
		}
	}

	async read(): Promise<MuxState> {
		this.calls.push("read");
		return this.settle("read", { machines: { ...this.machines } });
	}

	async remember(name: string, placement: MachinePlacement): Promise<void> {
		this.calls.push(`remember:${name}`);
		await this.settle(`remember:${name}`, null);
		if (this.failNextRemember) {
			this.failNextRemember = false;
			// The per-key upsert refused atomically: nothing was written.
			throw new MuxError("transient", "store write refused");
		}
		this.machines[name] = { ...placement, updatedAt: "2026-08-03T12:00:00.000Z" };
		// Pushed AFTER the write landed: the ordering assertions care about
		// when the commit is durable, not when it was requested.
		this.ops.push(`store:remembered:${name}:${placement.substrate}:${placement.sandboxId}:${placement.agent}`);
	}

	async forget(name: string): Promise<void> {
		this.calls.push(`forget:${name}`);
		await this.settle(`forget:${name}`, null);
		delete this.machines[name];
		this.ops.push(`store:forgot:${name}`);
	}

	async saveHealth(snapshot: SubstrateHealthSnapshot): Promise<void> {
		this.calls.push("saveHealth");
		await this.settle("saveHealth", null);
		this.health = snapshot;
	}
}

/** Same invariant as state-async.test.ts: serial store ops, none in flight. */
function assertStoreSerial(store: AsyncStore, where: string): void {
	assert.equal(store.pending, 0, `${where} resolved with a store write still in flight`);
	for (let index = 0; index < store.trace.length; index += 2) {
		const started = store.trace[index];
		const ended = store.trace[index + 1];
		assert.ok(started?.startsWith("start:"), `${where}: overlapping store ops ${store.trace.join(" ")}`);
		assert.equal(
			ended,
			`end:${started.slice("start:".length)}`,
			`${where}: a store op was not awaited -- ${store.trace.join(" ")}`,
		);
	}
}

// ---------------------------------------------------------------------------
// The world: scriptable sandboxes and providers over one op log
// ---------------------------------------------------------------------------

type FailPoint =
	| "provision"
	| "connect"
	| "installMiss" // isInstalled probe reports absent (install must run)
	| "installFail" // ...and the install itself fails
	| "verifyProbe"
	| "export"
	| "sha"
	| "restore"
	| "marker";

type World = {
	ops: string[];
	destroyed: string[];
	marker: string | null;
	restored: boolean;
	tar: Buffer;
	/** Allowlist entries the source reports absent (exercises `skipped`). */
	absent: Set<string>;
	fail: Partial<Record<FailPoint, boolean>>;
};

function fixtureTar(size = 700_003): Buffer {
	const bytes = Buffer.alloc(size);
	for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
	return bytes;
}

function makeWorld(): World {
	return {
		ops: [],
		destroyed: [],
		marker: null,
		restored: false,
		tar: fixtureTar(),
		absent: new Set([".agent-machines/chats"]),
		fail: {},
	};
}

function ok(stdout = ""): ExecResult {
	return { stdout, stderr: "", exitCode: 0, durationMs: 1 };
}

function bad(exitCode: number, stderr: string): ExecResult {
	return { stdout: "", stderr, exitCode, durationMs: 1 };
}

class StubHandle {
	readonly writes: Array<{ path: string; content: string }> = [];
	readonly backgrounds: string[] = [];
	readonly capabilities: {
		persistence: string;
		pty: string;
		reattach: boolean;
		publicUrl: boolean;
		streamingExec: boolean;
		detachedWork: "reliable" | "throttled";
	};

	constructor(
		readonly id: string,
		readonly substrate: SubstrateKind,
		readonly world: World,
		detachedWork: "reliable" | "throttled",
	) {
		this.capabilities = {
			persistence: "always-on",
			pty: "tmux",
			reattach: true,
			publicUrl: false,
			streamingExec: false,
			detachedWork,
		};
	}

	async exec(command: string, _options?: ExecOptions): Promise<ExecResult> {
		const { world } = this;
		// Harness installs (package markers are checked before `command -v`,
		// because an install command legitimately contains probes of its own).
		if (
			command.includes("@anthropic-ai/claude-code@") ||
			command.includes("@openai/codex@") ||
			command.includes("openclaw@")
		) {
			world.ops.push(`install:${this.id}`);
			return world.fail.installFail ? bad(1, "install boom") : ok();
		}
		if (/command -v (claude|codex|openclaw)/.test(command)) {
			world.ops.push(`install-probe:${this.id}`);
			return world.fail.installMiss ? bad(1, "") : ok();
		}
		if (/\b(claude|codex|openclaw|hermes) --version/.test(command)) {
			world.ops.push(`probe:${this.id}`);
			return world.fail.verifyProbe ? bad(1, "harness exploded on startup") : ok("0.0.0-test");
		}
		if (command.includes("AM_MOVE_HOME")) return ok("AM_MOVE_HOME:/home/user:");
		if (command.includes(MIGRATION_MARKER_PATH) && command.includes("base64 -d")) {
			const payload = /printf '%s' '([A-Za-z0-9+/=]+)'/.exec(command)?.[1] ?? "";
			world.marker = Buffer.from(payload, "base64").toString("utf8");
			world.ops.push("marker-write");
			return ok();
		}
		if (command.startsWith("for p in ")) {
			const paths = [...command.matchAll(/'([^']+)'/g)].map((match) => match[1]);
			return ok(
				paths
					.map((path) => `AM_MOVE ${world.absent.has(path) ? "A" : "P"} ${path}`)
					.join("\n"),
			);
		}
		if (command.startsWith(`tar -C "$HOME" -czf`)) {
			world.ops.push("export");
			return world.fail.export ? bad(1, "tar: boom") : ok();
		}
		if (command.startsWith("stat -c %s ")) return ok(`${world.tar.length}\n`);
		if (command.startsWith("sha256sum ")) {
			const digest = world.fail.sha
				? "0".repeat(64)
				: createHash("sha256").update(world.tar).digest("hex");
			return ok(`${digest}  /tmp/t.tgz\n`);
		}
		if (command.startsWith("dd if=")) {
			const skip = Number(/skip=(\d+)/.exec(command)?.[1]);
			const bs = Number(/bs=(\d+)/.exec(command)?.[1]);
			const count = Number(/count=(\d+)/.exec(command)?.[1]);
			return ok(this.world.tar.subarray(skip * bs, skip * bs + count * bs).toString("base64"));
		}
		if (command.startsWith("rm -f ")) return ok();
		if (command.includes(`tar -C "$HOME" -xzf`)) {
			world.ops.push("restore");
			if (world.fail.restore) return bad(1, "restore boom");
			world.restored = true;
			return ok("AM_MOVE_RESTORED\n");
		}
		if (command === `cat "$HOME/${MIGRATION_MARKER_PATH}"`) {
			if (!world.restored || world.marker === null) return bad(1, "No such file");
			if (world.fail.marker) {
				// A stale marker from an earlier migration: same name, other nonce.
				const parsed = JSON.parse(world.marker) as Record<string, unknown>;
				return ok(JSON.stringify({ ...parsed, nonce: "stale-nonce" }));
			}
			return ok(world.marker);
		}
		// Detached-install plumbing (the reliable-lane path).
		if (command.startsWith("cat /tmp/am-install-")) return ok("0\n");
		if (command.includes("tail -c 800")) return ok("");
		throw new Error(`StubHandle has no dispatch for: ${command.slice(0, 120)}`);
	}

	async *execStream(): AsyncGenerator<never, void, void> {
		throw new MuxError("not_supported", "no execStream in this stub");
	}

	async execBackground(command: string): Promise<void> {
		this.backgrounds.push(command);
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		this.writes.push({ path, content: content.toString() });
	}

	async openPty(): Promise<never> {
		throw new MuxError("not_supported", "no pty in this stub");
	}

	async keepAlive(): Promise<void> {}
	async publicUrl(): Promise<null> {
		return null;
	}
	async state(): Promise<string> {
		return "ready";
	}
	async sleep(): Promise<void> {}
	async wake(): Promise<void> {}

	async destroy(): Promise<void> {
		this.world.destroyed.push(this.id);
		this.world.ops.push(`destroy:${this.id}`);
	}
}

type ProviderOptions = {
	missing?: string[];
	detachedWork?: "reliable" | "throttled";
	/** State describe() reports; omit the member entirely with `noDescribe`. */
	describeState?: string;
	noDescribe?: boolean;
	hasPark?: boolean;
	/** remove() throws this instead of removing. */
	removeError?: MuxError;
};

function stubProvider(kind: SubstrateKind, world: World, options: ProviderOptions = {}) {
	const removed: string[] = [];
	const parked: string[] = [];
	const handles: StubHandle[] = [];
	const detachedWork = options.detachedWork ?? "throttled";
	const provider = {
		kind,
		capabilities: {
			persistence: "always-on",
			pty: "tmux",
			reattach: true,
			publicUrl: false,
			streamingExec: false,
			detachedWork,
		},
		removed,
		parked,
		handles,
		ready: () =>
			options.missing ? { ok: false, missing: options.missing } : { ok: true, missing: [] },
		create: async () => {
			world.ops.push(`provision:${kind}`);
			if (world.fail.provision) throw new MuxError("transient", "provision boom");
			const handle = new StubHandle(`${kind}-new-1`, kind, world, detachedWork);
			handles.push(handle);
			return handle;
		},
		connect: async (id: string) => {
			world.ops.push(`connect:${kind}:${id}`);
			if (world.fail.connect) throw new MuxError("transient", "connect boom");
			const handle = new StubHandle(id, kind, world, detachedWork);
			handles.push(handle);
			return handle;
		},
		list: async () => [],
		describe: options.noDescribe
			? undefined
			: async () => ({ state: options.describeState ?? "ready", rawPhase: "stub" }),
		remove: async (id: string) => {
			world.ops.push(`remove:${id}`);
			if (options.removeError) throw options.removeError;
			removed.push(id);
		},
		park: options.hasPark
			? async (id: string) => {
					world.ops.push(`park:${id}`);
					parked.push(id);
				}
			: undefined,
	};
	return provider;
}

// ---------------------------------------------------------------------------
// Fixture wiring
// ---------------------------------------------------------------------------

const CONFIG: MuxConfigInput = {
	// Explicit key so requireUpstream is hermetic (env keys are deleted
	// above). claude-code and openclaw are drivable; codex is NOT -- which is
	// what the missing-upstream test relies on.
	keys: { anthropic: "test-anthropic-key" },
	sandboxes: { primary: "e2b", backups: ["sprites"] },
};

const ORIGINAL = {
	substrate: "e2b" as SubstrateKind,
	sandboxId: "e2b-old-1",
	agent: "claude-code" as const,
	updatedAt: "2026-08-01T00:00:00.000Z",
};

let store: AsyncStore;

function setup(options: { source?: ProviderOptions; target?: ProviderOptions } = {}): {
	mux: Mux;
	world: World;
	source: ReturnType<typeof stubProvider>;
	target: ReturnType<typeof stubProvider>;
} {
	const world = makeWorld();
	store = new AsyncStore(world.ops);
	store.machines.alpha = { ...ORIGINAL };
	setPlacementStore(store);
	const mux = createMux(CONFIG, {
		// Injected breaker + no persistence: health samples from one test must
		// not reorder another test's pinned route or add store traffic the
		// ordering assertions would have to skip over.
		health: new SubstrateHealth(),
		persistHealth: false,
		selection: new SelectionPolicy({ traces: [] }),
	});
	const source = stubProvider("e2b", world, options.source);
	const target = stubProvider("sprites", world, options.target);
	mux.registerProvider("e2b", source as unknown as SandboxProvider);
	mux.registerProvider("sprites", target as unknown as SandboxProvider);
	return { mux, world, source, target };
}

/** Assert `sequence` appears in ops in order (prefix match per entry). */
function assertOrder(ops: string[], sequence: string[]): void {
	let cursor = -1;
	for (const needle of sequence) {
		const at = ops.findIndex(
			(op, index) => index > cursor && (op === needle || op.startsWith(needle)),
		);
		assert.ok(
			at > cursor,
			`expected "${needle}" after position ${cursor} in ops:\n  ${ops.join("\n  ")}`,
		);
		cursor = at;
	}
}

// ---------------------------------------------------------------------------
// switchAgent
// ---------------------------------------------------------------------------

test("switchAgent installs on a miss (foreground on a throttled lane), probes, and persists only after the probe", async () => {
	const { mux, world, source } = setup();
	world.fail.installMiss = true;
	const report = await mux.switchAgent("alpha", "openclaw");

	// The point-of-no-return ordering: the placement write lands strictly
	// after the harness answered its version probe.
	assertOrder(world.ops, [
		"connect:e2b:e2b-old-1",
		"install-probe:e2b-old-1",
		"install:e2b-old-1",
		"probe:e2b-old-1",
		"store:remembered:alpha:e2b:e2b-old-1:openclaw",
	]);
	// The sprites foreground-install trap: a throttled lane must never get a
	// detached install (measured 2026-08-01: 17s foreground vs >15min detached).
	assert.equal(source.handles[0].backgrounds.length, 0, "throttled lane got a detached install");
	assert.deepEqual(store.machines.alpha, {
		substrate: "e2b",
		sandboxId: "e2b-old-1",
		agent: "openclaw",
		updatedAt: "2026-08-03T12:00:00.000Z",
	});
	assert.equal(report.changed, true);
	assert.equal(report.installed, true);
	assert.equal(report.from, "claude-code");
	assert.equal(report.to, "openclaw");
	assert.match(report.probe.command, /--version/);
	assert.deepEqual(world.destroyed, [], "a switch never destroys anything");
	assertStoreSerial(store, "switchAgent()");
});

test("switchAgent fast path: an already-installed harness flips the placement without installing", async () => {
	const { mux, world } = setup();
	const report = await mux.switchAgent("alpha", "openclaw");
	assert.equal(report.installed, false, "the probe passed; nothing installed");
	assert.ok(!world.ops.some((op) => op.startsWith("install:")), "no install ran");
	// Still probed: install-fast-path without an answering harness must not persist.
	assert.ok(world.ops.some((op) => op.startsWith("probe:")));
	assert.equal(store.machines.alpha.agent, "openclaw");
});

test("switchAgent on the reliable lane drives the detached install path with the caller's poll cadence", async () => {
	const { mux, world, source } = setup({ source: { detachedWork: "reliable" } });
	world.fail.installMiss = true;
	const report = await mux.switchAgent("alpha", "openclaw", { pollMs: 1, timeoutMs: 5_000 });
	assert.equal(report.installed, true);
	assert.equal(source.handles[0].backgrounds.length, 1, "reliable lanes install detached");
	assert.equal(store.machines.alpha.agent, "openclaw");
});

test("switchAgent to the current agent probes, resolves changed:false, and writes nothing", async () => {
	const { mux, world } = setup();
	const report = await mux.switchAgent("alpha", "claude-code");
	assert.equal(report.changed, false);
	assert.ok(world.ops.some((op) => op.startsWith("probe:")), "the no-op is still probed");
	assert.ok(!store.calls.some((call) => call.startsWith("remember:")), "no store write");
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
});

test("switchAgent install failure leaves the placement byte-identical", async () => {
	const { mux, world } = setup();
	world.fail.installMiss = true;
	world.fail.installFail = true;
	await assert.rejects(
		() => mux.switchAgent("alpha", "openclaw"),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /install failed/);
			assert.match(error.message, /install boom/, "carries the real cause");
			return true;
		},
	);
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
	assert.ok(!store.calls.some((call) => call.startsWith("remember:")), "zero remember calls");
});

test("switchAgent probe failure never persists an install that does not answer", async () => {
	const { mux, world } = setup();
	world.fail.verifyProbe = true;
	await assert.rejects(
		() => mux.switchAgent("alpha", "openclaw"),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /installed but does not answer/);
			return true;
		},
	);
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
	assert.ok(!store.calls.some((call) => call.startsWith("remember:")));
});

test("switchAgent connect failure keeps the placement (the substrate is the staleness authority)", async () => {
	const { mux, world } = setup();
	world.fail.connect = true;
	await assert.rejects(() => mux.switchAgent("alpha", "openclaw"), /connect boom/);
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
});

test("switchAgent with no drivable upstream rejects BEFORE any provider call -- no wake, no billing", async () => {
	const { mux, world } = setup();
	// codex needs an OpenAI-shaped key; the config holds only anthropic.
	await assert.rejects(
		() => mux.switchAgent("alpha", "codex"),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "missing_credentials");
			assert.match(error.message, /OPENAI_API_KEY/);
			return true;
		},
	);
	assert.deepEqual(world.ops, [], "the provider was never touched -- the sandbox stayed parked");
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
});

test("switchAgent store-write failure after a good probe propagates and changes nothing", async () => {
	const { mux, world } = setup();
	store.failNextRemember = true;
	await assert.rejects(() => mux.switchAgent("alpha", "openclaw"), /store write refused/);
	// The probe DID pass -- but the per-key upsert refused atomically, so the
	// placement still names the old agent. The installed new harness is
	// harmless; a retry hits the fast path and just flips the record.
	assert.ok(world.ops.some((op) => op.startsWith("probe:")));
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
});

test("switchAgent reports woke from describe(), and unknown where the substrate has none", async () => {
	{
		const { mux } = setup({ source: { describeState: "sleeping" } });
		assert.equal((await mux.switchAgent("alpha", "openclaw")).woke, true);
	}
	{
		const { mux } = setup({ source: { describeState: "ready" } });
		assert.equal((await mux.switchAgent("alpha", "openclaw")).woke, false);
	}
	{
		// No describe on the provider: "unknown", never invented.
		const { mux } = setup({ source: { noDescribe: true } });
		assert.equal((await mux.switchAgent("alpha", "openclaw")).woke, "unknown");
	}
});

test("switchAgent on an unknown name throws with zero provider calls", async () => {
	const { mux, world } = setup();
	await assert.rejects(
		() => mux.switchAgent("ghost", "openclaw"),
		/No remembered machine named "ghost"/,
	);
	assert.deepEqual(world.ops, []);
});

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------

test("migrate runs provision -> install -> export -> restore -> verify -> remember -> remove, in that order", async () => {
	const { mux, world, target } = setup();
	const steps: string[] = [];
	const report = await mux.migrate("alpha", {
		to: "sprites",
		onProgress: (step) => steps.push(step.step),
	});

	assertOrder(world.ops, [
		"provision:sprites",
		"install-probe:sprites-new-1",
		"connect:e2b:e2b-old-1",
		"marker-write",
		"export",
		"restore",
		"probe:sprites-new-1",
		// The commit LANDED (pushed post-write by the store fake) strictly
		// before the source teardown began. A reorder here is the
		// load-losing bug this suite exists to prevent: destroy-then-fail-to-
		// remember leaves the name pointing at a dead sandbox.
		"store:remembered:alpha:sprites:sprites-new-1:claude-code",
		"remove:e2b-old-1",
	]);
	assert.deepEqual(store.machines.alpha, {
		substrate: "sprites",
		sandboxId: "sprites-new-1",
		agent: "claude-code",
		updatedAt: "2026-08-03T12:00:00.000Z",
	});
	assert.deepEqual(steps, [
		"gate",
		"provision",
		"install",
		"export",
		"restore",
		"verify",
		"commit",
		"source",
	]);

	// The report is the API surface.
	assert.equal(report.agent, "claude-code");
	assert.deepEqual(report.from, { substrate: "e2b", sandboxId: "e2b-old-1" });
	assert.deepEqual(report.to, { substrate: "sprites", sandboxId: "sprites-new-1" });
	assert.ok(report.state.moved.includes(".agent-machines/MEMORY.md"));
	assert.ok(report.state.moved.includes(".agent-machines/skills"));
	assert.ok(
		!report.state.moved.includes(MIGRATION_MARKER_PATH),
		"the marker is the verification vehicle, not user load",
	);
	assert.deepEqual(report.state.skipped, [
		{ path: ".agent-machines/chats", reason: "not present on the source" },
	]);
	assert.equal(report.state.bytes, world.tar.length);
	assert.ok(report.state.lost.some((line) => line.includes("RAM state")), "leaving e2b loses RAM state");
	assert.deepEqual(report.verified.marker, true);
	assert.match(report.verified.probe, /--version/);
	assert.deepEqual(report.source, { action: "destroyed", resumed: false });
	assert.ok(report.attempts.some((a) => a.substrate === "sprites" && a.outcome === "ok"));
	// One writeFile of the tar payload on the target (the loadout precedent).
	const targetHandle = target.handles[0];
	assert.equal(targetHandle.writes.length, 1);
	assert.equal(targetHandle.writes[0].content, world.tar.toString("base64"));
	assert.deepEqual(world.destroyed, [], "nothing was handle-destroyed on the success path");
	assertStoreSerial(store, "migrate()");
});

test("every pre-commit failure leaves the ORIGINAL placement and tears down only the NEW sandbox", async () => {
	const cases: Array<{ point: FailPoint | "remember"; expect: RegExp; provisioned: boolean }> = [
		{ point: "provision", expect: /provision boom/, provisioned: false },
		// create()'s own teardown branch destroys the fresh sandbox on an
		// install failure, and the route error carries the cause.
		{ point: "installFail", expect: /install failed .*install boom|install boom/, provisioned: true },
		{ point: "export", expect: /state export tar failed/, provisioned: true },
		{ point: "sha", expect: /digest mismatch/, provisioned: true },
		{ point: "restore", expect: /state restore failed/, provisioned: true },
		{ point: "verifyProbe", expect: /installed but does not answer/, provisioned: true },
		{ point: "marker", expect: /migration marker check failed .*nonce/, provisioned: true },
		{ point: "remember", expect: /store write refused/, provisioned: true },
	];
	for (const { point, expect, provisioned } of cases) {
		const { mux, world } = setup();
		if (point === "remember") store.failNextRemember = true;
		else if (point === "installFail") {
			world.fail.installMiss = true;
			world.fail.installFail = true;
		} else world.fail[point] = true;

		await assert.rejects(
			() => mux.migrate("alpha", { to: "sprites" }),
			expect,
			`failure at "${point}" threw the wrong error`,
		);
		// (a) the original placement is untouched and addressable,
		assert.deepEqual(
			store.machines.alpha,
			{ ...ORIGINAL },
			`failure at "${point}" corrupted the placement`,
		);
		// (b) the NEW sandbox was destroyed, the OLD one never was,
		if (provisioned) {
			assert.ok(
				world.destroyed.includes("sprites-new-1"),
				`failure at "${point}" leaked the new sandbox`,
			);
		}
		assert.ok(
			!world.destroyed.includes("e2b-old-1"),
			`failure at "${point}" destroyed the SOURCE -- the load is gone`,
		);
		assert.ok(
			!world.ops.includes("remove:e2b-old-1"),
			`failure at "${point}" removed the SOURCE -- the load is gone`,
		);
	}
});

test("migrate post-commit source-destroy failure still succeeds, naming the orphan", async () => {
	const { mux } = setup({
		source: {
			// Measured on Dedalus 2026-08-02: destroy returned a 500 from the
			// vendor's own metering ledger, which says nothing about whether
			// the machine survived.
			removeError: new MuxError("transient", "500 from the vendor metering ledger"),
		},
	});
	const report = await mux.migrate("alpha", { to: "sprites" });
	assert.equal(report.source.action, "kept");
	assert.match(report.source.error ?? "", /orphaning e2b:e2b-old-1/);
	// The load is safe: the placement points at the new sandbox regardless.
	assert.equal(store.machines.alpha.sandboxId, "sprites-new-1");
});

test("migrate treats a confirmed not-found source as destroyed (the remove() rule)", async () => {
	const { mux } = setup({
		source: { removeError: new MuxError("fatal", "sandbox e2b-old-1 not found") },
	});
	const report = await mux.migrate("alpha", { to: "sprites" });
	assert.deepEqual(report.source, { action: "destroyed", resumed: false });
});

test("migrate source:'park' without park support keeps the source and says so", async () => {
	const { mux, world } = setup();
	const report = await mux.migrate("alpha", { to: "sprites", source: "park" });
	assert.equal(report.source.action, "kept");
	assert.match(report.source.error ?? "", /cannot park/);
	assert.ok(!world.ops.some((op) => op.startsWith("remove:")), "nothing was destroyed either");
	assert.equal(store.machines.alpha.sandboxId, "sprites-new-1", "the migration still succeeded");
});

test("migrate source:'park' parks by the OLD sandbox id where the substrate supports it", async () => {
	const { mux, source } = setup({ source: { hasPark: true } });
	const report = await mux.migrate("alpha", { to: "sprites", source: "park" });
	assert.deepEqual(report.source, { action: "parked" });
	assert.deepEqual(source.parked, ["e2b-old-1"]);
});

test("migrate source:'keep' leaves the source running and reports it", async () => {
	const { mux, world } = setup();
	const report = await mux.migrate("alpha", { to: "sprites", source: "keep" });
	assert.deepEqual(report.source, { action: "kept" });
	assert.ok(!world.ops.some((op) => op.startsWith("remove:") || op.startsWith("park:")));
});

test("switchAgent and migrate exclude each other, both directions", async () => {
	// The cross-verb race an adversarial review found 2026-08-03: switchAgent
	// used to snapshot the placement, spend its install window (6s to the full
	// 15-minute budget) in awaits, and re-assert the stale snapshot -- so a
	// migrate that committed and destroyed the source inside that window was
	// silently clobbered. Placement -> destroyed sandbox, load stranded on the
	// new one, BOTH verbs reporting success. The shared per-name claim is the
	// fix; this pins both contention orders.
	{
		const { mux } = setup();
		const migrating = mux.migrate("alpha", { to: "sprites" });
		await assert.rejects(mux.switchAgent("alpha", "openclaw"), (error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "transient");
			assert.match(error.message, /already in flight/);
			return true;
		});
		const report = await migrating;
		assert.equal(report.to.sandboxId, "sprites-new-1", "the migrate was unaffected");
		assert.equal(store.machines.alpha.substrate, "sprites", "the commit survived");
	}
	{
		const { mux, world } = setup();
		world.fail.installMiss = true; // switch takes the slow path, holding its claim
		const switching = mux.switchAgent("alpha", "openclaw");
		await assert.rejects(mux.migrate("alpha", { to: "sprites" }), /already in flight/);
		const report = await switching;
		assert.equal(report.changed, true, "the switch was unaffected");
		assert.equal(store.machines.alpha.agent, "openclaw");
	}
});

/**
 * Interleave an out-of-band placement write between switchAgent's initial
 * snapshot (store read #1, rememberedOrThrow) and its pre-commit re-read
 * (read #2). Polling for install ops cannot do this deterministically -- the
 * world's exec fakes resolve on microtasks, so the whole pipeline completes
 * between two setTimeout ticks. Hooking the read is exact.
 */
function mutateBetweenReads(mutate: () => void): void {
	const original = store.read.bind(store);
	let reads = 0;
	store.read = async () => {
		reads += 1;
		if (reads === 2) mutate();
		return original();
	};
}

test("switchAgent refuses to re-assert a snapshot over a placement that moved", async () => {
	// Belt for writers the claim cannot see (a raw rememberMachine from a
	// script, a host with a different claims directory): the placement is
	// re-read after install+probe, and a changed substrate/sandboxId aborts
	// instead of resurrecting a pointer to a sandbox someone else just
	// replaced -- and possibly destroyed.
	const { mux, world } = setup();
	world.fail.installMiss = true;
	mutateBetweenReads(() => {
		store.machines.alpha = {
			substrate: "sprites",
			sandboxId: "sprites-new-9",
			agent: "claude-code",
			updatedAt: "2026-08-03T12:00:01.000Z",
		};
	});
	await assert.rejects(mux.switchAgent("alpha", "openclaw"), (error: unknown) => {
		assert.ok(error instanceof MuxError);
		assert.equal(error.kind, "fatal");
		assert.match(error.message, /moved to sprites\/sprites-new-9 while switching/);
		return true;
	});
	// The out-of-band writer's record survives untouched, and the switch
	// genuinely got as far as installing before it noticed (the window is the
	// point of the test).
	assert.equal(store.machines.alpha.sandboxId, "sprites-new-9");
	assert.equal(store.machines.alpha.agent, "claude-code");
	assert.ok(world.ops.some((op) => op.startsWith("install:")), "install ran before the re-read");
});

test("switchAgent on a placement deleted mid-flight names the orphaned install", async () => {
	const { mux } = setup();
	mutateBetweenReads(() => {
		delete store.machines.alpha;
	});
	await assert.rejects(
		mux.switchAgent("alpha", "openclaw"),
		/was removed while switching agents/,
	);
	assert.equal(store.machines.alpha, undefined, "nothing resurrected the record");
});

test("a second migrate of the same name is refused while one is in flight", async () => {
	const { mux } = setup();
	const first = mux.migrate("alpha", { to: "sprites" });
	const second = mux.migrate("alpha", { to: "sprites" });
	await assert.rejects(second, (error: unknown) => {
		assert.ok(error instanceof MuxError);
		assert.equal(error.kind, "transient");
		assert.match(error.message, /already in flight/);
		return true;
	});
	const report = await first;
	assert.equal(report.to.sandboxId, "sprites-new-1", "the first migration was unaffected");
});

test("migrate refuses an unknown name and a same-substrate target with zero provider calls", async () => {
	const { mux, world } = setup();
	await assert.rejects(
		() => mux.migrate("ghost", { to: "sprites" }),
		/No remembered machine named "ghost"/,
	);
	await assert.rejects(
		() => mux.migrate("alpha", { to: "e2b" }),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /already on e2b/);
			return true;
		},
	);
	assert.deepEqual(world.ops, []);
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
});

test("migrate to an uncredentialed lane names the missing key and never wakes the source", async () => {
	const { mux, world } = setup({ target: { missing: ["SPRITES_TOKEN"] } });
	await assert.rejects(
		() => mux.migrate("alpha", { to: "sprites" }),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "missing_credentials");
			assert.match(error.message, /SPRITES_TOKEN/, "the missing key is NAMED");
			return true;
		},
	);
	assert.ok(!world.ops.some((op) => op.startsWith("connect:e2b")), "the source was never woken");
	assert.ok(!world.ops.some((op) => op.startsWith("provision:")), "nothing was provisioned");
	assert.deepEqual(store.machines.alpha, { ...ORIGINAL });
});

test("migrate moveState:false ships no tar, skips the marker, and enumerates the whole file contract as lost", async () => {
	const { mux, world, target } = setup();
	const report = await mux.migrate("alpha", { to: "sprites", moveState: false });

	assert.ok(!world.ops.some((op) => op.startsWith("connect:e2b")), "the source was never woken");
	assert.equal(target.handles[0].writes.length, 0, "no tar was shipped");
	assert.deepEqual(report.state.moved, []);
	assert.equal(report.state.bytes, 0);
	assert.equal(report.verified.marker, "skipped");
	assert.match(report.verified.probe, /--version/, "the harness is still verified to answer");
	// The honest "fresh box, same agent, same name" outcome: everything
	// file-shaped is declared left behind.
	for (const path of MOVE_ALLOWLIST("claude-code").include) {
		assert.ok(report.state.lost.includes(path), `${path} must be declared lost`);
	}
	for (const line of LOST_ALWAYS) {
		assert.ok(report.state.lost.includes(line));
	}
	assert.equal(store.machines.alpha.substrate, "sprites");
	assertStoreSerial(store, "migrate(moveState:false)");
});
