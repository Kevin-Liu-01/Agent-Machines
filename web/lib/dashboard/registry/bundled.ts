/**
 * Bundled catalog adapter.
 *
 * Surfaces everything that ships with Agent Machines as installable
 * registry items: the full trusted add-on catalog the Loadout builds
 * (~660 entries) -- 161 skills, 30 MCP servers + their 244 tools, the
 * built-in rig tools, the service/task hierarchy, and the curated
 * add-on list. This is the backbone of the registry: it's instant,
 * offline, and always present, so the registry is never bare even when
 * every external source is down.
 *
 * Items keep their catalog id (e.g. `skill-deepsec`, `mcp-vercel`) so
 * "Add to loadout" + installed-state detection line up with the rest of
 * the system, which keys off the same ids.
 */

import {
	BUILTIN_TOOLS,
	SERVICES,
	TASKS,
	buildTrustedAddOnCatalog,
	type TrustedAddOn,
} from "@/lib/dashboard/loadout";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

/**
 * Turn a catalog `source` string into a clickable homepage when it
 * encodes one (URL, `github:owner/repo`, `owner/repo`, npm package, or
 * a bare domain). Returns null for non-locating sources (file paths,
 * builtin handles) so the card simply omits the link.
 */
function homepageFromSource(source: string): string | null {
	const s = source.trim();
	if (!s) return null;
	if (/^https?:\/\//i.test(s)) return s;
	if (s.startsWith("github:")) return `https://github.com/${s.slice("github:".length)}`;
	// npm scoped or known package specifier
	if (s.startsWith("@") && s.includes("/")) {
		return `https://www.npmjs.com/package/${s}`;
	}
	// owner/repo (exactly one slash, no spaces, looks like a repo)
	if (/^[\w.-]+\/[\w.-]+$/.test(s) && !s.includes(" ")) {
		return `https://github.com/${s}`;
	}
	// bare domain (e.g. sprites.dev, coolify.io, ui.shadcn.com/registry)
	if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
	return null;
}

function toRegistryItem(addon: TrustedAddOn): RegistryItem {
	return {
		id: addon.id,
		name: addon.name,
		kind: addon.kind,
		description: addon.description,
		provider: addon.provider,
		source: "bundled",
		installCommand: addon.command,
		logoUrl: null,
		brand: addon.brand ?? null,
		stars: null,
		version: null,
		homepage: homepageFromSource(addon.source),
		installed: false,
	};
}

let catalogCache: RegistryItem[] | null = null;

function buildCatalog(): RegistryItem[] {
	if (catalogCache) return catalogCache;
	const addons = buildTrustedAddOnCatalog({
		skills: listSkills(),
		mcps: listMcpServers(),
		builtins: BUILTIN_TOOLS,
		services: SERVICES,
		tasks: TASKS,
	});
	catalogCache = addons.map(toRegistryItem);
	return catalogCache;
}

export const bundledAdapter: RegistryAdapter = {
	id: "bundled",
	label: "Bundled",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		const all = buildCatalog();
		const q = opts.query.trim().toLowerCase();
		if (!q) return all;

		const key = cacheKey("bundled", q);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		const matched = all.filter(
			(i) =>
				i.name.toLowerCase().includes(q) ||
				i.description.toLowerCase().includes(q) ||
				i.provider.toLowerCase().includes(q) ||
				i.kind.includes(q),
		);
		cacheSet(key, matched);
		return matched;
	},
};
