/**
 * The cross-verb interleaving found in adversarial review, 2026-08-03 --
 * WRITTEN FAILING against the defect the same day, and kept as the regression
 * test for the fix (a shared per-name claim across both verbs, plus a
 * placement re-read before switchAgent's commit; router.ts
 * machineOpClaimKey). The scenario below now proves the overlap is REFUSED
 * and the property holds, instead of documenting its violation.
 *
 * The defect: `Mux.switchAgent()` snapshots the placement ONCE (at
 * rememberedOrThrow) and, after a window of awaits that is seconds to minutes
 * wide in production (describe -> connect -> ensureInstalled -> probe;
 * measured 2026-08-03: 6.6s on the fast path, up to the 900s install budget
 * on a cold install), blindly re-asserts the snapshot's substrate AND
 * sandboxId in its placement write (router.ts ~1263). `Mux.migrate()` guards
 * itself against concurrent MIGRATIONS with the am-migrate:<name> claim and
 * its comment names the hazard ("one would destroy a sandbox the other just
 * committed to") -- but switchAgent never touches that claim, so a migrate
 * that COMMITS and DESTROYS THE SOURCE inside switchAgent's window is
 * silently clobbered by switchAgent's stale write:
 *
 *   1. switchAgent("alpha", openclaw) reads {e2b, e2b-old-1, claude-code},
 *      connects, and is inside install/probe.
 *   2. migrate("alpha", {to: sprites}) runs to completion: the load is
 *      copied, verified, COMMITTED to {sprites, sprites-new-1, claude-code},
 *      and the source e2b-old-1 is DESTROYED (default source: "destroy").
 *   3. switchAgent's probe answer arrives (it was in flight when the destroy
 *      landed -- or the destroy landed between the probe answer and the
 *      store write; both windows are real, and nothing orders them), and it
 *      writes {e2b, e2b-old-1, openclaw}.
 *
 * Final state: the placement points at a DESTROYED sandbox, and the migrated
 * load on sprites-new-1 is stranded -- alive and billing, but unreachable by
 * name. Both halves of the product promise are broken at once, and BOTH
 * verbs reported success. The hosted plane guards exactly this cross-verb
 * race (agent/route.ts 409s while migrationState.phase === "running"); the
 * SDK plane does not.
 *
 * The fix direction (either restores the green): have switchAgent hold (or
 * respect) the am-migrate:<name> claim across its window, or re-read the
 * placement after the probe and refuse/retarget when substrate:sandboxId no
 * longer equals the snapshot (a CAS on the placement identity, not a blind
 * upsert).
 *
 * Fixture idiom is switch-migrate-async.test.ts (macrotask store, shared op
 * log); the only addition is a gate that holds switchAgent's version probe
 * so the interleaving is deterministic instead of a sleep-race.
 *
 * Run: npx tsx --test src/mux/switch-migrate-race.test.ts
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
import { MIGRATION_MARKER_PATH } from "./statemove.js";
import {
	MuxError,
	type ExecOptions,
	type ExecResult,
	type SandboxProvider,
	type SubstrateKind,
} from "./types.js";

// ---------------------------------------------------------------------------
// Isolation (the switch-migrate-async.test.ts prologue)
// ---------------------------------------------------------------------------

const previousEnv = new Map<string, string | undefined>();
for (const name of [
	"AGENT_MACHINES_MUX_STATE",
	"AGENT_MACHINES_MUX_TRACES",
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"AI_GATEWAY_API_KEY",
	"AI_GATEWAY_KEY",
	"OPENROUTER_API_KEY",
]) {
	previousEnv.set(name, process.env[name]);
	delete process.env[name];
}
const isolationDir = mkdtempSync(join(tmpdir(), "am-mux-switch-migrate-race-"));
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
// Async store (macrotask idiom) + world
// ---------------------------------------------------------------------------

function later<T>(value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), 0));
}

class AsyncStore implements PlacementStore {
	readonly kind = "test-async";
	readonly synchronous = false;
	machines: Record<string, MachinePlacement & { updatedAt: string }> = {};
	health: SubstrateHealthSnapshot | undefined;

	constructor(private readonly ops: string[]) {}

	async read(): Promise<MuxState> {
		return later({ machines: { ...this.machines } });
	}

	async remember(name: string, placement: MachinePlacement): Promise<void> {
		await later(null);
		this.machines[name] = { ...placement, updatedAt: "2026-08-03T12:00:00.000Z" };
		this.ops.push(
			`store:remembered:${name}:${placement.substrate}:${placement.sandboxId}:${placement.agent}`,
		);
	}

	async forget(name: string): Promise<void> {
		await later(null);
		delete this.machines[name];
		this.ops.push(`store:forgot:${name}`);
	}

	async saveHealth(snapshot: SubstrateHealthSnapshot): Promise<void> {
		await later(null);
		this.health = snapshot;
	}
}

type Gate = {
	match: (handleId: string, command: string) => boolean;
	wait: () => Promise<void>;
};

type World = {
	ops: string[];
	marker: string | null;
	restored: boolean;
	tar: Buffer;
	gate: Gate | null;
};

function fixtureTar(size = 700_003): Buffer {
	const bytes = Buffer.alloc(size);
	for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
	return bytes;
}

function ok(stdout = ""): ExecResult {
	return { stdout, stderr: "", exitCode: 0, durationMs: 1 };
}

class StubHandle {
	readonly writes: Array<{ path: string; content: string }> = [];
	readonly capabilities = {
		persistence: "always-on",
		pty: "tmux",
		reattach: true,
		publicUrl: false,
		streamingExec: false,
		detachedWork: "throttled" as const,
	};

	constructor(
		readonly id: string,
		readonly substrate: SubstrateKind,
		readonly world: World,
	) {}

	async exec(command: string, _options?: ExecOptions): Promise<ExecResult> {
		const { world } = this;
		if (world.gate?.match(this.id, command)) await world.gate.wait();
		if (/command -v (claude|codex|openclaw)/.test(command)) return ok();
		if (/\b(claude|codex|openclaw|hermes) --version/.test(command)) return ok("0.0.0-test");
		if (command.includes("AM_MOVE_HOME")) return ok("AM_MOVE_HOME:/home/user:");
		if (command.includes(MIGRATION_MARKER_PATH) && command.includes("base64 -d")) {
			const payload = /printf '%s' '([A-Za-z0-9+/=]+)'/.exec(command)?.[1] ?? "";
			world.marker = Buffer.from(payload, "base64").toString("utf8");
			return ok();
		}
		if (command.startsWith("for p in ")) {
			const paths = [...command.matchAll(/'([^']+)'/g)].map((match) => match[1]);
			return ok(paths.map((path) => `AM_MOVE P ${path}`).join("\n"));
		}
		if (command.startsWith(`tar -C "$HOME" -czf`)) return ok();
		if (command.startsWith("stat -c %s ")) return ok(`${world.tar.length}\n`);
		if (command.startsWith("sha256sum ")) {
			const digest = createHash("sha256").update(world.tar).digest("hex");
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
			world.restored = true;
			return ok("AM_MOVE_RESTORED\n");
		}
		if (command === `cat "$HOME/${MIGRATION_MARKER_PATH}"`) {
			if (!world.restored || world.marker === null) {
				return { stdout: "", stderr: "No such file", exitCode: 1, durationMs: 1 };
			}
			return ok(world.marker);
		}
		if (command.startsWith("cat /tmp/am-install-")) return ok("0\n");
		if (command.includes("tail -c 800")) return ok("");
		throw new Error(`StubHandle has no dispatch for: ${command.slice(0, 120)}`);
	}

	async *execStream(): AsyncGenerator<never, void, void> {
		throw new MuxError("not_supported", "no execStream in this stub");
	}
	async execBackground(): Promise<void> {}
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
		this.world.ops.push(`destroy:${this.id}`);
	}
}

function stubProvider(kind: SubstrateKind, world: World) {
	const removed: string[] = [];
	return {
		kind,
		removed,
		capabilities: {
			persistence: "always-on",
			pty: "tmux",
			reattach: true,
			publicUrl: false,
			streamingExec: false,
			detachedWork: "throttled" as const,
		},
		ready: () => ({ ok: true, missing: [] as string[] }),
		create: async () => {
			world.ops.push(`provision:${kind}`);
			return new StubHandle(`${kind}-new-1`, kind, world);
		},
		connect: async (id: string) => {
			world.ops.push(`connect:${kind}:${id}`);
			return new StubHandle(id, kind, world);
		},
		list: async () => [],
		describe: async () => ({ state: "ready", rawPhase: "stub" }),
		remove: async (id: string) => {
			world.ops.push(`remove:${id}`);
			removed.push(id);
		},
	};
}

// ---------------------------------------------------------------------------
// The interleaving
// ---------------------------------------------------------------------------

const CONFIG: MuxConfigInput = {
	keys: { anthropic: "test-anthropic-key" },
	sandboxes: { primary: "e2b", backups: ["sprites"] },
};

test("a migrate attempted inside switchAgent's window is refused, and the load stays reachable by name", async () => {
	const world: World = { ops: [], marker: null, restored: false, tar: fixtureTar(), gate: null };
	const store = new AsyncStore(world.ops);
	store.machines.alpha = {
		substrate: "e2b",
		sandboxId: "e2b-old-1",
		agent: "claude-code",
		updatedAt: "2026-08-01T00:00:00.000Z",
	};
	setPlacementStore(store);
	const mux: Mux = createMux(CONFIG, {
		health: new SubstrateHealth(),
		persistHealth: false,
		selection: new SelectionPolicy({ traces: [] }),
	});
	const sourceProvider = stubProvider("e2b", world);
	const targetProvider = stubProvider("sprites", world);
	mux.registerProvider("e2b", sourceProvider as unknown as SandboxProvider);
	mux.registerProvider("sprites", targetProvider as unknown as SandboxProvider);

	// Hold switchAgent at its version probe on the SOURCE sandbox: the stand-in
	// for "the probe answer (or the placement write) is still in flight when
	// migrate's commit+destroy land". Only openclaw on e2b-old-1 matches, so
	// migrate's own probes (claude-code, on sprites-new-1) pass through.
	let probeReached!: () => void;
	const reached = new Promise<void>((resolve) => (probeReached = resolve));
	let releaseProbe!: () => void;
	const released = new Promise<void>((resolve) => (releaseProbe = resolve));
	world.gate = {
		match: (handleId, command) =>
			handleId === "e2b-old-1" && /openclaw --version/.test(command),
		wait: async () => {
			probeReached();
			await released;
		},
	};

	// 1. The agent router's verb starts and enters its window.
	const switching = mux.switchAgent("alpha", "openclaw");
	await reached;

	// 2. The sandbox router's verb attempts to run inside that window. The
	//    fix: both verbs contend on one per-name claim, so the migrate is
	//    REFUSED while the switch holds it -- the interleaving that stranded
	//    the load can no longer be constructed.
	await assert.rejects(mux.migrate("alpha", { to: "sprites" }), (error: unknown) => {
		assert.ok(error instanceof MuxError);
		assert.equal(error.kind, "transient", "refusal is retryable, not fatal");
		assert.match(error.message, /already in flight/);
		return true;
	});
	assert.ok(
		!sourceProvider.removed.includes("e2b-old-1"),
		"the refused migrate must not have touched the source",
	);

	// 3. switchAgent's window closes and its verb completes normally.
	releaseProbe();
	const switched = await switching;
	assert.equal(switched.to, "openclaw");

	// THE PROPERTY UNDER TEST, unchanged from the failing version: after both
	// verbs settle, the name still addresses the sandbox that holds the load.
	const placement = store.machines.alpha;
	assert.ok(
		!sourceProvider.removed.includes(placement.sandboxId),
		`the placement points at ${placement.substrate}:${placement.sandboxId}, which was destroyed`,
	);
	assert.deepEqual(
		{ substrate: placement.substrate, sandboxId: placement.sandboxId, agent: placement.agent },
		{ substrate: "e2b", sandboxId: "e2b-old-1", agent: "openclaw" },
		"the switch committed on the intact source; nothing was clobbered",
	);

	// 4. And the verb that was refused works fine once the claim is free --
	//    refusal was contention control, not a capability loss.
	const migrated = await mux.migrate("alpha", { to: "sprites" });
	assert.equal(migrated.to.sandboxId, "sprites-new-1");
	assert.equal(migrated.agent, "openclaw", "migrate carries the switched agent");
	assert.equal(store.machines.alpha.sandboxId, "sprites-new-1");
});
