import { describe, expect, it, vi } from "vitest";
import type { MachineProvider } from "@/lib/providers";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";
import { runWebBootstrap } from "./runner";

function fixture(memoryMib: number | undefined, agentKind: MachineRef["agentKind"] = "openclaw") {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys = { anthropic: "fixture-only-key" };
	const machine: MachineRef = {
		id: "owned-worker", name: "Owned Worker", providerKind: "e2b", agentKind,
		model: "anthropic/claude-sonnet-4-6", apiKey: "fixture-worker-key", apiUrl: null,
		agentProfileId: null, gatewayProfileId: null, environmentProfileId: null,
		bootstrapPresetId: null, createdAt: "2026-09-09T00:00:00Z",
		spec: { ...DEFAULT_USER_CONFIG.draftSpec, memoryMib: 8192 },
		bootstrapState: { phase: "idle", completed: [], startedAt: null, finishedAt: null, current: null, lastError: null },
	};
	const state = vi.fn(async () => ({ state: "ready", spec: { memoryMib } }));
	const exec = vi.fn(async () => { throw new Error("Fixture stops before installing anything"); });
	const onState = vi.fn();
	const run = () => runWebBootstrap({ machine, config, provider: { state, exec } as unknown as MachineProvider, onState });
	return { run, state, exec, onState };
}

describe("direct bootstrap capacity admission", () => {
	it.each([256, 512])("rejects observed %s MiB before installation or successful signoff", async (memoryMib) => {
		const test = fixture(memoryMib);
		await expect(test.run()).rejects.toThrow(/larger allocation/);
		expect(test.state).toHaveBeenCalledWith("owned-worker");
		expect(test.exec).not.toHaveBeenCalled();
		expect(test.onState).not.toHaveBeenCalled();
	});
	it.each([undefined, 2048])("does not invent a capacity rejection for observed %s MiB", async (memoryMib) => {
		const test = fixture(memoryMib);
		await expect(test.run()).rejects.toThrow("Fixture stops before installing anything");
		expect(test.state).toHaveBeenCalledWith("owned-worker");
		expect(test.exec).toHaveBeenCalled();
		expect(test.onState).not.toHaveBeenCalledWith(expect.objectContaining({ phase: "succeeded" }));
	});
	it("does not apply OpenClaw's observed failure to another runtime", async () => {
		const test = fixture(512, "claude-code");
		await expect(test.run()).rejects.toThrow("Fixture stops before installing anything");
		expect(test.state).not.toHaveBeenCalled();
		expect(test.exec).toHaveBeenCalled();
	});
});
