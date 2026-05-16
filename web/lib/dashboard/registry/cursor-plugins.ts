/**
 * Cursor plugin skill packs adapter.
 *
 * Scans the user's ~/.cursor/plugins/cache directory on the machine
 * via execOnMachine. Each plugin folder contains skill descriptors
 * that can be added to the user's loadout.
 */

import type { ServiceSlug } from "@/components/ServiceIcon";

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

type PluginSkillEntry = {
	name: string;
	slug: string;
	description: string;
	vendor: string;
	skillCount: number;
};

/**
 * We scan via execOnMachine dynamically at search time. The caller
 * (the search API route) injects the scan results via setScanResults
 * so the adapter doesn't import server-only modules at the type level.
 */
let scanResults: PluginSkillEntry[] | null = null;

export function setCursorPluginScanResults(results: PluginSkillEntry[]): void {
	scanResults = results;
}

function normalize(entry: PluginSkillEntry): RegistryItem {
	return {
		id: `cursor-plugin:${entry.slug}`,
		name: entry.name,
		kind: "plugin",
		description: entry.description || `${entry.skillCount} skills from ${entry.vendor}`,
		provider: entry.vendor || "Cursor Plugin",
		source: "cursor-plugins",
		installCommand: null,
		logoUrl: null,
		brand: null,
		stars: null,
		version: null,
		homepage: null,
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
		.split("\n")
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

function seedPlugin(slug: string, name: string, description: string, brand: ServiceSlug | null): RegistryItem {
	return {
		id: `cursor-plugin:${slug}`,
		name,
		kind: "plugin",
		description,
		provider: "Cursor Marketplace",
		source: "cursor-plugins",
		installCommand: null,
		logoUrl: null,
		brand,
		stars: null,
		version: null,
		homepage: "https://cursor.com/marketplace",
		installed: false,
	};
}

const SEED: RegistryItem[] = [
	seedPlugin("vercel", "Vercel", "28 skills for Next.js, AI SDK, caching, deployments, functions, and storage.", "vercel"),
	seedPlugin("stripe", "Stripe", "Best practices for payments, Connect platforms, subscriptions, and API upgrades.", "stripe"),
	seedPlugin("supabase", "Supabase", "Database, auth, Edge Functions, RLS policies, and SSR integration skills.", "supabase"),
	seedPlugin("figma", "Figma", "Read design files, Code Connect mapping, diagram generation, and library building.", "figma"),
	seedPlugin("firebase", "Firebase", "Auth, Firestore, App Hosting, Genkit AI, and Data Connect skills.", "firebase"),
	seedPlugin("datadog", "Datadog", "MCP server setup, configuration management, and toolset administration.", "datadog"),
	seedPlugin("sanity", "Sanity", "Content modeling, GROQ queries, Visual Editing, SEO, and experimentation.", null),
	seedPlugin("clickhouse", "ClickHouse", "28 query optimization and schema best-practice rules for ClickHouse.", "clickhouse"),
	seedPlugin("linear", "Linear", "Issue tracking, project management, cycles, and workflow automation.", "linear"),
	seedPlugin("slack", "Slack", "Channel messaging, workspace search, threads, and notification management.", "slack"),
	seedPlugin("shopify", "Shopify", "Admin API, Hydrogen storefronts, Liquid templates, Polaris UI, and checkout.", "shopify"),
	seedPlugin("posthog", "PostHog", "Product analytics, feature flags, experiments, session replays, and LLM tracing.", "posthog"),
	seedPlugin("sentry", "Sentry", "Error tracking, performance monitoring, alerts, and SDK setup for 15+ platforms.", "sentry"),
	seedPlugin("clerk", "Clerk", "Authentication, user management, organizations, webhooks, and Next.js middleware.", "clerk"),
	seedPlugin("grafana", "Grafana", "Dashboard queries, alert management, log exploration, and observability tooling.", "grafana"),
];

export const cursorPluginsAdapter: RegistryAdapter = {
	id: "cursor-plugins",
	label: "Cursor Plugins",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		const key = cacheKey("cursor-plugins", opts.query);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		if (!scanResults) {
			if (!opts.query) return SEED;
			const q = opts.query.toLowerCase();
			return SEED.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q) ||
					(s.brand?.toLowerCase().includes(q) ?? false),
			);
		}

		let items = scanResults.map(normalize);
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
	},
};
