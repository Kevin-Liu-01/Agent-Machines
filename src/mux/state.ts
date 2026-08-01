/**
 * Placement store for the mux.
 *
 * Named machines are remembered so `mux.connect("name")` works across
 * processes, shells and surfaces (SDK, CLI, local dev server) regardless of
 * which substrate the router placed the machine on. This is deliberately not
 * a daemon: the substrate vendors already persist the sandboxes themselves;
 * we only need to remember where we put things.
 *
 * The store is a seam, not a file. `PlacementStore` is the whole contract --
 * read, remember, forget, saveHealth -- and `LocalJsonPlacementStore` is the
 * default implementation over ~/.agent-machines/mux-state.json. The OSS path
 * is unchanged: no credentials, no network, one file per host. A hosted
 * control plane can install a shared implementation with
 * `setPlacementStore()` so a placement outlives the host that created it
 * (roadmap item 0.4, pillar 12); the guarantees such an implementation owes
 * are spelled out under "Hosted implementations" below.
 *
 * Concurrency: machines are merged, health is replaced.
 *
 *   Two shells creating differently-named machines at the same time must
 *   both survive. The old writer was read-modify-write with no locking and
 *   no atomic replace, so the second writer's copy of the file -- taken
 *   before the first writer's key existed -- clobbered it, and a name that
 *   was never remembered can never be reconnected to while its sandbox
 *   keeps billing. Every writer here therefore takes a lock file, re-reads
 *   inside it, mutates only its own key, and replaces the file by rename.
 *
 *   Health is different, and stays last-writer-wins on purpose. A snapshot
 *   is one whole-store aggregate of a rolling window that each process holds
 *   in memory, so there is no per-key merge to perform: the loser's samples
 *   are gone. That costs at most a short delay before a circuit opens, and
 *   the breaker re-learns from the next outcome (src/mux/health.ts). The
 *   asymmetry that matters is that a health save must still never drop a
 *   machine, which is exactly what it used to do -- so it goes through the
 *   same lock and the same fresh read as every other writer.
 *
 * Staleness: the substrate is the only authority.
 *
 *   A remembered machine can outlive its sandbox (E2B expires paused
 *   sandboxes; a sprite can be deleted out of band). The store never
 *   expires an entry on age, because an age threshold would either delete
 *   live long-running machines or keep dead ones -- neither of which the
 *   store can tell apart. Pruning happens when the substrate says the
 *   sandbox is gone, through `forget()`: `am mux rm` forgets an entry whose
 *   connect/destroy failed (src/commands/mux.ts, commit 1d0cff4) and
 *   `MuxMachine.destroy()` forgets on a successful teardown. `forget()`
 *   therefore also removes entries this version cannot parse, or a garbage
 *   row could never be cleaned up.
 *
 * Hosted implementations must guarantee:
 *
 *   1. Scoping. Names are unique per tenant, never globally. `read()`
 *      returns only the caller's placements.
 *   2. No lost inserts. Remembering one name must not clobber a concurrent
 *      insert of another -- a SQL upsert keyed on (tenant, name) is the
 *      natural form, which removes the read-modify-write entirely rather
 *      than locking it.
 *   3. `saveHealth()` writes the health column only. It must not be
 *      implemented as "replace the tenant's whole document", which is the
 *      bug this file exists to fix.
 *   4. `read()` returns a consistent snapshot: never a half-written
 *      placement, and machines and health from the same point in time.
 *   5. No expiry. See "Staleness" above: rows are pruned by `forget()` on
 *      the substrate's authority, never by a TTL.
 *   6. Durability across hosts. A placement written from one host must be
 *      readable from another, which is the entire point of the seam.
 *   7. Errors are `MuxError`s. A failed machine write must throw
 *      (`transient` when a retry could win, `fatal` otherwise) so the
 *      router tears the sandbox down instead of leaking it; a failed health
 *      write may throw too, since the router already swallows those.
 *   8. Latency. `read()` sits on the create and connect paths: one round
 *      trip, no fan-out.
 *   9. No secrets. A placement holds substrate ids only. Provider keys and
 *      model keys never enter this store.
 *  10. `updatedAt` is UTC ISO 8601 written by the store, from the database
 *      clock rather than the client's, so entries from clock-skewed hosts
 *      stay comparable.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { HARNESS_KINDS, SUBSTRATE_KINDS } from "./config.js";
import type { SubstrateHealthSnapshot } from "./health.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type RememberedMachine = {
	substrate: SubstrateKind;
	sandboxId: string;
	agent: HarnessKind;
	updatedAt: string;
};

/** What a caller supplies; the store owns `updatedAt`. */
export type MachinePlacement = Omit<RememberedMachine, "updatedAt">;

export type MuxState = {
	machines: Record<string, RememberedMachine>;
	/**
	 * Circuit-breaker samples, so a substrate that is failing stays
	 * de-prioritized for the next process too. Optional because older state
	 * files predate it and a missing breaker must degrade to "assume
	 * healthy", never to a crash.
	 */
	health?: SubstrateHealthSnapshot;
};

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

export type Awaitable<T> = T | Promise<T>;

/**
 * The whole placement contract. Four operations, deliberately: anything
 * richer (list by substrate, query by age) would have to be implemented
 * twice, and the router does not need it.
 *
 * Methods are await-tolerant so a hosted store can be asynchronous. The
 * synchronous compatibility functions at the bottom of this file
 * (`readMuxState` and friends) require `synchronous: true`, because the
 * router calls them inline today.
 */
export interface PlacementStore {
	/** Short identifier for diagnostics and error messages. */
	readonly kind: string;
	/** True only when every method returns a value rather than a promise. */
	readonly synchronous: boolean;
	read(): Awaitable<MuxState>;
	remember(name: string, placement: MachinePlacement): Awaitable<void>;
	forget(name: string): Awaitable<void>;
	saveHealth(snapshot: SubstrateHealthSnapshot): Awaitable<void>;
}

/** A store whose operations complete inline. The local JSON store is one. */
export interface SyncPlacementStore extends PlacementStore {
	readonly synchronous: true;
	read(): MuxState;
	remember(name: string, placement: MachinePlacement): void;
	forget(name: string): void;
	saveHealth(snapshot: SubstrateHealthSnapshot): void;
}

// ---------------------------------------------------------------------------
// Local JSON implementation
// ---------------------------------------------------------------------------

/**
 * How long a lock file may sit untouched before another writer may break it.
 *
 * A critical section here is a read, a JSON serialize and a rename -- well
 * under a millisecond. Ten seconds is three orders of magnitude of slack for
 * a suspended laptop or a stopped process, and it bounds the damage from a
 * writer that died holding the lock: after it, the file is writable again.
 */
export const LOCK_STALE_MS = 10_000;

/**
 * How long a writer waits for the lock before failing closed.
 *
 * Larger than LOCK_STALE_MS on purpose: if the budget were smaller, a holder
 * that crashed would fail every writer for the rest of the staleness window
 * instead of being broken by the first one that noticed.
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 15_000;

/** Poll interval while the lock is held by someone else. */
const LOCK_POLL_MS = 2;

/**
 * Cap on stale-lock breaks per acquisition. A lock created a moment ago is
 * never stale, so one break per contender is the real bound; the cap only
 * guarantees termination if a pathological peer recreates a stale lock in a
 * loop.
 */
const MAX_LOCK_BREAKS = 8;

/** Shared word used purely as an Atomics.wait target for a real sync sleep. */
const SLEEP_WORD = new Int32Array(new SharedArrayBuffer(4));

/**
 * Block for `ms`.
 *
 * The writers are synchronous by contract -- `Mux.create()` calls
 * `rememberMachine()` inline -- so there is no `await` to yield with and a
 * busy loop would burn a core. `Atomics.wait` is the only true sleep
 * available on this path.
 */
function sleepSync(ms: number): void {
	Atomics.wait(SLEEP_WORD, 0, 0, ms);
}

export function muxStatePath(): string {
	return (
		process.env.AGENT_MACHINES_MUX_STATE ??
		join(homedir(), ".agent-machines", "mux-state.json")
	);
}

/**
 * The file as parsed, before validation.
 *
 * Writers mutate this shape rather than the validated `MuxState` so an entry
 * that this version cannot parse -- a hand-edit, or a name written by a
 * newer build with a substrate this one does not know -- is preserved by
 * everyone else's writes instead of being silently deleted. "Never drop
 * another writer's key" has to hold for keys we do not understand too.
 */
type RawState = {
	machines: Record<string, unknown>;
	health?: unknown;
};

function readRawState(path: string): RawState {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object") return { machines: {} };
		const record = parsed as Record<string, unknown>;
		const machines = record.machines;
		const usable =
			machines && typeof machines === "object" && !Array.isArray(machines)
				? { ...(machines as Record<string, unknown>) }
				: {};
		return { machines: usable, health: record.health };
	} catch {
		// A missing file is the first-run case and a corrupt one is
		// unrecoverable; both degrade to "nothing remembered" so a bad state
		// file can never stop a machine from being created. The next write
		// replaces it.
		return { machines: {} };
	}
}

function isKnown(kinds: readonly string[], value: unknown): boolean {
	return typeof value === "string" && kinds.includes(value);
}

/**
 * Validate one entry, or reject it.
 *
 * `read()` returns only placements the router can act on: an entry missing
 * its sandbox id, or naming a substrate this build has no adapter for, would
 * otherwise fail deep inside `connect()` with a less useful error. Rejected
 * entries stay on disk (see RawState) and remain removable through
 * `forget()`.
 */
function parsePlacement(raw: unknown): RememberedMachine | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.sandboxId !== "string" || record.sandboxId.length === 0) return null;
	if (!isKnown(SUBSTRATE_KINDS, record.substrate)) return null;
	if (!isKnown(HARNESS_KINDS, record.agent)) return null;
	if (typeof record.updatedAt !== "string" || record.updatedAt.length === 0) return null;
	return {
		substrate: record.substrate as SubstrateKind,
		sandboxId: record.sandboxId,
		agent: record.agent as HarnessKind,
		updatedAt: record.updatedAt,
	};
}

/**
 * Write-path seams.
 *
 * Both exist so concurrency and atomicity can be tested deterministically
 * instead of by racing timers: `beforeLock` is the exact point where a
 * last-writer-wins store loses a peer's insert, and `afterTempWrite` is the
 * only moment at which a partially written file exists on disk.
 */
export type LocalStoreHooks = {
	/** Runs at the start of a write, before the lock is acquired. */
	beforeLock?: () => void;
	/** Runs inside the lock, after the temp file, before the rename. */
	afterTempWrite?: (tempPath: string) => void;
};

export type LocalStoreOptions = {
	/**
	 * Fixed state file. Omit it to resolve AGENT_MACHINES_MUX_STATE (or the
	 * home-directory default) on every operation, which is what keeps the
	 * process-wide default store honest when a test repoints the env var.
	 */
	path?: string;
	lockTimeoutMs?: number;
	lockStaleMs?: number;
	hooks?: LocalStoreHooks;
};

export class LocalJsonPlacementStore implements SyncPlacementStore {
	readonly kind = "local-json";
	readonly synchronous = true;
	private readonly fixedPath?: string;
	private readonly lockTimeoutMs: number;
	private readonly lockStaleMs: number;
	private readonly hooks: LocalStoreHooks;

	constructor(options: LocalStoreOptions = {}) {
		if (options.path !== undefined) this.fixedPath = options.path;
		this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
		this.lockStaleMs = options.lockStaleMs ?? LOCK_STALE_MS;
		this.hooks = options.hooks ?? {};
	}

	path(): string {
		return this.fixedPath ?? muxStatePath();
	}

	/**
	 * Readers take no lock. The file is only ever replaced by rename, so a
	 * reader observes either the whole previous file or the whole next one --
	 * which is the property `commit()` exists to provide.
	 */
	read(): MuxState {
		const raw = readRawState(this.path());
		const machines: Record<string, RememberedMachine> = {};
		for (const [name, value] of Object.entries(raw.machines)) {
			const placement = parsePlacement(value);
			if (placement) machines[name] = placement;
		}
		const state: MuxState = { machines };
		// Cast rather than validate: SubstrateHealth.fromJSON version-checks
		// the snapshot and re-parses every sample, and duplicating that here
		// would be a second place to keep in step with the breaker's shape.
		if (raw.health && typeof raw.health === "object") {
			state.health = raw.health as SubstrateHealthSnapshot;
		}
		return state;
	}

	remember(name: string, placement: MachinePlacement): void {
		if (typeof name !== "string" || name.length === 0) {
			throw new MuxError("fatal", "rememberMachine needs a non-empty machine name");
		}
		const entry: RememberedMachine = {
			...placement,
			updatedAt: new Date().toISOString(),
		};
		// Refuse to write something read() would then hide: a placement that
		// cannot be parsed back is a machine that exists and can never be
		// reached, which is worse than failing the create.
		if (!parsePlacement(entry)) {
			throw new MuxError(
				"fatal",
				`refusing to remember "${name}": incomplete placement (substrate=${String(
					placement.substrate,
				)}, agent=${String(placement.agent)}, sandboxId=${String(placement.sandboxId)})`,
			);
		}
		this.mutate((raw) => ({
			...raw,
			// The base is the read taken inside the lock, and only this one key
			// is touched, so every concurrent writer's name survives.
			machines: { ...raw.machines, [name]: entry },
		}));
	}

	forget(name: string): void {
		this.mutate((raw) => {
			if (!(name in raw.machines)) return null;
			const machines = { ...raw.machines };
			delete machines[name];
			return { ...raw, machines };
		});
	}

	saveHealth(snapshot: SubstrateHealthSnapshot): void {
		// Whole-snapshot replace (see the header): samples are not merged
		// across processes, but the machines map is carried over untouched.
		this.mutate((raw) => ({ ...raw, health: snapshot }));
	}

	/**
	 * Read-modify-write under the lock. The mutator receives the state as it
	 * is on disk right now and returns the state to persist, or null to
	 * persist nothing (so a no-op `forget` does not rewrite the file).
	 */
	private mutate(mutator: (raw: RawState) => RawState | null): void {
		const path = this.path();
		mkdirSync(dirname(path), { recursive: true });
		this.hooks.beforeLock?.();
		const release = this.acquire(path);
		try {
			const next = mutator(readRawState(path));
			if (next) this.commit(path, next);
		} finally {
			release();
		}
	}

	/** Serialize to a sibling temp file, then rename over the target. */
	private commit(path: string, next: RawState): void {
		const temp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
		try {
			writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
			this.hooks.afterTempWrite?.(temp);
			// Rename is atomic within a directory: a concurrent reader sees the
			// old file or the new one, never a truncated one.
			renameSync(temp, path);
		} finally {
			// A failure between the two steps must not leave a half-written
			// sibling behind. After a successful rename there is nothing left
			// to remove, which `force` makes a no-op.
			rmSync(temp, { force: true });
		}
	}

	/**
	 * Take the lock, returning its release.
	 *
	 * Exclusive create (`wx`) is atomic, the same primitive the run-key
	 * registry uses (src/mux/traces.ts), so two processes cannot both hold
	 * it. Without it, atomic replace alone would still lose data: both
	 * writers would read the same state and the second rename would win.
	 */
	private acquire(path: string): () => void {
		const lockPath = `${path}.lock`;
		const deadline = Date.now() + this.lockTimeoutMs;
		let breaks = 0;
		for (;;) {
			try {
				writeFileSync(lockPath, `${process.pid}@${hostname()}\n`, {
					encoding: "utf8",
					flag: "wx",
				});
				return () => {
					rmSync(lockPath, { force: true });
				};
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST") {
					throw new MuxError(
						"fatal",
						`cannot lock the mux state file ${lockPath}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
			}
			if (breaks < MAX_LOCK_BREAKS && this.breakIfStale(lockPath)) {
				breaks += 1;
				continue;
			}
			if (Date.now() >= deadline) {
				// transient because a retry is exactly what fixes it. The router
				// will fold this into the substrate's health window, which is
				// the wrong attribution -- but that is pre-existing (any
				// writeFileSync failure here already did the same) and belongs
				// to create(), not to the store.
				throw new MuxError(
					"transient",
					`mux state file is locked by ${this.lockOwner(lockPath)} after ${
						this.lockTimeoutMs
					}ms: ${lockPath}`,
				);
			}
			sleepSync(LOCK_POLL_MS);
		}
	}

	/** True when the lock was removed or had already vanished. */
	private breakIfStale(lockPath: string): boolean {
		try {
			const age = Date.now() - statSync(lockPath).mtimeMs;
			if (age < this.lockStaleMs) return false;
		} catch {
			// Gone between our create attempt and this stat: retry at once.
			return true;
		}
		try {
			rmSync(lockPath, { force: true });
			return true;
		} catch {
			return false;
		}
	}

	private lockOwner(lockPath: string): string {
		try {
			const owner = readFileSync(lockPath, "utf8").trim();
			return owner.length > 0 ? owner : "an unknown writer";
		} catch {
			return "an unknown writer";
		}
	}
}

// ---------------------------------------------------------------------------
// Active store
// ---------------------------------------------------------------------------

let activeStore: PlacementStore | null = null;

/**
 * The store every mux surface reads through. Defaults to the local JSON
 * file, constructed lazily and kept: it resolves its path per operation, so
 * caching the instance cannot pin a stale AGENT_MACHINES_MUX_STATE.
 */
export function getPlacementStore(): PlacementStore {
	if (!activeStore) activeStore = new LocalJsonPlacementStore();
	return activeStore;
}

/** Install a store (hosted path, tests). `null` restores the local default. */
export function setPlacementStore(store: PlacementStore | null): void {
	activeStore = store;
}

function isSyncStore(store: PlacementStore): store is SyncPlacementStore {
	return store.synchronous;
}

/**
 * Fail closed rather than returning a promise from a function typed to
 * return a value: the router would treat the promise as state and silently
 * see no machines.
 */
function syncStore(): SyncPlacementStore {
	const store = getPlacementStore();
	if (isSyncStore(store)) return store;
	throw new MuxError(
		"fatal",
		`placement store "${store.kind}" is asynchronous; readMuxState/rememberMachine/forgetMachine/saveHealth are the synchronous API. Await getPlacementStore() instead.`,
	);
}

// ---------------------------------------------------------------------------
// Synchronous API (what the router and CLI call today)
// ---------------------------------------------------------------------------

export function readMuxState(): MuxState {
	return syncStore().read();
}

export function rememberMachine(name: string, machine: MachinePlacement): void {
	syncStore().remember(name, machine);
}

export function forgetMachine(name: string): void {
	syncStore().forget(name);
}

/** Persist the circuit-breaker snapshot. Health semantics: see the header. */
export function saveHealth(snapshot: SubstrateHealthSnapshot): void {
	syncStore().saveHealth(snapshot);
}
