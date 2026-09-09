import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";
const mocks = vi.hoisted(() => ({ config: vi.fn(), state: vi.fn(), wake: vi.fn(), exec: vi.fn(), chats: vi.fn(), artifacts: vi.fn() }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config }));
vi.mock("@/lib/user-config/request-cache", () => ({ getUserConfigCached: mocks.config }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: async () => "tenant" }));
vi.mock("@/lib/providers", async (original) => ({
	...await original<typeof import("@/lib/providers")>(),
	getProvider: () => ({ capabilities: { hasPersistentDisk: true }, state: mocks.state, wake: mocks.wake, exec: mocks.exec }),
}));
vi.mock("@/lib/storage/machine-chats", () => ({ listChats: mocks.chats, deleteChat: vi.fn(), loadChat: vi.fn(), saveChat: vi.fn() }));
vi.mock("@/lib/storage/machine-artifacts", () => ({ listArtifactInventory: mocks.artifacts, saveArtifact: vi.fn() }));
import { GET as getChats } from "@/app/api/dashboard/chats/route";
import { GET as getArtifacts } from "@/app/api/dashboard/artifacts/route";
import { withActiveMachine } from "./machine-fs";

beforeEach(() => {
	vi.clearAllMocks();
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.machines = [{ id: "paused-worker", providerKind: "e2b", agentKind: "claude-code" } as MachineRef];
	config.activeMachineId = "paused-worker";
	mocks.config.mockResolvedValue(config); mocks.state.mockResolvedValue({ state: "sleeping" });
	mocks.chats.mockResolvedValue([]); mocks.artifacts.mockResolvedValue({ artifacts: [], warnings: [] });
});
describe("passive saved-work reads never wake compute", () => {
	it.each([getChats, getArtifacts])("returns an explicit asleep response from the real GET handler with no wake or exec", async (get) => {
		const response = await get(new Request("https://app.test/api/dashboard/read?machineId=paused-worker"));
		expect(await response.json()).toMatchObject({ ok: false, reason: "machine_asleep", machineId: "paused-worker" });
		expect(mocks.wake).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
		expect(mocks.chats).not.toHaveBeenCalled(); expect(mocks.artifacts).not.toHaveBeenCalled();
	});
	it("repeated polling leaves the machine paused", async () => {
		for (let poll = 0; poll < 3; poll++) await withActiveMachine("paused-worker");
		expect(mocks.wake).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
	});
	it.each(["destroyed", "destroying"])("reports %s as missing rather than a machine that is starting or can wake", async (state) => {
		mocks.state.mockResolvedValue({ state });
		expect(await withActiveMachine("paused-worker")).toMatchObject({ ok: false, reason: "machine_missing", message: expect.stringMatching(/not.*wake|cannot.*wake/i) });
		expect(mocks.wake).not.toHaveBeenCalled();
	});
	it("reads storage only when the no-wake status probe reports ready", async () => {
		mocks.state.mockResolvedValue({ state: "ready" });
		const response = await getChats(new Request("https://app.test/api/dashboard/chats?machineId=paused-worker"));
		expect(await response.json()).toMatchObject({ ok: true, machineId: "paused-worker" });
		expect(mocks.chats).toHaveBeenCalledTimes(1); expect(mocks.wake).not.toHaveBeenCalled();
	});
});
