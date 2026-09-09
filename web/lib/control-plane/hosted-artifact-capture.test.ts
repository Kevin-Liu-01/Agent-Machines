import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";
const mocks = vi.hoisted(() => ({ exec: vi.fn(), begin: vi.fn(), finish: vi.fn() }));
vi.mock("@/lib/providers", () => ({ getProvider: () => ({ exec: mocks.exec }) }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: vi.fn(), setOperationalUserConfigById: vi.fn() }));
vi.mock("@/lib/storage/workspace-capture", () => ({ beginWorkspaceCapture: mocks.begin, finishWorkspaceCapture: mocks.finish }));
import { HostedWorkerRuntimeDriver } from "./hosted-driver";
const placement = { workerId: "worker", sandboxId: "machine", sandbox: "e2b" as const, runtime: "claude-code" as const };
function driver(deadline?: number) {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys = { anthropic: "fixture-key" };
	config.machines = [{ id: "machine", agentKind: "claude-code", providerKind: "e2b", model: "claude-sonnet-4-6" } as MachineRef];
	return new HostedWorkerRuntimeDriver("tenant", config, { executionDeadlineMs: deadline });
}
beforeEach(() => {
	vi.restoreAllMocks(); vi.clearAllMocks();
	mocks.begin.mockResolvedValue({ id: "capture", runKey: "paid-run", available: true, warnings: [] });
	mocks.finish.mockResolvedValue({ artifacts: [{ id: "artifact", runKey: "paid-run" }], warnings: [] });
	mocks.exec.mockResolvedValue({ stdout: '{"type":"result","result":"done","is_error":false}', stderr: "", exitCode: 0 });
});
describe("managed-run artifact capture boundary", () => {
	it("returns file provenance alongside the actual sandbox response", async () => {
		const result = await driver().run(placement, "write a file", { runKey: "paid-run" });
		expect(result).toMatchObject({ text: "done", exitCode: 0, artifacts: [{ id: "artifact", runKey: "paid-run" }] });
		expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.exec.mock.invocationCallOrder[0]);
		expect(mocks.finish.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.exec.mock.invocationCallOrder[0]);
		expect(mocks.exec).toHaveBeenCalledTimes(1);
		expect(mocks.exec.mock.calls[0][1]).toContain('mkdir -p "/home/user/agent-machines"');
		expect(mocks.exec.mock.calls[0][1]).toContain("cd '/home/user/agent-machines'");
	});
	it("reports capture failure without retrying or changing successful paid work", async () => {
		mocks.finish.mockResolvedValue({ artifacts: [], warnings: ["Artifact collection incomplete."] });
		await expect(driver().run(placement, "work", { runKey: "paid-run" })).resolves.toMatchObject({ text: "done", exitCode: 0, warnings: ["Artifact collection incomplete."] });
		expect(mocks.exec).toHaveBeenCalledTimes(1);
	});
	it("preserves a provider failure while collecting partial files once", async () => {
		mocks.exec.mockRejectedValue(new Error("Runtime timeout"));
		await expect(driver().run(placement, "work", { runKey: "paid-run" })).rejects.toThrow("Runtime timeout");
		expect(mocks.finish).toHaveBeenCalledTimes(1); expect(mocks.exec).toHaveBeenCalledTimes(1);
	});
	it("keeps nonzero runtime exit a failure even if files were captured", async () => {
		mocks.exec.mockResolvedValue({ stdout: "", stderr: "agent failed", exitCode: 7 });
		await expect(driver().run(placement, "work", { runKey: "paid-run" })).rejects.toThrow("exit 7");
		expect(mocks.finish).toHaveBeenCalledTimes(1);
	});
	it("does not start baseline or work when the execution deadline is exhausted", async () => {
		await expect(driver(Date.now() - 1).run(placement, "work", { runKey: "paid-run" })).rejects.toThrow(/deadline/);
		expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
	});
	it("recomputes the paid-work budget after baseline scan time", async () => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
		mocks.begin.mockImplementation(async () => { clock.mockReturnValue(120_000); return { available: true, warnings: [] }; });
		await expect(driver(140_000).run(placement, "work", { runKey: "paid-run" })).rejects.toThrow(/deadline/);
		expect(mocks.exec).not.toHaveBeenCalled();
	});
});
