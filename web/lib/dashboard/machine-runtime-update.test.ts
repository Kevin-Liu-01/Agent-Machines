import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ wait: vi.fn() }));
vi.mock("@/lib/control-plane/client", () => ({ waitForControlPlaneOperation: mocks.wait }));
import { requestMachineRuntimeUpdate } from "./machine-runtime-update";

const fetchMock = vi.fn();
beforeEach(() => {
	vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockResolvedValue(Response.json({ ok: true, operation: { id: "operation-1", status: "queued" } }, { status: 202 }));
	mocks.wait.mockResolvedValue({ operation: { id: "operation-1", status: "succeeded" }, worker: { status: { phase: "running" } } });
});
afterEach(() => vi.unstubAllGlobals());

it("invariant_configuration_is_not_applied_until_the_operation_completes", async () => {
	let complete!: (value: unknown) => void;
	mocks.wait.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
	const messages: string[] = [];
	let finished = false;
	const request = requestMachineRuntimeUpdate("chosen/machine", { model: "selected-model" }, (message) => messages.push(message)).then((result) => { finished = true; return result; });
	await new Promise(setImmediate);
	expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/dashboard/machines/chosen%2Fmachine", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ model: "selected-model" }) }));
	expect(finished).toBe(false); expect(messages).toEqual(["Runtime update queued…"]);
	complete({ operation: { id: "operation-1", status: "succeeded" }, worker: { status: { phase: "running" } } });
	expect(await request).toBe("Configured for new runs. Relaunch an already-open CLI to use it there.");
});
it("invariant_backend_validation_details_are_not_replaced_with_generic_success", async () => {
	fetchMock.mockResolvedValue(Response.json({ error: "model_required", message: "Choose a Claude model." }, { status: 400 }));
	await expect(requestMachineRuntimeUpdate("target", { model: "wrong-model" })).rejects.toThrow("Choose a Claude model.");
	expect(mocks.wait).not.toHaveBeenCalled();
});
it("invariant_failed_reconciliation_is_reported_as_failure", async () => {
	mocks.wait.mockRejectedValue(new Error("Runtime bootstrap failed"));
	await expect(requestMachineRuntimeUpdate("target", { gatewayProfileId: "router" })).rejects.toThrow("Runtime bootstrap failed");
});
it("invariant_missing_journal_evidence_never_counts_as_an_applied_model", async () => {
	fetchMock.mockResolvedValue(Response.json({ ok: true, machine: { model: "new-label" } }));
	await expect(requestMachineRuntimeUpdate("target", { model: "new-label" })).rejects.toThrow("did not confirm a runtime operation");
	expect(mocks.wait).not.toHaveBeenCalled();
});
it("invariant_paused_worker_configuration_is_reported_as_deferred", async () => {
	fetchMock.mockResolvedValue(Response.json({ ok: true, deferredUntilWake: true, operation: { id: "operation-1", status: "queued" } }, { status: 202 }));
	mocks.wait.mockResolvedValue({ operation: { status: "succeeded" }, worker: { status: { phase: "sleeping" } } });
	expect(await requestMachineRuntimeUpdate("target", { model: "next-model" })).toBe("Saved for next wake. The Worker remains paused.");
});
it("invariant_pause_during_reconciliation_is_not_reported_as_applied", async () => {
	mocks.wait.mockResolvedValue({ operation: { status: "succeeded" }, worker: { status: { phase: "sleeping" } } });
	expect(await requestMachineRuntimeUpdate("target", { model: "next-model" })).toContain("next wake");
});
it("invariant_already_reconciled_operations_do_not_need_another_wait", async () => {
	fetchMock.mockResolvedValue(Response.json({ ok: true, operation: { id: "operation-1", status: "succeeded" } }));
	expect(await requestMachineRuntimeUpdate("target", { model: "next-model" })).toBe("Configured for new runs. Relaunch an already-open CLI to use it there.");
	expect(mocks.wait).not.toHaveBeenCalled();
});
