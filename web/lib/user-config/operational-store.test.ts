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

import { getUserConfigById, setOperationalUserConfigById, setUserConfigById } from "./clerk";
import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type MachineRef,
	type Worker,
	type MemoryBundle,
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
	mocks.getSupabaseUserConfig.mockImplementation(() => mocks.ensureUser());
});

describe("authoritative settings persistence", () => {
	const memory: MemoryBundle = {
		id: "memory-1", name: "Research memory", description: "Saved research", source: "custom",
		docs: { soul: "", agentDocs: "", user: "", memory: "Remember this project" },
		skillIds: [], toolIds: [], mcpServerIds: [],
		createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
	};
	const updateMetadata = vi.fn();
	const row = () => ({
		active_machine_id: machine.id,
		gateway_profiles: [], environment_profiles: [], bootstrap_presets: [],
		custom_loadout: [], loadout_sources: [], memory_bundles: [memory], workers: [worker],
		setup_step: "provisioned", draft_agent_kind: "claude-code", draft_provider_kind: "e2b",
		draft_model: "claude-opus-4-8", draft_spec: machine.spec,
	});

	beforeEach(() => {
		mocks.clerkClient.mockResolvedValue({ users: {
			getUser: vi.fn().mockResolvedValue({
				publicMetadata: { machines: [], workers: [], memoryBundles: [], activeMachineId: null },
				privateMetadata: { providers: { e2b: { apiKey: "existing-key" } } },
				emailAddresses: [],
			}),
			updateUserMetadata: updateMetadata,
		} });
		updateMetadata.mockResolvedValue(undefined);
		mocks.getSupabaseUserConfig.mockResolvedValue(row());
		mocks.listMachines.mockResolvedValue([machine]);
	});

	it("preserves Worker, memory, machine and active selection when an API key changes", async () => {
		const next = await setUserConfigById("tenant-1", { aiProviderKeys: { anthropic: "new-ai-key" } });
		expect(next.machines).toEqual([machine]);
		expect(next.workers).toEqual([worker]);
		expect(next.memoryBundles).toEqual([memory]);
		expect(next.activeMachineId).toBe(machine.id);
		expect(mocks.updateUserConfigColumns).not.toHaveBeenCalled();
		expect(updateMetadata.mock.calls[0][1].privateMetadata.aiProviderKeys).toMatchObject({ anthropic: "new-ai-key" });
	});

	it("writes only the changed wizard column", async () => {
		await setUserConfigById("tenant-1", { draftProviderKind: "sprites" });
		expect(mocks.updateUserConfigColumns).toHaveBeenCalledExactlyOnceWith("tenant-1", { draft_provider_kind: "sprites" });
	});

	it("preserves deliberate empty SQL arrays over old Clerk values", async () => {
		mocks.clerkClient.mockResolvedValue({ users: { getUser: vi.fn().mockResolvedValue({
			publicMetadata: {
				workers: [worker], memoryBundles: [memory],
				environmentProfiles: [{ id: "old-env", name: "Removed environment" }],
				loadoutSources: [{ id: "old-source", name: "Removed source" }],
				customLoadout: [{ id: "old-tool", name: "Removed tool" }],
			}, privateMetadata: {}, emailAddresses: [],
		}) } });
		mocks.getSupabaseUserConfig.mockResolvedValue({ ...row(), workers: [], memory_bundles: [] });
		const config = await getUserConfigById("tenant-1");
		expect(config.workers).toEqual([]);
		expect(config.memoryBundles).toEqual([]);
		expect(config.environmentProfiles).toEqual([]);
		expect(config.loadoutSources).toEqual([]);
		expect(config.customLoadout).toEqual([]);
	});

	it("never resurrects a deleted machine from stale Clerk metadata", async () => {
		mocks.clerkClient.mockResolvedValue({ users: { getUser: vi.fn().mockResolvedValue({
			publicMetadata: { machines: [machine], machineId: "legacy-machine", activeMachineId: machine.id },
			privateMetadata: {}, emailAddresses: [],
		}) } });
		mocks.getSupabaseUserConfig.mockResolvedValue({ ...row(), active_machine_id: null });
		mocks.listMachines.mockResolvedValue([]);
		const config = await getUserConfigById("tenant-1");
		expect(config.machines).toEqual([]);
		expect(config.activeMachineId).toBeNull();
		expect(mocks.seedMachinesFromClerk).not.toHaveBeenCalled();
	});

	it("reports a database read failure instead of rebuilding stale empty state", async () => {
		mocks.getSupabaseUserConfig.mockRejectedValue(new Error("database unavailable"));
		await expect(setUserConfigById("tenant-1", { workers: [] })).rejects.toThrow("database unavailable");
		expect(updateMetadata).not.toHaveBeenCalled();
		expect(mocks.updateUserConfigColumns).not.toHaveBeenCalled();
	});

	it("reports failed Worker persistence instead of claiming it was saved", async () => {
		mocks.updateUserConfigColumns.mockRejectedValue(new Error("workers column write failed"));
		await expect(setUserConfigById("tenant-1", { workers: [worker] })).rejects.toThrow("workers column write failed");
		expect(updateMetadata).not.toHaveBeenCalled();
	});

	it("reports machine writes that fail", async () => {
		mocks.upsertMachine.mockRejectedValue(new Error("machine write failed"));
		await expect(setUserConfigById("tenant-1", { upsertMachine: machine })).rejects.toThrow("machine write failed");
		expect(updateMetadata).not.toHaveBeenCalled();
	});

	it("persists Worker arrays when running without Supabase", async () => {
		vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
		const next = await setUserConfigById("tenant-1", { workers: [worker], memoryBundles: [memory] });
		expect(next.workers).toEqual([worker]);
		expect(updateMetadata.mock.calls[0][1].publicMetadata).toMatchObject({ workers: [worker], memoryBundles: [memory] });
	});
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
