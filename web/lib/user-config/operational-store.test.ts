import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	clerkClient: vi.fn(),
	ensureUser: vi.fn(),
	getSupabaseUserConfig: vi.fn(),
	listMachines: vi.fn(),
	seedMachinesFromClerk: vi.fn(),
	updateUserConfigColumns: vi.fn(),
	upsertMachine: vi.fn(),
	patchMachine: vi.fn(),
	archiveMachine: vi.fn(),
	deleteMachine: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mocks.clerkClient }));
vi.mock("@/lib/supabase/users", () => ({
	ensureUser: mocks.ensureUser,
	getUserConfig: mocks.getSupabaseUserConfig,
	updateUserConfigColumns: mocks.updateUserConfigColumns,
}));
vi.mock("@/lib/supabase/machines", () => ({
	listMachines: mocks.listMachines,
	seedMachinesFromClerk: mocks.seedMachinesFromClerk,
	upsertMachine: mocks.upsertMachine,
	patchMachine: mocks.patchMachine,
	archiveMachine: mocks.archiveMachine,
	deleteMachine: mocks.deleteMachine,
}));
vi.mock("./identity", () => ({
	getEffectiveUserId: vi.fn(),
	isDevUserId: () => false,
}));
vi.mock("./dev-store", () => ({
	getDevUserConfig: vi.fn(),
	setDevUserConfig: vi.fn(),
}));

import { getUserConfigById, setOperationalUserConfigById } from "./clerk";
import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type MachineRef,
	type Worker,
} from "./schema";

const machine: MachineRef = {
	id: "machine-1",
	providerKind: "e2b",
	agentKind: "claude-code",
	name: "test machine",
	spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
	model: "anthropic/claude-sonnet-4-6",
	agentProfileId: null,
	gatewayProfileId: "vercel-ai-gateway",
	environmentProfileId: null,
	bootstrapPresetId: null,
	createdAt: "2026-08-14T17:00:00.000Z",
	apiUrl: null,
	apiKey: "machine-secret",
	bootstrapState: INITIAL_BOOTSTRAP_STATE,
};

const worker: Worker = {
	id: "worker-1",
	name: "Claude Code worker",
	source: "custom",
	agentKind: "claude-code",
	model: "anthropic/claude-sonnet-4-6",
	gatewayProfileId: "vercel-ai-gateway",
	memoryBundleId: "am-default",
	rolePrompt: null,
	lastMachineId: machine.id,
	createdAt: "2026-08-14T17:00:00.000Z",
	updatedAt: "2026-08-14T17:00:00.000Z",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
	mocks.updateUserConfigColumns.mockResolvedValue(undefined);
	mocks.upsertMachine.mockResolvedValue(undefined);
	mocks.patchMachine.mockResolvedValue(undefined);
	mocks.archiveMachine.mockResolvedValue(undefined);
	mocks.deleteMachine.mockResolvedValue(undefined);
});

describe("getUserConfigById active machine ownership", () => {
	it("prefers Supabase active_machine_id over stale Clerk metadata", async () => {
		const target = {
			...machine,
			id: "sprite-2",
			providerKind: "sprites" as const,
			name: "sprite",
		};
		mocks.clerkClient.mockResolvedValue({
			users: {
				getUser: vi.fn().mockResolvedValue({
					publicMetadata: {
						activeMachineId: machine.id,
						machines: [{ ...machine, apiKey: undefined }],
					},
					privateMetadata: {},
					emailAddresses: [],
				}),
			},
		});
		mocks.ensureUser.mockResolvedValue({
			active_machine_id: target.id,
			gateway_profiles: [],
			environment_profiles: [],
			bootstrap_presets: [],
			custom_loadout: [],
			loadout_sources: [],
			memory_bundles: [],
			workers: [],
		});
		mocks.listMachines.mockResolvedValue([machine, target]);

		const config = await getUserConfigById("tenant-1");

		expect(config.activeMachineId).toBe(target.id);
		expect(config.machines.map((candidate) => candidate.id)).toEqual([
			machine.id,
			target.id,
		]);
	});
});

describe("setOperationalUserConfigById", () => {
	it("writes lifecycle state to Supabase without touching Clerk", async () => {
		const current = {
			...DEFAULT_USER_CONFIG,
			providers: { e2b: { apiKey: "provider-secret" } },
		};

		const next = await setOperationalUserConfigById("tenant-1", current, {
			workers: [worker],
			upsertMachine: machine,
			activeMachineId: machine.id,
		});

		expect(mocks.clerkClient).not.toHaveBeenCalled();
		expect(mocks.updateUserConfigColumns).toHaveBeenCalledWith("tenant-1", {
			workers: [worker],
			active_machine_id: machine.id,
		});
		expect(mocks.upsertMachine).toHaveBeenCalledWith("tenant-1", machine);
		expect(next.machines).toEqual([machine]);
		expect(next.workers).toEqual([worker]);
		expect(next.providers.e2b?.apiKey).toBe("provider-secret");
	});

	it("patches and removes a machine without rewriting user metadata", async () => {
		const current = {
			...DEFAULT_USER_CONFIG,
			machines: [machine],
			activeMachineId: machine.id,
		};

		const patched = await setOperationalUserConfigById("tenant-1", current, {
			patchMachine: {
				id: machine.id,
				patch: { bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "running" } },
			},
		});
		expect(mocks.patchMachine).toHaveBeenCalledOnce();
		expect(patched.machines[0]?.bootstrapState.phase).toBe("running");

		const removed = await setOperationalUserConfigById("tenant-1", patched, {
			removeMachine: machine.id,
		});
		expect(mocks.deleteMachine).toHaveBeenCalledWith("tenant-1", machine.id);
		expect(mocks.updateUserConfigColumns).toHaveBeenLastCalledWith("tenant-1", {
			active_machine_id: null,
		});
		expect(mocks.clerkClient).not.toHaveBeenCalled();
		expect(removed.machines).toEqual([]);
		expect(removed.activeMachineId).toBeNull();
	});
});
