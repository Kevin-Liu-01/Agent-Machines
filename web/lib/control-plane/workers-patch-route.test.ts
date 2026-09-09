import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerResource } from "agent-machines/control-plane";
import { DEFAULT_USER_CONFIG, INITIAL_BOOTSTRAP_STATE, type UserConfig } from "@/lib/user-config/schema";
import { DEFAULT_CODEX_MODEL } from "@/lib/agents/runtime-model";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), plane: vi.fn(), get: vi.fn(), apply: vi.fn(), after: vi.fn(), reconcile: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: mocks.config }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: mocks.plane }));
vi.mock("@/lib/providers", () => ({ getProvider: mocks.provider }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { PATCH } from "@/app/api/dashboard/control-plane/workers/[id]/route";

let config: UserConfig;
let worker: WorkerResource;
beforeEach(() => {
	vi.resetAllMocks();
	config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys.custom = { url: "https://custom.example.invalid/v1", key: "fixture-custom-key" };
	worker = {
		id: "worker-1", version: 1, generation: 1, desiredState: "running",
		spec: { name: "Specialist", runtime: "hermes", sandbox: "e2b", model: "gpt-custom-id", gatewayProfileId: "custom-router", schedules: [] },
		status: { phase: "running", placement: { workerId: "worker-1", sandboxId: "machine-1", sandbox: "e2b", runtime: "hermes" }, observedGeneration: 1, lastOperationId: null, lastError: null, conditions: [] },
		createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
	};
	config.machines = [{ id: "machine-1", name: "Specialist", providerKind: "e2b", agentKind: "hermes", model: worker.spec.model!, spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 }, apiKey: null, apiUrl: null, agentProfileId: null, gatewayProfileId: "custom-router", environmentProfileId: null, bootstrapPresetId: null, bootstrapState: { ...INITIAL_BOOTSTRAP_STATE }, createdAt: worker.createdAt }];
	mocks.identity.mockResolvedValue("owner-1");
	mocks.config.mockImplementation(async () => config);
	mocks.plane.mockReturnValue({ store: { getWorker: mocks.get }, apply: mocks.apply, reconcileNext: mocks.reconcile });
	mocks.get.mockImplementation(async (id) => id === worker.id ? structuredClone(worker) : null);
	mocks.apply.mockImplementation(async (intent) => ({ worker: { ...worker, ...intent }, operation: { id: "operation-1", status: "queued" } }));
	mocks.provider.mockReturnValue({ capabilities: { canSleep: true } });
});

function patch(body: unknown, id = "worker-1") {
	return PATCH(new Request(`https://example.invalid/api/dashboard/control-plane/workers/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
function unchanged() { expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); }

it("rejects retired gateways without advertising a supported Dedalus provider", async () => {
	const response = await patch({ gatewayProfileId: "dedalus-default" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "unsupported_gateway", message: expect.stringContaining("providers and model gateways are retired") });
	unchanged();
});

describe.each(["hermes", "openclaw"] as const)("%s journal selection", (runtime) => {
	it("invariant_changed_custom_model_remains_opaque_and_is_journaled_once", async () => {
		worker.spec.runtime = runtime;
		const response = await patch({ model: "gpt-custom-next" });
		expect(response.status).toBe(202);
		expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "worker-1", desiredState: "running", spec: expect.objectContaining({ runtime, model: "gpt-custom-next" }) }), expect.anything());
		expect(await response.json()).toMatchObject({ operation: { id: "operation-1" }, statusUrl: "/api/dashboard/control-plane/operations/operation-1" });
		await mocks.after.mock.calls[0][0]();
		expect(mocks.reconcile).toHaveBeenCalledWith("worker-1");
	});
	it("invariant_router_change_selects_a_model_for_the_actual_endpoint", async () => {
		worker.spec.runtime = runtime;
		worker.spec.model = "anthropic/claude-opus-4-8";
		config.aiProviderKeys.openai = "fixture-openai-key";
		expect((await patch({ gatewayProfileId: " openai-router " })).status).toBe(202);
		expect(mocks.apply.mock.calls[0][0].spec).toMatchObject({ gatewayProfileId: "openai-router", model: `openai/${DEFAULT_CODEX_MODEL}` });
	});
});

it("invariant_native_runtime_change_resolves_its_compatible_default", async () => {
	worker.spec.model = "organization/research-custom";
	config.aiProviderKeys.openai = "fixture-openai-key";
	expect((await patch({ runtime: "codex" })).status).toBe(202);
	expect(mocks.apply.mock.calls[0][0].spec).toMatchObject({ runtime: "codex", model: DEFAULT_CODEX_MODEL });
});

it("invariant_explicit_native_aliases_are_normalized_without_changing_the_choice", async () => {
	config.aiProviderKeys.anthropic = "fixture-anthropic-key";
	expect((await patch({ runtime: "claude-code", model: "anthropic/claude-sonnet-4.6" })).status).toBe(202);
	expect(mocks.apply.mock.calls[0][0].spec.model).toBe("claude-sonnet-4-6");
});

it.each([
	{ runtime: "codex", model: "anthropic/claude-sonnet-4-6" },
	{ runtime: "claude-code", model: "openai/gpt-explicit" },
	{ gatewayProfileId: "openai-router", model: "anthropic/claude-sonnet-4-6" },
])("invariant_explicit_model_mismatches_fail_before_any_intent_mutation", async (selection) => {
	config.aiProviderKeys.openai = "fixture-openai-key";
	config.aiProviderKeys.anthropic = "fixture-anthropic-key";
	expect((await patch({ ...selection, environmentProfileId: "must-not-save" })).status).toBe(400);
	unchanged();
});

it("invariant_missing_native_credentials_fail_before_intent_mutation", async () => {
	const response = await patch({ runtime: "codex", model: "openai/gpt-explicit" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "missing_agent_credentials" });
	unchanged();
});

it.each([
	{ desiredState: "sleeping" },
	{ desiredState: "running" },
	{ environmentProfileId: "env-next" },
	{ desiredState: "sleeping", runtime: "hermes", gatewayProfileId: "custom-router", model: "gpt-custom-id" },
])("invariant_unrelated_changes_preserve_opaque_models_without_demanding_keys", async (body) => {
	config.aiProviderKeys = {};
	expect((await patch(body)).status).toBe(202);
	expect(mocks.apply.mock.calls[0][0].spec.model).toBe("gpt-custom-id");
	expect(mocks.apply.mock.calls[0][0].desiredState).toBe(body.desiredState ?? "running");
});

it("invariant_model_edits_do_not_wake_a_paused_worker", async () => {
	worker.desiredState = "sleeping";
	worker.status.phase = "sleeping";
	expect((await patch({ model: "gpt-custom-next" })).status).toBe(202);
	expect(mocks.apply.mock.calls[0][0].desiredState).toBe("sleeping");
});

it.each(["desired-deleted", "phase-deleting", "phase-deleted"])("invariant_deleted_workers_cannot_be_resurrected_by_patch", async (state) => {
	if (state === "desired-deleted") worker.desiredState = "deleted";
	else worker.status.phase = state === "phase-deleting" ? "deleting" : "deleted";
	expect((await patch({ desiredState: "running" })).status).toBe(409);
	unchanged();
});

it("invariant_archived_placement_is_not_reactivated", async () => {
	config.machines[0].archived = true;
	expect((await patch({ desiredState: "running" })).status).toBe(404);
	unchanged();
});

it("invariant_tenant_scoping_precedes_configuration_reads_and_mutations", async () => {
	expect((await patch({ model: "gpt-next" }, "foreign-worker")).status).toBe(404);
	expect(mocks.plane).toHaveBeenCalledWith("owner-1");
	expect(mocks.config).not.toHaveBeenCalled();
	unchanged();
});

it("invariant_signed_out_updates_do_not_read_or_mutate", async () => {
	mocks.identity.mockResolvedValue(null);
	expect((await patch({ desiredState: "sleeping" })).status).toBe(401);
	expect(mocks.plane).not.toHaveBeenCalled();
	expect(mocks.config).not.toHaveBeenCalled();
	unchanged();
});

it.each([
	null, [], "invalid", { model: 42 }, { model: null }, { model: " " },
	{ model: "gpt-model\nother" }, { model: "a".repeat(201) },
	{ runtime: "unknown" }, { sandbox: "unknown" }, { gatewayProfileId: 42 },
	{ desiredState: "deleted" }, { environmentProfileId: [] },
])("invariant_invalid_input_returns_a_client_error_without_mutation", async (body) => {
	expect((await patch(body)).status).toBe(400);
	unchanged();
});

it("invariant_invalid_json_does_not_become_a_noop_apply", async () => {
	const response = await PATCH(new Request("https://example.invalid", { method: "PATCH", body: "{" }), { params: Promise.resolve({ id: "worker-1" }) });
	expect(response.status).toBe(400);
	unchanged();
});

it("invariant_manual_sleep_checks_the_current_provider_before_applying_intent", async () => {
	worker.status.placement!.sandbox = "sprites";
	worker.spec.sandbox = "e2b";
	mocks.provider.mockReturnValue({ capabilities: { canSleep: false } });
	const response = await patch({ desiredState: "sleeping" });
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ error: "not_supported", message: "This provider does not support manual pause. No compute was stopped." });
	expect(mocks.provider).toHaveBeenCalledWith("sprites", config.providers);
	unchanged();
});

it("invariant_paused_model_edits_do_not_probe_or_pause_the_provider", async () => {
	worker.desiredState = "sleeping";
	worker.status.phase = "sleeping";
	expect((await patch({ model: "gpt-next" })).status).toBe(202);
	expect(mocks.provider).not.toHaveBeenCalled();
	expect(mocks.apply.mock.calls[0][0].desiredState).toBe("sleeping");
});

it("invariant_unplaced_workers_can_be_logically_idle_without_a_provider_pause", async () => {
	worker.status.placement = null;
	expect((await patch({ desiredState: "sleeping" })).status).toBe(202);
	expect(mocks.provider).not.toHaveBeenCalled();
	expect(mocks.apply.mock.calls[0][0].desiredState).toBe("sleeping");
});
