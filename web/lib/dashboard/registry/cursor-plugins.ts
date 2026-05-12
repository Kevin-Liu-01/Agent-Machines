/**
 * Cursor plugin skill packs adapter.
 *
 * Scans the user's ~/.cursor/plugins/cache directory on the machine
 * via execOnMachine. Each plugin folder contains skill descriptors
 * that can be added to the user's loadout.
 */

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

type PluginSkillEntry = {
	name: string;
	slug: string;
	description: string;
	vendor: string;
	skillCount: number;
};

/**
 * We scan via execOnMachine dynamically at search time. The caller
 * (the search API route) injects the scan results via setScanResults
 * so the adapter doesn't import server-only modules at the type level.
 */
let scanResults: PluginSkillEntry[] | null = null;

export function setCursorPluginScanResults(results: PluginSkillEntry[]): void {
	scanResults = results;
}

function normalize(entry: PluginSkillEntry): RegistryItem {
	return {
		id: `cursor-plugin:${entry.slug}`,
		name: entry.name,
		kind: "plugin",
		description: entry.description || `${entry.skillCount} skills from ${entry.vendor}`,
		provider: entry.vendor || "Cursor Plugin",
		source: "cursor-plugins",
		installCommand: null,
		logoUrl: null,
		brand: null,
		stars: null,
		version: null,
		homepage: null,
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

		if (!scanResults) return [];

		let items = scanResults.map(normalize);
		if (opts.query) {
			const q = opts.query.toLowerCase();
			items = items.filter(
				(i) =>
					i.name.toLowerCase().includes(q) ||
					i.description.toLowerCase().includes(q) ||
					i.provider.toLowerCase().includes(q),
			);
		}
		items = items.slice(0, opts.limit ?? 40);
		cacheSet(key, items);
		return items;
	},
};
