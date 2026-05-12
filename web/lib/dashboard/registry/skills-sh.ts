/**
 * skills.sh registry adapter.
 *
 * Fetches from the skills.sh public API. Falls back to a curated
 * seed list when the API is unreachable so the registry page never
 * renders empty on first load.
 */

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

const API_BASE = "https://skills.sh/api";

type SkillsShEntry = {
	slug: string;
	name: string;
	description: string;
	version?: string;
	author?: string;
	downloads?: number;
	stars?: number;
	homepage?: string;
	tags?: string[];
};

async function fetchFromApi(query: string): Promise<SkillsShEntry[]> {
	const url = query
		? `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=40`
		: `${API_BASE}/skills?sort=popular&limit=40`;
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(8_000),
	});
	if (!res.ok) throw new Error(`skills.sh ${res.status}`);
	const body = (await res.json()) as { skills?: SkillsShEntry[]; results?: SkillsShEntry[] };
	return body.skills ?? body.results ?? [];
}

function normalize(entry: SkillsShEntry): RegistryItem {
	return {
		id: `skills-sh:${entry.slug}`,
		name: entry.name || entry.slug,
		kind: "skill",
		description: entry.description || "",
		provider: entry.author || "skills.sh",
		source: "skills-sh",
		installCommand: `npx skills install ${entry.slug}`,
		logoUrl: null,
		brand: null,
		stars: entry.stars ?? entry.downloads ?? null,
		version: entry.version ?? null,
		homepage: entry.homepage ?? `https://skills.sh/skills/${entry.slug}`,
		installed: false,
	};
}

const SEED: RegistryItem[] = [
	{ id: "skills-sh:react-best-practices", name: "react-best-practices", kind: "skill", description: "React component quality checklist covering structure, hooks, accessibility, performance, and TypeScript patterns.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install react-best-practices", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://skills.sh/skills/react-best-practices", installed: false },
	{ id: "skills-sh:nextjs-app-router", name: "nextjs-app-router", kind: "skill", description: "Next.js App Router expert guidance for routing, Server Components, Server Actions, data fetching, and rendering.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install nextjs-app-router", logoUrl: null, brand: "nextdotjs", stars: null, version: null, homepage: "https://skills.sh/skills/nextjs-app-router", installed: false },
	{ id: "skills-sh:typescript-strict", name: "typescript-strict", kind: "skill", description: "Strict TypeScript patterns -- branded types, discriminated unions, exhaustive switches, and inference helpers.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install typescript-strict", logoUrl: null, brand: "typescript", stars: null, version: null, homepage: "https://skills.sh/skills/typescript-strict", installed: false },
	{ id: "skills-sh:tailwind-patterns", name: "tailwind-patterns", kind: "skill", description: "Tailwind CSS v4 utility patterns, responsive design, dark mode, custom themes, and component extraction.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install tailwind-patterns", logoUrl: null, brand: "tailwindcss", stars: null, version: null, homepage: "https://skills.sh/skills/tailwind-patterns", installed: false },
];

export const skillsShAdapter: RegistryAdapter = {
	id: "skills-sh",
	label: "skills.sh",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		const key = cacheKey("skills-sh", opts.query);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		try {
			const entries = await fetchFromApi(opts.query);
			const items = entries.map(normalize).slice(0, opts.limit ?? 40);
			cacheSet(key, items);
			return items;
		} catch {
			if (!opts.query) return SEED;
			return SEED.filter(
				(s) =>
					s.name.includes(opts.query.toLowerCase()) ||
					s.description.toLowerCase().includes(opts.query.toLowerCase()),
			);
		}
	},
};
