import { describe, expect, it } from "vitest";

import { BUILTIN_TOOLS } from "./loadout";
import { listMcpServers } from "./mcps";
import { findPreset, listPresets } from "./presets";
import { listSkills } from "./skills";

const WILDCARD = "*";

describe("listPresets", () => {
	it("returns at least the core starter and exposes unique ids", () => {
		const presets = listPresets();
		expect(presets.length).toBeGreaterThan(0);
		expect(presets.some((p) => p.id === "core")).toBe(true);
		const ids = presets.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("returns copies so callers cannot mutate the registry", () => {
		const a = listPresets()[0];
		a.skillIds.push("__mutation__");
		const b = listPresets()[0];
		expect(b.skillIds).not.toContain("__mutation__");
	});
});

describe("findPreset", () => {
	it("resolves a known id and returns null otherwise", () => {
		expect(findPreset("core")?.id).toBe("core");
		expect(findPreset("does-not-exist")).toBeNull();
	});
});

describe("preset ability ids resolve against the live catalogs", () => {
	const skillSlugs = new Set(listSkills().map((s) => s.slug));
	const toolNames = new Set(BUILTIN_TOOLS.map((t) => t.name));
	const mcpNames = new Set(listMcpServers().map((m) => m.name));

	for (const preset of listPresets()) {
		it(`${preset.id}: every skill slug exists`, () => {
			const bad = preset.skillIds.filter((id) => id !== WILDCARD && !skillSlugs.has(id));
			expect(bad).toEqual([]);
		});

		it(`${preset.id}: every tool name exists`, () => {
			const bad = preset.toolIds.filter((id) => id !== WILDCARD && !toolNames.has(id));
			expect(bad).toEqual([]);
		});

		it(`${preset.id}: every MCP server name exists`, () => {
			const bad = preset.mcpServerIds.filter((id) => id !== WILDCARD && !mcpNames.has(id));
			expect(bad).toEqual([]);
		});
	}
});
