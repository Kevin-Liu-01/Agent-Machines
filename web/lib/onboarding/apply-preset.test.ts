import { describe, expect, it } from "vitest";

import { findPreset } from "@/lib/dashboard/presets";
import {
	BAREBONES_MEMORY_BUNDLE_ID,
	DEFAULT_USER_CONFIG,
	PRESET_MEMORY_PREFIX,
	type UserConfig,
} from "@/lib/user-config/schema";

import { applyPreset } from "./apply-preset";

const baseConfig: UserConfig = { ...DEFAULT_USER_CONFIG };

describe("applyPreset", () => {
	it("creates a Worker bound to the preset's synthesized Memory, linked to the machine", () => {
		const preset = findPreset("deep-research")!;
		const out = applyPreset({
			config: baseConfig,
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: "dedalus-default",
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
			gatewayProfileId: "dedalus-default",
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
			gatewayProfileId: "dedalus-default",
			machineId: "m1",
		});
		const second = applyPreset({
			config: { ...baseConfig, workers: first.workers },
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: "dedalus-default",
			machineId: "m2",
		});
		expect(second.workers.length).toBe(first.workers.length + 1);
	});
});
