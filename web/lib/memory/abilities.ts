/**
 * Resolve a bundle's ability id lists against the live catalogs, expanding the
 * `*` wildcard to the full set. Server-only (reads the bundled catalogs).
 */

import { BUILTIN_TOOLS } from "@/lib/dashboard/loadout";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";
import type { MemoryBundle } from "@/lib/user-config/schema";

import { ABILITY_WILDCARD } from "./bundle";

export type AbilityItem = { id: string; name: string; description: string };

export type ResolvedAbilities = {
	skills: AbilityItem[];
	tools: AbilityItem[];
	mcps: AbilityItem[];
};

function pick<T>(all: ReadonlyArray<T>, ids: string[], idOf: (t: T) => string): T[] {
	if (ids.includes(ABILITY_WILDCARD)) return [...all];
	const set = new Set(ids);
	return all.filter((t) => set.has(idOf(t)));
}

export function resolveAbilities(bundle: MemoryBundle): ResolvedAbilities {
	const skills = pick(listSkills(), bundle.skillIds, (s) => s.slug).map((s) => ({
		id: s.slug,
		name: s.name,
		description: s.description,
	}));
	const tools = pick(BUILTIN_TOOLS, bundle.toolIds, (t) => t.name).map((t) => ({
		id: t.name,
		name: t.title,
		description: t.description,
	}));
	const mcps = pick(listMcpServers(), bundle.mcpServerIds, (m) => m.name).map((m) => ({
		id: m.name,
		name: m.name,
		description: `${m.tools.length} tool${m.tools.length === 1 ? "" : "s"}`,
	}));
	return { skills, tools, mcps };
}

export function abilityCounts(bundle: MemoryBundle): {
	skills: number;
	tools: number;
	mcps: number;
} {
	const r = resolveAbilities(bundle);
	return { skills: r.skills.length, tools: r.tools.length, mcps: r.mcps.length };
}
