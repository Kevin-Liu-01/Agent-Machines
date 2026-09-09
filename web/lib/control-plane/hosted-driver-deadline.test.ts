import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerPlacement, WorkerResource } from "agent-machines/control-plane";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ exec: vi.fn(), artifacts: vi.fn(), bootstrap: vi.fn() }));
vi.mock("@/lib/bootstrap/bootstrap-repair", () => ({ agentArtifactsPresent: mocks.artifacts }));
vi.mock("@/lib/bootstrap/runner", () => ({ runWebBootstrap: mocks.bootstrap }));
vi.mock("@/lib/providers", async (original) => ({
	...await original<typeof import("@/lib/providers")>(),
	getProvider: () => ({ exec: mocks.exec }),
}));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: vi.fn(), setOperationalUserConfigById: vi.fn() }));
vi.mock("agent-machines/mux", async (original) => ({
	...await original<typeof import("agent-machines/mux")>(),
	getHarness: () => ({
		runCommand: () => ({ command: "fixture-native-agent", env: {} }),
		parseLine: () => [],
	}),
}));

import { HostedWorkerRuntimeDriver } from "./hosted-driver";

const placement: WorkerPlacement = { workerId: "worker", sandboxId: "machine", sandbox: "e2b", runtime: "claude-code" };
function driver(executionDeadlineMs?: number) {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.machines = [{ id: "machine", agentKind: "claude-code", providerKind: "e2b", model: "claude-sonnet-4-6", bootstrapState: { phase: "succeeded" } } as MachineRef];
	mocks.exec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
	return new HostedWorkerRuntimeDriver("tenant", config, { executionDeadlineMs });
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("hosted Console run deadlines", () => {
	it.each([
		[260_000, 190_000],
		[80_000, 60_000],
		[30_001, 10_001],
	])("invariant_console_exec_reserves_journal_time_with_%i_ms_remaining", async (remaining, expectedTimeout) => {
		vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		await driver(1_000_000 + remaining).run(placement, "Do bounded work", { runKey: "run" });
		expect(mocks.exec).toHaveBeenCalledWith("machine", expect.any(String), expect.objectContaining({ timeoutMs: expectedTimeout }));
		expect(mocks.exec.mock.calls[0][1]).toContain("timeout --signal=TERM --kill-after=5s");
	});

	it.each([30_000, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("invariant_exhausted_or_invalid_deadline_cannot_start_paid_work: %s", async (remaining) => {
		vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		await expect(driver(1_000_000 + remaining).run(placement, "Do not start", { runKey: "run" })).rejects.toThrow(/deadline/i);
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("invariant_provider_timeout_is_a_run_failure_not_a_successful_result", async () => {
		const runtime = driver(Date.now() + 260_000);
		mocks.exec.mockRejectedValue(new Error("Native command timed out"));
		await expect(runtime.run(placement, "Bounded work", { runKey: "run" })).rejects.toThrow("Native command timed out");
	});

	it("design_non_console_runs_retain_the_existing_timeout", async () => {
		await driver().run(placement, "Existing API work", { runKey: "run" });
		expect(mocks.exec).toHaveBeenCalledWith("machine", expect.any(String), expect.objectContaining({ timeoutMs: 600_000 }));
		expect(mocks.exec.mock.calls[0][1]).not.toContain("timeout --signal");
	});

	it.each([true, false])("invariant_console_cannot_start_unbounded_bootstrap_when_artifacts_present_%s", async (artifactsPresent) => {
		mocks.artifacts.mockResolvedValue(artifactsPresent);
		const worker = { id: "worker", spec: { runtime: "claude-code", model: artifactsPresent ? "claude-opus-4-8" : "claude-sonnet-4-6" } } as WorkerResource;
		await expect(driver(Date.now() + 260_000).bootstrap(placement, worker)).rejects.toThrow(/lifecycle controls/);
		expect(mocks.bootstrap).not.toHaveBeenCalled();
	});
});
