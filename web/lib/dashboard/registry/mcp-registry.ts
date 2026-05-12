/**
 * Official MCP server registry adapter.
 *
 * Fetches the server index from the modelcontextprotocol/servers
 * GitHub repository. The repo maintains a structured README with
 * server entries; we fetch the raw content and parse it, with a
 * curated seed fallback.
 */

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

import type { ServiceSlug } from "@/components/ServiceIcon";

const GITHUB_RAW =
	"https://raw.githubusercontent.com/modelcontextprotocol/servers/main/servers.json";

type McpServerEntry = {
	name: string;
	description: string;
	repository?: string;
	homepage?: string;
	author?: string;
	tags?: string[];
	npm?: string;
};

const BRAND_MAP: Record<string, ServiceSlug> = {
	github: "github",
	slack: "slack",
	stripe: "stripe",
	firebase: "firebase",
	sentry: "sentry",
	datadog: "datadog",
	supabase: "supabase",
	figma: "figma",
	linear: "linear",
	cloudflare: "cloudflare",
	playwright: "playwright",
	postgres: "supabase",
	clickhouse: "clickhouse",
};

function detectBrand(name: string): ServiceSlug | null {
	const lower = name.toLowerCase();
	for (const [key, slug] of Object.entries(BRAND_MAP)) {
		if (lower.includes(key)) return slug;
	}
	return null;
}

function slug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalize(entry: McpServerEntry): RegistryItem {
	const s = slug(entry.name);
	return {
		id: `mcp-registry:${s}`,
		name: entry.name,
		kind: "mcp",
		description: entry.description || "",
		provider: entry.author || "MCP Community",
		source: "mcp-registry",
		installCommand: entry.npm ? `npx -y ${entry.npm}` : null,
		logoUrl: null,
		brand: detectBrand(entry.name),
		stars: null,
		version: null,
		homepage: entry.homepage ?? entry.repository ?? null,
		installed: false,
	};
}

async function fetchIndex(): Promise<McpServerEntry[]> {
	const res = await fetch(GITHUB_RAW, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`mcp-registry ${res.status}`);
	const body = await res.json();
	if (Array.isArray(body)) return body as McpServerEntry[];
	if (body && typeof body === "object" && "servers" in body)
		return (body as { servers: McpServerEntry[] }).servers;
	return [];
}

const SEED: RegistryItem[] = [
	{ id: "mcp-registry:filesystem", name: "Filesystem", kind: "mcp", description: "Read, write, and manage files on the local filesystem with configurable access controls.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-filesystem", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem", installed: false },
	{ id: "mcp-registry:github", name: "GitHub", kind: "mcp", description: "Interact with GitHub repositories, issues, pull requests, and more.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-github", logoUrl: null, brand: "github", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/github", installed: false },
	{ id: "mcp-registry:slack", name: "Slack", kind: "mcp", description: "Read and send messages, manage channels, and search Slack workspace content.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-slack", logoUrl: null, brand: "slack", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack", installed: false },
	{ id: "mcp-registry:postgres", name: "PostgreSQL", kind: "mcp", description: "Query and manage PostgreSQL databases with read-only access by default.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-postgres", logoUrl: null, brand: "supabase", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres", installed: false },
	{ id: "mcp-registry:puppeteer", name: "Puppeteer", kind: "mcp", description: "Browser automation using Puppeteer for web scraping, testing, and interaction.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-puppeteer", logoUrl: null, brand: "googlechrome", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer", installed: false },
	{ id: "mcp-registry:memory", name: "Memory", kind: "mcp", description: "Persistent memory using a local knowledge graph for long-term context retention.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-memory", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory", installed: false },
];

export const mcpRegistryAdapter: RegistryAdapter = {
	id: "mcp-registry",
	label: "MCP Registry",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		const key = cacheKey("mcp-registry", opts.query);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		try {
			const entries = await fetchIndex();
			let items = entries.map(normalize);
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
		} catch {
			if (!opts.query) return SEED;
			const q = opts.query.toLowerCase();
			return SEED.filter(
				(s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
			);
		}
	},
};
