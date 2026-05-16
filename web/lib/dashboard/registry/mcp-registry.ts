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

const REGISTRY_API =
	"https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest";

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

type McpRegistryApiEntry = {
	name: string;
	description?: string;
	repository?: { url?: string };
	version_detail?: { packages?: { registry_name?: string }[] };
};

async function fetchIndex(): Promise<McpServerEntry[]> {
	const res = await fetch(REGISTRY_API, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`mcp-registry ${res.status}`);
	const body = await res.json();

	let raw: McpRegistryApiEntry[];
	if (Array.isArray(body)) raw = body;
	else if (body && typeof body === "object" && "servers" in body)
		raw = (body as { servers: McpRegistryApiEntry[] }).servers;
	else return [];

	return raw.map((entry) => {
		const npmPkg = entry.version_detail?.packages?.[0]?.registry_name ?? undefined;
		return {
			name: entry.name,
			description: entry.description ?? "",
			repository: entry.repository?.url,
			npm: npmPkg,
		};
	});
}

const SEED: RegistryItem[] = [
	{ id: "mcp-registry:filesystem", name: "Filesystem", kind: "mcp", description: "Read, write, and manage files on the local filesystem with configurable access controls.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-filesystem", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem", installed: false },
	{ id: "mcp-registry:github", name: "GitHub", kind: "mcp", description: "Interact with GitHub repositories, issues, pull requests, and more.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-github", logoUrl: null, brand: "github", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/github", installed: false },
	{ id: "mcp-registry:slack", name: "Slack", kind: "mcp", description: "Read and send messages, manage channels, and search Slack workspace content.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-slack", logoUrl: null, brand: "slack", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack", installed: false },
	{ id: "mcp-registry:postgres", name: "PostgreSQL", kind: "mcp", description: "Query and manage PostgreSQL databases with read-only access by default.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-postgres", logoUrl: null, brand: "supabase", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres", installed: false },
	{ id: "mcp-registry:puppeteer", name: "Puppeteer", kind: "mcp", description: "Browser automation using Puppeteer for web scraping, testing, and interaction.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-puppeteer", logoUrl: null, brand: "googlechrome", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer", installed: false },
	{ id: "mcp-registry:memory", name: "Memory", kind: "mcp", description: "Persistent memory using a local knowledge graph for long-term context retention.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-memory", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory", installed: false },
	{ id: "mcp-registry:brave-search", name: "Brave Search", kind: "mcp", description: "Web search powered by Brave's independent search index with privacy focus.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-brave-search", logoUrl: null, brand: "brave", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search", installed: false },
	{ id: "mcp-registry:google-drive", name: "Google Drive", kind: "mcp", description: "Access and search Google Drive files, folders, and shared drives.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-gdrive", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive", installed: false },
	{ id: "mcp-registry:google-maps", name: "Google Maps", kind: "mcp", description: "Location search, geocoding, directions, and mapping services via Google Maps API.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-google-maps", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps", installed: false },
	{ id: "mcp-registry:fetch", name: "Fetch", kind: "mcp", description: "Make HTTP requests and retrieve web content as clean markdown or raw data.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-fetch", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch", installed: false },
	{ id: "mcp-registry:git", name: "Git", kind: "mcp", description: "Git repository operations including status, diff, log, branch, and commit management.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-git", logoUrl: null, brand: "github", stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/git", installed: false },
	{ id: "mcp-registry:sqlite", name: "SQLite", kind: "mcp", description: "Query and manage local SQLite databases with schema inspection and migrations.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-sqlite", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite", installed: false },
	{ id: "mcp-registry:sequential-thinking", name: "Sequential Thinking", kind: "mcp", description: "Chain-of-thought reasoning tool for structured multi-step problem solving.", provider: "MCP", source: "mcp-registry", installCommand: "npx -y @modelcontextprotocol/server-sequential-thinking", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking", installed: false },
	{ id: "mcp-registry:sentry", name: "Sentry", kind: "mcp", description: "Production error tracking, issue management, and performance monitoring via Sentry.", provider: "Sentry", source: "mcp-registry", installCommand: "npx -y @sentry/mcp-server", logoUrl: null, brand: "sentry", stars: null, version: null, homepage: "https://github.com/getsentry/sentry-mcp", installed: false },
	{ id: "mcp-registry:neon", name: "Neon", kind: "mcp", description: "Serverless Postgres with database branching, autoscaling, and point-in-time restore.", provider: "Neon", source: "mcp-registry", installCommand: "npx -y @neondatabase/mcp-server-neon", logoUrl: null, brand: "neon", stars: null, version: null, homepage: "https://github.com/neondatabase/mcp-server-neon", installed: false },
	{ id: "mcp-registry:upstash", name: "Upstash", kind: "mcp", description: "Serverless Redis, QStash message queues, and Vector database operations.", provider: "Upstash", source: "mcp-registry", installCommand: "npx -y @upstash/mcp-server", logoUrl: null, brand: "upstash", stars: null, version: null, homepage: "https://github.com/upstash/mcp-server", installed: false },
	{ id: "mcp-registry:notion", name: "Notion", kind: "mcp", description: "Access Notion workspace pages, databases, blocks, and comments.", provider: "Notion", source: "mcp-registry", installCommand: "npx -y @notionhq/mcp-server", logoUrl: null, brand: "notion", stars: null, version: null, homepage: "https://github.com/notionhq/notion-mcp-server", installed: false },
	{ id: "mcp-registry:linear", name: "Linear", kind: "mcp", description: "Issue tracking, project management, cycles, and team workflow automation.", provider: "Linear", source: "mcp-registry", installCommand: "npx -y @linear/mcp-server", logoUrl: null, brand: "linear", stars: null, version: null, homepage: "https://github.com/linear/linear-mcp-server", installed: false },
	{ id: "mcp-registry:stripe", name: "Stripe", kind: "mcp", description: "Payment processing, subscription billing, invoices, and customer management.", provider: "Stripe", source: "mcp-registry", installCommand: "npx -y @stripe/mcp-server", logoUrl: null, brand: "stripe", stars: null, version: null, homepage: "https://github.com/stripe/stripe-mcp", installed: false },
	{ id: "mcp-registry:cloudflare", name: "Cloudflare", kind: "mcp", description: "Manage Cloudflare Workers, KV namespaces, D1 databases, and R2 object storage.", provider: "Cloudflare", source: "mcp-registry", installCommand: "npx -y @cloudflare/mcp-server-cloudflare", logoUrl: null, brand: "cloudflare", stars: null, version: null, homepage: "https://github.com/cloudflare/mcp-server-cloudflare", installed: false },
	{ id: "mcp-registry:vercel", name: "Vercel", kind: "mcp", description: "Manage deployments, projects, domains, and environment variables on Vercel.", provider: "Vercel", source: "mcp-registry", installCommand: "npx -y @vercel/mcp-server", logoUrl: null, brand: "vercel", stars: null, version: null, homepage: "https://github.com/vercel/mcp-server", installed: false },
	{ id: "mcp-registry:supabase", name: "Supabase", kind: "mcp", description: "Manage Supabase database, auth, storage, and edge functions via MCP.", provider: "Supabase", source: "mcp-registry", installCommand: "npx -y @supabase/mcp-server", logoUrl: null, brand: "supabase", stars: null, version: null, homepage: "https://github.com/supabase-community/supabase-mcp", installed: false },
	{ id: "mcp-registry:exa", name: "Exa", kind: "mcp", description: "Neural semantic search engine for finding relevant web content and research.", provider: "Exa", source: "mcp-registry", installCommand: "npx -y exa-mcp-server", logoUrl: null, brand: "exa", stars: null, version: null, homepage: "https://github.com/exa-labs/exa-mcp-server", installed: false },
	{ id: "mcp-registry:resend", name: "Resend", kind: "mcp", description: "Send transactional emails, manage domains, and track delivery via Resend.", provider: "Resend", source: "mcp-registry", installCommand: "npx -y resend-mcp-server", logoUrl: null, brand: "resend", stars: null, version: null, homepage: "https://github.com/resend/mcp-server", installed: false },
	{ id: "mcp-registry:grafana", name: "Grafana", kind: "mcp", description: "Query dashboards, manage alerts, search logs, and explore metrics in Grafana.", provider: "Grafana", source: "mcp-registry", installCommand: "npx -y grafana-mcp-server", logoUrl: null, brand: "grafana", stars: null, version: null, homepage: "https://github.com/grafana/mcp-server", installed: false },
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
