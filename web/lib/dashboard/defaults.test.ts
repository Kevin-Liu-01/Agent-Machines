import { describe, expect, it } from "vitest";

import { defaultPoolMcpIds, defaultPoolSkillIds } from "./defaults";
import { listMcpServers } from "./mcps";
import { listSkills } from "./skills";

describe("default starter pool", () => {
	it("is non-empty and has no duplicate ids", () => {
		const skills = defaultPoolSkillIds();
		const mcps = defaultPoolMcpIds();
		expect(skills.length).toBeGreaterThan(0);
		expect(mcps.length).toBeGreaterThan(0);
		expect(new Set(skills).size).toBe(skills.length);
		expect(new Set(mcps).size).toBe(mcps.length);
	});

	it("every default skill slug exists in the bundled library", () => {
		const slugs = new Set(listSkills().map((s) => s.slug));
		const missing = defaultPoolSkillIds().filter((id) => !slugs.has(id));
		expect(missing).toEqual([]);
	});

	it("every default MCP server name exists in the bundled catalog", () => {
		const names = new Set(listMcpServers().map((m) => m.name));
		const missing = defaultPoolMcpIds().filter((id) => !names.has(id));
		expect(missing).toEqual([]);
	});
});
