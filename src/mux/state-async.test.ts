/**
 * The router against an ASYNCHRONOUS placement store.
 *
 * `PlacementStore` was always declared await-tolerant, but nothing could
 * actually install an async one: the router called the synchronous module
 * functions inline, and `Mux`'s constructor read persisted health, which a
 * constructor cannot await. So `web/lib/mux/placement-store.ts` -- the Supabase
 * store, roadmap 0.4 -- was implemented, tested against a fake Postgres, and
 * unusable. This suite is the proof that it is usable now.
 *
 * The store below is async in the way that matters: every method returns a
 * promise that resolves on a LATER macrotask (`setTimeout`, not `Promise
 * .resolve`). A microtask-only fake would pass even if the router awaited
 * nothing, because the microtask queue drains before the next `await` in the
 * caller -- so the test would prove nothing about the code under test.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";

import { SubstrateHealth, type SubstrateHealthSnapshot } from "./health.js";
import { SelectionPolicy } from "./selection.js";
import { createMux } from "./router.js";
import {
	forgetMachineAsync,
	getPlacementStore,
	readMuxState,
	readMuxStateAsync,
	rememberMachine,
	rememberMachineAsync,
	saveHealth,
	saveHealthAsync,
	setPlacementStore,
	type MachinePlacement,
	type MuxState,
	type PlacementStore,
} from "./state.js";
import { MuxError, type SandboxProvider, type SubstrateKind } from "./types.js";

// The local store must not be reachable: a test that accidentally fell back to
// it would pass while proving the opposite of the point.
const previousStatePath = process.env.AGENT_MACHINES_MUX_STATE;
const stateDir = mkdtempSync(join(tmpdir(), "am-mux-async-state-"));
process.env.AGENT_MACHINES_MUX_STATE = join(stateDir, "mux-state.json");

after(() => {
	setPlacementStore(null);
	if (previousStatePath === undefined) delete process.env.AGENT_MACHINES_MUX_STATE;
	else process.env.AGENT_MACHINES_MUX_STATE = previousStatePath;
	rmSync(stateDir, { recursive: true, force: true });
});

/**
 * A breaker whose e2b lane is OPEN, so adopting it is observable.
 *
 * `openAfter` is 3 and only `transient` samples count -- `fatal` ones are
 * recorded but never degrade a lane, since a fatal is the substrate correctly
 * rejecting a request rather than a transport failure. A fixture built from
 * fatals looks exactly like an empty breaker, which silently turns every
 * "health was loaded" assertion into a tautology.
 */
function openBreaker(): SubstrateHealth {
	const health = new SubstrateHealth();
	health.record("e2b", "transient");
	health.record("e2b", "transient");
	health.record("e2b", "transient");
	return health;
}

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
	/** Set to make the next read reject, for the degrade-to-empty path. */
	failNextRead = false;
	reads = 0;
	/**
	 * Operations started but not finished. The general catch for a dropped
	 * await: any router method that resolves while this is non-zero left a store
	 * write in flight, which on a serverless host means the process can be
	 * frozen before it lands. Asserting the specific side effect is not enough --
	 * a later `await` in the same method gives the orphaned promise time to
	 * complete, so the effect appears and the bug hides.
	 */
	pending = 0;

	/**
	 * Start/end markers for every operation, so overlap is visible.
	 *
	 * A leftover-only check (`pending === 0` at the end) is not enough: drop the
	 * await on `remember()` and `create()` still awaits `saveHealth` afterwards,
	 * which gives the orphan time to land before the call returns. What a dropped
	 * await really produces is two store operations IN FLIGHT AT ONCE, and that is
	 * what this records.
	 */
	readonly trace: string[] = [];

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
		this.reads += 1;
		if (this.failNextRead) {
			this.failNextRead = false;
			await this.settle("read", null);
			throw new MuxError("transient", "store unreachable");
		}
		return this.settle("read", {
			machines: { ...this.machines },
			...(this.health ? { health: this.health } : {}),
		});
	}

	async remember(name: string, placement: MachinePlacement): Promise<void> {
		this.calls.push(`remember:${name}`);
		await this.settle(`remember:${name}`, null);
		this.machines[name] = { ...placement, updatedAt: "2026-08-02T12:00:00.000Z" };
	}

	async forget(name: string): Promise<void> {
		this.calls.push(`forget:${name}`);
		await this.settle(`forget:${name}`, null);
		delete this.machines[name];
	}

	async saveHealth(snapshot: SubstrateHealthSnapshot): Promise<void> {
		this.calls.push("saveHealth");
		await this.settle("saveHealth", null);
		this.health = snapshot;
	}
}

let store: AsyncStore;

beforeEach(() => {
	store = new AsyncStore();
	setPlacementStore(store);
});

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

test("the synchronous API fails closed under an async store, naming the fix", () => {
	// Not "returns undefined" and not "returns a promise": either would let the
	// router treat a pending read as "no machines remembered" and provision a
	// duplicate. The message has to name the async API, since the caller cannot
	// see which store is installed.
	for (const call of [
		() => readMuxState(),
		() => rememberMachine("alpha", { substrate: "e2b", sandboxId: "s1", agent: "claude-code" }),
		() => saveHealth(new SubstrateHealth().toJSON()),
	]) {
		assert.throws(call, (error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /asynchronous/);
			assert.match(error.message, /test-async/);
			return true;
		});
	}
});

test("the asynchronous API round-trips through whatever store is installed", async () => {
	await rememberMachineAsync("alpha", {
		substrate: "sprites",
		sandboxId: "sp-1",
		agent: "codex",
	});
	assert.deepEqual((await readMuxStateAsync()).machines.alpha, {
		substrate: "sprites",
		sandboxId: "sp-1",
		agent: "codex",
		updatedAt: "2026-08-02T12:00:00.000Z",
	});
	await saveHealthAsync(new SubstrateHealth().toJSON());
	assert.ok(store.health, "health reached the store");
	await forgetMachineAsync("alpha");
	assert.deepEqual((await readMuxStateAsync()).machines, {});
	assert.equal(getPlacementStore().kind, "test-async");
});

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

const CONFIG = {
	sandboxes: {
		primary: "e2b" as SubstrateKind,
		backups: [] as SubstrateKind[],
		credentials: { e2b: { apiKey: "test" } },
	},
	agents: { default: "claude-code" as const },
};

class StubHandle {
	readonly id: string;
	readonly substrate: SubstrateKind;
	destroyed = false;
	constructor(id: string, substrate: SubstrateKind) {
		this.id = id;
		this.substrate = substrate;
	}
	async exec() {
		return { stdout: "", stderr: "", exitCode: 0 };
	}
	async execStream() {
		return { stdout: "", stderr: "", exitCode: 0 };
	}
	async writeFile() {}
	async readFile() {
		return "";
	}
	async destroy() {
		this.destroyed = true;
	}
	async openPty() {
		throw new MuxError("not_supported", "no pty in this stub");
	}
}

/** Minimal provider: enough surface for create/connect/describe/remove/park. */
function stubProvider(kind: SubstrateKind) {
	const provider = {
		kind,
		capabilities: {
			persistence: "pause-resume",
			pty: "emulated",
			streaming: "poll",
			detachedWork: "reliable",
		},
		ready: () => ({ ok: true, missing: [] }),
		create: async () => new StubHandle(`${kind}-sbx-1`, kind),
		connect: async (id: string) => new StubHandle(id, kind),
		list: async () => [],
		describe: async () => ({ state: "running", rawPhase: "running" }),
		remove: async (id: string) => {
			provider.removed.push(id);
		},
		park: async (id: string) => {
			provider.parked.push(id);
		},
		removed: [] as string[],
		parked: [] as string[],
	};
	return provider;
}

function muxWith(options: { health?: SubstrateHealth } = {}) {
	const mux = createMux(CONFIG, {
		selection: new SelectionPolicy({ traces: [] }),
		...options,
	});
	const provider = stubProvider("e2b");
	mux.registerProvider("e2b", provider as unknown as SandboxProvider);
	return { mux, provider };
}

/**
 * Every store operation the call started finished before the next one began,
 * and none was left in flight when the call resolved.
 *
 * Serial is the right invariant for these paths: the router does one store
 * operation at a time on purpose, so any overlap means a promise escaped its
 * await -- on a serverless host that write can be frozen before it lands, which
 * is how a provisioned sandbox becomes an unremembered orphan.
 */
function assertStoreWasDriverSerially(where: string): void {
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

test("create() remembers the placement in the async store", async () => {
	const { mux } = muxWith();
	const machine = await mux.create({ name: "alpha", install: false });
	assertStoreWasDriverSerially("create()");
	assert.equal(machine.substrate, "e2b");
	// The assertion that matters: the write LANDED before create() resolved. An
	// unawaited store.remember() would leave this empty, because the fake
	// resolves on a later macrotask.
	assert.deepEqual(store.machines.alpha, {
		substrate: "e2b",
		sandboxId: "e2b-sbx-1",
		agent: "claude-code",
		updatedAt: "2026-08-02T12:00:00.000Z",
	});
});

test("connect(), describe() and park() read the placement from the async store", async () => {
	const { mux, provider } = muxWith();
	await mux.create({ name: "alpha", install: false });

	const reconnected = await mux.connect("alpha");
	assertStoreWasDriverSerially("connect()");
	assert.equal(reconnected.sandbox.id, "e2b-sbx-1");

	assert.deepEqual(await mux.describe("alpha"), { state: "running", rawPhase: "running" });

	await mux.park("alpha");
	assertStoreWasDriverSerially("park()");
	assert.deepEqual(provider.parked, ["e2b-sbx-1"]);
});

test("remove() forgets through the async store", async () => {
	const { mux, provider } = muxWith();
	await mux.create({ name: "alpha", install: false });
	const outcome = await mux.remove("alpha");
	assertStoreWasDriverSerially("remove()");
	assert.deepEqual(outcome, { removed: true, resumed: false });
	assert.deepEqual(provider.removed, ["e2b-sbx-1"]);
	assert.deepEqual(store.machines, {}, "the placement is gone");
});

test("remove() forgets through the async store when the sandbox is already gone", async () => {
	// The branch POSTMORTEM-2026-05-18 item 5 exists for: a placement whose
	// sandbox is gone must still be forgettable, or it can never be cleaned up.
	// Only a confirmed not-found forgets -- any other failure may leave the
	// machine alive and billing, and a forgotten placement cannot be retried.
	const { mux, provider } = muxWith();
	await mux.create({ name: "alpha", install: false });
	provider.remove = async () => {
		throw new MuxError("fatal", "sandbox alpha not found");
	};
	assert.deepEqual(await mux.remove("alpha"), { removed: true, resumed: false });
	assertStoreWasDriverSerially("remove() after not-found");
	assert.deepEqual(store.machines, {}, "the placement is gone");
});

test("remove() keeps the placement when the failure is not a confirmed not-found", async () => {
	const { mux, provider } = muxWith();
	await mux.create({ name: "alpha", install: false });
	provider.remove = async () => {
		// Measured on Dedalus 2026-08-02: destroy returned a 500 from the vendor's
		// own metering ledger, which says nothing about whether the machine lives.
		throw new MuxError("transient", "500 from the vendor metering ledger");
	};
	await assert.rejects(() => mux.remove("alpha"), /metering ledger/);
	assert.ok(store.machines.alpha, "an unconfirmed teardown must not forget");
});

test("an unknown name still throws rather than resolving to undefined", async () => {
	const { mux } = muxWith();
	for (const call of [
		() => mux.describe("ghost"),
		() => mux.remove("ghost"),
		() => mux.park("ghost"),
		() => mux.connect("ghost"),
	]) {
		await assert.rejects(call, /No remembered machine named "ghost"/);
	}
});

test("machine.destroy() forgets its own placement through the async store", async () => {
	const { mux } = muxWith();
	const machine = await mux.create({ name: "alpha", install: false });
	await machine.destroy();
	assertStoreWasDriverSerially("machine.destroy()");
	assert.deepEqual(store.machines, {});
});

// ---------------------------------------------------------------------------
// Lazily loaded health
// ---------------------------------------------------------------------------

test("health is empty at construction and loaded before the first create()", async () => {
	// Seed a breaker the constructor cannot possibly have read synchronously.
	// TRANSIENT, not fatal: only transport-class outcomes degrade a lane
	// (health.ts `state()`), so a fatal-only fixture would be indistinguishable
	// from an empty breaker and this test would prove nothing.
	const seeded = openBreaker();
	store.health = seeded.toJSON();
	assert.equal(seeded.state("e2b"), "open", "the fixture must differ from an empty breaker");

	const { mux } = muxWith();
	// Constructed, nothing awaited: the constructor did not block on a network
	// read, so the breaker is empty rather than stale-or-pending.
	assert.equal(mux.health.state("e2b"), "healthy");
	assert.equal(store.reads, 0, "no read was issued from the constructor");

	await mux.create({ name: "alpha", install: false });
	// Assert on the SAMPLES, not the state. create() succeeded on e2b, which
	// records an ok sample and moves an open breaker toward recovery -- so the
	// state legitimately differs from the seeded one, and comparing states would
	// fail for a correct reason. The seeded samples surviving is the adoption.
	assert.deepEqual(
		mux.health.toJSON().substrates.e2b?.samples.map((sample) => sample.outcome),
		["transient", "transient", "transient", "ok"],
		"the persisted samples were adopted, then this run appended to them",
	);
});

test("a store whose read fails leaves an empty breaker and is not retried per call", async () => {
	store.failNextRead = true;
	const { mux } = muxWith();
	await mux.create({ name: "alpha", install: false });
	// Health never removes a lane, so no history is a safe degrade -- the
	// configured order is used. What must NOT happen is the failing read
	// repeating on every operation, adding a doomed round trip to each one.
	assert.deepEqual(
		mux.health.toJSON().substrates.e2b?.samples.map((sample) => sample.outcome),
		["ok"],
		"only this run's own sample -- nothing was adopted",
	);

	// Now make a load SUCCEED and carry an open circuit. If the router retried
	// the health load, this is where it would pick it up -- so the seeded samples
	// staying absent is what proves there was no second attempt. (Counting reads
	// cannot show it: create() and describe() read placements through the same
	// method.)
	store.health = openBreaker().toJSON();
	await mux.create({ name: "beta", install: false });
	assert.deepEqual(
		mux.health.toJSON().substrates.e2b?.samples.map((sample) => sample.outcome),
		["ok", "ok"],
		"one load attempt, ever -- a failed read must not re-read on the next call",
	);

	// A FRESH mux does load it, so the failure is per-instance and not a
	// process-wide latch. Re-seed first: the mux above persists its own breaker
	// on every create, so by now the store holds its samples, not the fixture's.
	const { mux: second } = muxWith();
	store.health = openBreaker().toJSON();
	await second.create({ name: "gamma", install: false });
	assert.deepEqual(
		second.health.toJSON().substrates.e2b?.samples.map((sample) => sample.outcome),
		["transient", "transient", "transient", "ok"],
		"a new instance still reads the store; the latch is per-instance",
	);
});

test("an injected breaker is never overwritten by the store", async () => {
	const injected = new SubstrateHealth();
	injected.record("e2b", "transient");
	store.health = openBreaker().toJSON();
	const { mux } = muxWith({ health: injected });
	await mux.create({ name: "alpha", install: false });
	assert.equal(mux.health, injected, "the caller's breaker is authoritative");
});

test("create() persists the health sample it just recorded", async () => {
	const { mux } = muxWith();
	await mux.create({ name: "alpha", install: false });
	// Present BEFORE create() resolved: the fake resolves saveHealth on a later
	// macrotask, so a fire-and-forget write would leave this undefined.
	assert.ok(store.health, "the breaker snapshot reached the store");
	// The specific sample this create() produced, not merely "something was
	// written": an ok outcome on the lane it actually used.
	assert.deepEqual(
		store.health.substrates.e2b?.samples.map((sample) => sample.outcome),
		["ok"],
	);
});

// ---------------------------------------------------------------------------
// Per-instance placement store (the hosted plane's tenant scoping)
// ---------------------------------------------------------------------------

test("an injected placementStore is used instead of the global, and never replaces it", async () => {
	// The hosted plane cannot use setPlacementStore(): it is a module singleton,
	// and a serverless process serves concurrent requests for different users,
	// so setting the global per request lets one tenant read another's
	// placements. web/lib/mux/hosted-mux.ts passes the store per instance; this
	// is the mux-side half of that contract.
	const globalStore = store; // installed by beforeEach
	const injected = new AsyncStore();
	injected.machines.alpha = {
		substrate: "e2b",
		sandboxId: "injected-sbx",
		agent: "claude-code",
		updatedAt: "2026-08-03T12:00:00.000Z",
	};

	const mux = createMux(CONFIG, {
		selection: new SelectionPolicy({ traces: [] }),
		placementStore: injected,
	});
	mux.registerProvider("e2b", stubProvider("e2b") as unknown as SandboxProvider);

	// Reads come from the injected store: the global has no "alpha" at all, so
	// a global read would throw "No remembered machine named".
	assert.deepEqual(await mux.describe("alpha"), {
		state: "running",
		rawPhase: "running",
	});

	// Writes land in the injected store and the global stays empty.
	await mux.create({ name: "beta", install: false });
	assert.ok(injected.machines.beta, "the write went to the injected store");
	assert.equal(globalStore.machines.beta, undefined, "the global was written to");
	assert.equal(getPlacementStore().kind, "test-async", "the global was swapped");
});

test("a machine built by an injected-store mux forgets in THAT store on destroy", async () => {
	// MuxMachine.destroy() reaches the store directly, so the store has to be
	// threaded into the machine too -- otherwise destroy() falls back to the
	// global and forgets the wrong tenant's placement, or none.
	const globalStore = store;
	const injected = new AsyncStore();
	const mux = createMux(CONFIG, {
		selection: new SelectionPolicy({ traces: [] }),
		placementStore: injected,
	});
	mux.registerProvider("e2b", stubProvider("e2b") as unknown as SandboxProvider);

	const machine = await mux.create({ name: "gamma", install: false });
	assert.ok(injected.machines.gamma);
	await machine.destroy();
	assert.equal(injected.machines.gamma, undefined, "forgot in the injected store");
	assert.equal(globalStore.machines.gamma, undefined, "and never touched the global");
});
