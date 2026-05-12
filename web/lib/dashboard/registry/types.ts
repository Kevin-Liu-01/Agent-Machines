/**
 * Unified types for the registry browser.
 *
 * Every external source (skills.sh, MCP registry, npm, Cursor plugins,
 * GitHub repos, URL manifests) normalizes into `RegistryItem` before
 * reaching the UI. The adapter interface is intentionally minimal --
 * each source implements `search()` and we merge the results.
 */

import type { ServiceSlug } from "@/components/ServiceIcon";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";

export type RegistrySourceId =
	| "skills-sh"
	| "mcp-registry"
	| "npm"
	| "cursor-plugins"
	| "github-repo"
	| "url-manifest"
	| "bundled";

export type RegistryItem = {
	id: string;
	name: string;
	kind: TrustedAddOnKind;
	description: string;
	provider: string;
	source: RegistrySourceId;
	installCommand: string | null;
	logoUrl: string | null;
	brand: ServiceSlug | null;
	stars: number | null;
	version: string | null;
	homepage: string | null;
	installed: boolean;
};

export type RegistrySearchOptions = {
	query: string;
	limit?: number;
};

export type RegistryAdapter = {
	id: RegistrySourceId;
	label: string;
	search: (opts: RegistrySearchOptions) => Promise<RegistryItem[]>;
};

export type SourceStatus = {
	id: RegistrySourceId;
	label: string;
	ok: boolean;
	count: number;
	error?: string;
};
