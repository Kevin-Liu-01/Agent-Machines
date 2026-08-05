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
	setUserConfig: vi.fn(),
	getProvider: vi.fn(),
	scheduleWebBootstrap: vi.fn(),
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
vi.mock("@/lib/bootstrap/schedule-bootstrap", () => ({
	scheduleWebBootstrap: mocks.scheduleWebBootstrap,
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

/** Stateful config store: setUserConfig patches apply so the second
 * getUserConfig (the one that feeds the scheduler) sees the flipped agent. */
function installConfig(config: UserConfig): void {
	let store: UserConfig = structuredClone(config);
	mocks.getUserConfig.mockImplementation(async () => structuredClone(store));
	mocks.setUserConfig.mockImplementation(
		async (patch: {
			patchMachine?: { id: string; patch: Partial<MachineRef> };
		}) => {
			if (patch.patchMachine) {
				store = {
					...store,
					machines: store.machines.map((m) =>
						m.id === patch.patchMachine?.id ? { ...m, ...patch.patchMachine.patch } : m,
					),
				};
			}
			return structuredClone(store);
		},
	);
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
	installConfig(baseConfig());
});

describe("POST /api/dashboard/machines/[id]/agent", () => {
	it("401s when unauthenticated, before any read", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(401);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("400s an unknown agentKind and writes nothing", async () => {
		const res = await POST(req({ agentKind: "gpt-9" }), ctx("m-1"));
		expect(res.status).toBe(400);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
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
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("409s naming the missing key when the target agent has no drivable upstream (real validator)", async () => {
		// claude-code needs a NATIVE anthropic key; openrouter alone is not it.
		const res = await POST(req({ agentKind: "claude-code" }), ctx("m-1"));
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; missing: string[]; message: string };
		expect(body.error).toBe("missing_agent_credentials");
		expect(body.missing).toContain("anthropic");
		expect(body.message).toMatch(/Anthropic/i);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
		expect(mocks.scheduleWebBootstrap).not.toHaveBeenCalled();
	});

	it("409s while a bootstrap is running", async () => {
		const config = baseConfig();
		config.machines[0].bootstrapState.phase = "running";
		installConfig(config);
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(409);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
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
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("flips agentKind + resets bootstrapState in ONE write, then schedules a FORCE bootstrap with the flipped machine", async () => {
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

		// ONE config write carrying agent + reset together.
		expect(mocks.setUserConfig).toHaveBeenCalledTimes(1);
		const patch = mocks.setUserConfig.mock.calls[0][0] as {
			patchMachine: { id: string; patch: Partial<MachineRef> };
		};
		expect(patch.patchMachine.id).toBe("m-1");
		expect(patch.patchMachine.patch.agentKind).toBe("openclaw");
		expect(patch.patchMachine.patch.bootstrapState).toEqual({ ...INITIAL_BOOTSTRAP_STATE });
		// Stale gateway URL is a lie on the new agent; it must be cleared.
		expect(patch.patchMachine.patch.apiUrl).toBeNull();

		// The scheduler receives the ALREADY-FLIPPED machine and force:true --
		// a non-force run would skip the completed start-gateway phase and the
		// new agent's gateway would never start.
		expect(mocks.scheduleWebBootstrap).toHaveBeenCalledTimes(1);
		const [schedMachine, , , options] = mocks.scheduleWebBootstrap.mock.calls[0] as [
			MachineRef,
			unknown,
			unknown,
			{ force?: boolean; placementTenantId?: string },
		];
		expect(schedMachine.agentKind).toBe("openclaw");
		expect(schedMachine.bootstrapState.completed).toEqual([]);
		// placementTenantId is THIS REQUEST's user id: the mux placement mirror
		// that runs after the install is a tenant-scoped write, and a global (or
		// missing) tenant would put one user's placement in another's namespace.
		expect(options).toEqual({ force: true, placementTenantId: "user-1" });
	});

	it("carries the SIGNED-IN user into the placement mirror, not a constant", async () => {
		// Mutation guard for the scoping assertion above: with a different signed-in
		// user the tenant handed to the mirror must change with it.
		mocks.getEffectiveUserId.mockResolvedValue("user-beta");
		const res = await POST(req({ agentKind: "openclaw" }), ctx("m-1"));
		expect(res.status).toBe(202);
		const [, , , options] = mocks.scheduleWebBootstrap.mock.calls[0] as [
			MachineRef,
			unknown,
			unknown,
			{ placementTenantId?: string },
		];
		expect(options.placementTenantId).toBe("user-beta");
	});
});
