/**
 * Tests for src/mux/state.ts: the placement store seam, the concurrency
 * rules its writers promise, and the staleness rule they deliberately do not
 * implement.
 *
 * Run: tsx --test src/mux/state.test.ts
 *
 * Isolation has two layers: AGENT_MACHINES_MUX_STATE points the process-wide
 * default store at a temp file for the whole run, and every test that needs
 * its own file constructs a store over a fresh temp dir. In neither case can
 * a test touch ~/.agent-machines/mux-state.json.
 *
 * Interleaving is simulated through the store's documented write hooks
 * rather than by racing timers, so a concurrency regression fails the same
 * way on every machine.
 */

import assert from "node:assert/strict";
import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { SubstrateHealth, type SubstrateHealthSnapshot } from "./health.js";
import {
	DEFAULT_LOCK_TIMEOUT_MS,
	LocalJsonPlacementStore,
	forgetMachine,
	getPlacementStore,
	muxStatePath,
	readMuxState,
	rememberMachine,
	saveHealth,
	setPlacementStore,
	type LocalStoreOptions,
	type MachinePlacement,
	type MuxState,
	type PlacementStore,
} from "./state.js";
import { MuxError } from "./types.js";

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

const dirs: string[] = [];

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "am-mux-state-"));
	dirs.push(dir);
	return dir;
}

const defaultDir = tempDir();
const defaultFile = join(defaultDir, "mux-state.json");
const previousStatePath = process.env.AGENT_MACHINES_MUX_STATE;
process.env.AGENT_MACHINES_MUX_STATE = defaultFile;

after(() => {
	setPlacementStore(null);
	if (previousStatePath === undefined) {
		delete process.env.AGENT_MACHINES_MUX_STATE;
	} else {
		process.env.AGENT_MACHINES_MUX_STATE = previousStatePath;
	}
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A store over its own file, so no two tests share state. */
function localStore(options: Omit<LocalStoreOptions, "path"> = {}): {
	store: LocalJsonPlacementStore;
	path: string;
} {
	const path = join(tempDir(), "mux-state.json");
	return { store: new LocalJsonPlacementStore({ path, ...options }), path };
}

function placement(overrides: Partial<MachinePlacement> = {}): MachinePlacement {
	return { substrate: "e2b", sandboxId: "sbx-1", agent: "claude-code", ...overrides };
}

function readFile(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function tempFiles(path: string): string[] {
	return readdirSync(dirname(path)).filter((entry) => entry.endsWith(".tmp"));
}

function isMuxError(kind: MuxError["kind"], pattern: RegExp) {
	return (error: unknown): boolean => {
		assert.ok(error instanceof MuxError, `expected a MuxError, got ${String(error)}`);
		assert.equal(error.kind, kind);
		assert.match(error.message, pattern);
		return true;
	};
}

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

test("an unwritten store reads as empty rather than throwing", () => {
	const { store, path } = localStore();
	const state = store.read();
	assert.deepEqual(state.machines, {});
	assert.equal(state.health, undefined);
	assert.throws(() => statSync(path), /ENOENT/, "read must not create the file");
});

test("remember round-trips a placement and stamps a UTC timestamp", () => {
	const { store } = localStore();
	store.remember("alpha", placement({ sandboxId: "sbx-alpha" }));
	const entry = store.read().machines.alpha;
	assert.equal(entry?.substrate, "e2b");
	assert.equal(entry?.sandboxId, "sbx-alpha");
	assert.equal(entry?.agent, "claude-code");
	assert.equal(new Date(entry?.updatedAt ?? "").toISOString(), entry?.updatedAt);
});

test("forget removes one name and leaves the others", () => {
	const { store } = localStore();
	store.remember("alpha", placement());
	store.remember("beta", placement({ substrate: "sprites", sandboxId: "sp-1" }));
	store.forget("alpha");
	assert.deepEqual(Object.keys(store.read().machines), ["beta"]);
});

test("forgetting an unknown name writes nothing", () => {
	const { store, path } = localStore();
	store.forget("never-existed");
	assert.throws(() => statSync(path), /ENOENT/);
	assert.deepEqual(tempFiles(path), []);
});

test("remember refuses a nameless or incomplete placement", () => {
	const { store } = localStore();
	assert.throws(
		() => store.remember("", placement()),
		isMuxError("fatal", /non-empty machine name/),
	);
	assert.throws(
		() =>
			store.remember("alpha", {
				...placement(),
				sandboxId: "",
			}),
		isMuxError("fatal", /incomplete placement/),
	);
});

// ---------------------------------------------------------------------------
// Staleness: the substrate is the only authority
// ---------------------------------------------------------------------------

test("a placement never expires on age; only forget removes it", () => {
	const { store, path } = localStore();
	const ancient = new Date(Date.now() - 400 * 24 * 3_600_000).toISOString();
	writeFileSync(
		path,
		`${JSON.stringify({
			machines: {
				ancient: {
					substrate: "e2b",
					sandboxId: "sbx-old",
					agent: "claude-code",
					updatedAt: ancient,
				},
			},
		})}\n`,
		"utf8",
	);
	// A TTL here would delete a live long-running machine; `am mux rm` prunes
	// on the substrate's verdict instead, through forget().
	assert.equal(store.read().machines.ancient?.sandboxId, "sbx-old");
	store.forget("ancient");
	assert.deepEqual(store.read().machines, {});
});

test("read hides an unusable entry, writes keep it, forget can remove it", () => {
	const { store, path } = localStore();
	writeFileSync(
		path,
		`${JSON.stringify({
			machines: {
				good: {
					substrate: "sprites",
					sandboxId: "sp-1",
					agent: "codex",
					updatedAt: new Date().toISOString(),
				},
				// A substrate this build has no adapter for: unusable here, but
				// possibly a newer build's live machine.
				future: { substrate: "modal", sandboxId: "mo-1", agent: "codex", updatedAt: "x" },
				garbage: 7,
			},
		})}\n`,
		"utf8",
	);
	assert.deepEqual(Object.keys(store.read().machines), ["good"]);

	store.remember("mine", placement());
	const onDisk = readFile(path).machines as Record<string, unknown>;
	assert.ok("future" in onDisk, "a write must not delete a key it cannot parse");
	assert.ok("garbage" in onDisk);

	store.forget("future");
	assert.ok(!("future" in (readFile(path).machines as Record<string, unknown>)));
});

test("a corrupt state file degrades to empty and the next write replaces it", () => {
	const { store, path } = localStore();
	writeFileSync(path, "{not json at all", "utf8");
	assert.deepEqual(store.read().machines, {});
	store.remember("alpha", placement());
	assert.deepEqual(Object.keys(store.read().machines), ["alpha"]);
});

// ---------------------------------------------------------------------------
// Concurrency: interleaved read-modify-write must not lose an entry
// ---------------------------------------------------------------------------

/** Run `hook` on the first write only, so the interleaving is one-shot. */
function once(hook: () => void): () => void {
	let fired = false;
	return () => {
		if (fired) return;
		fired = true;
		hook();
	};
}

test("two interleaved machine writers both survive", () => {
	const path = join(tempDir(), "mux-state.json");
	// Two independent stores over one file, as two shells would be.
	const peer = new LocalJsonPlacementStore({ path });
	const store = new LocalJsonPlacementStore({
		path,
		hooks: {
			// The exact instant a last-writer-wins store loses data: the peer
			// completes an entire read-modify-write after we entered ours.
			beforeLock: once(() => peer.remember("beta", placement({ sandboxId: "sbx-beta" }))),
		},
	});

	store.remember("alpha", placement({ sandboxId: "sbx-alpha" }));

	const machines = store.read().machines;
	assert.equal(machines.alpha?.sandboxId, "sbx-alpha");
	assert.equal(machines.beta?.sandboxId, "sbx-beta", "the peer's insert was dropped");
});

test("a health save cannot clobber a machine a peer just remembered", () => {
	const path = join(tempDir(), "mux-state.json");
	const peer = new LocalJsonPlacementStore({ path });
	const store = new LocalJsonPlacementStore({
		path,
		hooks: {
			beforeLock: once(() => peer.remember("gamma", placement({ sandboxId: "sbx-gamma" }))),
		},
	});

	const snapshot: SubstrateHealthSnapshot = { version: 1, substrates: {} };
	store.saveHealth(snapshot);

	const state = store.read();
	assert.equal(
		state.machines.gamma?.sandboxId,
		"sbx-gamma",
		"saveHealth must merge, not replace the document",
	);
	assert.deepEqual(state.health, snapshot);
});

test("a machine write cannot clobber health a peer just saved", () => {
	const path = join(tempDir(), "mux-state.json");
	const peer = new LocalJsonPlacementStore({ path });
	const snapshot: SubstrateHealthSnapshot = {
		version: 1,
		substrates: { e2b: { samples: [{ at: 1, outcome: "transient" }] } },
	};
	const store = new LocalJsonPlacementStore({
		path,
		hooks: { beforeLock: once(() => peer.saveHealth(snapshot)) },
	});

	store.remember("alpha", placement());

	const state = store.read();
	assert.deepEqual(state.health, snapshot);
	assert.equal(state.machines.alpha?.sandboxId, "sbx-1");
});

test("a chain of interleaved writers keeps every name", () => {
	const path = join(tempDir(), "mux-state.json");
	const outer = new LocalJsonPlacementStore({ path });
	const middle = new LocalJsonPlacementStore({
		path,
		hooks: { beforeLock: once(() => outer.remember("three", placement({ sandboxId: "s3" }))) },
	});
	const inner = new LocalJsonPlacementStore({
		path,
		hooks: { beforeLock: once(() => middle.remember("two", placement({ sandboxId: "s2" }))) },
	});

	inner.remember("one", placement({ sandboxId: "s1" }));

	assert.deepEqual(Object.keys(outer.read().machines).sort(), ["one", "three", "two"]);
});

// ---------------------------------------------------------------------------
// Atomic replace
// ---------------------------------------------------------------------------

test("the target file is replaced by rename, never written in place", () => {
	const { store, path } = localStore();
	store.remember("alpha", placement({ sandboxId: "sbx-alpha" }));
	const before = readFileSync(path, "utf8");

	let observed: { destination: string; tempParsed: Record<string, unknown> } | null = null;
	const writer = new LocalJsonPlacementStore({
		path,
		hooks: {
			afterTempWrite: (temp) => {
				observed = {
					destination: readFileSync(path, "utf8"),
					tempParsed: JSON.parse(readFileSync(temp, "utf8")) as Record<string, unknown>,
				};
			},
		},
	});
	writer.remember("beta", placement({ sandboxId: "sbx-beta" }));

	assert.ok(observed, "the write must go through a temp file");
	const seen = observed as { destination: string; tempParsed: Record<string, unknown> };
	assert.equal(seen.destination, before, "the live file changed before the rename");
	const staged = seen.tempParsed.machines as Record<string, unknown>;
	assert.deepEqual(Object.keys(staged).sort(), ["alpha", "beta"]);
	assert.deepEqual(tempFiles(path), [], "the temp file must not outlive the write");
	assert.deepEqual(Object.keys(writer.read().machines).sort(), ["alpha", "beta"]);
});

test("a crash between the temp file and the rename leaves the old state intact", () => {
	const { store, path } = localStore();
	store.remember("alpha", placement());
	const before = readFileSync(path, "utf8");

	const crasher = new LocalJsonPlacementStore({
		path,
		hooks: {
			afterTempWrite: () => {
				throw new Error("power cut");
			},
		},
	});
	assert.throws(() => crasher.remember("beta", placement()), /power cut/);

	assert.equal(readFileSync(path, "utf8"), before);
	assert.deepEqual(tempFiles(path), [], "a partial file must not be left behind");
	assert.throws(() => statSync(`${path}.lock`), /ENOENT/, "the lock must be released");
	// The store is still usable, which is what releasing the lock buys.
	store.remember("beta", placement({ sandboxId: "sbx-beta" }));
	assert.deepEqual(Object.keys(store.read().machines).sort(), ["alpha", "beta"]);
});

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

test("a live lock fails closed and names its holder", () => {
	const { store, path } = localStore({ lockTimeoutMs: 0 });
	writeFileSync(`${path}.lock`, "4242@peer-host\n", "utf8");
	assert.throws(
		() => store.remember("alpha", placement()),
		isMuxError("transient", /locked by 4242@peer-host/),
	);
	assert.throws(() => statSync(path), /ENOENT/, "a refused write must not touch the state");
});

test("a stale lock is broken so a dead writer cannot wedge the store", () => {
	const { store, path } = localStore({ lockStaleMs: 1_000 });
	const lockPath = `${path}.lock`;
	writeFileSync(lockPath, "999@dead-host\n", "utf8");
	const longAgo = new Date(Date.now() - 60_000);
	utimesSync(lockPath, longAgo, longAgo);

	store.remember("alpha", placement());

	assert.equal(store.read().machines.alpha?.sandboxId, "sbx-1");
	assert.throws(() => statSync(lockPath), /ENOENT/, "the lock must be released again");
});

test("the wait budget outlives the staleness horizon", () => {
	// Otherwise a crashed holder would fail every writer for the rest of the
	// staleness window instead of being broken by the first one to notice.
	assert.ok(DEFAULT_LOCK_TIMEOUT_MS > 10_000);
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

test("health round-trips through the store and keeps the breaker open", () => {
	const { store } = localStore();
	let clock = 1_000_000;
	const health = new SubstrateHealth({ now: () => clock, openAfter: 2 });
	health.record("e2b", "transient", 120);
	clock += 10;
	health.record("e2b", "transient", 130);
	assert.equal(health.state("e2b"), "open");

	store.saveHealth(health.toJSON());

	const restored = SubstrateHealth.fromJSON(store.read().health, {
		now: () => clock,
		openAfter: 2,
	});
	assert.equal(restored.state("e2b"), "open");
	const stats = restored.stats("e2b");
	assert.equal(stats.failures, 2);
	assert.equal(stats.avgLatencyMs, 125);
	assert.deepEqual(store.read().health, health.toJSON());
});

test("a machine write preserves the stored health snapshot", () => {
	const { store } = localStore();
	const snapshot: SubstrateHealthSnapshot = {
		version: 1,
		substrates: { sprites: { samples: [], openedAt: 42 } },
	};
	store.saveHealth(snapshot);
	store.remember("alpha", placement());
	store.forget("alpha");
	assert.deepEqual(store.read().health, snapshot);
});

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

test("the local store satisfies PlacementStore through the awaited surface", async () => {
	const path = join(tempDir(), "mux-state.json");
	// Typed as the interface on purpose: this is the compile-time assertion
	// that a hosted implementation has the same four operations to fill.
	const store: PlacementStore = new LocalJsonPlacementStore({ path });
	assert.equal(store.kind, "local-json");
	assert.equal(store.synchronous, true);

	await store.remember("alpha", placement({ sandboxId: "sbx-alpha" }));
	const snapshot: SubstrateHealthSnapshot = { version: 1, substrates: {} };
	await store.saveHealth(snapshot);

	const state = await store.read();
	assert.equal(state.machines.alpha?.sandboxId, "sbx-alpha");
	assert.deepEqual(state.health, snapshot);

	await store.forget("alpha");
	assert.deepEqual((await store.read()).machines, {});
});

test("the default store follows AGENT_MACHINES_MUX_STATE", () => {
	setPlacementStore(null);
	rmSync(defaultFile, { force: true });
	assert.equal(muxStatePath(), defaultFile);
	rememberMachine("alpha", placement({ sandboxId: "sbx-env" }));
	assert.equal(readMuxState().machines.alpha?.sandboxId, "sbx-env");
	assert.equal(
		(readFile(defaultFile).machines as Record<string, { sandboxId: string }>).alpha?.sandboxId,
		"sbx-env",
	);
	forgetMachine("alpha");
	assert.deepEqual(readMuxState().machines, {});
	assert.equal(getPlacementStore().kind, "local-json");
});

test("the synchronous API delegates to an installed store", () => {
	const calls: string[] = [];
	const state: MuxState = { machines: {} };
	const fake: PlacementStore = {
		kind: "fake-sync",
		synchronous: true,
		read: () => {
			calls.push("read");
			return state;
		},
		remember: (name) => {
			calls.push(`remember:${name}`);
		},
		forget: (name) => {
			calls.push(`forget:${name}`);
		},
		saveHealth: () => {
			calls.push("saveHealth");
		},
	};
	setPlacementStore(fake);
	try {
		assert.equal(readMuxState(), state);
		rememberMachine("alpha", placement());
		forgetMachine("alpha");
		saveHealth({ version: 1, substrates: {} });
		assert.deepEqual(calls, ["read", "remember:alpha", "forget:alpha", "saveHealth"]);
	} finally {
		setPlacementStore(null);
	}
	assert.equal(getPlacementStore().kind, "local-json");
});

test("an asynchronous store fails the synchronous API closed", () => {
	const fake: PlacementStore = {
		kind: "fake-async",
		synchronous: false,
		read: async () => ({ machines: {} }),
		remember: async () => undefined,
		forget: async () => undefined,
		saveHealth: async () => undefined,
	};
	setPlacementStore(fake);
	try {
		// Returning the promise would let the router read it as state and see
		// no machines at all, so this must throw instead.
		assert.throws(() => readMuxState(), isMuxError("fatal", /fake-async.*asynchronous/s));
		assert.throws(
			() => rememberMachine("alpha", placement()),
			isMuxError("fatal", /asynchronous/),
		);
		assert.throws(() => forgetMachine("alpha"), isMuxError("fatal", /asynchronous/));
		assert.throws(
			() => saveHealth({ version: 1, substrates: {} }),
			isMuxError("fatal", /asynchronous/),
		);
	} finally {
		setPlacementStore(null);
	}
});
