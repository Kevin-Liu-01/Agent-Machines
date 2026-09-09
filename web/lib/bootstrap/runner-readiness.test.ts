import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MachineProvider } from "@/lib/providers";
import { BOOTSTRAP_PHASES, DEFAULT_USER_CONFIG, type AgentKind, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock("./runtime-readiness", () => ({ agentArtifactsPresent: mocks.readiness }));
import { finalizeGatewayBootstrap, runWebBootstrap } from "./runner";

function fixture(agentKind: AgentKind) {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys = { anthropic: "fixture-only-key", openai: "fixture-only-key" };
	const machine: MachineRef = { id: "owned-worker", name: "QA", providerKind: "daytona", agentKind, model: "fixture-model", apiKey: "fixture-token", apiUrl: null, gatewayProfileId: null, environmentProfileId: null, agentProfileId: null, bootstrapPresetId: null, createdAt: "2026-09-09", spec: config.draftSpec, bootstrapState: { phase: "succeeded", completed: [...BOOTSTRAP_PHASES], current: null, startedAt: null, finishedAt: null, lastError: null } };
	const exec = vi.fn(async () => ({ stdout: "ok", stderr: "", exitCode: 0 }));
	const provider = { kind: "daytona", state: async () => ({ state: "ready", spec: { memoryMib: 2048 } }), exec } as unknown as MachineProvider;
	const onState = vi.fn();
	return { machine, config, provider, onState, exec };
}
beforeEach(() => vi.resetAllMocks());

describe("shared bootstrap readiness boundary", () => {
	it.each(["claude-code", "codex", "hermes", "openclaw"] as const)("refuses successful %s bootstrap when its actual readiness check fails", async (agent) => {
		mocks.readiness.mockResolvedValue(false);
		const f = fixture(agent);
		await expect(runWebBootstrap(f)).rejects.toThrow(/readiness check/);
		expect(f.onState).not.toHaveBeenCalledWith(expect.objectContaining({ phase: "succeeded" }));
		expect(f.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "failed", lastError: expect.stringMatching(/readiness check/) }));
		expect(mocks.readiness).toHaveBeenCalledWith(f.machine, f.provider);
	});
	it("fails direct bootstrap when the final provider probe throws", async () => {
		mocks.readiness.mockRejectedValue(new Error("Provider probe timed out"));
		const f = fixture("claude-code");
		await expect(runWebBootstrap(f)).rejects.toThrow("Provider probe timed out");
		expect(f.onState).not.toHaveBeenCalledWith(expect.objectContaining({ phase: "succeeded" }));
		expect(f.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "failed" }));
	});
	it("marks completed-phase bootstrap successful only after one actual readiness check", async () => {
		mocks.readiness.mockResolvedValue(true);
		const f = fixture("claude-code");
		await expect(runWebBootstrap(f)).resolves.toEqual({ apiUrl: null, apiKey: "fixture-token" });
		expect(mocks.readiness).toHaveBeenCalledTimes(1);
		expect(f.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "succeeded" }));
	});
	it.each(["claude-code", "codex"] as const)("cannot relabel a missing %s CLI ready through gateway finalization", async (agent) => {
		const f = fixture(agent);
		await expect(finalizeGatewayBootstrap(f)).rejects.toThrow(/normal Worker bootstrap/);
		expect(f.exec).not.toHaveBeenCalled();
		expect(f.onState).not.toHaveBeenCalled();
	});
});
