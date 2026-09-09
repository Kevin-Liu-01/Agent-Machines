import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MACHINE_SPEC, DEFAULT_USER_CONFIG, INITIAL_BOOTSTRAP_STATE, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), state: vi.fn(), provision: vi.fn(), wake: vi.fn(), exec: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config }));
vi.mock("@/lib/providers", async (original) => ({
	...await original<typeof import("@/lib/providers")>(),
	getProvider: () => ({ state: mocks.state, provision: mocks.provision, wake: mocks.wake, exec: mocks.exec, capabilities: null }),
}));
import { GET } from "@/app/api/dashboard/machines/route";

const machine: MachineRef = {
	id: "e2b-fixture", providerKind: "e2b", agentKind: "claude-code", name: "Coding Worker",
	spec: { ...DEFAULT_MACHINE_SPEC }, model: "claude-sonnet-4-6", createdAt: "2026-09-09T07:00:00Z",
	agentProfileId: null, gatewayProfileId: null, environmentProfileId: null, bootstrapPresetId: null,
	apiUrl: null, apiKey: null, bootstrapState: INITIAL_BOOTSTRAP_STATE,
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.identity.mockResolvedValue("allocation-owner");
	mocks.config.mockResolvedValue({ ...structuredClone(DEFAULT_USER_CONFIG), machines: [structuredClone(machine)], activeMachineId: machine.id });
	mocks.state.mockResolvedValue({ id: machine.id, state: "sleeping", rawPhase: "paused", lastError: null, spec: { vcpu: 2, memoryMib: 512 } });
});

describe("fleet requested sizing versus provider-reported allocation", () => {
	it("retains requested 1/2048/10 separately from actual 2/512/unknown disk, using only the non-waking state probe", async () => {
		const result = await (await GET()).json();
		expect(result.machines[0].spec).toEqual({ vcpu: 1, memoryMib: 2048, storageGib: 10 });
		expect(result.machines[0].live).toMatchObject({ ok: true, state: "sleeping", spec: { vcpu: 2, memoryMib: 512 } });
		expect(result.machines[0].live.spec).not.toHaveProperty("storageGib");
		expect(mocks.state).toHaveBeenCalledExactlyOnceWith(machine.id);
		expect(mocks.provision).not.toHaveBeenCalled();
		expect(mocks.wake).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("does not fill an absent allocation from requested sizing", async () => {
		mocks.state.mockResolvedValue({ state: "ready", rawPhase: "running", lastError: null });
		const result = await (await GET()).json();
		expect(result.machines[0].live.spec).toEqual({});
		expect(result.machines[0].spec).toEqual(machine.spec);
	});

	it("keeps a failed probe unavailable instead of reporting the request as actual", async () => {
		mocks.state.mockRejectedValue(new Error("provider unavailable"));
		const result = await (await GET()).json();
		expect(result.machines[0].live).toEqual({ ok: false, reason: "provider unavailable" });
		expect(result.machines[0].spec).toEqual(machine.spec);
	});
});
