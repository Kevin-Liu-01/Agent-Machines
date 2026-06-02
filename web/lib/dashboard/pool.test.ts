import { describe, expect, it } from "vitest";

import { resolveAbilities } from "@/lib/memory/abilities";
import { newBundle } from "@/lib/memory/bundle";
import { BUILTIN_TOOLS } from "./loadout";
import { buildPool, importedMcps, importedSkills } from "./pool";
import { DEFAULT_USER_CONFIG, type CustomLoadoutEntry, type UserConfig } from "@/lib/user-config/schema";

const now = new Date(0).toISOString();

function entry(part: Partial<CustomLoadoutEntry>): CustomLoadoutEntry {
	return {
		id: "x",
		name: "x",
		kind: "skill",
		description: "",
		command: null,
		enabled: true,
		createdAt: now,
		updatedAt: now,
		...part,
	};
}

function configWith(customLoadout: CustomLoadoutEntry[]): UserConfig {
	return { ...DEFAULT_USER_CONFIG, customLoadout };
}

describe("importedSkills", () => {
	it("joins a bundled `skill-<slug>` import to its catalog metadata", () => {
		const skills = importedSkills(
			configWith([entry({ id: "skill-deepsec", name: "deepsec", kind: "skill" })]),
		);
		expect(skills.map((s) => s.slug)).toContain("deepsec");
		// catalog join carries the real category, not the synthetic "custom"
		expect(skills.find((s) => s.slug === "deepsec")?.category).not.toBe("custom");
	});

	it("represents a custom skill import as a synthetic entry", () => {
		const skills = importedSkills(
			configWith([
				entry({ id: "custom-skill:custom/my-thing", name: "My Thing", kind: "skill", description: "d" }),
			]),
		);
		const s = skills.find((x) => x.slug === "my-thing");
		expect(s).toBeTruthy();
		expect(s?.category).toBe("custom");
	});

	it("always includes the bundled library; excludes disabled custom + non-skill kinds", () => {
		const skills = importedSkills(
			configWith([
				entry({ id: "custom-skill:custom/disabled-one", name: "Disabled", kind: "skill", enabled: false }),
				entry({ id: "ext-mcp-foo", name: "foo", kind: "mcp" }),
			]),
		);
		// bundled defaults are always present
		expect(skills.length).toBeGreaterThan(50);
		expect(skills.some((s) => s.slug === "deepsec")).toBe(true);
		// the disabled custom skill and the MCP entry are not in the skill pool
		expect(skills.some((s) => s.slug === "disabled-one")).toBe(false);
	});
});

describe("importedMcps", () => {
	it("joins a bundled `mcp-server-<name>` import to its catalog metadata", () => {
		const mcps = importedMcps(
			configWith([entry({ id: "mcp-server-vercel", name: "vercel", kind: "mcp" })]),
		);
		const vercel = mcps.find((m) => m.name === "vercel");
		expect(vercel).toBeTruthy();
		expect(vercel?.tools.length).toBeGreaterThan(0);
	});

	it("represents an unknown MCP import as a synthetic server", () => {
		const mcps = importedMcps(
			configWith([entry({ id: "ext-mcp-foo", name: "foo-mcp", kind: "mcp" })]),
		);
		expect(mcps.map((m) => m.name)).toContain("foo-mcp");
	});
});

describe("resolveAbilities over the pool", () => {
	it("wildcard skill/mcp ids resolve to the whole pool; empty pool -> empty", () => {
		const empty = resolveAbilities(newBundle({ name: "W" }), { skills: [], mcps: [] });
		expect(empty.skills).toEqual([]);
		expect(empty.mcps).toEqual([]);
		// tools are runtime-intrinsic: a wildcard resolves to all builtins
		expect(empty.tools.length).toBe(BUILTIN_TOOLS.length);
	});

	it("wildcard resolves skills + mcps from the imported pool", () => {
		const config = configWith([
			entry({ id: "skill-deepsec", name: "deepsec", kind: "skill" }),
			entry({ id: "mcp-server-vercel", name: "vercel", kind: "mcp" }),
		]);
		const r = resolveAbilities(newBundle({ name: "W" }), buildPool(config));
		expect(r.skills.map((s) => s.id)).toContain("deepsec");
		expect(r.mcps.map((m) => m.id)).toContain("vercel");
	});

	it("a narrowed Memory selects only the listed abilities from the pool", () => {
		const config = configWith([
			entry({ id: "skill-deepsec", name: "deepsec", kind: "skill" }),
			entry({ id: "skill-perf", name: "perf", kind: "skill" }),
		]);
		const bundle = newBundle({
			name: "N",
			skillIds: ["deepsec"],
			toolIds: [],
			mcpServerIds: [],
		});
		const r = resolveAbilities(bundle, buildPool(config));
		expect(r.skills.map((s) => s.id)).toEqual(["deepsec"]);
	});
});
