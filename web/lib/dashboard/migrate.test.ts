/**
 * runMachineMigration -- ordering, the point of no return, and fail-closed.
 *
 * The failover walk (lib/mux/failover.ts) and the route resolution
 * (lib/mux/route.ts) run REAL; the vendors, the bootstrap runner, and the
 * statemove transport are faked at their module seams. A shared `trace`
 * array collects every side effect so the ordering assertions read as one
 * sequence: provision -> bootstrap -> export -> restore -> verify -> commit
 * -> source teardown.
 *
 * The invariants under test are the product promise:
 *  - the ORIGINAL machine is never destructively touched before commit,
 *  - every pre-commit failure destroys the NEW sandbox and leaves the old
 *    record, crons, and activeMachineId byte-identical,
 *  - activeMachineId flips only at commit and only if the old machine was
 *    active,
 *  - post-commit source-teardown failure does NOT fail the migration; the
 *    orphan is NAMED in report.source.error.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type CronEntry,
	type MachineRef,
	type MigrationState,
	type UserConfig,
} from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => {
	const trace: string[] = [];
	return {
		trace,
		getUserConfig: vi.fn(),
		setUserConfig: vi.fn(),
		getProvider: vi.fn(),
		createMachineForConfig: vi.fn(),
		runWebBootstrap: vi.fn(),
		finalizeGatewayBootstrap: vi.fn(),
		agentArtifactsPresent: vi.fn(),
		probeGatewayLocal: vi.fn(),
		gatewayPort: vi.fn(() => 8642),
		writeMarker: vi.fn(),
		probeIncludes: vi.fn(),
		buildExportCommand: vi.fn(() => "tar-cmd"),
		exportTar: vi.fn(),
		restoreTar: vi.fn(),
		verifyMarker: vi.fn(),
		/** Tenants the placement store was constructed for, in order. */
		placementTenants: [] as string[],
		/** Placement writes that reached the store. */
		placementWrites: [] as Array<{ tenantId: string; name: string; placement: unknown }>,
		/** Set to make the next remember() reject, for the best-effort path. */
		placementFails: false,
	};
});

vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
	setUserConfig: mocks.setUserConfig,
}));
vi.mock("@/lib/providers", async () => {
	const actual = await vi.importActual<typeof import("@/lib/providers/types")>(
		"@/lib/providers/types",
	);
	return {
		getProvider: mocks.getProvider,
		MachineProviderError: actual.MachineProviderError,
	};
});
vi.mock("@/lib/dashboard/provision", () => ({
	createMachineForConfig: mocks.createMachineForConfig,
}));
vi.mock("@/lib/bootstrap/runner", () => ({
	runWebBootstrap: mocks.runWebBootstrap,
	finalizeGatewayBootstrap: mocks.finalizeGatewayBootstrap,
}));
vi.mock("@/lib/bootstrap/bootstrap-repair", () => ({
	agentArtifactsPresent: mocks.agentArtifactsPresent,
}));
vi.mock("@/lib/bootstrap/gateway-lifecycle", () => ({
	gatewayPort: mocks.gatewayPort,
	probeGatewayLocal: mocks.probeGatewayLocal,
}));
vi.mock("@/lib/memory/bundle", () => ({
	resolveBundle: vi.fn(() => null),
	defaultMemoryBundle: vi.fn(() => ({ docs: {} })),
}));
vi.mock("@/lib/memory/install", () => ({
	bundleInstallLines: vi.fn(() => ["echo docs"]),
}));
vi.mock("@/lib/workers/resolve", () => ({
	resolveMachineWorker: vi.fn(() => ({ memoryBundleId: "mb" })),
}));
// Only the STORE is faked; lib/mux/placements.ts runs for real, so the tenant
// threading and the name-ambiguity guard under test are the production ones.
vi.mock("@/lib/mux/placement-store", () => ({
	createSupabasePlacementStore: (tenantId: string) => {
		mocks.placementTenants.push(tenantId);
		return {
			remember: async (name: string, placement: unknown) => {
				if (mocks.placementFails) throw new Error("supabase placement write failed");
				mocks.trace.push(`placement:remember:${name}`);
				mocks.placementWrites.push({ tenantId, name, placement });
			},
			read: async () => ({ machines: {} }),
			forget: async (name: string) => {
				mocks.trace.push(`placement:forget:${name}`);
			},
		};
	},
}));
vi.mock("agent-machines/mux", () => ({
	// hosted-mux.ts value-imports this; migrate never builds a mux, but the
	// import binding must exist or the mocked module throws on access.
	createMux: vi.fn(),
	MOVE_ALLOWLIST: (agent: string) => ({
		include: [".agent-machines/MEMORY.md", ".agent-machines/skills", `${agent}-state`],
		exclude: [".env"],
	}),
	MOVE_NOTES: () => ["a named unknown"],
	REDERIVED: () => ["harness toolchain: reinstalled"],
	lostState: (from: string) => [`running processes on ${from}`],
	buildExportCommand: mocks.buildExportCommand,
	exportTar: mocks.exportTar,
	probeIncludes: mocks.probeIncludes,
	restoreTar: mocks.restoreTar,
	verifyMarker: mocks.verifyMarker,
	writeMarker: mocks.writeMarker,
}));

import { runMachineMigration } from "@/lib/dashboard/migrate";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type FakeProvider = {
	kind: string;
	capabilities: { canSleep: boolean };
	wake: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	sleep: ReturnType<typeof vi.fn>;
	exec: ReturnType<typeof vi.fn>;
};

let store: UserConfig;
let providers: Record<string, FakeProvider>;
let configWrites: Array<Record<string, unknown>>;

function machine(overrides: Partial<MachineRef> = {}): MachineRef {
	return {
		id: "old-1",
		providerKind: "e2b",
		agentKind: "codex",
		name: "box",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "gpt-5.2-codex",
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: new Date().toISOString(),
		apiUrl: null,
		apiKey: null,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
		...overrides,
	};
}

function cron(id: string, machineId: string): CronEntry {
	return {
		id,
		name: id,
		schedule: "every 1h",
		prompt: "check",
		machineId,
		skills: [],
		enabled: true,
		createdAt: new Date().toISOString(),
		lastRunAt: null,
		lastStatus: null,
		lastSummary: null,
	};
}

function applyPatch(current: UserConfig, patch: Record<string, unknown>): UserConfig {
	let machines = [...current.machines];
	const upsert = patch.upsertMachine as MachineRef | undefined;
	if (upsert) {
		const idx = machines.findIndex((m) => m.id === upsert.id);
		if (idx >= 0) machines[idx] = upsert;
		else machines = [upsert, ...machines];
	}
	const pm = patch.patchMachine as { id: string; patch: Partial<MachineRef> } | undefined;
	if (pm) {
		machines = machines.map((m) => (m.id === pm.id ? { ...m, ...pm.patch } : m));
	}
	if (typeof patch.removeMachine === "string") {
		machines = machines.filter((m) => m.id !== patch.removeMachine);
	}
	return {
		...current,
		machines,
		crons: (patch.crons as CronEntry[] | undefined) ?? current.crons,
		activeMachineId:
			patch.activeMachineId !== undefined
				? (patch.activeMachineId as string | null)
				: current.activeMachineId,
	};
}

function makeProvider(kind: string, canSleep: boolean): FakeProvider {
	return {
		kind,
		capabilities: { canSleep },
		wake: vi.fn(async () => {
			mocks.trace.push(`wake:${kind}`);
			return { state: "ready" };
		}),
		destroy: vi.fn(async (id: string) => {
			mocks.trace.push(`destroy:${kind}:${id}`);
		}),
		sleep: vi.fn(async (id: string) => {
			mocks.trace.push(`sleep:${kind}:${id}`);
		}),
		exec: vi.fn(async (_id: string, cmd: string) => {
			mocks.trace.push(`exec:${kind}:${cmd.split(" ")[0].slice(0, 16)}`);
			return { stdout: "", stderr: "", exitCode: 0 };
		}),
	};
}

function migrationStateOf(machineId: string): MigrationState | undefined {
	return store.machines.find((m) => m.id === machineId)?.migrationState;
}

function refOf(machineId: string): MachineRef | undefined {
	return store.machines.find((m) => m.id === machineId);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.trace.length = 0;
	mocks.placementTenants.length = 0;
	mocks.placementWrites.length = 0;
	mocks.placementFails = false;
	delete process.env.VERCEL_OIDC_TOKEN;

	store = {
		...DEFAULT_USER_CONFIG,
		providers: {
			e2b: { apiKey: "e2b_live" },
			sprites: { apiKey: "sp_live" },
			vercel: { token: "t", teamId: "team", projectId: "proj" },
		},
		machines: [machine(), machine({ id: "other-1", providerKind: "sprites", name: "other" })],
		activeMachineId: "old-1",
		crons: [cron("c1", "old-1"), cron("c2", "other-1")],
	};
	providers = {
		e2b: makeProvider("e2b", true),
		sprites: makeProvider("sprites", false),
		vercel: makeProvider("vercel", true),
		dedalus: makeProvider("dedalus", false),
	};
	configWrites = [];

	mocks.getUserConfig.mockImplementation(async () => structuredClone(store));
	mocks.setUserConfig.mockImplementation(async (patch: Record<string, unknown>) => {
		if (patch.upsertMachine && patch.crons) mocks.trace.push("commit");
		configWrites.push(patch);
		store = applyPatch(store, patch);
		return structuredClone(store);
	});
	mocks.getProvider.mockImplementation((kind: string) => providers[kind]);
	mocks.createMachineForConfig.mockImplementation(
		async (_config: UserConfig, opts: { providerKind: string; activate?: boolean }) => {
			mocks.trace.push(`provision:${opts.providerKind}:activate=${String(opts.activate)}`);
			store = applyPatch(store, {
				upsertMachine: machine({
					id: "new-1",
					providerKind: opts.providerKind as MachineRef["providerKind"],
					bootstrapState: { ...INITIAL_BOOTSTRAP_STATE },
				}),
			});
			return { machineId: "new-1", phase: "provisioned", state: "ready" };
		},
	);
	mocks.runWebBootstrap.mockImplementation(async () => {
		mocks.trace.push("bootstrap");
		return { apiUrl: "https://new.example/v1", apiKey: "new-bearer" };
	});
	mocks.finalizeGatewayBootstrap.mockImplementation(async () => {
		mocks.trace.push("finalize-gateway");
		return { apiUrl: "https://new.example/v1", apiKey: "new-bearer" };
	});
	mocks.agentArtifactsPresent.mockImplementation(async () => {
		mocks.trace.push("artifacts");
		return true;
	});
	mocks.probeGatewayLocal.mockImplementation(async () => {
		mocks.trace.push("gateway-probe");
		return true;
	});
	mocks.writeMarker.mockImplementation(async () => {
		mocks.trace.push("marker-write");
	});
	mocks.probeIncludes.mockImplementation(async () => {
		mocks.trace.push("probe-includes");
		return {
			present: [".agent-machines/MEMORY.md", ".agent-machines/skills"],
			skipped: [{ path: "codex-state", reason: "not present on the source" }],
		};
	});
	mocks.exportTar.mockImplementation(async () => {
		mocks.trace.push("export");
		return { bytes: Buffer.from("tar-bytes"), sha256: "abc123" };
	});
	mocks.restoreTar.mockImplementation(async () => {
		mocks.trace.push("restore");
	});
	mocks.verifyMarker.mockImplementation(async () => {
		mocks.trace.push("marker-verify");
		return { ok: true };
	});
});

const run = (overrides: Partial<Parameters<typeof runMachineMigration>[0]> = {}) =>
	runMachineMigration({
		machineId: "old-1",
		to: "sprites",
		moveState: true,
		source: "destroy",
		userId: "user-alpha",
		...overrides,
	});

/* ------------------------------------------------------------------ */
/* Happy path                                                          */
/* ------------------------------------------------------------------ */

describe("runMachineMigration happy path", () => {
	it("walks provision -> bootstrap -> export -> restore -> verify -> COMMIT -> destroy old, in that order", async () => {
		await run();

		const order = [
			"provision:sprites:activate=false",
			"bootstrap",
			"marker-write",
			"probe-includes",
			"export",
			"restore",
			"marker-verify",
			"commit",
			"destroy:e2b:old-1",
		];
		const positions = order.map((label) => mocks.trace.indexOf(label));
		for (const [index, position] of positions.entries()) {
			expect(position, `${order[index]} missing from trace ${JSON.stringify(mocks.trace)}`).toBeGreaterThanOrEqual(0);
			if (index > 0) {
				expect(position, `${order[index]} ran before ${order[index - 1]}`).toBeGreaterThan(
					positions[index - 1],
				);
			}
		}

		// The old sandbox is destroyed strictly AFTER the commit.
		expect(mocks.trace.indexOf("destroy:e2b:old-1")).toBeGreaterThan(
			mocks.trace.indexOf("commit"),
		);

		const finalState = migrationStateOf("old-1");
		expect(finalState?.phase).toBe("succeeded");
		expect(finalState?.report?.state.moved).toEqual([
			".agent-machines/MEMORY.md",
			".agent-machines/skills",
		]);
		expect(finalState?.report?.state.skipped).toEqual([
			{ path: "codex-state", reason: "not present on the source" },
		]);
		expect(finalState?.report?.verified.marker).toBe(true);
		expect(finalState?.report?.source.action).toBe("destroyed");
		expect(finalState?.report?.newMachineId).toBe("new-1");
		// The new ref carries the same terminal record.
		expect(migrationStateOf("new-1")?.phase).toBe("succeeded");
	});

	it("flips activeMachineId at commit because the old machine was active, and re-points only its crons", async () => {
		await run();
		expect(store.activeMachineId).toBe("new-1");
		expect(store.crons.find((c) => c.id === "c1")?.machineId).toBe("new-1");
		expect(store.crons.find((c) => c.id === "c2")?.machineId).toBe("other-1");
		// destroy => the old RECORD is archived (still readable with its report),
		// never silently removed mid-read.
		expect(refOf("old-1")?.archived).toBe(true);
		expect(refOf("new-1")).toBeDefined();
	});

	it("does NOT flip activeMachineId when the old machine was not active", async () => {
		store.activeMachineId = "other-1";
		await run();
		expect(store.activeMachineId).toBe("other-1");
		const commit = configWrites.find((w) => w.upsertMachine && w.crons);
		expect(commit).toBeDefined();
		expect("activeMachineId" in (commit as Record<string, unknown>)).toBe(false);
	});

	it("uses the gateway probe (not the CLI probe) for hermes and restarts the gateway after restore", async () => {
		store.machines[0] = machine({ agentKind: "hermes" });
		await run();
		expect(mocks.probeGatewayLocal).toHaveBeenCalled();
		expect(mocks.trace).toContain("finalize-gateway");
		expect(migrationStateOf("old-1")?.report?.verified.probe).toContain("gateway");
	});

	it("moveState:false ships no tar and reports marker skipped with the full lost list", async () => {
		await run({ moveState: false });
		expect(mocks.writeMarker).not.toHaveBeenCalled();
		expect(mocks.exportTar).not.toHaveBeenCalled();
		expect(mocks.restoreTar).not.toHaveBeenCalled();
		expect(mocks.verifyMarker).not.toHaveBeenCalled();
		const report = migrationStateOf("old-1")?.report;
		expect(report?.verified.marker).toBe("skipped");
		expect(report?.state.moved).toEqual([]);
		expect(report?.state.bytes).toBe(0);
		expect(report?.state.lost.join(" ")).toContain("moveState:false");
	});
});

/* ------------------------------------------------------------------ */
/* Source disposition                                                  */
/* ------------------------------------------------------------------ */

describe("source disposition (post-commit, never silent)", () => {
	it("park uses provider sleep where supported", async () => {
		// e2b (the source) advertises canSleep in this fixture.
		await run({ source: "park" });
		expect(providers.e2b.sleep).toHaveBeenCalledWith("old-1");
		expect(migrationStateOf("old-1")?.report?.source.action).toBe("parked");
	});

	it("park on a provider without sleep support still succeeds, with the gap NAMED", async () => {
		providers.e2b.capabilities.canSleep = false;
		await run({ source: "park" });
		expect(providers.e2b.sleep).not.toHaveBeenCalled();
		const report = migrationStateOf("old-1")?.report;
		expect(migrationStateOf("old-1")?.phase).toBe("succeeded");
		expect(report?.source.action).toBe("kept");
		expect(report?.source.error).toContain("park is not supported");
	});

	it("keep leaves the old sandbox AND the old record unarchived", async () => {
		await run({ source: "keep" });
		expect(providers.e2b.destroy).not.toHaveBeenCalled();
		expect(providers.e2b.sleep).not.toHaveBeenCalled();
		expect(refOf("old-1")?.archived).toBeUndefined();
		expect(migrationStateOf("old-1")?.report?.source.action).toBe("kept");
	});

	it("a post-commit destroy failure does NOT fail the migration; the orphan is NAMED", async () => {
		providers.e2b.destroy.mockRejectedValue(new Error("metering ledger 500"));
		await run();
		const state = migrationStateOf("old-1");
		expect(state?.phase).toBe("succeeded");
		expect(state?.report?.source.action).toBe("kept");
		expect(state?.report?.source.error).toContain("old-1");
		expect(state?.report?.source.error).toContain("metering ledger 500");
	});
});

/* ------------------------------------------------------------------ */
/* Fail closed: every pre-commit failure                               */
/* ------------------------------------------------------------------ */

type FailureCase = {
	name: string;
	step: string;
	inject: () => void;
};

const FAILURES: FailureCase[] = [
	{
		name: "bootstrap failure",
		step: "bootstrap",
		inject: () => mocks.runWebBootstrap.mockRejectedValue(new Error("install died")),
	},
	{
		name: "export failure (digest mismatch)",
		step: "export",
		inject: () => mocks.exportTar.mockRejectedValue(new Error("sha mismatch")),
	},
	{
		name: "restore failure",
		step: "restore",
		inject: () => mocks.restoreTar.mockRejectedValue(new Error("untar failed")),
	},
	{
		name: "verify failure (marker mismatch)",
		step: "verify",
		inject: () =>
			mocks.verifyMarker.mockResolvedValue({ ok: false, reason: "stale nonce" }),
	},
	{
		name: "verify failure (artifacts missing)",
		step: "verify",
		inject: () => mocks.agentArtifactsPresent.mockResolvedValue(false),
	},
];

describe.each(FAILURES)("pre-commit failure: $name", ({ step, inject }) => {
	it(`destroys the NEW sandbox, leaves the original intact, and records step "${step}"`, async () => {
		inject();
		await run();

		// The NEW sandbox is torn down by its explicit id and its record removed.
		expect(providers.sprites.destroy).toHaveBeenCalledWith("new-1");
		expect(refOf("new-1")).toBeUndefined();

		// The ORIGINAL machine is byte-identical where it matters: record
		// present, not archived, still active, crons untouched.
		expect(refOf("old-1")).toBeDefined();
		expect(refOf("old-1")?.archived).toBeUndefined();
		expect(store.activeMachineId).toBe("old-1");
		expect(store.crons.find((c) => c.id === "c1")?.machineId).toBe("old-1");
		expect(providers.e2b.destroy).not.toHaveBeenCalled();

		// No commit ever happened.
		expect(mocks.trace).not.toContain("commit");

		const state = migrationStateOf("old-1");
		expect(state?.phase).toBe("failed");
		expect(state?.step).toBe(step);
		expect(state?.lastError).toBeTruthy();
	});
});

describe("commit failure (the store refuses the point of no return)", () => {
	it("destroys the new sandbox and keeps the original placement", async () => {
		const realImpl = mocks.setUserConfig.getMockImplementation()!;
		mocks.setUserConfig.mockImplementation(async (patch: Record<string, unknown>) => {
			if (patch.upsertMachine && patch.crons) {
				throw new Error("metadata write refused");
			}
			return realImpl(patch);
		});

		await run();

		expect(providers.sprites.destroy).toHaveBeenCalledWith("new-1");
		expect(refOf("new-1")).toBeUndefined();
		expect(refOf("old-1")?.archived).toBeUndefined();
		expect(store.activeMachineId).toBe("old-1");
		expect(store.crons.find((c) => c.id === "c1")?.machineId).toBe("old-1");
		expect(providers.e2b.destroy).not.toHaveBeenCalled();

		const state = migrationStateOf("old-1");
		expect(state?.phase).toBe("failed");
		expect(state?.step).toBe("commit");
	});
});

/* ------------------------------------------------------------------ */
/* Validate gate: refused before anything is touched                   */
/* ------------------------------------------------------------------ */

describe("validate gate", () => {
	it("refuses a same-substrate migrate with zero provider calls", async () => {
		await run({ to: "e2b" });
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
		expect(providers.e2b.exec).not.toHaveBeenCalled();
		const state = migrationStateOf("old-1");
		expect(state?.phase).toBe("failed");
		expect(state?.step).toBe("validate");
		expect(state?.lastError).toContain("already on e2b");
	});

	it("does NOT special-case vercel: moveState there goes through the normal gate", async () => {
		// An earlier version refused vercel + moveState with "vercel has no
		// persistent disk" -- false per the repo's own capability record
		// (filesystem-snapshot; hasPersistentDisk true; the facade test asserts
		// it). The refusal was removed 2026-08-03; the migration machinery's
		// verify step is the real guard for any target that cannot hold state.
		// The fixture carries a full vercel credential triple and a mocked
		// provider, so the strongest assertion is available: the migration runs
		// the WHOLE pipeline -- provision, state move, verify, commit -- and
		// succeeds, exactly like any other credentialed lane.
		await run({ to: "vercel" });
		const state = migrationStateOf("new-1");
		expect(state?.phase).toBe("succeeded");
		expect(state?.lastError ?? "").not.toContain("persistent disk");
		expect(mocks.createMachineForConfig).toHaveBeenCalled();
	});

	it("refuses an uncredentialed target lane, NAMING the missing key, before any provision", async () => {
		await run({ to: "dedalus" });
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
		const state = migrationStateOf("old-1");
		expect(state?.phase).toBe("failed");
		expect(state?.step).toBe("validate");
		expect(state?.lastError).toContain("DEDALUS_API_KEY");
	});
});

/* ------------------------------------------------------------------ */
/* Mux placement mirror (post-commit, tenant-scoped, best-effort)       */
/* ------------------------------------------------------------------ */

describe("mux placement mirror", () => {
	it("re-points the placement at the new sandbox, under the CALLER's tenant", async () => {
		await run({ userId: "user-alpha" });

		// The store is constructed per operation with the tenant the route
		// resolved -- never a process-global store, which under concurrency is
		// another tenant's placements.
		expect(mocks.placementTenants).toEqual(["user-alpha"]);
		expect(mocks.placementWrites).toEqual([
			{
				tenantId: "user-alpha",
				name: "box",
				// The NEW sandbox on the NEW substrate, carrying the agent that
				// survived the move; the name is what stays constant.
				placement: { substrate: "sprites", sandboxId: "new-1", agent: "codex" },
			},
		]);
		const report = migrationStateOf("new-1")?.report;
		expect(report?.placement).toEqual({ recorded: true, name: "box" });
	});

	it("mirrors AFTER the commit and BEFORE the source is destroyed", async () => {
		// Ordering matters in one direction only: between commit and teardown is
		// the shortest window in which the router could hand a caller a sandbox
		// this migration is about to destroy.
		await run();
		const commit = mocks.trace.indexOf("commit");
		const mirror = mocks.trace.indexOf("placement:remember:box");
		const teardown = mocks.trace.indexOf("destroy:e2b:old-1");
		expect(commit).toBeGreaterThanOrEqual(0);
		expect(mirror).toBeGreaterThan(commit);
		expect(teardown).toBeGreaterThan(mirror);
	});

	it("another tenant's id is the only thing that changes the write's scope", async () => {
		await run({ userId: "user-beta" });
		expect(mocks.placementTenants).toEqual(["user-beta"]);
		expect(mocks.placementWrites.map((w) => w.tenantId)).toEqual(["user-beta"]);
	});

	it("declines to record when source:keep leaves TWO live machines named box", async () => {
		// Both records stay live under the same name, and a placement keyed by
		// that name would resolve to whichever wrote last -- i.e. the SDK could
		// get either sandbox. Refusing is the fail-closed answer, and the reason
		// names both ids.
		await run({ source: "keep" });
		expect(mocks.placementWrites).toEqual([]);
		const report = migrationStateOf("new-1")?.report;
		expect(report?.placement?.recorded).toBe(false);
		expect(report?.placement?.reason).toContain("old-1");
		expect(report?.placement?.reason).toContain("new-1");
		// The migration itself still succeeded: the mirror is bookkeeping.
		expect(migrationStateOf("new-1")?.phase).toBe("succeeded");
	});

	it("a placement-store failure does NOT fail a committed migration, and is REPORTED", async () => {
		mocks.placementFails = true;
		await run();
		const state = migrationStateOf("new-1");
		expect(state?.phase).toBe("succeeded");
		expect(state?.report?.placement).toEqual({
			recorded: false,
			reason: "supabase placement write failed",
		});
		// And the source disposition still ran: a mirror failure must not skip
		// the teardown and leak a sandbox.
		expect(mocks.trace).toContain("destroy:e2b:old-1");
	});

	it("never writes a placement for a migration that failed before commit", async () => {
		mocks.verifyMarker.mockImplementation(async () => ({ ok: false, reason: "sha mismatch" }));
		await run();
		expect(mocks.placementWrites).toEqual([]);
		expect(mocks.placementTenants).toEqual([]);
		expect(migrationStateOf("old-1")?.phase).toBe("failed");
	});
});
