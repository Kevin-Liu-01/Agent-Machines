/**
 * GET/POST /api/dashboard/machines/[id]/migrate -- validation and scheduling.
 *
 * The orchestrator itself is tested in migrate.test.ts; here the contract is
 * the HTTP surface: every refusal (same lane, unknown lane, uncredentialed
 * lane with the missing keys NAMED, operation already running, vercel target
 * with moveState) happens BEFORE anything is scheduled, and a 202 both
 * persists migrationState "running" and schedules the background run.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type MachineRef,
	type MigrationState,
	type UserConfig,
} from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
	getProvider: vi.fn(),
	runMachineMigration: vi.fn(),
	after: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
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
vi.mock("@/lib/dashboard/migrate", () => ({
	runMachineMigration: mocks.runMachineMigration,
}));
vi.mock("next/server", () => ({ after: mocks.after }));

import { GET, POST } from "@/app/api/dashboard/machines/[id]/migrate/route";

function machine(overrides: Partial<MachineRef> = {}): MachineRef {
	return {
		id: "m-1",
		providerKind: "e2b",
		agentKind: "hermes",
		name: "box",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "anthropic/claude-opus-4-8",
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

/** e2b + sprites credentialed; vercel + dedalus not. */
function config(overrides: Partial<UserConfig> = {}): UserConfig {
	return {
		...DEFAULT_USER_CONFIG,
		providers: { e2b: { apiKey: "e2b_live" }, sprites: { apiKey: "sp_live" } },
		machines: [machine()],
		activeMachineId: "m-1",
		...overrides,
	};
}

function req(body: unknown): Request {
	return { json: async () => body } as unknown as Request;
}

function ctx(id: string) {
	return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.after.mockImplementation((fn: () => unknown) => fn());
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockResolvedValue(config());
	mocks.setUserConfig.mockResolvedValue(config());
	mocks.getProvider.mockReturnValue({ kind: "e2b", capabilities: { canSleep: true } });
	// Make sure VERCEL_OIDC_TOKEN in the test environment cannot credential
	// the vercel lane behind our back (route.ts treats it as an alternative).
	delete process.env.VERCEL_OIDC_TOKEN;
});

describe("GET /api/dashboard/machines/[id]/migrate", () => {
	it("lists credentialed lanes minus the current one, and skipped lanes with missing keys NAMED", async () => {
		const res = await GET(req({}), ctx("m-1"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			current: string;
			lanes: Array<{ substrate: string }>;
			skipped: Array<{ substrate: string; missing: string[] }>;
			contract: { moves: string[]; rederived: string[]; lost: string[] };
		};
		expect(body.current).toBe("e2b");
		expect(body.lanes.map((l) => l.substrate)).toEqual(["sprites"]);
		const dedalus = body.skipped.find((s) => s.substrate === "dedalus");
		expect(dedalus?.missing).toContain("DEDALUS_API_KEY");
		// The static contract rides the same response (one wording everywhere).
		expect(body.contract.moves).toContain(".agent-machines/MEMORY.md");
		expect(body.contract.moves).toContain(".agent-machines/config.yaml");
		expect(body.contract.lost.join(" ")).toMatch(/tmux/);
	});
});

describe("POST /api/dashboard/machines/[id]/migrate", () => {
	it("400s an unknown substrate", async () => {
		const res = await POST(req({ to: "aws" }), ctx("m-1"));
		expect(res.status).toBe(400);
		expect(mocks.runMachineMigration).not.toHaveBeenCalled();
	});

	it("400s a same-lane migrate (a no-op reported as a migration would lie)", async () => {
		const res = await POST(req({ to: "e2b" }), ctx("m-1"));
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("same_substrate");
		expect(mocks.runMachineMigration).not.toHaveBeenCalled();
	});

	it("404s an unknown machine", async () => {
		const res = await POST(req({ to: "sprites" }), ctx("ghost"));
		expect(res.status).toBe(404);
	});

	it("409s an uncredentialed target with the missing keys NAMED, before anything runs", async () => {
		const res = await POST(req({ to: "dedalus" }), ctx("m-1"));
		expect(res.status).toBe(409);
		const body = (await res.json()) as { missing: string[]; message: string };
		expect(body.missing).toContain("DEDALUS_API_KEY");
		expect(body.message).toContain("DEDALUS_API_KEY");
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
		expect(mocks.runMachineMigration).not.toHaveBeenCalled();
	});

	it("409s while a bootstrap is running", async () => {
		const cfg = config();
		cfg.machines[0].bootstrapState.phase = "running";
		mocks.getUserConfig.mockResolvedValue(cfg);
		const res = await POST(req({ to: "sprites" }), ctx("m-1"));
		expect(res.status).toBe(409);
		expect(mocks.runMachineMigration).not.toHaveBeenCalled();
	});

	it("409s while another migration is in flight", async () => {
		const running: MigrationState = {
			phase: "running",
			step: "export",
			startedAt: new Date().toISOString(),
			finishedAt: null,
			lastError: null,
			targetSubstrate: "sprites",
			newMachineId: null,
			report: null,
		};
		const cfg = config();
		cfg.machines[0].migrationState = running;
		mocks.getUserConfig.mockResolvedValue(cfg);
		const res = await POST(req({ to: "sprites" }), ctx("m-1"));
		expect(res.status).toBe(409);
		expect(mocks.runMachineMigration).not.toHaveBeenCalled();
	});

	it("does NOT special-case vercel: moveState there is accepted like any credentialed lane", async () => {
		// An earlier version 409'd vercel + moveState claiming "vercel has no
		// persistent disk" -- contradicted by the repo's own capability record
		// (persistence: filesystem-snapshot; hasPersistentDisk derives true).
		// Removed 2026-08-03. The migrate machinery's verify step is the real
		// guard for a target that cannot hold state.
		const cfg = config({
			providers: {
				e2b: { apiKey: "e2b_live" },
				vercel: { token: "t", teamId: "team", projectId: "proj" },
			},
		});
		mocks.getUserConfig.mockResolvedValue(cfg);

		const withState = await POST(req({ to: "vercel" }), ctx("m-1"));
		expect(withState.status).toBe(202);
		expect(mocks.runMachineMigration).toHaveBeenCalledWith({
			machineId: "m-1",
			to: "vercel",
			moveState: true,
			source: "destroy",
		});

		const withoutState = await POST(req({ to: "vercel", moveState: false }), ctx("m-1"));
		expect(withoutState.status).toBe(202);
		expect(mocks.runMachineMigration).toHaveBeenCalledWith({
			machineId: "m-1",
			to: "vercel",
			moveState: false,
			source: "destroy",
		});
	});

	it("202: persists migrationState running BEFORE scheduling, then schedules the run", async () => {
		const order: string[] = [];
		mocks.setUserConfig.mockImplementation(async () => {
			order.push("persist");
			return config();
		});
		mocks.runMachineMigration.mockImplementation(async () => {
			order.push("run");
		});

		const res = await POST(req({ to: "sprites", source: "keep" }), ctx("m-1"));
		expect(res.status).toBe(202);
		const body = (await res.json()) as { ok: boolean; migration: string };
		expect(body).toMatchObject({ ok: true, migration: "scheduled" });

		expect(order).toEqual(["persist", "run"]);
		const persisted = mocks.setUserConfig.mock.calls[0][0] as {
			patchMachine: { id: string; patch: { migrationState: MigrationState } };
		};
		expect(persisted.patchMachine.id).toBe("m-1");
		expect(persisted.patchMachine.patch.migrationState.phase).toBe("running");
		expect(persisted.patchMachine.patch.migrationState.targetSubstrate).toBe("sprites");
		expect(mocks.runMachineMigration).toHaveBeenCalledWith({
			machineId: "m-1",
			to: "sprites",
			moveState: true,
			source: "keep",
		});
	});
});
