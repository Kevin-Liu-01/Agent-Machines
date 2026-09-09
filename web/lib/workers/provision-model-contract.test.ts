import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type AgentKind, type UserConfig } from "@/lib/user-config/schema";
import { DEFAULT_CODEX_MODEL } from "@/lib/agents/runtime-model";
import { newWorker } from "@/lib/workers/resolve";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), save: vi.fn(), controlPlane: vi.fn(), apply: vi.fn(), reconcile: vi.fn(), recommend: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config, setUserConfig: mocks.save }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: mocks.controlPlane }));
vi.mock("@/lib/learning/recommend", () => ({ recommendArm: mocks.recommend }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { POST as deployWorker } from "@/app/api/dashboard/workers/[id]/deploy/route";
import { POST as provisionMachine } from "@/app/api/dashboard/admin/provision-machine/route";

type Flow = "template-deploy" | "admin-existing" | "admin-new";
let config: UserConfig;
beforeEach(() => {
	vi.clearAllMocks();
	config = structuredClone(DEFAULT_USER_CONFIG);
	config.providers.e2b = { apiKey: "test-e2b-key" };
	config.aiProviderKeys.custom = { url: "https://custom-model.example.invalid/v1", key: "test-custom-key" };
	mocks.identity.mockResolvedValue("user-1");
	mocks.config.mockImplementation(async () => config);
	mocks.save.mockImplementation(async (patch: Partial<UserConfig>) => { config = { ...config, ...patch }; return config; });
	mocks.controlPlane.mockReturnValue({ apply: mocks.apply, reconcileNext: mocks.reconcile });
	mocks.apply.mockResolvedValue({ worker: { status: { phase: "pending", placement: null } }, operation: { id: "operation-1", status: "queued" } });
	mocks.after.mockImplementation(() => {});
});

async function launch(flow: Flow, model?: string, gatewayProfileId = "custom-router", agentKind: AgentKind = "hermes") {
	const worker = { ...newWorker({ name: "Custom Worker", agentKind, model: model ?? "", gatewayProfileId }), id: "saved-worker" };
	config.workers = flow === "admin-new" ? [] : [worker];
	const body = { providerKind: "e2b", agentKind, gatewayProfileId, ...(model !== undefined ? { model } : {}), ...(flow === "admin-existing" ? { workerId: worker.id } : {}) };
	const request = new Request("https://example.invalid/api/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
	return flow === "template-deploy" ? deployWorker(request, { params: Promise.resolve({ id: worker.id }) }) : provisionMachine(request);
}

describe.each(["template-deploy", "admin-existing", "admin-new"] as const)("endpoint-aware model survives %s", (flow) => {
	it.each(["hermes", "openclaw"] as const)("preserves a bare gpt-custom-id for %s without adding an OpenAI prefix", async (agent) => {
		const response = await launch(flow, "  gpt-custom-id  ", " custom-router ", agent);
		expect(response.status).toBe(202);
		expect(mocks.apply.mock.calls[0][0].spec).toMatchObject({ runtime: agent, model: "gpt-custom-id", gatewayProfileId: "custom-router" });
		expect(mocks.after).toHaveBeenCalledTimes(1);
		if (flow === "admin-new") expect(config.workers[0].model).toBe("gpt-custom-id");
		else expect(mocks.save).not.toHaveBeenCalled();
	});

	it("preserves an opaque custom namespace exactly", async () => {
		expect((await launch(flow, "vendor-a/family:model-v2")).status).toBe(202);
		expect(mocks.apply.mock.calls[0][0].spec.model).toBe("vendor-a/family:model-v2");
	});

	it("requires a model on custom endpoints before saving or scheduling provisioning", async () => {
		const response = await launch(flow);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "model_required", message: expect.stringContaining("model ID") });
		expect(mocks.save).not.toHaveBeenCalled();
		expect(mocks.controlPlane).not.toHaveBeenCalled();
		expect(mocks.after).not.toHaveBeenCalled();
	});

	it("rejects a saved or explicit Claude model on a native OpenAI endpoint before paid work", async () => {
		config.aiProviderKeys = { openai: "test-openai-key" };
		const response = await launch(flow, "anthropic/claude-sonnet-4-6", "openai-router");
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "model_required", message: expect.stringContaining("OpenAI model") });
		expect(mocks.save).not.toHaveBeenCalled();
		expect(mocks.controlPlane).not.toHaveBeenCalled();
		expect(mocks.after).not.toHaveBeenCalled();
	});
});

it("resolves a new default against actual credential fallback, not the unrelated draft model", async () => {
	config.aiProviderKeys = { openai: "test-openai-key" };
	config.draftModel = "anthropic/claude-opus-4-8";
	expect((await launch("admin-new", undefined, "vercel-ai-gateway")).status).toBe(202);
	expect(mocks.apply.mock.calls[0][0].spec.model).toBe(`openai/${DEFAULT_CODEX_MODEL}`);
	expect(config.workers[0].model).toBe(`openai/${DEFAULT_CODEX_MODEL}`);
});

it("an admin launch honors the existing Worker's exact custom model over body draft overrides", async () => {
	config.workers = [{ ...newWorker({ name: "Existing", agentKind: "hermes", model: "gpt-existing-exact", gatewayProfileId: "custom-router" }), id: "saved-worker" }];
	const response = await provisionMachine(new Request("https://example.invalid/api/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workerId: "saved-worker", providerKind: "e2b", model: "openai/gpt-ignore-this-draft", gatewayProfileId: "openai-router" }) }));
	expect(response.status).toBe(202);
	expect(mocks.apply.mock.calls[0][0].spec).toMatchObject({ model: "gpt-existing-exact", gatewayProfileId: "custom-router" });
	expect(mocks.save).not.toHaveBeenCalled();
});
