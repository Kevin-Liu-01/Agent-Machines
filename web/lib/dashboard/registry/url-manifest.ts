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

import { fetchPublicJson, publicManifestUrl } from "./public-json";
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

function optionalText(value: unknown, max: number): string | undefined {
	return typeof value === "string" && value.length <= max ? value : undefined;
}

function publicLink(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		return publicManifestUrl(value).href;
	} catch { return null; }
}

export function normalizeManifest(value: unknown, url: string, limit = 100): RegistryItem[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Manifest must be a JSON object.");
	const manifest = value as Record<string, unknown>;
	if (!Array.isArray(manifest.items)) throw new Error("Manifest must contain an items array.");
	if (manifest.items.length > 1000) throw new Error("Manifest exceeds 1,000 items.");
	const name = optionalText(manifest.name, 256) ?? "";
	const items: RegistryItem[] = [];
	for (const value of manifest.items) {
		if (!value || typeof value !== "object" || Array.isArray(value)) continue;
		const entry = value as Record<string, unknown>;
		const entryName = optionalText(entry.name, 256)?.trim();
		if (!entryName) continue;
		items.push(normalize({ name: entryName,
			kind: optionalText(entry.kind, 32), description: optionalText(entry.description, 4096),
			provider: optionalText(entry.provider, 256), command: optionalText(entry.command, 8192) ?? null,
			version: optionalText(entry.version, 128), homepage: publicLink(entry.homepage), logo: publicLink(entry.logo),
		}, name, url));
	}
	return items.slice(0, Math.max(0, Math.min(1000, Number.isFinite(limit) ? Math.floor(limit) : 100)));
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

		// A URL can contain a capability token: never retain its response in a
		// process-global catalog cache or fold case-sensitive URL paths together.
		return normalizeManifest(await fetchPublicJson(opts.query), opts.query, opts.limit);
	},
};
