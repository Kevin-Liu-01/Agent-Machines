/**
 * The default starter pool: a curated everyday subset of the bundled personal
 * library, loaded on every machine out of the box. The full library + external
 * sources are added from the Registry. Synced from `knowledge/defaults.json`.
 *
 *   - skillIds      -> skill slugs (e.g. "code-review")
 *   - mcpServerIds  -> MCP server names (e.g. "vercel")
 */

import defaultsData from "@/data/defaults.json";

type DefaultsShape = { skillIds: string[]; mcpServerIds: string[] };

const DATA = (defaultsData as DefaultsShape) ?? { skillIds: [], mcpServerIds: [] };

export function defaultPoolSkillIds(): string[] {
	return [...(DATA.skillIds ?? [])];
}

export function defaultPoolMcpIds(): string[] {
	return [...(DATA.mcpServerIds ?? [])];
}
