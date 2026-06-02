/**
 * The account-global ability pool.
 *
 * The pool is the bundled catalog (shipped, default-loaded on every machine)
 * PLUS anything the user adds from the Registry (`config.customLoadout`). The
 * Skills/MCPs library pages render the pool, and a Memory selects its abilities
 * from it. Built-in tools are runtime-intrinsic (always available), so they are
 * NOT part of the pool -- only skills and MCP servers are.
 *
 * Registry id conventions (see buildTrustedAddOnCatalog in loadout.ts):
 *   - bundled skill      -> `skill-<slug>`   (already in the bundled set)
 *   - custom skill       -> `custom-skill:custom/<slug>`
 *   - bundled MCP server -> `mcp-server-<slug(name)>` (already bundled)
 * Only non-bundled customLoadout entries (external/custom) are appended; the
 * bundled catalog already covers the rest.
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

/**
 * The pool's skills: the full bundled library (default-loaded) plus any custom
 * or external skills the user added from the Registry.
 */
export function importedSkills(config: UserConfig): SkillSummary[] {
	const bundled = listSkills();
	const seen = new Set(bundled.map((s) => s.slug));
	const out: SkillSummary[] = [...bundled];
	for (const entry of config.customLoadout) {
		if (entry.kind !== "skill" || !entry.enabled) continue;
		const slugValue = skillSlugForEntry(entry);
		if (!slugValue || seen.has(slugValue)) continue; // bundled already covers it
		seen.add(slugValue);
		out.push(syntheticSkill(entry, slugValue));
	}
	return out;
}

/**
 * The pool's MCP servers: the full bundled catalog (default-loaded) plus any
 * external MCP servers the user added from the Registry.
 */
export function importedMcps(config: UserConfig): McpServerWithBrand[] {
	const bundled = listMcpServers();
	const bundledIds = new Set(bundled.map((m) => `${MCP_PREFIX}${slug(m.name)}`));
	const seen = new Set(bundled.map((m) => m.name));
	const out: McpServerWithBrand[] = [...bundled];
	for (const entry of config.customLoadout) {
		if (entry.kind !== "mcp" || !entry.enabled) continue;
		if (bundledIds.has(entry.id)) continue; // bundled already covers it
		const server = syntheticMcp(entry);
		if (seen.has(server.name)) continue;
		seen.add(server.name);
		out.push(server);
	}
	return out;
}

/** Skills + MCP servers, the surface a Memory selects abilities from. */
export function buildPool(config: UserConfig): Pool {
	return { skills: importedSkills(config), mcps: importedMcps(config) };
}
