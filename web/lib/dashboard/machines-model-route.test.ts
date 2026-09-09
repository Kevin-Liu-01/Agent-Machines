import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, INITIAL_BOOTSTRAP_STATE, type MachineRef, type UserConfig } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), get: vi.fn(), save: vi.fn(), submit: vi.fn(), managed: vi.fn(), state: vi.fn(), after: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: mocks.get, setOperationalUserConfigById: mocks.save }));
vi.mock("@/lib/control-plane/adopt-machine", () => ({ submitMachineIntent: mocks.submit }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: () => ({ store: { getWorker: mocks.managed } }) }));
vi.mock("@/lib/providers", async () => ({ ...await vi.importActual("@/lib/providers/types"), getProvider: () => ({ state: mocks.state }) }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { PATCH } from "@/app/api/dashboard/machines/[id]/route";

let config: UserConfig;
let target: MachineRef;
beforeEach(() => {
	vi.resetAllMocks();
	target = { id: "chosen-machine", name: "Specialist", providerKind: "e2b", agentKind: "hermes", model: "gpt-custom-id", gatewayProfileId: "custom-router", environmentProfileId: null, agentProfileId: null, bootstrapPresetId: null, createdAt: "2026-01-01T00:00:00Z", spec: { vcpu: 2, memoryMib: 2048, storageGib: 10 }, apiUrl: null, apiKey: "fixture-private-gateway-key", bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" } };
	config = { ...structuredClone(DEFAULT_USER_CONFIG), activeMachineId: "different-machine", machines: [target] };
	config.aiProviderKeys.custom = { url: "https://custom.example.invalid/v1", key: "fixture-custom-key" };
	mocks.identity.mockResolvedValue("owner-1");
	mocks.get.mockImplementation(async () => config);
	mocks.save.mockImplementation(async (_user, _config, patch) => {
		if (patch.patchMachine) target = { ...target, ...patch.patchMachine.patch };
		config = { ...config, machines: [target], ...(patch.activeMachineId ? { activeMachineId: patch.activeMachineId } : {}) };
		return config;
	});
	mocks.managed.mockResolvedValue({ id: target.id, desiredState: "running", spec: { model: target.model } });
	mocks.state.mockResolvedValue({ state: "ready" });
	mocks.submit.mockImplementation(async (_user, _id, intent) => ({ controlPlane: { reconcileNext: mocks.reconcile }, accepted: { worker: { id: target.id, desiredState: intent.desiredState ?? "running" }, operation: { id: "model-operation", status: "queued" } } }));
});
function patch(body: unknown, id = "chosen-machine") { return PATCH(new Request(`https://example.invalid/api/dashboard/machines/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) }); }
function unchanged() { expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); }

it("rejects retired gateways without advertising a supported Dedalus provider", async () => {
	const response = await patch({ gatewayProfileId: "dedalus-default" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "unsupported_gateway", message: expect.stringContaining("providers and model gateways are retired") });
	unchanged();
});

describe.each(["hermes", "openclaw", "claude-code", "codex"] as const)("%s machine model intent", (agentKind) => {
	it("invariant_model_change_journals_the_owned_target_without_relabeling_it", async () => {
		target.agentKind = agentKind;
		config.aiProviderKeys.anthropic = "fixture-anthropic-key";
		config.aiProviderKeys.openai = "fixture-openai-key";
		const model = agentKind === "claude-code" ? "anthropic/claude-sonnet-4.6" : agentKind === "codex" ? "openai/gpt-explicit" : "gpt-custom-next";
		const expected = agentKind === "claude-code" ? "claude-sonnet-4-6" : agentKind === "codex" ? "gpt-explicit" : model;
		const response = await patch({ model });
		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body).toMatchObject({ operation: { id: "model-operation", status: "queued" }, requested: { model: expected }, machine: { model: "gpt-custom-id", hasApiKey: true } });
		expect(body.machine).not.toHaveProperty("apiKey");
		expect(mocks.submit).toHaveBeenCalledWith("owner-1", "chosen-machine", expect.objectContaining({ spec: expect.objectContaining({ model: expected }) }));
		expect(mocks.submit.mock.calls[0][2]).not.toHaveProperty("desiredState");
		expect(mocks.save).not.toHaveBeenCalled();
		expect(mocks.after).toHaveBeenCalledOnce();
		await mocks.after.mock.calls[0][0]();
		expect(mocks.reconcile).toHaveBeenCalledWith("chosen-machine");
	});
});

it("invariant_router_change_selects_a_compatible_model_before_journaling", async () => {
	target.model = "anthropic/claude-opus-4-8";
	config.aiProviderKeys.openai = "fixture-openai-key";
	const response = await patch({ gatewayProfileId: "openai-router" });
	expect(response.status).toBe(202);
	expect(mocks.submit.mock.calls[0][2].spec).toMatchObject({ gatewayProfileId: "openai-router", model: expect.stringMatching(/^openai\/gpt-/) });
	expect(mocks.save).not.toHaveBeenCalled();
});

it("invariant_managed_pause_is_preserved_and_reported_as_deferred_configuration", async () => {
	mocks.managed.mockResolvedValue({ id: target.id, desiredState: "sleeping" });
	mocks.submit.mockResolvedValue({ controlPlane: { reconcileNext: mocks.reconcile }, accepted: { worker: { id: target.id, desiredState: "sleeping" }, operation: { id: "model-operation", status: "queued" } } });
	const response = await patch({ model: "gpt-next" });
	expect(response.status).toBe(202);
	expect(await response.json()).toMatchObject({ deferredUntilWake: true });
	expect(mocks.submit.mock.calls[0][2]).not.toHaveProperty("desiredState");
	expect(mocks.state).not.toHaveBeenCalled();
});

it("invariant_legacy_paused_machine_is_not_woken_to_edit_its_model", async () => {
	mocks.managed.mockResolvedValue(null);
	mocks.state.mockResolvedValue({ state: "sleeping" });
	const response = await patch({ model: "gpt-next" });
	expect(response.status).toBe(202);
	expect(mocks.submit.mock.calls[0][2]).toMatchObject({ desiredState: "sleeping" });
	expect(await response.json()).toMatchObject({ deferredUntilWake: true });
});

it.each(["unknown", "destroyed", "error"])("invariant_unverifiable_legacy_state_does_not_trigger_paid_adoption", async (state) => {
	mocks.managed.mockResolvedValue(null); mocks.state.mockResolvedValue({ state });
	expect((await patch({ model: "gpt-next" })).status).toBe(409);
	unchanged();
});

it("invariant_invalid_model_selection_does_not_write_even_unrelated_fields", async () => {
	config.aiProviderKeys.openai = "fixture-openai-key";
	expect((await patch({ name: "Must not save", active: true, gatewayProfileId: "openai-router", model: "anthropic/claude-sonnet-4-6" })).status).toBe(400);
	unchanged();
});

it("invariant_failed_intent_submission_does_not_relabel_or_claim_success", async () => {
	mocks.submit.mockRejectedValue(new Error("journal unavailable"));
	const response = await patch({ model: "gpt-next" });
	expect(response.status).toBe(502);
	expect(await response.json()).toMatchObject({ error: "runtime_update_failed" });
	expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled();
});

it("invariant_native_model_mismatches_are_not_silently_replaced_with_defaults", async () => {
	target.agentKind = "codex"; config.aiProviderKeys.openai = "fixture-openai-key";
	expect((await patch({ model: "anthropic/claude-sonnet-4-6" })).status).toBe(400);
	unchanged();
});

it("invariant_deleted_workers_are_not_reactivated_by_model_updates", async () => {
	mocks.managed.mockResolvedValue({ id: target.id, desiredState: "deleted" });
	expect((await patch({ model: "gpt-next" })).status).toBe(409);
	unchanged();
});

it("invariant_signed_out_model_updates_do_not_read_or_write_configuration", async () => {
	mocks.identity.mockResolvedValue(null);
	expect((await patch({ model: "gpt-next" })).status).toBe(401);
	expect(mocks.get).not.toHaveBeenCalled();
	unchanged();
});

it("invariant_unrelated_metadata_and_active_selection_remain_simple_patches", async () => {
	const response = await patch({ name: "Renamed", active: true });
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ machine: { name: "Renamed" } });
	expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.managed).not.toHaveBeenCalled();
	expect(config.activeMachineId).toBe("chosen-machine");
});

it.each(["foreign-machine", "archived"])("invariant_model_updates_only_target_owned_nonarchived_machines", async (id) => {
	if (id === "archived") { target.archived = true; id = target.id; }
	expect((await patch({ model: "gpt-next" }, id)).status).toBe(404);
	unchanged();
});

it("invariant_runtime_changes_do_not_race_an_existing_bootstrap", async () => {
	target.bootstrapState.phase = "running";
	expect((await patch({ model: "gpt-next" })).status).toBe(409);
	unchanged();
});
