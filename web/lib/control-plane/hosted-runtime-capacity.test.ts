import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerPlacement, WorkerResource } from "agent-machines/control-plane";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ state: vi.fn(), exec: vi.fn(), bootstrap: vi.fn(), artifacts: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/providers", () => ({ getProvider: () => ({ state: mocks.state, exec: mocks.exec }) }));
vi.mock("@/lib/bootstrap/bootstrap-repair", () => ({ agentArtifactsPresent: mocks.artifacts }));
vi.mock("@/lib/bootstrap/runner", () => ({ runWebBootstrap: mocks.bootstrap }));
vi.mock("@/lib/storage/workspace-capture", () => ({ beginWorkspaceCapture: mocks.capture, finishWorkspaceCapture: async () => ({ artifacts: [], warnings: [] }) }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: vi.fn(), setOperationalUserConfigById: vi.fn() }));
import { HostedWorkerRuntimeDriver } from "./hosted-driver";

const placement: WorkerPlacement = { workerId: "worker", sandboxId: "machine", sandbox: "e2b", runtime: "openclaw" };
function driver(runtime = "openclaw") {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys = { anthropic: "fixture-key" };
	config.machines = [{ id: "machine", agentKind: runtime, providerKind: "e2b", model: "anthropic/claude-sonnet-4-6", spec: { memoryMib: 8192 }, bootstrapState: { phase: "succeeded" } } as MachineRef];
	return new HostedWorkerRuntimeDriver("tenant", config);
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.mockResolvedValue({ state: "ready", spec: { memoryMib: 512 } });
	mocks.artifacts.mockResolvedValue(true);
	mocks.capture.mockResolvedValue({ available: false, warnings: [] });
	mocks.exec.mockResolvedValue({ exitCode: 0, stderr: "", stdout: JSON.stringify({ text: "done" }) });
});
describe("OpenClaw observed capacity admission", () => {
	it("does not mark an installed but undersized runtime ready or reinstall it", async () => {
		const worker = { id: "worker", spec: { runtime: "openclaw", model: "anthropic/claude-sonnet-4-6" } } as WorkerResource;
		await expect(driver().bootstrap(placement, worker)).rejects.toThrow(/512 MiB/);
		expect(mocks.bootstrap).not.toHaveBeenCalled();
		expect(mocks.artifacts).not.toHaveBeenCalled();
	});
	it("checks the desired runtime before switching from Claude to undersized OpenClaw", async () => {
		const worker = { id: "worker", spec: { runtime: "openclaw" } } as WorkerResource;
		await expect(driver("claude-code").bootstrap(placement, worker)).rejects.toThrow(/512 MiB/);
		expect(mocks.bootstrap).not.toHaveBeenCalled();
	});
	it("rejects scheduled or direct managed runs before capture or paid execution", async () => {
		await expect(driver().run(placement, "Read file", { runKey: "run" })).rejects.toThrow(/512 MiB/);
		expect(mocks.state).toHaveBeenCalledWith("machine");
		expect(mocks.exec).not.toHaveBeenCalled();
		expect(mocks.capture).not.toHaveBeenCalled();
	});
	it("does not claim unknown observed RAM is the requested 8192 MiB", async () => {
		mocks.state.mockResolvedValue({ state: "ready", spec: {} });
		const result = await driver().run(placement, "Read file", { runKey: "run" });
		expect(result).toMatchObject({ exitCode: 0, warnings: [expect.stringMatching(/capacity is unverified/i)] });
	});
	it("reports a structured runtime error even when stderr contains harmless transport logs", async () => {
		mocks.state.mockResolvedValue({ state: "ready", spec: { memoryMib: 2048 } });
		mocks.exec.mockResolvedValue({ exitCode: 1, stdout: JSON.stringify({ status: "error", error: { message: "Exec tool refused: permission required" } }), stderr: "model-fetch response status=200" });
		await expect(driver().run(placement, "Read file", { runKey: "run" })).rejects.toThrow(/Exec tool refused: permission required/);
	});
});
