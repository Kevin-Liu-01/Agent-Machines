import { describe, expect, it } from "vitest";

import { findPreset } from "@/lib/dashboard/presets";
import { DEFAULT_MEMORY_BUNDLE_ID, DEFAULT_USER_CONFIG, type UserConfig } from "@/lib/user-config/schema";

import { applyPreset, presetToCustomLoadout } from "./apply-preset";

const baseConfig: UserConfig = { ...DEFAULT_USER_CONFIG };

describe("presetToCustomLoadout", () => {
	it("maps preset skills/mcps to registry-id pool entries", () => {
		const preset = findPreset("frontend-design");
		expect(preset).toBeTruthy();
		const entries = presetToCustomLoadout(preset!);
		expect(entries.some((e) => e.id === "skill-frontend-design" && e.kind === "skill")).toBe(true);
		expect(entries.some((e) => e.id === "mcp-server-figma" && e.kind === "mcp")).toBe(true);
		// every entry is enabled and carries a label
		expect(entries.every((e) => e.enabled && e.name)).toBe(true);
	});
});

describe("applyPreset", () => {
	it("imports the pool, creates a Memory with docs, and a linked Worker", () => {
		const preset = findPreset("core")!;
		const out = applyPreset({
			config: baseConfig,
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: "dedalus-default",
			machineId: "machine-123",
		});

		// pool import
		expect(out.customLoadout.some((e) => e.id.startsWith("skill-"))).toBe(true);
		// memory created with the preset's selection + non-empty default docs
		const mem = out.memoryBundles.find((b) => b.id === out.memoryBundleId);
		expect(mem).toBeTruthy();
		expect(mem?.id).not.toBe(DEFAULT_MEMORY_BUNDLE_ID);
		expect(mem?.skillIds).toEqual(preset.skillIds);
		expect((mem?.docs.soul.length ?? 0) + (mem?.docs.agentDocs.length ?? 0)).toBeGreaterThan(0);
		// worker links to the machine + the new memory
		const worker = out.workers.find((w) => w.id === out.workerId);
		expect(worker?.memoryBundleId).toBe(out.memoryBundleId);
		expect(worker?.lastMachineId).toBe("machine-123");
		expect(worker?.rolePrompt).toBe(preset.rolePrompt);
		expect(worker?.source).toBe("custom");
	});

	it("no-preset starts blank on the default Memory", () => {
		const out = applyPreset({
			config: baseConfig,
			preset: null,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: "dedalus-default",
			machineId: "machine-9",
		});
		expect(out.customLoadout).toEqual(baseConfig.customLoadout);
		expect(out.memoryBundleId).toBe(DEFAULT_MEMORY_BUNDLE_ID);
		expect(out.memoryBundles).toEqual(baseConfig.memoryBundles ?? []);
		const worker = out.workers.find((w) => w.id === out.workerId);
		expect(worker?.source).toBe("default");
		expect(worker?.memoryBundleId).toBe(DEFAULT_MEMORY_BUNDLE_ID);
	});

	it("does not duplicate already-imported pool entries", () => {
		const preset = findPreset("core")!;
		const first = applyPreset({
			config: baseConfig,
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: "dedalus-default",
			machineId: "m1",
		});
		// apply again on top of the first result
		const second = applyPreset({
			config: { ...baseConfig, customLoadout: first.customLoadout },
			preset,
			agentKind: "hermes",
			model: "m",
			gatewayProfileId: "dedalus-default",
			machineId: "m2",
		});
		expect(second.customLoadout.length).toBe(first.customLoadout.length);
	});
});
