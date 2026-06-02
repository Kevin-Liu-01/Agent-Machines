/**
 * The account-global imported pool.
 *
 * Everything a user installs from the Registry lands in
 * `config.customLoadout`. This module turns that flat list into the resolved
 * skill + MCP catalogs that the Skills/MCPs library pages render and that a
 * Memory's abilities are selected from. Built-in tools are runtime-intrinsic
 * (always available), so they are NOT part of the imported pool -- only skills
 * and MCP servers are "imported".
 *
 * Registry id conventions (see buildTrustedAddOnCatalog in loadout.ts):
 *   - bundled skill      -> `skill-<slug>`
 *   - custom skill       -> `custom-skill:custom/<slug>`
 *   - bundled MCP server -> `mcp-server-<slug(name)>`
 * Imports from external sources keep their own ids; we fall back to the
 * entry's own metadata for those.
 */

import { slug } from "@/lib/dashboard/loadout";
import { listMcpServers, type McpServerWithBrand } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";
import type { SkillSummary } from "@/lib/dashboard/types";
import type { CustomLoadoutEntry, UserConfig } from "@/lib/user-config/schema";

const SKILL_PREFIX = "skill-";
const CUSTOM_SKILL_PREFIX = "custom-skill:";
const MCP_PREFIX = "mcp-server-";

export type Pool = {
	skills: SkillSummary[];
	mcps: McpServerWithBrand[];
};

/** Slug of a custom skill entry id (`custom-skill:custom/<slug>` or legacy). */
export function customSkillSlug(id: string): string {
	const rest = id.slice(CUSTOM_SKILL_PREFIX.length);
	return rest.startsWith("custom/") ? rest.slice("custom/".length) : rest;
}

function syntheticSkill(entry: CustomLoadoutEntry, slugValue: string): SkillSummary {
	return {
		slug: slugValue,
		name: entry.name || slugValue,
		description: entry.description ?? "",
		version: "",
		category: "custom",
		tags: [],
		related: [],
		bytes: 0,
	};
}

function syntheticMcp(entry: CustomLoadoutEntry): McpServerWithBrand {
	return {
		name: entry.name || entry.id,
		transport: "stdio",
		source: entry.description || "imported",
		tools: [],
	};
}

/** Skill slug an imported entry maps to, regardless of source. */
function skillSlugForEntry(entry: CustomLoadoutEntry): string {
	if (entry.id.startsWith(SKILL_PREFIX)) return entry.id.slice(SKILL_PREFIX.length);
	if (entry.id.startsWith(CUSTOM_SKILL_PREFIX)) return customSkillSlug(entry.id);
	return slug(entry.name || entry.id);
}

/** The imported skills, joined to bundled metadata when the id resolves. */
export function importedSkills(config: UserConfig): SkillSummary[] {
	const catalog = new Map(listSkills().map((s) => [s.slug, s]));
	const out: SkillSummary[] = [];
	const seen = new Set<string>();
	for (const entry of config.customLoadout) {
		if (entry.kind !== "skill" || !entry.enabled) continue;
		const slugValue = skillSlugForEntry(entry);
		if (!slugValue || seen.has(slugValue)) continue;
		seen.add(slugValue);
		out.push(catalog.get(slugValue) ?? syntheticSkill(entry, slugValue));
	}
	return out;
}

/** The imported MCP servers, joined to bundled metadata when the id resolves. */
export function importedMcps(config: UserConfig): McpServerWithBrand[] {
	const byRegistryId = new Map(
		listMcpServers().map((m) => [`${MCP_PREFIX}${slug(m.name)}`, m]),
	);
	const out: McpServerWithBrand[] = [];
	const seen = new Set<string>();
	for (const entry of config.customLoadout) {
		if (entry.kind !== "mcp" || !entry.enabled) continue;
		const server = byRegistryId.get(entry.id) ?? syntheticMcp(entry);
		if (seen.has(server.name)) continue;
		seen.add(server.name);
		out.push(server);
	}
	return out;
}

/** Imported skills + MCP servers, the surface a Memory selects abilities from. */
export function buildPool(config: UserConfig): Pool {
	return { skills: importedSkills(config), mcps: importedMcps(config) };
}
