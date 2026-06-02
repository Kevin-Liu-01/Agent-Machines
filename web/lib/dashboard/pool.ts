/**
 * The account-global ability pool.
 *
 * The pool is the curated default starter set (a subset of the bundled personal
 * library, loaded on every machine out of the box) PLUS anything the user adds
 * from the Registry (`config.customLoadout`) -- which can be the rest of the
 * bundled library or external/custom items. The Skills/MCPs library pages
 * render the pool, and a Memory selects its abilities from it. Built-in tools
 * are runtime-intrinsic (always available), so they are NOT part of the pool.
 *
 * Registry id conventions (see buildTrustedAddOnCatalog in loadout.ts):
 *   - bundled skill      -> `skill-<slug>`
 *   - custom skill       -> `custom-skill:custom/<slug>`
 *   - bundled MCP server -> `mcp-server-<slug(name)>`
 */

import { defaultPoolMcpIds, defaultPoolSkillIds } from "@/lib/dashboard/defaults";
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
 * The pool's skills: the curated default starter set (resolved against the
 * bundled catalog) plus any skills the user added from the Registry (the rest
 * of the bundled library, or external/custom skills).
 */
export function importedSkills(config: UserConfig): SkillSummary[] {
	const catalog = new Map(listSkills().map((s) => [s.slug, s]));
	const out: SkillSummary[] = [];
	const seen = new Set<string>();
	// 1) curated default starter set (bundled, default-loaded)
	for (const skillSlug of defaultPoolSkillIds()) {
		const skill = catalog.get(skillSlug);
		if (skill && !seen.has(skillSlug)) {
			seen.add(skillSlug);
			out.push(skill);
		}
	}
	// 2) user additions from the Registry (bundled-beyond-default, or custom)
	for (const entry of config.customLoadout) {
		if (entry.kind !== "skill" || !entry.enabled) continue;
		const slugValue = skillSlugForEntry(entry);
		if (!slugValue || seen.has(slugValue)) continue;
		seen.add(slugValue);
		out.push(catalog.get(slugValue) ?? syntheticSkill(entry, slugValue));
	}
	return out;
}

/**
 * The pool's MCP servers: the curated default starter set (resolved against the
 * bundled catalog) plus any MCP servers the user added from the Registry.
 */
export function importedMcps(config: UserConfig): McpServerWithBrand[] {
	const byName = new Map(listMcpServers().map((m) => [m.name, m]));
	const byRegistryId = new Map(
		listMcpServers().map((m) => [`${MCP_PREFIX}${slug(m.name)}`, m]),
	);
	const out: McpServerWithBrand[] = [];
	const seen = new Set<string>();
	// 1) curated default starter set
	for (const name of defaultPoolMcpIds()) {
		const server = byName.get(name);
		if (server && !seen.has(name)) {
			seen.add(name);
			out.push(server);
		}
	}
	// 2) user additions from the Registry (bundled-beyond-default, or external)
	for (const entry of config.customLoadout) {
		if (entry.kind !== "mcp" || !entry.enabled) continue;
		const server = byRegistryId.get(entry.id) ?? syntheticMcp(entry);
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
