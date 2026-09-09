import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, INITIAL_BOOTSTRAP_STATE, type UserConfig } from "@/lib/user-config/schema";
import { MachineProviderError } from "@/lib/providers/types";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), provider: vi.fn(), submit: vi.fn(), after: vi.fn(), reconcile: vi.fn(), state: vi.fn(), sleep: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: mocks.config }));
vi.mock("@/lib/control-plane/adopt-machine", () => ({ submitMachineIntent: mocks.submit }));
vi.mock("@/lib/providers", async () => ({ getProvider: mocks.provider, MachineProviderError: (await import("@/lib/providers/types")).MachineProviderError }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { POST } from "@/app/api/dashboard/machines/[id]/sleep/route";
import { GET } from "@/app/api/dashboard/machines/[id]/route";

let config: UserConfig;
beforeEach(() => {
	vi.resetAllMocks();
	config = structuredClone(DEFAULT_USER_CONFIG);
	config.machines = [{
		id: "owned-machine", name: "Worker", providerKind: "e2b", agentKind: "claude-code", model: "claude-sonnet-4-6",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 }, createdAt: "2026-09-09T00:00:00Z",
		apiUrl: null, apiKey: null, agentProfileId: null, gatewayProfileId: null, environmentProfileId: null,
		bootstrapPresetId: null, bootstrapState: INITIAL_BOOTSTRAP_STATE,
	}];
	mocks.identity.mockResolvedValue("owner-1");
	mocks.config.mockImplementation(async () => config);
	mocks.provider.mockReturnValue({ capabilities: { canSleep: true }, state: mocks.state, sleep: mocks.sleep, connect: mocks.connect });
	mocks.submit.mockResolvedValue({ accepted: { worker: { id: "worker-1" }, operation: { id: "operation-1", status: "queued" } }, controlPlane: { reconcileNext: mocks.reconcile } });
});

function sleep(id = "owned-machine") {
	return POST(new Request(`https://example.invalid/api/dashboard/machines/${id}/sleep`, { method: "POST", headers: { "idempotency-key": "pause-once" } }), { params: Promise.resolve({ id }) });
}
function unchanged() {
	expect(mocks.submit).not.toHaveBeenCalled();
	expect(mocks.after).not.toHaveBeenCalled();
	expect(mocks.state).not.toHaveBeenCalled();
	expect(mocks.sleep).not.toHaveBeenCalled();
	expect(mocks.connect).not.toHaveBeenCalled();
}

describe("manual pause preflight", () => {
	it("rejects signed-out requests before reading account data", async () => {
		mocks.identity.mockResolvedValue(null);
		expect((await sleep()).status).toBe(401);
		expect(mocks.config).not.toHaveBeenCalled();
		expect(mocks.provider).not.toHaveBeenCalled();
		unchanged();
	});

	it.each(["foreign", "archived"])("checks %s ownership before provider construction or journal adoption", async (kind) => {
		if (kind === "archived") config.machines[0].archived = true;
		expect((await sleep(kind === "foreign" ? "someone-elses-machine" : undefined)).status).toBe(404);
		expect(mocks.config).toHaveBeenCalledWith("owner-1");
		expect(mocks.provider).not.toHaveBeenCalled();
		unchanged();
	});

	it.each(["sprites", "dedalus"] as const)("rejects unsupported %s pause before creating an operation", async (kind) => {
		config.machines[0].providerKind = kind;
		mocks.provider.mockReturnValue({ capabilities: { canSleep: false } });
		const response = await sleep();
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ ok: false, error: "not_supported", message: "This provider does not support manual pause. No compute was stopped." });
		expect(mocks.provider).toHaveBeenCalledExactlyOnceWith(kind, config.providers);
		unchanged();
	});

	it("fails closed if pause support is unknown", async () => {
		mocks.provider.mockReturnValue({ capabilities: {} });
		expect((await sleep()).status).toBe(409);
		unchanged();
	});

	it.each(["e2b", "vercel"] as const)("queues supported %s pause as intent, not an observed sleeping state", async (kind) => {
		config.machines[0].providerKind = kind;
		const response = await sleep();
		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body.summary).toEqual({ phase: "queued", desiredState: "sleeping" });
		expect(body.summary).not.toHaveProperty("state");
		expect(body.statusUrl).toBe("/api/dashboard/control-plane/operations/operation-1");
		expect(mocks.submit).toHaveBeenCalledExactlyOnceWith("owner-1", "owned-machine", { desiredState: "sleeping", idempotencyKey: "pause-once" });
		expect(mocks.after).toHaveBeenCalledTimes(1);
		expect(mocks.state).not.toHaveBeenCalled();
		expect(mocks.sleep).not.toHaveBeenCalled();
		expect(mocks.connect).not.toHaveBeenCalled();
		await mocks.after.mock.calls[0][0]();
		expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith("worker-1");
	});

	it("does not journal anything if provider construction fails", async () => {
		mocks.provider.mockImplementation(() => { throw new MachineProviderError("e2b", "missing_credentials", "A provider key is required."); });
		expect((await sleep()).status).toBe(502);
		unchanged();
	});
});

describe("scoped machine capability propagation", () => {
	it.each([true, false])("returns actual pause capability (%s) with the existing non-waking probe", async (canSleep) => {
		mocks.provider.mockReturnValue({ capabilities: { canSleep }, state: mocks.state, sleep: mocks.sleep, connect: mocks.connect });
		mocks.state.mockResolvedValue({ id: "owned-machine", state: "ready", spec: {} });
		const response = await GET(new Request("https://example.invalid/api/dashboard/machines/owned-machine"), { params: Promise.resolve({ id: "owned-machine" }) });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ machine: { id: "owned-machine", capabilities: { canSleep } }, live: { state: "ready" } });
		expect(mocks.state).toHaveBeenCalledExactlyOnceWith("owned-machine");
		expect(mocks.sleep).not.toHaveBeenCalled();
		expect(mocks.connect).not.toHaveBeenCalled();
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("does not invent capabilities when the provider is unavailable", async () => {
		mocks.provider.mockImplementation(() => { throw new Error("provider unavailable"); });
		const response = await GET(new Request("https://example.invalid/api/dashboard/machines/owned-machine"), { params: Promise.resolve({ id: "owned-machine" }) });
		expect(await response.json()).toMatchObject({ machine: { capabilities: null }, live: { error: "provider unavailable" } });
		unchanged();
	});
});
