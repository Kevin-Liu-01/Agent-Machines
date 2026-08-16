/**
 * POST /api/dashboard/machines/[id]/agent -- the hosted agent router.
 *
 * Lives under lib/ because vitest.config.ts only collects `lib/**` (the
 * provision-route.test.ts precedent). The credential validator is REAL --
 * the 409s below prove the actual gate, not a mock of it.
 *
 * What must hold:
 *  - the record flips agentKind and resets bootstrapState in ONE write
 *    (a poller must never see "openclaw + succeeded" before the install),
 *  - the force bootstrap is scheduled with the ALREADY-FLIPPED machine,
 *  - every refusal (unknown agent, same agent, missing upstream key,
 *    operation already running) happens BEFORE any config write.
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
	getProvider: vi.fn(),
	submitMachineIntent: vi.fn(),
	reconcileNext: vi.fn(),
	after: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
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
vi.mock("@/lib/control-plane/adopt-machine", () => ({
	submitMachineIntent: mocks.submitMachineIntent,
}));
vi.mock("next/server", () => ({ after: mocks.after }));

import { POST } from "@/app/api/dashboard/machines/[id]/agent/route";

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
		apiUrl: "https://old.example/v1",
		apiKey: "old-bearer",
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
		...overrides,
	};
}

function installConfig(config: UserConfig): void {
	mocks.getUserConfig.mockResolvedValue(structuredClone(config));
}

function req(body: unknown): Request {
	return { json: async () => body } as unknown as Request;
}

function ctx(id: string) {
	return { params: Promise.resolve({ id }) };
}

const baseConfig = (): UserConfig => ({
	...DEFAULT_USER_CONFIG,
	providers: { e2b: { apiKey: "e2b_live" } },
	aiProviderKeys: { openrouter: "or_live" },
	machines: [machine()],
	activeMachineId: "m-1",
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.after.mockImplementation((fn: () => unknown) => fn());
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getProvider.mockReturnValue({ kind: "e2b" });
	mocks.reconcileNext.mockResolvedValue(null);
	mocks.submitMachineIntent.mockResolvedValue({
		accepted: {
			worker: { id: "worker-1" },
			operation: { id: "op-1", status: "queued" },
		},
		controlPlane: { reconcileNext: mocks.reconcileNext },
	});
	installConfig(baseConfig());
});

describe("POST /api/dashboard/machines/[id]/agent", () => {
	it("401s when unauthenticated, before any read", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(401);
		expect(mocks.submitMachineIntent).not.toHaveBeenCalled();
	});

	it("400s an unknown agentKind and writes nothing", async () => {
		const res = await POST(req({ agentKind: "gpt-9" }), ctx("m-1"));
		expect(res.status).toBe(400);
		expect(mocks.submitMachineIntent).not.toHaveBeenCalled();
	});

	it("404s an unknown machine", async () => {
		const res = await POST(req({ agentKind: "openclaw" }), ctx("nope"));
		expect(res.status).toBe(404);
	});

	it("400s when the machine already runs the requested agent", async () => {
		const res = await POST(req({ agentKind: "hermes" }), ctx("m-1"));
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("agent_unchanged");
		expect(mocks.submitMachineIntent).not.toHaveBeenCalled();
	});

	it("409s naming the missing key when the target agent has no drivable upstream (real validator)", async () => {
		// claude-code needs a NATIVE anthropic key; openrouter alone is not it.
		const res = await POST(req({ agentKind: "claude-code" }), ctx("m-1"));
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; missing: string[]; message: string };
		expect(body.error).toBe("missing_agent_credentials");
		expect(body.missing).toContain("anthropic");
		expect(body.message).toMatch(/Anthropic/i);
		expect(mocks.submitMachineIntent).not.toHaveBeenCalled();
	});

	it("409s while a bootstrap is running", async () => {
		const config = baseConfig();
		config.machines[0].bootstrapState.phase = "running";
		installConfig(config);
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(409);
		expect(mocks.submitMachineIntent).not.toHaveBeenCalled();
	});

	it("409s while a migration is running", async () => {
		const config = baseConfig();
		config.machines[0].migrationState = {
			phase: "running",
			step: "export",
			startedAt: new Date().toISOString(),
			finishedAt: null,
			lastError: null,
			targetSubstrate: "sprites",
			newMachineId: null,
			report: null,
		};
		installConfig(config);
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(409);
		expect(mocks.submitMachineIntent).not.toHaveBeenCalled();
	});

	it("journals the runtime intent, then schedules reconciliation", async () => {
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(202);
		const body = (await res.json()) as {
			ok: boolean;
			machineId: string;
			agentKind: string;
			bootstrap: string;
		};
		expect(body).toMatchObject({
			ok: true,
			machineId: "m-1",
			agentKind: "openclaw",
			bootstrap: "scheduled",
		});

		expect(mocks.submitMachineIntent).toHaveBeenCalledWith(
			"user-1",
			"m-1",
			expect.objectContaining({
				desiredState: "running",
				spec: { runtime: "openclaw", model: "anthropic/claude-opus-4-8" },
			}),
		);
		expect(mocks.reconcileNext).toHaveBeenCalledWith("worker-1");
	});

	it("carries the SIGNED-IN user into the placement mirror, not a constant", async () => {
		// Mutation guard for the scoping assertion above: with a different signed-in
		// user the tenant handed to the mirror must change with it.
		mocks.getEffectiveUserId.mockResolvedValue("user-beta");
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(202);
		expect(mocks.submitMachineIntent).toHaveBeenCalledWith(
			"user-beta",
			"m-1",
			expect.any(Object),
		);
	});
});
