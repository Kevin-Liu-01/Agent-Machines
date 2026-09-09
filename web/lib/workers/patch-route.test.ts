import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type AgentKind, type UserConfig, type Worker } from "@/lib/user-config/schema";
import { DEFAULT_CODEX_MODEL } from "@/lib/agents/runtime-model";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), save: vi.fn(), getWorker: vi.fn(), apply: vi.fn(), submit: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config, setUserConfig: mocks.save, getUserConfigById: vi.fn(), setUserConfigById: vi.fn() }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: () => ({ store: { getWorker: mocks.getWorker }, apply: mocks.apply, reconcileNext: vi.fn() }) }));
vi.mock("@/lib/control-plane/adopt-machine", () => ({ submitMachineIntent: mocks.submit }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { PATCH } from "@/app/api/dashboard/workers/[id]/route";

let config: UserConfig;
function worker(agentKind: AgentKind = "hermes"): Worker {
	return { id: "worker-1", name: "Specialist", source: "custom", agentKind, model: "gpt-custom-id", gatewayProfileId: "custom-router", memoryBundleId: "barebones", rolePrompt: null, lastMachineId: "machine-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}
function request(body: unknown) {
	return new Request("https://example.invalid/api/dashboard/workers/worker-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function patch(body: unknown) { return PATCH(request(body), { params: Promise.resolve({ id: "worker-1" }) }); }
function assertNoMutation() {
	expect(mocks.apply).not.toHaveBeenCalled();
	expect(mocks.submit).not.toHaveBeenCalled();
	expect(mocks.save).not.toHaveBeenCalled();
	expect(mocks.after).not.toHaveBeenCalled();
}

it("rejects retired gateways without advertising a supported Dedalus provider", async () => {
	const response = await patch({ gatewayProfileId: "dedalus-default" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "unsupported_gateway", message: expect.stringContaining("providers and model gateways are retired") });
	assertNoMutation();
});
beforeEach(() => {
	vi.resetAllMocks();
	config = structuredClone(DEFAULT_USER_CONFIG);
	config.workers = [worker()];
	config.aiProviderKeys.custom = { url: "https://models.example.invalid/v1", key: "fixture-custom-key" };
	mocks.identity.mockResolvedValue("owner-1");
	mocks.config.mockImplementation(async () => config);
	mocks.save.mockImplementation(async (partial: Partial<UserConfig>) => { config = { ...config, ...partial }; return config; });
	mocks.getWorker.mockImplementation(async () => ({ id: "worker-1", desiredState: "running", spec: { name: config.workers[0].name, runtime: config.workers[0].agentKind, model: config.workers[0].model, sandbox: "e2b", schedules: [] } }));
	mocks.apply.mockResolvedValue({ operation: { id: "operation-1", status: "queued" } });
	mocks.submit.mockResolvedValue({ accepted: { operation: { id: "operation-1", status: "queued" } } });
});

describe.each(["hermes", "openclaw"] as const)("%s Worker model update", (agent) => {
	it("invariant_unrelated_edits_preserve_opaque_model_in_config_and_managed_spec", async () => {
		config.workers[0] = worker(agent);
		const response = await patch({ name: "Renamed specialist" });
		expect(response.status).toBe(202);
		expect((await response.json()).worker).toMatchObject({ name: "Renamed specialist", model: "gpt-custom-id" });
		expect(config.workers[0].model).toBe("gpt-custom-id");
		expect(mocks.apply.mock.calls[0][0].spec.model).toBe("gpt-custom-id");
	});
	it("invariant_resaving_the_full_form_does_not_reinterpret_an_existing_model", async () => {
		config.workers[0] = worker(agent);
		const response = await patch({ ...config.workers[0], rolePrompt: "Keep useful evidence." });
		expect(response.status).toBe(202);
		expect(mocks.apply.mock.calls[0][0].spec.model).toBe("gpt-custom-id");
		expect(config.workers[0].model).toBe("gpt-custom-id");
	});
	it("invariant_custom_model_changes_remain_opaque_in_both_representations", async () => {
		config.workers[0] = worker(agent);
		const response = await patch({ model: "gpt-another-custom-id" });
		expect(response.status).toBe(202);
		expect(config.workers[0].model).toBe("gpt-another-custom-id");
		expect(mocks.apply.mock.calls[0][0].spec.model).toBe("gpt-another-custom-id");
	});
	it("invariant_connection_change_uses_a_model_compatible_with_the_actual_endpoint", async () => {
		config.workers[0] = { ...worker(agent), model: "anthropic/claude-opus-4-8" };
		config.aiProviderKeys.openai = "fixture-openai-key";
		const response = await patch({ gatewayProfileId: " openai-router " });
		expect(response.status).toBe(202);
		expect(config.workers[0]).toMatchObject({ model: `openai/${DEFAULT_CODEX_MODEL}`, gatewayProfileId: "openai-router" });
		expect(mocks.apply.mock.calls[0][0].spec.model).toBe(config.workers[0].model);
	});
});

it("invariant_native_runtime_change_persists_the_resolved_model_in_both_representations", async () => {
	config.workers[0].model = "my-organization/research-model";
	config.aiProviderKeys.openai = "fixture-openai-key";
	const response = await patch({ agentKind: "codex" });
	expect(response.status).toBe(202);
	expect(config.workers[0]).toMatchObject({ agentKind: "codex", model: DEFAULT_CODEX_MODEL });
	expect(mocks.apply.mock.calls[0][0].spec.model).toBe(DEFAULT_CODEX_MODEL);
});

it("invariant_native_model_selection_is_normalized_once_for_config_and_spec", async () => {
	config.aiProviderKeys.anthropic = "fixture-anthropic-key";
	const response = await patch({ agentKind: "claude-code", model: "anthropic/claude-sonnet-4.6" });
	expect(response.status).toBe(202);
	expect(config.workers[0].model).toBe("claude-sonnet-4-6");
	expect(mocks.apply.mock.calls[0][0].spec.model).toBe(config.workers[0].model);
});

it("invariant_legacy_adoption_uses_the_same_opaque_model_as_the_saved_worker", async () => {
	mocks.getWorker.mockResolvedValue(null);
	expect((await patch({ name: "Renamed legacy specialist" })).status).toBe(202);
	expect(mocks.submit).toHaveBeenCalledWith("owner-1", "machine-1", { spec: expect.objectContaining({ model: "gpt-custom-id" }) });
	expect(config.workers[0].model).toBe("gpt-custom-id");
});

it("invariant_invalid_explicit_provider_model_is_rejected_before_state_mutation", async () => {
	config.aiProviderKeys.openai = "fixture-openai-key";
	const response = await patch({ name: "Must not save", gatewayProfileId: "openai-router", model: "anthropic/claude-sonnet-4-6" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "model_required", message: expect.stringContaining("OpenAI model") });
	assertNoMutation();
});

it("invariant_a_new_opaque_endpoint_requires_an_explicit_model_before_mutation", async () => {
	config.workers[0].gatewayProfileId = "openai-router";
	config.workers[0].model = "openai/gpt-existing";
	const response = await patch({ gatewayProfileId: "custom-router" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "model_required" });
	assertNoMutation();
});

it.each(["a".repeat(201), "gpt-model\nother"])("invariant_malformed_model_is_rejected_before_state_mutation", async (model) => {
	expect((await patch({ model })).status).toBe(400);
	assertNoMutation();
});

it.each([null, [], "not-an-object"])("invariant_non_object_updates_do_not_mutate_worker_state", async (body) => {
	expect((await patch(body)).status).toBe(400);
	assertNoMutation();
});

it("invariant_signed_out_updates_do_not_read_or_mutate_worker_state", async () => {
	mocks.identity.mockResolvedValue(null);
	expect((await patch({ name: "Renamed" })).status).toBe(401);
	expect(mocks.config).not.toHaveBeenCalled();
	assertNoMutation();
});
