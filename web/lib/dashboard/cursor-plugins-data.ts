/**
 * Cursor Marketplace plugin metadata synced from local cache.
 * Source: knowledge/cursor-plugins.json via sync-cursor-plugins.mjs
 */

import cursorPluginsData from "@/data/cursor-plugins.json";

export type CursorPluginRecord = {
	id: string;
	cursorPluginId: string;
	cursorVendor: string;
	name: string;
	description: string;
	homepage: string | null;
	docsUrl: string | null;
	marketplaceUrl: string | null;
	repositoryUrl: string | null;
	brand: string | null;
	logoUrl: string | null;
	mcpServerIds: string[];
	skillSlugs: string[];
	skillDetails: Array<{ name: string; description: string; sourceUrl: string | null }>;
	registryItemIds: string[];
	triggers: string[];
	publisher: string | null;
	isVerified: boolean;
	tags: string[];
};

type Shape = { plugins: CursorPluginRecord[] };

const DATA = (cursorPluginsData as Shape) ?? { plugins: [] };

export function listCursorPlugins(): CursorPluginRecord[] {
	return [...(DATA.plugins ?? [])];
}

export function findCursorPlugin(id: string): CursorPluginRecord | null {
	return listCursorPlugins().find((p) => p.id === id) ?? null;
}
