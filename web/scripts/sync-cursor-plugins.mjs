#!/usr/bin/env node
/**
 * Sync Cursor marketplace plugins from ~/.cursor/plugins/cache/cursor-public
 * into knowledge/cursor-plugins.json, derive knowledge/packages.json, and
 * copy brand logos into web/public/brand/services/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const CACHE = join(process.env.HOME ?? "", ".cursor/plugins/cache/cursor-public");
const OUT_PLUGINS = join(REPO_ROOT, "knowledge", "cursor-plugins.json");
const OUT_PACKAGES = join(REPO_ROOT, "knowledge", "packages.json");
const OUT_WEB_PACKAGES = join(WEB_ROOT, "data", "packages.json");
const OUT_WEB_PLUGINS = join(WEB_ROOT, "data", "cursor-plugins.json");
const BRAND_DIR = join(WEB_ROOT, "public", "brand", "services");

/** Verified official docs + homepages (not guessed). */
const VERIFIED_LINKS = {
	vercel: { homepage: "https://vercel.com", docsUrl: "https://vercel.com/docs", marketplace: "https://cursor.com/marketplace/vercel" },
	stripe: { homepage: "https://stripe.com", docsUrl: "https://docs.stripe.com", marketplace: "https://cursor.com/marketplace/stripe" },
	supabase: { homepage: "https://supabase.com", docsUrl: "https://supabase.com/docs", marketplace: "https://cursor.com/marketplace/supabase" },
	clerk: { homepage: "https://clerk.com", docsUrl: "https://clerk.com/docs", marketplace: "https://cursor.com/marketplace/clerk" },
	posthog: { homepage: "https://posthog.com", docsUrl: "https://posthog.com/docs", marketplace: "https://cursor.com/marketplace/posthog" },
	sentry: { homepage: "https://sentry.io", docsUrl: "https://docs.sentry.io", marketplace: "https://cursor.com/marketplace/sentry" },
	datadog: { homepage: "https://www.datadoghq.com", docsUrl: "https://docs.datadoghq.com", marketplace: "https://cursor.com/marketplace/datadog" },
	figma: { homepage: "https://www.figma.com", docsUrl: "https://developers.figma.com", marketplace: "https://cursor.com/marketplace/figma" },
	linear: { homepage: "https://linear.app", docsUrl: "https://linear.app/docs", marketplace: "https://cursor.com/marketplace/linear" },
	firebase: { homepage: "https://firebase.google.com", docsUrl: "https://firebase.google.com/docs", marketplace: "https://cursor.com/marketplace/firebase" },
	firecrawl: { homepage: "https://www.firecrawl.dev", docsUrl: "https://docs.firecrawl.dev", marketplace: "https://cursor.com/marketplace/firecrawl" },
	granola: { homepage: "https://granola.ai", docsUrl: "https://granola.ai", marketplace: "https://cursor.com/marketplace/granola" },
	huggingface: { homepage: "https://huggingface.co", docsUrl: "https://huggingface.co/docs", marketplace: "https://cursor.com/marketplace/huggingface" },
	render: { homepage: "https://render.com", docsUrl: "https://render.com/docs", marketplace: "https://cursor.com/marketplace/render" },
	sanity: { homepage: "https://www.sanity.io", docsUrl: "https://www.sanity.io/docs", marketplace: "https://cursor.com/marketplace/sanity" },
	shopify: { homepage: "https://www.shopify.com", docsUrl: "https://shopify.dev/docs", marketplace: "https://cursor.com/marketplace/shopify" },
	slack: { homepage: "https://slack.com", docsUrl: "https://api.slack.com", marketplace: "https://cursor.com/marketplace/slack" },
	clickhouse: { homepage: "https://clickhouse.com", docsUrl: "https://clickhouse.com/docs", marketplace: "https://cursor.com/marketplace/clickhouse" },
	context7: { homepage: "https://context7.com", docsUrl: "https://github.com/upstash/context7", marketplace: "https://cursor.com/marketplace/context7" },
	superpowers: { homepage: "https://github.com/obra/superpowers", docsUrl: "https://github.com/obra/superpowers/blob/main/README.md", marketplace: "https://cursor.com/marketplace/superpowers" },
};

const BRAND_SLUG = {
	vercel: "vercel", stripe: "stripe", supabase: "supabase", clerk: "clerk", posthog: "posthog",
	sentry: "sentry", datadog: "datadog", figma: "figma", linear: "linear", firebase: "firebase",
	firecrawl: "firecrawl", granola: "granola", huggingface: "huggingface", render: "render",
	sanity: "sanity", shopify: "shopify", slack: "slack", clickhouse: "clickhouse", context7: "context7",
};

const TRIGGER_EXTRA = {
	stripe: ["subscription", "invoice", "payment", "checkout", "billing", "webhook", "customer"],
	posthog: ["analytics", "feature flag", "experiment", "hogql", "session replay", "funnel", "llm trace"],
	supabase: ["postgres", "rls", "row level", "edge function", "auth"],
	vercel: ["deploy", "deployment", "preview url", "next.js"],
	linear: ["issue", "ticket", "cycle", "project"],
	sentry: ["error tracking", "stack trace", "production issue", "release health"],
	clerk: ["authentication", "sign in", "organization", "webhook", "jwt"],
	datadog: ["logs", "metrics", "apm", "monitor", "trace"],
	figma: ["design file", "component", "figjam", "code connect"],
	firebase: ["firestore", "genkit", "app hosting"],
	firecrawl: ["scrape", "crawl", "web search", "research"],
	granola: ["meeting", "notes.granola.ai", "action items", "decided"],
	huggingface: ["model", "dataset", "hub", "gradio", "training"],
	render: ["blueprint", "web service", "postgres", "cron job"],
	sanity: ["groq", "content model", "visual editing"],
	shopify: ["liquid", "hydrogen", "polaris", "storefront"],
	slack: ["channel", "message", "workspace"],
	clickhouse: ["olap", "columnar", "chdb"],
	context7: ["library docs", "documentation lookup", "upstash"],
	superpowers: ["tdd", "brainstorm", "writing-plans", "systematic-debugging"],
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

function normalizeId(vendor, manifest) {
	const raw = (manifest.name ?? vendor).toLowerCase();
	if (raw === "clickhouse-cursor-plugin" || vendor === "clickhouse-cursor-plugin") return "clickhouse";
	if (raw === "shopify-plugin" || vendor === "shopify-plugin") return "shopify";
	if (raw === "huggingface-skills" || vendor === "huggingface-skills") return "huggingface";
	if (raw === "context7-plugin" || vendor === "context7-plugin") return "context7";
	return raw.replace(/-plugin$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function displayName(id, manifest) {
	const map = {
		clickhouse: "ClickHouse",
		huggingface: "Hugging Face",
		context7: "Context7",
		posthog: "PostHog",
		shopify: "Shopify",
	};
	if (map[id]) return map[id];
	if (manifest.name && manifest.name !== manifest.name.toLowerCase()) {
		return manifest.name.charAt(0).toUpperCase() + manifest.name.slice(1);
	}
	return id.charAt(0).toUpperCase() + id.slice(1);
}

function registryIds(id, mcpIds, hasPluginSkills) {
	const ids = [];
	const pluginId = `plugin-${id}`;
	ids.push(pluginId);
		for (const mcp of mcpIds) {
		const normalized =
			mcp.toLowerCase() === "sanity"
				? "sanity"
				: mcp.toLowerCase() === "huggingface-skills"
					? "huggingface"
					: mcp.toLowerCase();
		ids.push(`mcp-${normalized}`);
	}
	if (id === "firecrawl") ids.push("cli-firecrawl");
	if (hasPluginSkills && id === "superpowers") {
		/* plugin only — skills ship inside plugin pack */
	}
	return [...new Set(ids)];
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

function scanCache() {
	if (!existsSync(CACHE)) {
		console.warn(`sync-cursor-plugins: cache missing at ${CACHE}; using committed JSON only`);
		return null;
	}
	const plugins = [];
	for (const vendor of readdirSync(CACHE).filter((n) => !n.startsWith(".")).sort()) {
		const vendorPath = join(CACHE, vendor);
		const versions = readdirSync(vendorPath).filter((n) => !n.startsWith("."));
		if (!versions.length) continue;
		const root = join(vendorPath, versions[0]);
		const manifest =
			readJson(join(root, ".cursor-plugin/plugin.json")) ??
			readJson(join(root, ".claude-plugin/plugin.json")) ??
			readJson(join(root, ".codex-plugin/plugin.json")) ??
			{ name: vendor };
		const mcpJson = readJson(join(root, ".mcp.json")) ?? readJson(join(root, "mcp.json"));
		const skills = listSkills(root);
		const id = normalizeId(vendor, manifest);
		const links = VERIFIED_LINKS[id] ?? {
			homepage: manifest.homepage ?? null,
			docsUrl: manifest.homepage ?? null,
			marketplace: `https://cursor.com/marketplace/${id}`,
		};
		const brand = BRAND_SLUG[id] ?? null;
		const mcpServerIds = parseMcp(mcpJson).map((n) => (n === "Sanity" ? "sanity" : n));
		const logoUrl = copyLogo(root, brand);

		const triggers = [
			id,
			vendor.replace(/-plugin$/, "").replace(/-cursor-plugin$/, ""),
			...(TRIGGER_EXTRA[id] ?? []),
		]
			.map((t) => t.toLowerCase())
			.filter(Boolean);

		plugins.push({
			id,
			cursorVendor: vendor,
			name: displayName(id, manifest),
			description: manifest.description ?? "",
			homepage: links.homepage,
			docsUrl: links.docsUrl,
			marketplaceUrl: links.marketplace,
			brand,
			logoUrl,
			mcpServerIds,
			skillSlugs: skills,
			registryItemIds: registryIds(id, mcpServerIds, skills.length > 0),
			triggers: [...new Set(triggers)],
		});
	}
	return plugins;
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
		triggers: p.triggers,
		skillIds: p.skillSlugs.slice(0, 12),
		mcpServerIds: p.mcpServerIds,
		registryItemIds: p.registryItemIds,
	}));
}

function main() {
	const plugins = scanCache();
	if (!plugins) {
		if (existsSync(OUT_PLUGINS)) {
			console.log(`sync-cursor-plugins: skipped scan; ${OUT_PLUGINS} unchanged`);
		}
		return;
	}

	const payload = {
		description: "Cursor Marketplace plugins — synced from local plugin cache with verified doc links.",
		syncedAt: new Date().toISOString(),
		plugins,
	};

	const packages = {
		description:
			"Session attach packages for Add ___ composer chips — one per Cursor Marketplace plugin.",
		packages: pluginsToPackages(plugins),
	};

	mkdirSync(dirname(OUT_PLUGINS), { recursive: true });
	writeFileSync(OUT_PLUGINS, `${JSON.stringify(payload, null, 2)}\n`);
	writeFileSync(OUT_PACKAGES, `${JSON.stringify(packages, null, 2)}\n`);
	mkdirSync(join(WEB_ROOT, "data"), { recursive: true });
	writeFileSync(OUT_WEB_PLUGINS, `${JSON.stringify(payload, null, 2)}\n`);
	writeFileSync(OUT_WEB_PACKAGES, `${JSON.stringify(packages, null, 2)}\n`);

	console.log(
		`sync-cursor-plugins: ${plugins.length} plugins -> ${OUT_PLUGINS}, ${OUT_PACKAGES}`,
	);
}

main();
