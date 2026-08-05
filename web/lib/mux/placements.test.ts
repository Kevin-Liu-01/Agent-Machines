/**
 * The hosted placement seam: TENANT SCOPING and FAIL CLOSED.
 *
 * These functions are the only thing in web/ that writes the mux router's
 * memory, so the properties worth spending a test on are the ones whose failure
 * is invisible in production:
 *
 *  - every store is constructed with the CALLER's user id, and a different
 *    caller moves it (a constant would satisfy a single-tenant assertion),
 *  - a missing tenant writes NOTHING rather than an unscoped row,
 *  - an ambiguous name is REFUSED: hosted machine names are not unique, and a
 *    placement keyed by a shared name resolves to whichever wrote last, i.e.
 *    the SDK gets a sandbox the dashboard row of that name does not describe,
 *  - forget is guarded by sandbox id, so destroying the OLD record after a
 *    migration cannot strand the new sandbox (unreachable by name, still
 *    billing),
 *  - the read goes through the ROUTER, and an unreadable store is an error --
 *    never an empty list, which would read as "this tenant has nothing".
 *
 * The store and the mux are faked at their module seams (the
 * lib/mux/hosted-mux.test.ts idiom). `lib/mux/route.ts` runs REAL: the
 * credential gate is the fail-closed behavior under test, not a mock of it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type MachineRef,
	type UserConfig,
} from "@/lib/user-config/schema";

type FakeStore = {
	tenantId: string;
	read: ReturnType<typeof vi.fn>;
	remember: ReturnType<typeof vi.fn>;
	forget: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
	createSupabasePlacementStore: vi.fn(),
	createHostedMux: vi.fn(),
}));

vi.mock("@/lib/mux/placement-store", () => ({
	createSupabasePlacementStore: mocks.createSupabasePlacementStore,
}));
vi.mock("@/lib/mux/hosted-mux", () => ({
	createHostedMux: mocks.createHostedMux,
}));

import {
	describeHostedPlacement,
	forgetHostedPlacement,
	readHostedPlacements,
	recordHostedPlacement,
	resolvePlacementName,
} from "@/lib/mux/placements";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function machine(overrides: Partial<MachineRef> = {}): MachineRef {
	return {
		id: "sbx-1",
		providerKind: "e2b",
		agentKind: "codex",
		name: "box",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "gpt-5.2-codex",
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: "2026-08-04T00:00:00.000Z",
		apiUrl: null,
		apiKey: null,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
		...overrides,
	};
}

function config(machines: MachineRef[] = [machine()]): UserConfig {
	return {
		...DEFAULT_USER_CONFIG,
		// e2b and sprites credentialed, dedalus deliberately NOT: the
		// uncredentialed-lane assertions need a lane that stays uncredentialed
		// whatever the developer has exported.
		providers: { e2b: { apiKey: "e2b_live" }, sprites: { apiKey: "sp_live" } },
		machines,
	};
}

/** Stores handed out, in construction order, so scoping is observable. */
let stores: FakeStore[] = [];

function storeFor(tenantId: string): FakeStore {
	const store: FakeStore = {
		tenantId,
		read: vi.fn(async () => ({ machines: {} })),
		remember: vi.fn(async () => undefined),
		forget: vi.fn(async () => undefined),
	};
	stores.push(store);
	return store;
}

/** Muxes handed out, in construction order, with the tenant they were built for. */
let muxes: Array<{ userId: string; placements: ReturnType<typeof vi.fn>; describe: ReturnType<typeof vi.fn> }> = [];

beforeEach(() => {
	vi.clearAllMocks();
	stores = [];
	muxes = [];
	// A developer's exported OIDC token would silently credential the vercel
	// lane and change what `credentialed` reports.
	delete process.env.VERCEL_OIDC_TOKEN;
	mocks.createSupabasePlacementStore.mockImplementation((tenantId: string) => storeFor(tenantId));
	mocks.createHostedMux.mockImplementation((userId: string) => {
		const mux = {
			userId,
			placements: vi.fn(async () => ({})),
			describe: vi.fn(async () => ({ state: "running", rawPhase: "running" })),
		};
		muxes.push(mux);
		return mux;
	});
});

/* ------------------------------------------------------------------ */
/* resolvePlacementName                                                */
/* ------------------------------------------------------------------ */

describe("resolvePlacementName", () => {
	it("accepts the sole live bearer of a name", () => {
		expect(resolvePlacementName(config(), machine())).toEqual({ ok: true, name: "box" });
	});

	it("refuses a name TWO live machines share, naming both ids", () => {
		const conf = config([machine(), machine({ id: "sbx-2" })]);
		const verdict = resolvePlacementName(conf, machine());
		expect(verdict.ok).toBe(false);
		if (verdict.ok) throw new Error("unreachable");
		expect(verdict.reason).toContain("sbx-1");
		expect(verdict.reason).toContain("sbx-2");
		expect(verdict.reason).toContain("whichever wrote last");
	});

	it("ignores an ARCHIVED namesake -- migrate's own post-commit shape", () => {
		// At commit the old record is archived and the new one carries the name;
		// treating the archived row as a conflict would make every migration
		// decline to re-point the placement.
		const conf = config([machine({ archived: true }), machine({ id: "sbx-2" })]);
		expect(resolvePlacementName(conf, machine({ id: "sbx-2" }))).toEqual({
			ok: true,
			name: "box",
		});
	});

	it("refuses a name a DIFFERENT live machine holds", () => {
		const conf = config([machine({ id: "sbx-live" })]);
		const verdict = resolvePlacementName(conf, machine({ id: "sbx-2" }));
		expect(verdict.ok).toBe(false);
		if (verdict.ok) throw new Error("unreachable");
		expect(verdict.reason).toContain("sbx-live");
	});

	it("refuses a blank name: a placement is keyed by it", () => {
		for (const name of ["", "   "]) {
			const verdict = resolvePlacementName(config([]), machine({ name }));
			expect(verdict.ok).toBe(false);
		}
	});
});

/* ------------------------------------------------------------------ */
/* recordHostedPlacement                                               */
/* ------------------------------------------------------------------ */

describe("recordHostedPlacement", () => {
	it("writes under the CALLER's tenant, spelling the placement from the ref", async () => {
		const result = await recordHostedPlacement({
			userId: "user-alpha",
			config: config(),
			machine: machine(),
		});
		expect(result).toEqual({ recorded: true, name: "box" });
		expect(mocks.createSupabasePlacementStore).toHaveBeenCalledWith("user-alpha");
		expect(stores).toHaveLength(1);
		expect(stores[0].remember).toHaveBeenCalledWith("box", {
			substrate: "e2b",
			sandboxId: "sbx-1",
			agent: "codex",
		});
	});

	it("gives two users two stores, so concurrent requests cannot cross", async () => {
		// The mutation guard for the assertion above: a hard-coded tenant, or a
		// module-level store built once, both fail here.
		await recordHostedPlacement({ userId: "user-alpha", config: config(), machine: machine() });
		await recordHostedPlacement({
			userId: "user-beta",
			config: config([machine({ id: "sbx-9", providerKind: "sprites" })]),
			machine: machine({ id: "sbx-9", providerKind: "sprites" }),
		});
		expect(stores.map((s) => s.tenantId)).toEqual(["user-alpha", "user-beta"]);
		expect(stores[0].remember).toHaveBeenCalledTimes(1);
		expect(stores[1].remember).toHaveBeenCalledWith("box", {
			substrate: "sprites",
			sandboxId: "sbx-9",
			agent: "codex",
		});
	});

	it("refuses an empty tenant WITHOUT constructing a store", async () => {
		for (const bad of ["", "   "]) {
			const result = await recordHostedPlacement({
				userId: bad,
				config: config(),
				machine: machine(),
			});
			expect(result).toEqual({
				recorded: false,
				reason: "no tenant id: refusing an unscoped placement write",
			});
		}
		expect(mocks.createSupabasePlacementStore).not.toHaveBeenCalled();
	});

	it("refuses an ambiguous name without touching the store", async () => {
		const result = await recordHostedPlacement({
			userId: "user-alpha",
			config: config([machine(), machine({ id: "sbx-2" })]),
			machine: machine(),
		});
		expect(result.recorded).toBe(false);
		expect(mocks.createSupabasePlacementStore).not.toHaveBeenCalled();
	});

	it("turns a store failure into a REASON and never throws", async () => {
		mocks.createSupabasePlacementStore.mockImplementation((tenantId: string) => {
			const store = storeFor(tenantId);
			store.remember.mockRejectedValue(new Error("supabase: 503"));
			return store;
		});
		const result = await recordHostedPlacement({
			userId: "user-alpha",
			config: config(),
			machine: machine(),
		});
		// Every caller is post-commit: a bookkeeping failure must be reported,
		// not turned into a failed operation whose real work already succeeded.
		expect(result).toEqual({ recorded: false, reason: "supabase: 503" });
	});
});

/* ------------------------------------------------------------------ */
/* forgetHostedPlacement                                               */
/* ------------------------------------------------------------------ */

describe("forgetHostedPlacement", () => {
	function withRemembered(entry: { sandboxId: string; substrate?: string } | null) {
		mocks.createSupabasePlacementStore.mockImplementation((tenantId: string) => {
			const store = storeFor(tenantId);
			store.read.mockResolvedValue({
				machines: entry
					? {
							box: {
								substrate: entry.substrate ?? "e2b",
								sandboxId: entry.sandboxId,
								agent: "codex",
								updatedAt: "2026-08-04T00:00:00.000Z",
							},
						}
					: {},
			});
			return store;
		});
	}

	it("forgets the name when the placement still names THIS sandbox", async () => {
		withRemembered({ sandboxId: "sbx-1" });
		const result = await forgetHostedPlacement({ userId: "user-alpha", machine: machine() });
		expect(result).toEqual({ forgotten: true, name: "box" });
		expect(stores[0].tenantId).toBe("user-alpha");
		expect(stores[0].forget).toHaveBeenCalledWith("box");
	});

	it("LEAVES a placement the name has moved on to (post-migration guard)", async () => {
		// After a migration "box" points at the new sandbox; forgetting it while
		// destroying the old record would strand a live sandbox -- unreachable by
		// name from the SDK, still billing.
		withRemembered({ sandboxId: "sbx-new" });
		const result = await forgetHostedPlacement({ userId: "user-alpha", machine: machine() });
		expect(result.forgotten).toBe(false);
		if (result.forgotten) throw new Error("unreachable");
		expect(result.reason).toContain("sbx-new");
		expect(result.reason).toContain("sbx-1");
		expect(stores[0].forget).not.toHaveBeenCalled();
	});

	it("reports nothing-remembered instead of a blind delete", async () => {
		withRemembered(null);
		const result = await forgetHostedPlacement({ userId: "user-alpha", machine: machine() });
		expect(result).toEqual({ forgotten: false, reason: 'nothing remembered under "box"' });
		expect(stores[0].forget).not.toHaveBeenCalled();
	});

	it("refuses an empty tenant WITHOUT constructing a store", async () => {
		const result = await forgetHostedPlacement({ userId: "  ", machine: machine() });
		expect(result.forgotten).toBe(false);
		expect(mocks.createSupabasePlacementStore).not.toHaveBeenCalled();
	});

	it("reads the tenant it was given, and a different tenant moves it", async () => {
		withRemembered({ sandboxId: "sbx-1" });
		await forgetHostedPlacement({ userId: "user-alpha", machine: machine() });
		await forgetHostedPlacement({ userId: "user-beta", machine: machine() });
		expect(stores.map((s) => s.tenantId)).toEqual(["user-alpha", "user-beta"]);
	});

	it("turns a store failure into a REASON and never throws", async () => {
		mocks.createSupabasePlacementStore.mockImplementation((tenantId: string) => {
			const store = storeFor(tenantId);
			store.read.mockRejectedValue(new Error("supabase: 503"));
			return store;
		});
		const result = await forgetHostedPlacement({ userId: "user-alpha", machine: machine() });
		expect(result).toEqual({ forgotten: false, reason: "supabase: 503" });
	});
});

/* ------------------------------------------------------------------ */
/* readHostedPlacements                                                */
/* ------------------------------------------------------------------ */

describe("readHostedPlacements", () => {
	function withPlacements(entries: Record<string, unknown>) {
		mocks.createHostedMux.mockImplementation((userId: string) => {
			const mux = {
				userId,
				placements: vi.fn(async () => entries),
				describe: vi.fn(async () => ({ state: "running", rawPhase: "running" })),
			};
			muxes.push(mux);
			return mux;
		});
	}

	it("asks the ROUTER, built for the caller's tenant with the caller's config", async () => {
		const conf = config();
		withPlacements({});
		await readHostedPlacements({ userId: "user-alpha", config: conf });
		expect(mocks.createHostedMux).toHaveBeenCalledWith("user-alpha", conf);
		expect(muxes.map((m) => m.userId)).toEqual(["user-alpha"]);
	});

	it("a different signed-in user builds a different mux", async () => {
		// Mutation guard: a constant tenant, or a cached module-level mux, fails.
		withPlacements({});
		await readHostedPlacements({ userId: "user-alpha", config: config() });
		await readHostedPlacements({ userId: "user-beta", config: config() });
		expect(muxes.map((m) => m.userId)).toEqual(["user-alpha", "user-beta"]);
	});

	it("joins placements to records BY SANDBOX ID and reports drift both ways", async () => {
		withPlacements({
			box: {
				substrate: "e2b",
				sandboxId: "sbx-1",
				agent: "codex",
				updatedAt: "2026-08-04T00:00:00.000Z",
			},
			ghost: {
				substrate: "sprites",
				sandboxId: "sbx-gone",
				agent: "hermes",
				updatedAt: "2026-08-03T00:00:00.000Z",
			},
			stale: {
				// Same sandbox as a record that says e2b/codex: the placement
				// disagrees, which is the drift the dashboard must be able to show.
				substrate: "sprites",
				sandboxId: "sbx-2",
				agent: "hermes",
				updatedAt: "2026-08-02T00:00:00.000Z",
			},
		});
		const conf = config([
			machine(),
			machine({ id: "sbx-2", name: "second" }),
			machine({ id: "sbx-3", name: "third" }),
			machine({ id: "sbx-4", name: "archived-one", archived: true }),
		]);

		const { placements, unremembered } = await readHostedPlacements({
			userId: "user-alpha",
			config: conf,
		});

		expect(placements.map((row) => row.name)).toEqual(["box", "ghost", "stale"]);
		expect(placements[0]).toMatchObject({ machineId: "sbx-1", disagrees: false, credentialed: true });
		// A remembered sandbox with no record: the mux knows about something the
		// dashboard cannot explain.
		expect(placements[1]).toMatchObject({ machineId: null, disagrees: false });
		expect(placements[2]).toMatchObject({ machineId: "sbx-2", disagrees: true });
		// Only LIVE records with no placement; the archived one is not "missing".
		expect(unremembered).toEqual([
			{ machineId: "sbx-3", name: "third", providerKind: "e2b" },
		]);
	});

	it("marks a placement on an UNCREDENTIALED lane, naming the missing key", async () => {
		// Remembered but not connectable. Presenting it as usable is the lie; the
		// fixture credentials e2b and sprites only.
		withPlacements({
			box: {
				substrate: "dedalus",
				sandboxId: "sbx-1",
				agent: "codex",
				updatedAt: "2026-08-04T00:00:00.000Z",
			},
		});
		const { placements } = await readHostedPlacements({
			userId: "user-alpha",
			config: config([]),
		});
		expect(placements[0].credentialed).toBe(false);
		expect(placements[0].missingCredentials).toContain("DEDALUS_API_KEY");
	});

	it("propagates a store failure instead of reporting an empty tenant", async () => {
		mocks.createHostedMux.mockImplementation(() => ({
			placements: vi.fn(async () => {
				throw new Error("supabase: 503");
			}),
		}));
		// "unreadable" and "nothing remembered" are different answers, and
		// collapsing them is how a caller creates a second sandbox for a name
		// that already has one.
		await expect(
			readHostedPlacements({ userId: "user-alpha", config: config() }),
		).rejects.toThrow(/503/);
	});
});

/* ------------------------------------------------------------------ */
/* describeHostedPlacement                                             */
/* ------------------------------------------------------------------ */

describe("describeHostedPlacement", () => {
	function withPlacement(substrate: string, describeImpl?: () => Promise<unknown>) {
		const describe = vi.fn(
			describeImpl ?? (async () => ({ state: "paused", rawPhase: "stopped" })),
		);
		mocks.createHostedMux.mockImplementation((userId: string) => {
			const mux = {
				userId,
				placements: vi.fn(async () => ({
					box: {
						substrate,
						sandboxId: "sbx-1",
						agent: "codex",
						updatedAt: "2026-08-04T00:00:00.000Z",
					},
				})),
				describe,
			};
			muxes.push(mux);
			return mux;
		});
		return describe;
	}

	it("returns the no-wake description for a credentialed lane", async () => {
		const describe = withPlacement("e2b");
		const result = await describeHostedPlacement({
			userId: "user-alpha",
			config: config(),
			name: "box",
		});
		expect(result).toEqual({
			ok: true,
			name: "box",
			substrate: "e2b",
			description: { state: "paused", rawPhase: "stopped" },
		});
		expect(describe).toHaveBeenCalledWith("box");
		expect(mocks.createHostedMux).toHaveBeenCalledWith("user-alpha", expect.anything());
	});

	it("FAILS CLOSED on an uncredentialed lane, naming the key, before any vendor call", async () => {
		// mux providers never throw at construction -- they report missing keys
		// from ready() -- so without this gate the request would reach dedalus and
		// come back as an opaque auth error.
		const describe = withPlacement("dedalus");
		const result = await describeHostedPlacement({
			userId: "user-alpha",
			config: config(),
			name: "box",
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.error).toBe("missing_provider_credentials");
		expect(result.missing).toContain("DEDALUS_API_KEY");
		expect(describe).not.toHaveBeenCalled();
	});

	it("reports an unknown name without touching a provider", async () => {
		const describe = withPlacement("e2b");
		const result = await describeHostedPlacement({
			userId: "user-alpha",
			config: config(),
			name: "nope",
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.error).toBe("unknown_placement");
		expect(describe).not.toHaveBeenCalled();
	});

	it("keeps not_supported as its own outcome, not an error", async () => {
		// sprites and dedalus cannot read status without resuming; that is a
		// capability fact, and reporting it as a failure would tell the user
		// something is broken.
		withPlacement("sprites", async () => {
			throw Object.assign(new Error("sprites cannot report status without resuming"), {
				kind: "not_supported",
			});
		});
		const result = await describeHostedPlacement({
			userId: "user-alpha",
			config: config(),
			name: "box",
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.error).toBe("not_supported");
	});

	it("a provider failure is describe_failed, carrying the substrate", async () => {
		withPlacement("e2b", async () => {
			throw new Error("e2b: 500");
		});
		const result = await describeHostedPlacement({
			userId: "user-alpha",
			config: config(),
			name: "box",
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.error).toBe("describe_failed");
		expect(result.substrate).toBe("e2b");
		expect(result.message).toContain("500");
	});
});
