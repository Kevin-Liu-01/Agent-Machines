/**
 * Cursor plugin skill packs adapter.
 *
 * Surfaces every plugin from the synced Cursor Marketplace catalog
 * (web/data/cursor-plugins.json). Replaces the old hardcoded SEED list.
 */

import type { ServiceSlug } from "@/components/ServiceIcon";
import { listCursorPlugins, type CursorPluginRecord } from "@/lib/dashboard/cursor-plugins-data";

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

export type PluginSkillEntry = {
	name: string;
	slug: string;
	description: string;
	vendor: string;
	skillCount: number;
};

/** @deprecated Use listCursorPlugins() — kept for machine scan injection. */
let scanResults: PluginSkillEntry[] | null = null;

export function setCursorPluginScanResults(results: PluginSkillEntry[]): void {
	scanResults = results;
}

function toRegistryItem(plugin: CursorPluginRecord): RegistryItem {
	const brand =
		plugin.brand && typeof plugin.brand === "string"
			? (plugin.brand as ServiceSlug)
			: null;
	return {
		id: `cursor-plugin:${plugin.id}`,
		name: plugin.name,
		kind: "plugin",
		description: plugin.description,
		provider: "Cursor Marketplace",
		source: "cursor-plugins",
		installCommand: null,
		logoUrl: plugin.logoUrl,
		brand,
		stars: null,
		version: null,
		homepage: plugin.docsUrl ?? plugin.homepage ?? plugin.marketplaceUrl,
		installed: false,
	};
}

/**
 * Parse the output of a scan command that lists plugin directories
 * and their skill files. Expected format per line:
 *   vendor/plugin-name<TAB>skill-count<TAB>first-skill-description
 */
export function parseScanOutput(stdout: string): PluginSkillEntry[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const [path, countStr, desc] = line.split("\t");
			if (!path) return null;
			const parts = (path ?? "").split("/");
			const vendor = parts[0] ?? "unknown";
			const name = parts.slice(1).join("/") || parts[0] || "unknown";
			const slug = name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "");
			return {
				name,
				slug,
				description: desc ?? "",
				vendor,
				skillCount: Number.parseInt(countStr ?? "0", 10) || 0,
			};
		})
		.filter((e): e is PluginSkillEntry => e !== null);
}

export const cursorPluginsAdapter: RegistryAdapter = {
	id: "cursor-plugins",
	label: "Cursor Plugins",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		const key = cacheKey("cursor-plugins", opts.query);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		if (scanResults) {
			let items = scanResults.map((entry) =>
				toRegistryItem({
					id: entry.slug,
					cursorVendor: entry.vendor,
					name: entry.name,
					description: entry.description || `${entry.skillCount} skills`,
					homepage: "https://cursor.com/marketplace",
					docsUrl: "https://cursor.com/docs/plugins",
					marketplaceUrl: "https://cursor.com/marketplace",
					brand: null,
					logoUrl: null,
					mcpServerIds: [],
					skillSlugs: [],
					registryItemIds: [],
					triggers: [],
				}),
			);
			if (opts.query) {
				const q = opts.query.toLowerCase();
				items = items.filter(
					(i) =>
						i.name.toLowerCase().includes(q) ||
						i.description.toLowerCase().includes(q),
				);
			}
			items = items.slice(0, opts.limit ?? 40);
			cacheSet(key, items);
			return items;
		}

		let items = listCursorPlugins().map(toRegistryItem);
		if (opts.query) {
			const q = opts.query.toLowerCase();
			items = items.filter(
				(i) =>
					i.name.toLowerCase().includes(q) ||
					i.description.toLowerCase().includes(q) ||
					(i.brand?.toLowerCase().includes(q) ?? false),
			);
		}
		items = items.slice(0, opts.limit ?? 80);
		cacheSet(key, items);
		return items;
	},
};
