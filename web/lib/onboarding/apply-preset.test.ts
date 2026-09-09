import { describe, expect, it } from "vitest";

import { findPreset } from "@/lib/dashboard/presets";
import { DEFAULT_ROUTER_ID } from "@/lib/agents/upstreams";
import {
	BAREBONES_MEMORY_BUNDLE_ID,
	DEFAULT_USER_CONFIG,
	PRESET_MEMORY_PREFIX,
	type UserConfig,
} from "@/lib/user-config/schema";

import { applyPreset } from "./apply-preset";

const baseConfig: UserConfig = { ...DEFAULT_USER_CONFIG };

describe("applyPreset", () => {
	it("reuses a saved Worker on retry with the same client identity", () => {
		const input = {
			workerId: "cf5dbe1d-f475-4c4e-852a-18c7d816ee97",
			config: baseConfig,
			preset: findPreset("coding-agent")!,
			agentKind: "codex" as const,
			model: "gpt-test",
			gatewayProfileId: DEFAULT_ROUTER_ID,
			machineId: null,
		};
		const first = applyPreset(input);
		const retried = applyPreset({ ...input, config: { ...baseConfig, workers: first.workers } });
		expect(first.workerId).toBe(input.workerId);
		expect(retried.workerId).toBe(first.workerId);
		expect(retried.workers).toBe(first.workers);
	});
	it("creates a Worker bound to the preset's synthesized Memory, linked to the machine", () => {
		const preset = findPreset("deep-research")!;
		const out = applyPreset({
			config: baseConfig,
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: DEFAULT_ROUTER_ID,
			machineId: "machine-123",
		});
		expect(out.memoryBundleId).toBe(`${PRESET_MEMORY_PREFIX}deep-research`);
		const worker = out.workers.find((w) => w.id === out.workerId);
		expect(worker?.memoryBundleId).toBe(`${PRESET_MEMORY_PREFIX}deep-research`);
		expect(worker?.lastMachineId).toBe("machine-123");
		expect(worker?.rolePrompt).toBe(preset.rolePrompt);
		expect(worker?.source).toBe("custom");
	});

	it("no-preset binds a default Worker to the Barebones memory", () => {
		const out = applyPreset({
			config: baseConfig,
			preset: null,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: DEFAULT_ROUTER_ID,
			machineId: "machine-9",
		});
		expect(out.memoryBundleId).toBe(BAREBONES_MEMORY_BUNDLE_ID);
		const worker = out.workers.find((w) => w.id === out.workerId);
		expect(worker?.source).toBe("default");
		expect(worker?.memoryBundleId).toBe(BAREBONES_MEMORY_BUNDLE_ID);
	});

	it("appends to existing workers without dropping them", () => {
		const preset = findPreset("coding-agent")!;
		const first = applyPreset({
			config: baseConfig,
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: DEFAULT_ROUTER_ID,
			machineId: "m1",
		});
		const second = applyPreset({
			config: { ...baseConfig, workers: first.workers },
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: DEFAULT_ROUTER_ID,
			machineId: "m2",
		});
		expect(second.workers.length).toBe(first.workers.length + 1);
	});
});
