/**
 * npm registry adapter.
 *
 * Searches the public npm registry API for CLI tools and packages.
 * Classifies results as "cli" when the package has a `bin` field or
 * `cli` keyword, otherwise "tool".
 */

import type { ServiceSlug } from "@/components/ServiceIcon";

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

const SEARCH_URL = "https://registry.npmjs.org/-/v1/search";

type NpmSearchHit = {
	package: {
		name: string;
		version: string;
		description?: string;
		keywords?: string[];
		author?: { name?: string };
		publisher?: { username?: string };
		links?: { npm?: string; homepage?: string; repository?: string };
	};
	score?: { detail?: { popularity?: number } };
};

type NpmSearchResponse = {
	objects: NpmSearchHit[];
	total: number;
};

const BRAND_KEYWORDS: Record<string, ServiceSlug> = {
	react: "react",
	nextjs: "nextdotjs",
	"next.js": "nextdotjs",
	tailwind: "tailwindcss",
	tailwindcss: "tailwindcss",
	typescript: "typescript",
	playwright: "playwright",
	firebase: "firebase",
	supabase: "supabase",
	stripe: "stripe",
	vercel: "vercel",
	cloudflare: "cloudflare",
};

function detectBrand(name: string, keywords: string[]): ServiceSlug | null {
	const combined = [name, ...keywords].join(" ").toLowerCase();
	for (const [key, slug] of Object.entries(BRAND_KEYWORDS)) {
		if (combined.includes(key)) return slug;
	}
	return null;
}

function isCli(hit: NpmSearchHit): boolean {
	const kw = hit.package.keywords ?? [];
	return kw.some((k) => ["cli", "command-line", "bin", "terminal"].includes(k.toLowerCase()));
}

function normalize(hit: NpmSearchHit): RegistryItem {
	const pkg = hit.package;
	const popularity = hit.score?.detail?.popularity ?? 0;
	const stars = Math.round(popularity * 10_000);
	return {
		id: `npm:${pkg.name}`,
		name: pkg.name,
		kind: isCli(hit) ? "cli" : "tool",
		description: pkg.description || "",
		provider: pkg.author?.name ?? pkg.publisher?.username ?? "npm",
		source: "npm",
		installCommand: isCli(hit)
			? `npm install -g ${pkg.name}`
			: `pnpm add ${pkg.name}`,
		logoUrl: null,
		brand: detectBrand(pkg.name, pkg.keywords ?? []),
		stars: stars > 0 ? stars : null,
		version: pkg.version,
		homepage:
			pkg.links?.homepage ??
			pkg.links?.repository ??
			pkg.links?.npm ??
			`https://www.npmjs.com/package/${pkg.name}`,
		installed: false,
	};
}

const SEED: RegistryItem[] = [
	{ id: "npm:agent-browser", name: "agent-browser", kind: "cli", description: "Browser automation for AI agents with snapshots, visual diff, and React introspection.", provider: "npm", source: "npm", installCommand: "npm install -g agent-browser", logoUrl: null, brand: "googlechrome", stars: null, version: null, homepage: "https://www.npmjs.com/package/agent-browser", installed: false },
	{ id: "npm:defuddle", name: "defuddle", kind: "cli", description: "Extract clean, readable content from web pages and convert to markdown.", provider: "npm", source: "npm", installCommand: "npm install -g defuddle", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/defuddle", installed: false },
	{ id: "npm:markitdown", name: "markitdown", kind: "tool", description: "Convert documents, PDFs, and spreadsheets to LLM-ready markdown.", provider: "npm", source: "npm", installCommand: "pnpm add markitdown", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/markitdown", installed: false },
	{ id: "npm:deepsec", name: "deepsec", kind: "cli", description: "Agent-powered vulnerability scanner that dispatches AI models to find security bugs.", provider: "npm", source: "npm", installCommand: "npm install -g deepsec", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/deepsec", installed: false },
	{ id: "npm:ultracite", name: "ultracite", kind: "cli", description: "Zero-config TypeScript linting and formatting powered by oxlint and oxfmt.", provider: "npm", source: "npm", installCommand: "npm install -g ultracite", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/ultracite", installed: false },
	{ id: "npm:react-doctor", name: "react-doctor", kind: "cli", description: "React codebase health checker that audits components for performance and best practices.", provider: "npm", source: "npm", installCommand: "npm install -g react-doctor", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://www.npmjs.com/package/react-doctor", installed: false },
	{ id: "npm:code-review-graph", name: "code-review-graph", kind: "cli", description: "Build an AST knowledge graph to surface relevant context for code reviews.", provider: "npm", source: "npm", installCommand: "npm install -g code-review-graph", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/code-review-graph", installed: false },
	{ id: "npm:skills", name: "skills", kind: "cli", description: "Install and manage agent skills from the skills.sh registry.", provider: "npm", source: "npm", installCommand: "npm install -g skills", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/skills", installed: false },
	{ id: "npm:@json-render/core", name: "@json-render/core", kind: "tool", description: "Render generative UI from JSON specs with catalog-constrained components.", provider: "npm", source: "npm", installCommand: "pnpm add @json-render/core", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/@json-render/core", installed: false },
	{ id: "npm:@cursor/sdk", name: "@cursor/sdk", kind: "tool", description: "Programmatically create and run Cursor coding agents from scripts and CI pipelines.", provider: "Cursor", source: "npm", installCommand: "pnpm add @cursor/sdk", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/@cursor/sdk", installed: false },
	{ id: "npm:cmdk", name: "cmdk", kind: "tool", description: "Fast, composable command menu component for React applications.", provider: "npm", source: "npm", installCommand: "pnpm add cmdk", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://www.npmjs.com/package/cmdk", installed: false },
	{ id: "npm:sonner", name: "sonner", kind: "tool", description: "Opinionated toast notification component for React with stacking and swipe gestures.", provider: "npm", source: "npm", installCommand: "pnpm add sonner", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://www.npmjs.com/package/sonner", installed: false },
	{ id: "npm:@ai-sdk/gateway", name: "@ai-sdk/gateway", kind: "tool", description: "Unified model routing to 200+ AI models through Vercel AI Gateway.", provider: "Vercel", source: "npm", installCommand: "pnpm add @ai-sdk/gateway", logoUrl: null, brand: "vercel", stars: null, version: null, homepage: "https://www.npmjs.com/package/@ai-sdk/gateway", installed: false },
	{ id: "npm:nia-docs", name: "nia-docs", kind: "cli", description: "Mount documentation sites as a virtual filesystem for AI agent context.", provider: "npm", source: "npm", installCommand: "npm install -g nia-docs", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/nia-docs", installed: false },
	{ id: "npm:qmd", name: "qmd", kind: "cli", description: "Local markdown search with BM25 ranking and optional vector similarity.", provider: "npm", source: "npm", installCommand: "npm install -g qmd", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/qmd", installed: false },
	{ id: "npm:@playwright/mcp", name: "@playwright/mcp", kind: "tool", description: "Playwright MCP server for browser automation with snapshot-based interactions.", provider: "Microsoft", source: "npm", installCommand: "pnpm add @playwright/mcp", logoUrl: null, brand: "playwright", stars: null, version: null, homepage: "https://www.npmjs.com/package/@playwright/mcp", installed: false },
	{ id: "npm:lean-ctx", name: "lean-ctx", kind: "tool", description: "Trim AI context windows for cost savings while preserving semantic relevance.", provider: "npm", source: "npm", installCommand: "pnpm add lean-ctx", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://www.npmjs.com/package/lean-ctx", installed: false },
	{ id: "npm:gsap", name: "gsap", kind: "tool", description: "Professional-grade animation platform for web with ScrollTrigger, timelines, and physics.", provider: "GSAP", source: "npm", installCommand: "pnpm add gsap", logoUrl: null, brand: "gsap", stars: null, version: null, homepage: "https://www.npmjs.com/package/gsap", installed: false },
	{ id: "npm:motion", name: "motion", kind: "tool", description: "Production animation library for React with springs, gestures, and layout transitions.", provider: "npm", source: "npm", installCommand: "pnpm add motion", logoUrl: null, brand: "framer", stars: null, version: null, homepage: "https://www.npmjs.com/package/motion", installed: false },
	{ id: "npm:@react-three/fiber", name: "@react-three/fiber", kind: "tool", description: "Declarative React renderer for Three.js enabling component-based 3D scenes.", provider: "Pmndrs", source: "npm", installCommand: "pnpm add @react-three/fiber", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://www.npmjs.com/package/@react-three/fiber", installed: false },
];

export const npmAdapter: RegistryAdapter = {
	id: "npm",
	label: "npm",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		if (!opts.query) return SEED;

		const key = cacheKey("npm", opts.query);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		const limit = opts.limit ?? 30;
		const url = `${SEARCH_URL}?text=${encodeURIComponent(opts.query)}&size=${limit}`;

		const res = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(8_000),
		});
		if (!res.ok) throw new Error(`npm search ${res.status}`);

		const body = (await res.json()) as NpmSearchResponse;
		const items = body.objects.map(normalize);
		cacheSet(key, items);
		return items;
	},
};
