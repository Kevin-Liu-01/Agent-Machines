import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMachinesControlPlane, InMemoryControlPlaneStore } from "agent-machines/control-plane";
import { DEFAULT_USER_CONFIG, INITIAL_BOOTSTRAP_STATE, type UserConfig } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), set: vi.fn(), plane: vi.fn(), provider: vi.fn(), destroy: vi.fn(), forget: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: mocks.config, setOperationalUserConfigById: mocks.set }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: mocks.plane }));
vi.mock("@/lib/providers", async () => ({ getProvider: mocks.provider, MachineProviderError: (await import("@/lib/providers/types")).MachineProviderError }));
vi.mock("@/lib/mux/placements", () => ({ forgetHostedPlacement: mocks.forget }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { submitMachineIntent } from "./adopt-machine";
import { HostedWorkerRuntimeDriver } from "./hosted-driver";
import { DELETE } from "@/app/api/dashboard/machines/[id]/route";

let config: UserConfig;
let plane: AgentMachinesControlPlane;
beforeEach(() => {
	vi.resetAllMocks();
	config = structuredClone(DEFAULT_USER_CONFIG);
	config.machines = [{ id: "source-machine", name: "Worker", providerKind: "e2b", agentKind: "claude-code", model: "claude-sonnet-4-6", spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 }, createdAt: "2026-09-09T00:00:00Z", apiKey: null, apiUrl: null, agentProfileId: null, gatewayProfileId: null, environmentProfileId: null, bootstrapPresetId: null, bootstrapState: INITIAL_BOOTSTRAP_STATE, archived: true }];
	mocks.identity.mockResolvedValue("tenant-1");
	mocks.config.mockImplementation(async () => config);
	mocks.set.mockImplementation(async (_userId, _current, patch) => {
		if (patch.removeMachine) config.machines = config.machines.filter((machine) => machine.id !== patch.removeMachine);
		if (patch.workers) config.workers = patch.workers;
		return config;
	});
	mocks.provider.mockReturnValue({ destroy: mocks.destroy });
	mocks.destroy.mockResolvedValue(undefined);
	mocks.forget.mockResolvedValue({ forgotten: true });
	plane = new AgentMachinesControlPlane(new InMemoryControlPlaneStore(), new HostedWorkerRuntimeDriver("tenant-1", config));
	mocks.plane.mockReturnValue(plane);
});

describe("archived machine intent boundary", () => {
	it("real DELETE route adopts an archived machine for deletion, and the hosted driver destroys only that ID", async () => {
		const response = await DELETE(new Request("https://example.invalid/api/dashboard/machines/source-machine?destroy=1", { method: "DELETE", headers: { "idempotency-key": "delete-archived-once" } }), { params: Promise.resolve({ id: "source-machine" }) });
		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body.operation.status).toBe("queued");
		expect(mocks.destroy).not.toHaveBeenCalled();
		expect((await plane.store.getWorker("source-machine"))?.desiredState).toBe("deleted");
		expect(mocks.after).toHaveBeenCalledTimes(1);
		await mocks.after.mock.calls[0][0]();
		expect(mocks.destroy).toHaveBeenCalledExactlyOnceWith("source-machine");
		expect(mocks.forget).toHaveBeenCalledExactlyOnceWith({ userId: "tenant-1", machine: expect.objectContaining({ id: "source-machine", archived: true }) });
		expect(config.machines).toEqual([]);
		expect((await plane.store.getWorker("source-machine"))?.status.phase).toBe("deleted");
	});

	it.each([
		{}, { desiredState: "running" }, { desiredState: "sleeping" }, { forceBootstrap: true },
		{ spec: { model: "changed" } }, { desiredState: "running", forceBootstrap: true },
	] as const)("keeps every non-delete archived intent rejected: %j", async (intent) => {
		await expect(submitMachineIntent("tenant-1", "source-machine", intent)).rejects.toThrow(/does not exist/);
		expect(mocks.plane).not.toHaveBeenCalled();
		expect(await plane.store.listWorkers()).toEqual([]);
		expect(mocks.destroy).not.toHaveBeenCalled();
	});

	it.each([true, false])("deletes archived exact targets with an existing journal (placed=%s)", async (placed) => {
		const spec = { name: "Worker", runtime: "claude-code" as const, sandbox: "e2b" as const };
		if (placed) await plane.adopt({ id: "source-machine", spec, placement: { workerId: "source-machine", sandboxId: "source-machine", sandbox: "e2b", runtime: "claude-code" } });
		else await plane.apply({ id: "source-machine", spec });
		const submitted = await submitMachineIntent("tenant-1", "source-machine", { desiredState: "deleted", idempotencyKey: "delete-existing-target" });
		expect(submitted.accepted.worker.status.placement?.sandboxId).toBe("source-machine");
		await plane.reconcileNext(submitted.accepted.worker.id);
		expect(mocks.destroy).toHaveBeenCalledExactlyOnceWith("source-machine");
		expect(config.machines).toEqual([]);
	});

	it("rejects foreign machine deletion before constructing a control plane", async () => {
		await expect(submitMachineIntent("tenant-1", "foreign-machine", { desiredState: "deleted" })).rejects.toThrow(/does not exist/);
		expect(mocks.plane).not.toHaveBeenCalled();
	});

	it("deleting a kept migration source cannot delete the different placement now managed by its legacy Worker ID", async () => {
		config.machines[0].archived = false;
		config.machines.push({ ...config.machines[0], id: "destination-machine", providerKind: "sprites" });
		await plane.adopt({ id: "source-machine", desiredState: "running", spec: { name: "Worker", runtime: "claude-code", sandbox: "sprites", model: "claude-sonnet-4-6" }, placement: { workerId: "source-machine", sandboxId: "destination-machine", sandbox: "sprites", runtime: "claude-code" } });
		const before = await plane.store.getWorker("source-machine");
		const operationCount = (await plane.store.listOperations()).length;
		await expect(submitMachineIntent("tenant-1", "source-machine", { desiredState: "deleted" })).rejects.toThrow(/already manages another placement/);
		expect(await plane.store.getWorker("source-machine")).toEqual(before);
		expect((await plane.store.listOperations()).length).toBe(operationCount);
		expect(mocks.destroy).not.toHaveBeenCalled();
		expect(config.machines.map((machine) => machine.id)).toEqual(["source-machine", "destination-machine"]);
	});
});
