/**
 * Load the bundled MCP catalog from knowledge/mcps/catalog.json.
 * Used by CLI bootstrap to register core and credential-gated MCP servers.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type McpTier = "core" | "bundled" | "ide" | "reference";

export type McpCatalogEntry = {
	id: string;
	name: string;
	tier: McpTier;
	transport: string;
	owner?: string;
	link?: string;
	install?: { type: string; package?: string; path?: string };
	installCommand?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	requiredEnv?: string[];
	tools?: string[];
	toolCount?: number;
};

export type McpCatalog = {
	version: string;
	updated: string;
	summary: Record<string, unknown>;
	servers: McpCatalogEntry[];
};

export function loadMcpCatalog(repoRoot: string): McpCatalog {
	const path = resolve(repoRoot, "knowledge/mcps/catalog.json");
	const raw = readFileSync(path, "utf8");
	return JSON.parse(raw) as McpCatalog;
}

export function coreServers(catalog: McpCatalog): McpCatalogEntry[] {
	return catalog.servers.filter((s) => s.tier === "core");
}

export function bundledServers(catalog: McpCatalog): McpCatalogEntry[] {
	return catalog.servers.filter((s) => s.tier === "bundled");
}
