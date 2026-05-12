/**
 * URL manifest adapter.
 *
 * Fetches a user-provided JSON URL, validates it against the manifest
 * schema, and normalizes each entry into RegistryItem.
 *
 * Expected manifest shape:
 * {
 *   "name": "My Org Tools",
 *   "items": [
 *     { "name": "...", "kind": "skill|mcp|cli|tool", "description": "...", ... }
 *   ]
 * }
 */

import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

type ManifestEntry = {
	name: string;
	kind?: string;
	description?: string;
	provider?: string;
	command?: string | null;
	homepage?: string | null;
	version?: string | null;
	logo?: string | null;
};

type Manifest = {
	name?: string;
	items?: ManifestEntry[];
};

const VALID_KINDS = new Set<string>(["skill", "mcp", "cli", "tool", "plugin", "provider", "source"]);

function isValidKind(kind: string | undefined): kind is TrustedAddOnKind {
	return kind !== undefined && VALID_KINDS.has(kind);
}

function slug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalize(entry: ManifestEntry, manifestName: string, url: string): RegistryItem {
	return {
		id: `manifest:${slug(url)}:${slug(entry.name)}`,
		name: entry.name,
		kind: isValidKind(entry.kind) ? entry.kind : "tool",
		description: entry.description || "",
		provider: entry.provider || manifestName || "URL manifest",
		source: "url-manifest",
		installCommand: entry.command ?? null,
		logoUrl: entry.logo ?? null,
		brand: null,
		stars: null,
		version: entry.version ?? null,
		homepage: entry.homepage ?? null,
		installed: false,
	};
}

async function fetchManifest(url: string): Promise<Manifest> {
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`manifest fetch ${res.status}`);
	return (await res.json()) as Manifest;
}

export const urlManifestAdapter: RegistryAdapter = {
	id: "url-manifest",
	label: "URL Manifest",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		if (!opts.query) return [];

		try {
			new URL(opts.query);
		} catch {
			return [];
		}

		const key = cacheKey("url-manifest", opts.query);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		const manifest = await fetchManifest(opts.query);
		if (!Array.isArray(manifest.items)) return [];

		const items = manifest.items
			.map((entry) => normalize(entry, manifest.name ?? "", opts.query))
			.slice(0, opts.limit ?? 100);
		cacheSet(key, items);
		return items;
	},
};
