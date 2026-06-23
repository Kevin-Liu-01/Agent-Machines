import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MachineRef, ProviderCredentials } from "@/lib/user-config/schema";

const providerMocks = vi.hoisted(() => ({
	getProvider: vi.fn(),
	state: vi.fn(),
	exec: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
	getProvider: providerMocks.getProvider,
	MachineProviderError: class MachineProviderError extends Error {},
}));

import { probeMachine } from "./collector";

const MACHINE: MachineRef = {
	id: "am-openclaw",
	providerKind: "sprites",
	agentKind: "openclaw",
	name: "openclaw",
	spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
	model: "openclaw",
	agentProfileId: null,
	gatewayProfileId: null,
	environmentProfileId: null,
	bootstrapPresetId: null,
	createdAt: "2026-06-23T00:00:00.000Z",
	apiUrl: null,
	apiKey: null,
	bootstrapState: {
		phase: "succeeded",
		current: null,
		completed: [],
		startedAt: "2026-06-23T00:00:00.000Z",
		finishedAt: "2026-06-23T00:00:00.000Z",
		lastError: null,
	},
};

const CREDS = {} as ProviderCredentials;

describe("probeMachine", () => {
	beforeEach(() => {
		providerMocks.state.mockReset();
		providerMocks.exec.mockReset();
		providerMocks.getProvider.mockReturnValue({
			state: providerMocks.state,
			exec: providerMocks.exec,
		});
	});

	it("keeps a ready sample when the optional resource probe fails", async () => {
		providerMocks.state.mockResolvedValue({
			id: MACHINE.id,
			state: "ready",
			rawPhase: "warm",
			spec: MACHINE.spec,
			createdAt: MACHINE.createdAt,
			lastError: null,
		});
		providerMocks.exec.mockRejectedValue(new Error("exec unavailable"));

		await expect(probeMachine(MACHINE, CREDS)).resolves.toMatchObject({
			machineId: MACHINE.id,
			phase: "ready",
			snapshot: null,
		});
	});

	it("does not exec sleeping machines", async () => {
		providerMocks.state.mockResolvedValue({
			id: MACHINE.id,
			state: "sleeping",
			rawPhase: "warm",
			spec: MACHINE.spec,
			createdAt: MACHINE.createdAt,
			lastError: null,
		});

		await expect(probeMachine(MACHINE, CREDS)).resolves.toMatchObject({
			machineId: MACHINE.id,
			phase: "warm",
			snapshot: null,
		});
		expect(providerMocks.exec).not.toHaveBeenCalled();
	});
});
