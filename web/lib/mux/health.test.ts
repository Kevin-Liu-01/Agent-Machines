/**
 * Tests for the hosted health gate.
 *
 * Two things are under test and they are different in kind:
 *
 *   1. The CLASSIFICATION is a restatement of `outcomeForError()` from
 *      `src/mux/health.ts` over `ProviderError`, so it is checked against the
 *      real function kind for kind rather than against a table written here. A
 *      restatement that has drifted is the whole risk (a `missing_credentials`
 *      counted as a transport failure would demote a lane forever), and only a
 *      derived assertion catches it.
 *
 *   2. The SCOPE and the FAIL-SOFT behavior are checked against the real
 *      `SubstrateHealth` -- imported, not faked -- with a fake store and an
 *      injected clock. The properties that matter are that samples can only
 *      reach the calling tenant's row, that an unreadable row still lets a
 *      provision proceed, and that a write failure costs a sample and nothing
 *      else.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// The breaker itself is the mux's, value-imported through the compiled package
// (dist/mux/health.js). NOT mocked: a fake breaker would make every ordering
// assertion below a test of the fake.
import { SubstrateHealth, outcomeForError } from "agent-machines/mux/health";
import { MuxError, MUX_ERROR_KINDS } from "agent-machines/mux/types";

import type { SubstrateHealthSnapshot } from "../../../src/mux/health.js";
import type { SubstrateKind } from "@/lib/mux/capabilities";
import type { ProviderError } from "@/lib/providers/types";

const mocks = vi.hoisted(() => ({
	createSupabasePlacementStore: vi.fn((tenantId: string) => ({
		tenantId,
		read: async () => ({}),
		saveHealth: async () => {},
	})),
}));

vi.mock("@/lib/mux/placement-store", () => ({
	createSupabasePlacementStore: mocks.createSupabasePlacementStore,
}));

import {
	healthOutcomeFor,
	loadTenantHealth,
	noHealthGate,
	type HealthStore,
} from "./health";

const ROUTE: readonly SubstrateKind[] = ["e2b", "sprites", "vercel", "dedalus"];

/**
 * Every `ProviderError`. Listed rather than derived because the union has no
 * runtime array in `web/`; the compile check below and the set comparison
 * against `MUX_ERROR_KINDS` in the first test together make a missed kind fail.
 */
const PROVIDER_ERROR_KINDS = [
	"missing_credentials",
	"not_supported",
	"rate_limited",
	"transient",
	"fatal",
] as const;
type ListCoversProviderError = ProviderError extends (typeof PROVIDER_ERROR_KINDS)[number]
	? true
	: never;
const LIST_COVERS_PROVIDER_ERROR: ListCoversProviderError = true;

/** A store that logs what it was asked to do and can be made to fail. */
function fakeStore(
	options: { snapshot?: unknown; readError?: Error; writeError?: Error } = {},
): HealthStore & { saved: SubstrateHealthSnapshot[]; reads: number } {
	const saved: SubstrateHealthSnapshot[] = [];
	return {
		saved,
		reads: 0,
		async read() {
			this.reads += 1;
			if (options.readError) throw options.readError;
			return { health: options.snapshot as SubstrateHealthSnapshot | undefined };
		},
		async saveHealth(snapshot) {
			if (options.writeError) throw options.writeError;
			saved.push(snapshot);
		},
	};
}

/** A snapshot in the real format: `count` transport failures on one lane. */
function snapshotWithFailures(
	substrate: SubstrateKind,
	count: number,
	at: number,
): SubstrateHealthSnapshot {
	const health = new SubstrateHealth({ now: () => at });
	for (let i = 0; i < count; i += 1) health.record(substrate, "transient");
	return health.toJSON();
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("healthOutcomeFor -- the restatement may not drift", () => {
	it("covers exactly the kinds the mux defines", () => {
		expect(LIST_COVERS_PROVIDER_ERROR).toBe(true);
		expect([...PROVIDER_ERROR_KINDS].sort()).toEqual([...MUX_ERROR_KINDS].sort());
	});

	it("classifies every kind the way src/mux/health.ts classifies it", () => {
		for (const kind of PROVIDER_ERROR_KINDS) {
			// The real function, given the real error type it was written for.
			const expected = outcomeForError(new MuxError(kind, `${kind} from a provider`));
			expect(healthOutcomeFor(kind)).toBe(expected);
		}
	});

	it("throws on an unclassified kind instead of guessing transient", () => {
		expect(() => healthOutcomeFor("weather" as ProviderError)).toThrow(
			/Unclassified provider error kind/,
		);
	});
});

describe("loadTenantHealth -- scope", () => {
	it("reads and writes through a store built for THIS tenant", async () => {
		await loadTenantHealth({ tenantId: "user-alpha" });
		await loadTenantHealth({ tenantId: "user-beta" });
		expect(mocks.createSupabasePlacementStore.mock.calls.map((call) => call[0])).toEqual([
			"user-alpha",
			"user-beta",
		]);
	});

	it("refuses to build a store for an empty tenant, and degrades to no health", async () => {
		for (const bad of ["", "   "]) {
			const gate = await loadTenantHealth({ tenantId: bad });
			expect(gate.loaded).toBe(false);
			expect(gate.order(ROUTE)).toEqual([...ROUTE]);
			// Recording must be a no-op rather than a write to some shared row.
			await gate.noteFailure("e2b", "transient", 10);
			expect(gate.stateOf("e2b")).toBe("healthy");
		}
		expect(mocks.createSupabasePlacementStore).not.toHaveBeenCalled();
	});

	it("loads the persisted breaker, so a lane that was failing stays demoted", async () => {
		const at = 1_000_000;
		const store = fakeStore({ snapshot: snapshotWithFailures("e2b", 3, at) });
		const gate = await loadTenantHealth({
			tenantId: "user-alpha",
			store,
			now: () => at + 1_000,
		});
		expect(gate.loaded).toBe(true);
		expect(gate.stateOf("e2b")).toBe("open");
		// e2b was first in the configured order and goes last -- but is still there.
		expect(gate.order(ROUTE)).toEqual(["sprites", "vercel", "dedalus", "e2b"]);
	});

	it("discards a snapshot from an incompatible version rather than misreading it", async () => {
		const at = 1_000_000;
		const foreign = { ...snapshotWithFailures("e2b", 3, at), version: 99 };
		const gate = await loadTenantHealth({
			tenantId: "user-alpha",
			store: fakeStore({ snapshot: foreign }),
			now: () => at + 1_000,
		});
		expect(gate.stateOf("e2b")).toBe("healthy");
		expect(gate.order(ROUTE)).toEqual([...ROUTE]);
	});

	it("probes an open lane again once the cooldown has elapsed", async () => {
		const at = 1_000_000;
		const store = fakeStore({ snapshot: snapshotWithFailures("e2b", 3, at) });
		let clock = at + 1_000;
		const gate = await loadTenantHealth({
			tenantId: "user-alpha",
			store,
			now: () => clock,
		});
		expect(gate.stateOf("e2b")).toBe("open");
		// 30s cooldown (DEFAULT_HEALTH_TUNING); degraded is the half-open state.
		clock = at + 31_000;
		expect(gate.stateOf("e2b")).toBe("degraded");
	});
});

describe("loadTenantHealth -- recording outcomes", () => {
	it("persists a success and closes an open circuit", async () => {
		const at = 2_000_000;
		const store = fakeStore({ snapshot: snapshotWithFailures("sprites", 3, at) });
		const gate = await loadTenantHealth({
			tenantId: "user-alpha",
			store,
			now: () => at + 1_000,
		});
		expect(gate.stateOf("sprites")).toBe("open");
		await gate.noteOk("sprites", 780);
		// CLOSED, not spotless: one success ends the cooldown, and the three
		// failures still inside the 5-minute window keep the lane behind a lane
		// with none. Only ageing out returns it to healthy, which is what stops a
		// single lucky probe from re-promoting a flapping substrate.
		expect(gate.stateOf("sprites")).toBe("degraded");
		expect(store.saved).toHaveLength(1);
		// The saved row is a real snapshot the next process can load, not a blob.
		const reloaded = SubstrateHealth.fromJSON(store.saved[0], { now: () => at + 2_000 });
		expect(reloaded.state("sprites")).toBe("degraded");
		expect(reloaded.stats("sprites").openedAt).toBeUndefined();
		expect(reloaded.stats("sprites").avgLatencyMs).toBe(780);
		// And once the window has aged past it, healthy again with no history.
		const aged = SubstrateHealth.fromJSON(store.saved[0], { now: () => at + 400_000 });
		expect(aged.state("sprites")).toBe("healthy");
	});

	it("opens a circuit after the third consecutive transport failure, not the second", async () => {
		const at = 3_000_000;
		const store = fakeStore();
		const gate = await loadTenantHealth({ tenantId: "user-alpha", store, now: () => at });
		await gate.noteFailure("e2b", "transient", 500);
		expect(gate.stateOf("e2b")).toBe("degraded");
		await gate.noteFailure("e2b", "rate_limited", 500);
		expect(gate.stateOf("e2b")).toBe("degraded");
		await gate.noteFailure("e2b", "transient", 500);
		expect(gate.stateOf("e2b")).toBe("open");
		expect(store.saved).toHaveLength(3);
	});

	it("records a fatal for diagnostics but never opens a circuit with it", async () => {
		const at = 4_000_000;
		const store = fakeStore();
		const gate = await loadTenantHealth({ tenantId: "user-alpha", store, now: () => at });
		for (let i = 0; i < 5; i += 1) await gate.noteFailure("e2b", "fatal", 100);
		// A substrate correctly rejecting a request says nothing about whether it
		// is reachable, so the lane keeps its place in the order.
		expect(gate.stateOf("e2b")).toBe("healthy");
		expect(gate.order(ROUTE)).toEqual([...ROUTE]);
		expect(store.saved).toHaveLength(5);
	});

	it("does not record -- or even write -- a credential or capability gap", async () => {
		const store = fakeStore();
		const gate = await loadTenantHealth({ tenantId: "user-alpha", store, now: () => 5_000 });
		for (const kind of ["missing_credentials", "not_supported"] as const) {
			await gate.noteFailure("dedalus", kind, 5);
		}
		expect(gate.stateOf("dedalus")).toBe("healthy");
		// No row churn either: these fire on every uncredentialed request.
		expect(store.saved).toHaveLength(0);
	});
});

describe("loadTenantHealth -- health never costs a machine", () => {
	it("degrades to no history when the row cannot be read", async () => {
		const store = fakeStore({ readError: new Error("57014 statement timeout") });
		const gate = await loadTenantHealth({ tenantId: "user-alpha", store, now: () => 1 });
		expect(gate.loaded).toBe(false);
		expect(gate.order(ROUTE)).toEqual([...ROUTE]);
		expect(gate.stateOf("e2b")).toBe("healthy");
	});

	it("swallows a write failure: the sample is lost, the request is not", async () => {
		const store = fakeStore({ writeError: new Error("08006 connection failure") });
		const gate = await loadTenantHealth({ tenantId: "user-alpha", store, now: () => 1 });
		await expect(gate.noteOk("e2b", 100)).resolves.toBeUndefined();
		await expect(gate.noteFailure("e2b", "transient", 100)).resolves.toBeUndefined();
		// In-memory evidence still informs THIS request's ordering.
		expect(gate.stateOf("e2b")).toBe("degraded");
	});

	it("reads exactly once, whatever the walk does afterwards", async () => {
		const store = fakeStore();
		const gate = await loadTenantHealth({ tenantId: "user-alpha", store, now: () => 1 });
		gate.order(ROUTE);
		await gate.noteFailure("e2b", "transient", 1);
		gate.stateOf("e2b");
		gate.order(ROUTE);
		expect(store.reads).toBe(1);
	});

	it("orders a permutation even when every lane is open", async () => {
		const at = 6_000_000;
		const health = new SubstrateHealth({ now: () => at });
		for (const kind of ROUTE) {
			for (let i = 0; i < 3; i += 1) health.record(kind, "transient");
		}
		const gate = await loadTenantHealth({
			tenantId: "user-alpha",
			store: fakeStore({ snapshot: health.toJSON() }),
			now: () => at + 1_000,
		});
		// A global blip must not make provisioning impossible: nothing is removed,
		// and a tie keeps the operator's configured preference.
		expect(gate.order(ROUTE)).toEqual([...ROUTE]);
		for (const kind of ROUTE) expect(gate.stateOf(kind)).toBe("open");
	});
});

describe("noHealthGate", () => {
	it("is the pre-2026-08-04 behavior exactly: configured order, no samples", async () => {
		const gate = noHealthGate();
		expect(gate.loaded).toBe(false);
		expect(gate.order(ROUTE)).toEqual([...ROUTE]);
		expect(gate.stateOf("vercel")).toBe("healthy");
		await expect(gate.noteFailure("vercel", "transient", 1)).resolves.toBeUndefined();
		expect(gate.stateOf("vercel")).toBe("healthy");
	});
});
