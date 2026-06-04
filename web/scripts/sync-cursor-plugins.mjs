#!/usr/bin/env node
/**
 * Sync the full Cursor Marketplace catalog into Agent Machines.
 *
 * Primary source: Cursor Dashboard API (same as the IDE marketplace panel)
 *   POST https://api2.cursor.sh/aiserver.v1.DashboardService/ListMarketplacePlugins
 *
 * Enrichment: local ~/.cursor/plugins/cache when present (manifest homepage, SVG logos).
 *
 * Outputs:
 *   knowledge/cursor-plugins.json
 *   knowledge/packages.json
 *   knowledge/cursor-marketplace-registry.json  (registry stubs for attach/install)
 *   web/data/{cursor-plugins,packages,cursor-marketplace-registry}.json
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	copyFileSync,
	readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const CACHE = join(process.env.HOME ?? "", ".cursor/plugins/cache/cursor-public");
const API_URL =
	"https://api2.cursor.sh/aiserver.v1.DashboardService/ListMarketplacePlugins";
const CURSOR_PLUGINS_REPO =
	"https://raw.githubusercontent.com/cursor/plugins/main/.cursor-plugin/marketplace.json";

const OUT_PLUGINS = join(REPO_ROOT, "knowledge", "cursor-plugins.json");
const OUT_PACKAGES = join(REPO_ROOT, "knowledge", "packages.json");
const OUT_REGISTRY = join(REPO_ROOT, "knowledge", "cursor-marketplace-registry.json");
const OUT_WEB_PLUGINS = join(WEB_ROOT, "data", "cursor-plugins.json");
const OUT_WEB_PACKAGES = join(WEB_ROOT, "data", "packages.json");
const OUT_WEB_REGISTRY = join(WEB_ROOT, "data", "cursor-marketplace-registry.json");
const BRAND_DIR = join(WEB_ROOT, "public", "brand", "services");

/** Verified official docs (override API/repo guesses). */
const VERIFIED_LINKS = {
	vercel: { homepage: "https://vercel.com", docsUrl: "https://vercel.com/docs" },
	stripe: { homepage: "https://stripe.com", docsUrl: "https://docs.stripe.com" },
	supabase: { homepage: "https://supabase.com", docsUrl: "https://supabase.com/docs" },
	clerk: { homepage: "https://clerk.com", docsUrl: "https://clerk.com/docs" },
	posthog: { homepage: "https://posthog.com", docsUrl: "https://posthog.com/docs" },
	sentry: { homepage: "https://sentry.io", docsUrl: "https://docs.sentry.io" },
	datadog: { homepage: "https://www.datadoghq.com", docsUrl: "https://docs.datadoghq.com" },
	figma: { homepage: "https://www.figma.com", docsUrl: "https://developers.figma.com" },
	linear: { homepage: "https://linear.app", docsUrl: "https://linear.app/docs" },
	firebase: { homepage: "https://firebase.google.com", docsUrl: "https://firebase.google.com/docs" },
	firecrawl: { homepage: "https://www.firecrawl.dev", docsUrl: "https://docs.firecrawl.dev" },
	granola: { homepage: "https://granola.ai", docsUrl: "https://granola.ai" },
	huggingface: { homepage: "https://huggingface.co", docsUrl: "https://huggingface.co/docs" },
	render: { homepage: "https://render.com", docsUrl: "https://render.com/docs" },
	sanity: { homepage: "https://www.sanity.io", docsUrl: "https://www.sanity.io/docs" },
	shopify: { homepage: "https://www.shopify.com", docsUrl: "https://shopify.dev/docs" },
	slack: { homepage: "https://slack.com", docsUrl: "https://api.slack.com" },
	clickhouse: { homepage: "https://clickhouse.com", docsUrl: "https://clickhouse.com/docs" },
	context7: { homepage: "https://context7.com", docsUrl: "https://github.com/upstash/context7" },
	superpowers: {
		homepage: "https://github.com/obra/superpowers",
		docsUrl: "https://github.com/obra/superpowers/blob/main/README.md",
	},
	github: { homepage: "https://github.com", docsUrl: "https://docs.github.com" },
	gitlab: { homepage: "https://about.gitlab.com", docsUrl: "https://docs.gitlab.com" },
	atlassian: { homepage: "https://www.atlassian.com", docsUrl: "https://developer.atlassian.com" },
	aws: { homepage: "https://aws.amazon.com", docsUrl: "https://docs.aws.amazon.com" },
	azure: { homepage: "https://azure.microsoft.com", docsUrl: "https://learn.microsoft.com/azure" },
	cloudflare: { homepage: "https://www.cloudflare.com", docsUrl: "https://developers.cloudflare.com" },
	notion: { homepage: "https://www.notion.so", docsUrl: "https://developers.notion.com" },
	prisma: { homepage: "https://www.prisma.io", docsUrl: "https://www.prisma.io/docs" },
	mongodb: { homepage: "https://www.mongodb.com", docsUrl: "https://www.mongodb.com/docs" },
	neon: { homepage: "https://neon.tech", docsUrl: "https://neon.tech/docs" },
	"neon-postgres": { homepage: "https://neon.tech", docsUrl: "https://neon.tech/docs" },
};

const BRAND_SLUG = {
	vercel: "vercel",
	stripe: "stripe",
	supabase: "supabase",
	clerk: "clerk",
	posthog: "posthog",
	sentry: "sentry",
	datadog: "datadog",
	figma: "figma",
	linear: "linear",
	firebase: "firebase",
	firecrawl: "firecrawl",
	granola: "granola",
	huggingface: "huggingface",
	render: "render",
	sanity: "sanity",
	shopify: "shopify",
	slack: "slack",
	clickhouse: "clickhouse",
	context7: "context7",
	github: "github",
	gitlab: "gitlab",
	atlassian: "atlassian",
	aws: "aws",
	azure: "azure",
	cloudflare: "cloudflare",
	notion: "notion",
	prisma: "prisma",
	mongodb: "mongodb",
	neon: "neon",
	shadcn: "shadcn",
	twilio: "twilio",
	snowflake: "snowflake",
	databricks: "databricks",
	elastic: "elastic",
	grafana: "grafana",
	pinecone: "pinecone",
	amplitude: "amplitude",
	mixpanel: "mixpanel",
	auth0: "auth0",
	workos: "workos",
	planetscale: "planetscale",
	redis: "redis",
};

const LOGO_CANDIDATES = [
	"assets/logo.svg",
	"assets/vercel.svg",
	"assets/clerk-logo.svg",
	"assets/firebase_logo.svg",
	"assets/shopify_glyph.svg",
	"Figma Icon (Full-color).svg",
	"logo.svg",
];

function readJson(p) {
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

async function fetchJson(url, init) {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
	return res.json();
}

async function fetchMarketplacePlugins() {
	const body = { excludeCloudAgentPlugins: true };
	const data = await fetchJson(API_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const plugins = (data.plugins ?? []).filter(
		(p) => p.status === "PLUGIN_STATUS_APPROVED" && p.isPublished !== false,
	);
	return plugins;
}

function normalizeId(name) {
	const raw = String(name ?? "").toLowerCase();
	const aliases = {
		"clickhouse-cursor-plugin": "clickhouse",
		"shopify-plugin": "shopify",
		"huggingface-skills": "huggingface",
		"context7-plugin": "context7",
		"snowflake-cursor-plugin": "snowflake",
		"aikido-cursor-plugin": "aikido",
		"sinch-cursor-plugin": "sinch",
		"sonatype-cursor-plugin": "sonatype",
		"sourcegraph-cursor-plugin": "sourcegraph",
		"semgrep-plugin": "semgrep",
		"grafana-cloud-mcp": "grafana",
		"grafana-assistant": "grafana",
		"neon-postgres": "neon",
		"notion-workspace": "notion",
		"redis-development": "redis",
		"aws-amplify": "aws",
		"aws-serverless": "aws",
		"databases-on-aws": "aws",
		"deploy-on-aws": "aws",
		"azure-cosmosdb": "azure",
		"databricks-skills": "databricks",
		"mixpanel-mcp": "mixpanel",
	};
	if (aliases[raw]) return aliases[raw];
	return raw
		.replace(/-cursor-plugin$/, "")
		.replace(/-plugin$/, "")
		.replace(/-skills$/, "")
		.replace(/-mcp$/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeMcpName(name) {
	const n = String(name ?? "").toLowerCase();
	if (n === "sanity") return "sanity";
	if (n.includes("huggingface")) return "huggingface";
	return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferBrand(id, publisherName) {
	if (BRAND_SLUG[id]) return BRAND_SLUG[id];
	const pub = String(publisherName ?? "").toLowerCase();
	if (BRAND_SLUG[pub]) return BRAND_SLUG[pub];
	return null;
}

function titleCase(id) {
	return id
		.split("-")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function resolveLinks(id, apiPlugin, cacheManifest) {
	const verified = VERIFIED_LINKS[id];
	const homepage =
		verified?.homepage ??
		cacheManifest?.homepage ??
		apiPlugin.publisher?.websiteUrl ??
		apiPlugin.repositoryUrl ??
		null;
	const docsUrl =
		verified?.docsUrl ??
		cacheManifest?.homepage ??
		apiPlugin.repositoryUrl ??
		homepage;
	return {
		homepage,
		docsUrl,
		marketplaceUrl: `https://cursor.com/marketplace/${apiPlugin.name}`,
	};
}

function buildTriggers(id, apiPlugin) {
	const parts = [
		id,
		apiPlugin.name,
		apiPlugin.displayName,
		...(apiPlugin.tags ?? []),
		apiPlugin.publisher?.name,
		apiPlugin.publisher?.displayName,
		...(apiPlugin.skills ?? []).map((s) => s.name),
		...(apiPlugin.mcpServers ?? []).map((m) => m.name),
	];
	return [...new Set(parts.map((p) => String(p).toLowerCase()).filter(Boolean))];
}

function registryIds(id, skillSlugs, mcpNames) {
	const ids = [`plugin-${id}`];
	for (const slug of skillSlugs) ids.push(`skill-${slug}`);
	for (const mcp of mcpNames) ids.push(`mcp-${normalizeMcpName(mcp)}`);
	if (id === "firecrawl") ids.push("cli-firecrawl");
	return [...new Set(ids)];
}

function listSkills(dir) {
	const skillsDir = join(dir, "skills");
	if (!existsSync(skillsDir)) return [];
	return readdirSync(skillsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")))
		.map((d) => d.name);
}

function parseMcp(mcpJson) {
	if (!mcpJson) return [];
	const servers = mcpJson.mcpServers ?? mcpJson;
	if (typeof servers !== "object" || servers === null) return [];
	return Object.keys(servers).filter((k) => k !== "mcpServers");
}

function copyLogo(root, brandSlug) {
	if (!brandSlug) return null;
	for (const rel of LOGO_CANDIDATES) {
		const src = join(root, rel);
		if (!existsSync(src)) continue;
		mkdirSync(BRAND_DIR, { recursive: true });
		const dest = join(BRAND_DIR, `${brandSlug}.svg`);
		copyFileSync(src, dest);
		return `/brand/services/${brandSlug}.svg`;
	}
	return null;
}

/** vendor folder name -> cache root path */
function scanCacheIndex() {
	const index = new Map();
	if (!existsSync(CACHE)) return index;
	for (const vendor of readdirSync(CACHE).filter((n) => !n.startsWith("."))) {
		const vendorPath = join(CACHE, vendor);
		const versions = readdirSync(vendorPath).filter((n) => !n.startsWith("."));
		if (!versions.length) continue;
		const root = join(vendorPath, versions[0]);
		const manifest =
			readJson(join(root, ".cursor-plugin/plugin.json")) ??
			readJson(join(root, ".claude-plugin/plugin.json")) ??
			{};
		const id = normalizeId(manifest?.name ?? vendor);
		index.set(vendor, { root, manifest, id });
		index.set(id, { root, manifest, id });
		index.set(apiName(vendor), { root, manifest, id });
	}
	return index;
}

function apiName(vendor) {
	return vendor.replace(/-plugin$/, "").replace(/-cursor-plugin$/, "");
}

function mapApiPlugin(apiPlugin, cacheIndex) {
	const id = normalizeId(apiPlugin.name);
	const cache =
		cacheIndex.get(apiPlugin.name) ??
		cacheIndex.get(id) ??
		cacheIndex.get(`${apiPlugin.name}-plugin`) ??
		null;
	const cacheRoot = cache?.root ?? null;
	const cacheManifest = cache?.manifest ?? null;
	const links = resolveLinks(id, apiPlugin, cacheManifest);
	const brand = inferBrand(id, apiPlugin.publisher?.displayName ?? apiPlugin.publisher?.name);
	const skillSlugs = (apiPlugin.skills ?? []).map((s) => s.name).filter(Boolean);
	const mcpServerIds = (apiPlugin.mcpServers ?? []).map((m) => normalizeMcpName(m.name));
	const localLogo = cacheRoot ? copyLogo(cacheRoot, brand) : null;
	const logoUrl = localLogo ?? apiPlugin.logoUrl ?? apiPlugin.publisher?.logoUrl ?? null;

	return {
		id,
		cursorPluginId: String(apiPlugin.id),
		cursorVendor: apiPlugin.name,
		name: apiPlugin.displayName || titleCase(id),
		description: apiPlugin.description ?? "",
		homepage: links.homepage,
		docsUrl: links.docsUrl,
		marketplaceUrl: links.marketplaceUrl,
		repositoryUrl: apiPlugin.repositoryUrl ?? apiPlugin.gitUrl ?? null,
		brand,
		logoUrl,
		mcpServerIds,
		skillSlugs,
		skillDetails: (apiPlugin.skills ?? []).map((s) => ({
			name: s.name,
			description: s.description ?? "",
			sourceUrl: s.sourceUrl ?? null,
		})),
		registryItemIds: registryIds(id, skillSlugs, mcpServerIds),
		triggers: buildTriggers(id, apiPlugin),
		publisher: apiPlugin.publisher?.displayName ?? apiPlugin.publisher?.name ?? null,
		isVerified: Boolean(apiPlugin.publisher?.isVerified),
		tags: apiPlugin.tags ?? [],
	};
}

function toRegistryAddons(plugins) {
	const items = [];
	const seen = new Set();

	function push(item) {
		if (seen.has(item.id)) return;
		seen.add(item.id);
		items.push(item);
	}

	for (const p of plugins) {
		push({
			id: `plugin-${p.id}`,
			name: `${p.name} skill pack`,
			kind: "plugin",
			provider: p.publisher ?? "Cursor Marketplace",
			description: p.description,
			source: p.repositoryUrl ?? `cursor-public/${p.cursorVendor}`,
			command: null,
			brand: p.brand,
			logoUrl: p.logoUrl,
			homepage: p.docsUrl ?? p.homepage ?? p.marketplaceUrl,
		});

		for (const skill of p.skillDetails ?? []) {
			push({
				id: `skill-${skill.name}`,
				name: skill.name,
				kind: "skill",
				provider: p.publisher ?? p.name,
				description: skill.description || `${p.name} marketplace skill`,
				source: skill.sourceUrl ?? p.repositoryUrl ?? `cursor-plugin:${p.id}`,
				command: null,
				brand: p.brand,
				logoUrl: p.logoUrl,
				homepage: skill.sourceUrl ?? p.docsUrl ?? p.homepage,
			});
		}

		for (const mcpName of p.mcpServerIds) {
			push({
				id: `mcp-${mcpName}`,
				name: `${titleCase(mcpName)} MCP`,
				kind: "mcp",
				provider: p.publisher ?? p.name,
				description: `MCP server from the ${p.name} Cursor plugin.`,
				source: p.repositoryUrl ?? `cursor-plugin:${p.id}`,
				command: null,
				brand: p.brand,
				logoUrl: p.logoUrl,
				homepage: p.docsUrl ?? p.homepage,
			});
		}

		if (p.id === "firecrawl") {
			push({
				id: "cli-firecrawl",
				name: "Firecrawl CLI",
				kind: "cli",
				provider: "Firecrawl",
				description: "Scrape, crawl, map, and search the web with agent-optimized markdown output.",
				source: "https://docs.firecrawl.dev",
				command: "npm install -g firecrawl-cli",
				brand: "firecrawl",
				logoUrl: p.logoUrl,
				homepage: "https://docs.firecrawl.dev",
			});
		}
	}

	return items;
}

function pluginsToPackages(plugins) {
	return plugins.map((p) => ({
		id: p.id,
		name: p.name,
		description: p.description,
		brand: p.brand,
		homepage: p.homepage,
		docsUrl: p.docsUrl,
		marketplaceUrl: p.marketplaceUrl,
		logoUrl: p.logoUrl,
		triggers: p.triggers.slice(0, 24),
		skillIds: p.skillSlugs,
		mcpServerIds: p.mcpServerIds,
		registryItemIds: p.registryItemIds,
	}));
}

function writeOutputs(payload, packages, registry) {
	mkdirSync(dirname(OUT_PLUGINS), { recursive: true });
	mkdirSync(join(WEB_ROOT, "data"), { recursive: true });
	const files = [
		[OUT_PLUGINS, payload],
		[OUT_PACKAGES, packages],
		[OUT_REGISTRY, registry],
		[OUT_WEB_PLUGINS, payload],
		[OUT_WEB_PACKAGES, packages],
		[OUT_WEB_REGISTRY, registry],
	];
	for (const [path, data] of files) {
		writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
	}
}

async function main() {
	const cacheIndex = scanCacheIndex();
	let apiPlugins;
	try {
		apiPlugins = await fetchMarketplacePlugins();
	} catch (err) {
		console.error(`sync-cursor-plugins: API fetch failed: ${err.message}`);
		if (existsSync(OUT_PLUGINS)) {
			console.log("sync-cursor-plugins: keeping committed JSON");
			return;
		}
		process.exit(1);
	}

	const plugins = apiPlugins
		.map((p) => mapApiPlugin(p, cacheIndex))
		.sort((a, b) => a.name.localeCompare(b.name));

	const registryItems = toRegistryAddons(plugins);
	const syncedAt = new Date().toISOString();

	const payload = {
		description:
			"Full Cursor Marketplace catalog (cursor-public) from Dashboard API, enriched with local cache when available.",
		source: API_URL,
		syncedAt,
		pluginCount: plugins.length,
		registryItemCount: registryItems.length,
		plugins,
	};

	const packages = {
		description:
			"Session attach packages for Add ___ composer chips — one per Cursor Marketplace plugin.",
		syncedAt,
		packages: pluginsToPackages(plugins),
	};

	const registry = {
		description:
			"Generated registry stubs for marketplace plugins, skills, and MCPs (used by bundled catalog lookup).",
		syncedAt,
		items: registryItems,
	};

	writeOutputs(payload, packages, registry);

	console.log(
		`sync-cursor-plugins: ${plugins.length} plugins, ${registryItems.length} registry items -> knowledge/ + web/data/`,
	);
}

main();
