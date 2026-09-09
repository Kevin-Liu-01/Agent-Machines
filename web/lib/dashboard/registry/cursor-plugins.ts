/**
 * Cursor plugin skill packs adapter.
 *
 * Surfaces every plugin from the synced Cursor Marketplace catalog
 * (web/data/cursor-plugins.json). Replaces the old hardcoded SEED list.
 */

import type { ServiceSlug } from "@/components/ServiceIcon";
import { listCursorPlugins, type CursorPluginRecord } from "@/lib/dashboard/cursor-plugins-data";

import type { RegistryAdapter, RegistryItem } from "./types";

export type PluginSkillEntry = {
	name: string;
	slug: string;
	description: string;
	vendor: string;
	skillCount: number;
};

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
		.slice(0, 256 * 1024)
		.split("\n")
		.slice(0, 1000)
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

/** Scanned machine data belongs only to this request, never a shared cache. */
export function createCursorPluginsAdapter(scanResults: readonly PluginSkillEntry[] = []): RegistryAdapter {
	const scanned: RegistryItem[] = scanResults.map((entry) => ({
		id: `cursor-plugin-scan:${encodeURIComponent(entry.vendor)}:${encodeURIComponent(entry.slug)}`,
		name: entry.name, kind: "plugin", description: entry.description || `${entry.skillCount} skills`,
		provider: `${entry.vendor} · machine scan`, source: "cursor-plugins", installCommand: null,
		logoUrl: null, brand: null, stars: null, version: null, homepage: null, installed: false,
	}));
	return {
		id: "cursor-plugins",
		label: "Cursor Plugins",
		async search(opts): Promise<RegistryItem[]> {
			let items = [...scanned, ...listCursorPlugins().map(toRegistryItem)];
			if (opts.query) {
				const q = opts.query.toLowerCase();
				items = items.filter(
					(i) =>
						i.name.toLowerCase().includes(q) ||
						i.description.toLowerCase().includes(q) ||
						(i.brand?.toLowerCase().includes(q) ?? false),
				);
			}
			return items.slice(0, opts.limit ?? 200);
		},
	};
}

/** Only the immutable public catalog is shared by default. */
export const cursorPluginsAdapter = createCursorPluginsAdapter();
