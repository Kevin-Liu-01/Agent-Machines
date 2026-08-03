/**
 * PATCH /api/dashboard/machines/[id] -- agentKind is no longer patchable.
 *
 * The old behavior wrote ONLY the DB record: the sandbox kept running the old
 * harness and the dashboard label lied. The field now 400s and points at the
 * action endpoint (POST machines/[id]/agent), which installs, verifies, then
 * relabels. Everything else PATCH does (name, model, active) is unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type MachineRef,
	type UserConfig,
} from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
	getProvider: vi.fn(),
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

import { PATCH } from "@/app/api/dashboard/machines/[id]/route";

function machine(): MachineRef {
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
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE },
	};
}

function config(): UserConfig {
	return { ...DEFAULT_USER_CONFIG, machines: [machine()], activeMachineId: "m-1" };
}

function req(body: unknown): Request {
	return { json: async () => body } as unknown as Request;
}

function ctx(id: string) {
	return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockResolvedValue(config());
	mocks.setUserConfig.mockResolvedValue(config());
});

describe("PATCH /api/dashboard/machines/[id] agentKind rejection", () => {
	it("400s any body carrying agentKind and names the action endpoint", async () => {
		const res = await PATCH(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string; message: string };
		expect(body.error).toBe("agent_kind_immutable");
		expect(body.message).toContain("/api/dashboard/machines/m-1/agent");
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("rejects agentKind even when combined with otherwise-valid fields (no partial apply)", async () => {
		const res = await PATCH(req({ name: "new-name", agentKind: "codex" }), ctx("m-1"));
		expect(res.status).toBe(400);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("still patches name without agentKind", async () => {
		const res = await PATCH(req({ name: "renamed" }), ctx("m-1"));
		expect(res.status).toBe(200);
		const patch = mocks.setUserConfig.mock.calls[0][0] as {
			patchMachine?: { patch: Partial<MachineRef> };
		};
		expect(patch.patchMachine?.patch.name).toBe("renamed");
	});

	it("still supports { active: true }", async () => {
		const res = await PATCH(req({ active: true }), ctx("m-1"));
		expect(res.status).toBe(200);
		const patch = mocks.setUserConfig.mock.calls[0][0] as { activeMachineId?: string };
		expect(patch.activeMachineId).toBe("m-1");
	});
});
