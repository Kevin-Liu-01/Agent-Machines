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

export const npmAdapter: RegistryAdapter = {
	id: "npm",
	label: "npm",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		if (!opts.query) return [];

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
