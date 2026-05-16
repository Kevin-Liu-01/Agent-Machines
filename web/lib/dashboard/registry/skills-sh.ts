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
	{ id: "skills-sh:typescript-strict", name: "typescript-strict", kind: "skill", description: "Strict TypeScript patterns including branded types, discriminated unions, exhaustive switches, and inference helpers.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install typescript-strict", logoUrl: null, brand: "typescript", stars: null, version: null, homepage: "https://skills.sh/skills/typescript-strict", installed: false },
	{ id: "skills-sh:tailwind-patterns", name: "tailwind-patterns", kind: "skill", description: "Tailwind CSS v4 utility patterns for responsive design, dark mode, custom themes, and component extraction.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install tailwind-patterns", logoUrl: null, brand: "tailwindcss", stars: null, version: null, homepage: "https://skills.sh/skills/tailwind-patterns", installed: false },
	{ id: "skills-sh:ai-sdk-streaming", name: "ai-sdk-streaming", kind: "skill", description: "Build streaming AI features with Vercel AI SDK including chat UIs, structured output, and tool calling.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install ai-sdk-streaming", logoUrl: null, brand: "vercel", stars: null, version: null, homepage: "https://skills.sh/skills/ai-sdk-streaming", installed: false },
	{ id: "skills-sh:supabase-auth", name: "supabase-auth", kind: "skill", description: "Supabase authentication setup with RLS policies, SSR session handling, and social OAuth providers.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install supabase-auth", logoUrl: null, brand: "supabase", stars: null, version: null, homepage: "https://skills.sh/skills/supabase-auth", installed: false },
	{ id: "skills-sh:stripe-integration", name: "stripe-integration", kind: "skill", description: "Stripe payment integration covering Checkout Sessions, PaymentIntents, webhooks, and subscription billing.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install stripe-integration", logoUrl: null, brand: "stripe", stars: null, version: null, homepage: "https://skills.sh/skills/stripe-integration", installed: false },
	{ id: "skills-sh:prisma-schema-design", name: "prisma-schema-design", kind: "skill", description: "Prisma schema modeling with relations, indexes, enums, migrations, and query optimization patterns.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install prisma-schema-design", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://skills.sh/skills/prisma-schema-design", installed: false },
	{ id: "skills-sh:testing-library", name: "testing-library", kind: "skill", description: "Testing Library patterns for component testing with accessible queries, user events, and async utilities.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install testing-library", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://skills.sh/skills/testing-library", installed: false },
	{ id: "skills-sh:accessibility-wcag", name: "accessibility-wcag", kind: "skill", description: "WCAG 2.2 compliance guidance for semantic HTML, ARIA roles, keyboard navigation, and color contrast.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install accessibility-wcag", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://skills.sh/skills/accessibility-wcag", installed: false },
	{ id: "skills-sh:graphql-best-practices", name: "graphql-best-practices", kind: "skill", description: "GraphQL schema design, resolver patterns, pagination, error handling, and client-side caching strategies.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install graphql-best-practices", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://skills.sh/skills/graphql-best-practices", installed: false },
	{ id: "skills-sh:docker-compose", name: "docker-compose", kind: "skill", description: "Docker Compose multi-service orchestration with networking, volumes, health checks, and dev/prod profiles.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install docker-compose", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://skills.sh/skills/docker-compose", installed: false },
	{ id: "skills-sh:github-actions-ci", name: "github-actions-ci", kind: "skill", description: "GitHub Actions CI/CD workflows with matrix builds, caching, artifact management, and deployment triggers.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install github-actions-ci", logoUrl: null, brand: "github", stars: null, version: null, homepage: "https://skills.sh/skills/github-actions-ci", installed: false },
	{ id: "skills-sh:vercel-deployment", name: "vercel-deployment", kind: "skill", description: "Vercel deployment strategies including preview URLs, environment variables, edge config, and monorepo setups.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install vercel-deployment", logoUrl: null, brand: "vercel", stars: null, version: null, homepage: "https://skills.sh/skills/vercel-deployment", installed: false },
	{ id: "skills-sh:sentry-error-tracking", name: "sentry-error-tracking", kind: "skill", description: "Sentry SDK setup for error tracking, performance monitoring, session replay, and release management.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install sentry-error-tracking", logoUrl: null, brand: "sentry", stars: null, version: null, homepage: "https://skills.sh/skills/sentry-error-tracking", installed: false },
	{ id: "skills-sh:firebase-auth-setup", name: "firebase-auth-setup", kind: "skill", description: "Firebase Authentication with email/password, social providers, phone auth, and custom claims.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install firebase-auth-setup", logoUrl: null, brand: "firebase", stars: null, version: null, homepage: "https://skills.sh/skills/firebase-auth-setup", installed: false },
	{ id: "skills-sh:clerk-nextjs", name: "clerk-nextjs", kind: "skill", description: "Clerk authentication for Next.js with middleware, user management, organizations, and webhook handlers.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install clerk-nextjs", logoUrl: null, brand: "clerk", stars: null, version: null, homepage: "https://skills.sh/skills/clerk-nextjs", installed: false },
	{ id: "skills-sh:shadcn-ui-patterns", name: "shadcn-ui-patterns", kind: "skill", description: "shadcn/ui component composition with custom themes, registry patterns, and Tailwind CSS integration.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install shadcn-ui-patterns", logoUrl: null, brand: "tailwindcss", stars: null, version: null, homepage: "https://skills.sh/skills/shadcn-ui-patterns", installed: false },
	{ id: "skills-sh:framer-motion-animations", name: "framer-motion-animations", kind: "skill", description: "Motion animation patterns for React including layout transitions, gestures, scroll effects, and exit animations.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install framer-motion-animations", logoUrl: null, brand: "framer", stars: null, version: null, homepage: "https://skills.sh/skills/framer-motion-animations", installed: false },
	{ id: "skills-sh:gsap-scroll-animations", name: "gsap-scroll-animations", kind: "skill", description: "GSAP ScrollTrigger patterns for scroll-driven animations, pinning, scrubbing, and parallax effects.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install gsap-scroll-animations", logoUrl: null, brand: "gsap", stars: null, version: null, homepage: "https://skills.sh/skills/gsap-scroll-animations", installed: false },
	{ id: "skills-sh:react-three-fiber-basics", name: "react-three-fiber-basics", kind: "skill", description: "React Three Fiber fundamentals for declarative 3D scenes, cameras, lights, materials, and drei helpers.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install react-three-fiber-basics", logoUrl: null, brand: "react", stars: null, version: null, homepage: "https://skills.sh/skills/react-three-fiber-basics", installed: false },
	{ id: "skills-sh:playwright-e2e-testing", name: "playwright-e2e-testing", kind: "skill", description: "Playwright end-to-end testing with page objects, fixtures, visual comparisons, and CI configuration.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install playwright-e2e-testing", logoUrl: null, brand: "playwright", stars: null, version: null, homepage: "https://skills.sh/skills/playwright-e2e-testing", installed: false },
	{ id: "skills-sh:node-security-hardening", name: "node-security-hardening", kind: "skill", description: "Node.js security hardening with input validation, CSRF protection, rate limiting, and dependency auditing.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install node-security-hardening", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://skills.sh/skills/node-security-hardening", installed: false },
	{ id: "skills-sh:postgres-performance", name: "postgres-performance", kind: "skill", description: "PostgreSQL performance tuning with query plans, indexing strategies, connection pooling, and vacuum management.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install postgres-performance", logoUrl: null, brand: "supabase", stars: null, version: null, homepage: "https://skills.sh/skills/postgres-performance", installed: false },
	{ id: "skills-sh:redis-caching-patterns", name: "redis-caching-patterns", kind: "skill", description: "Redis caching strategies including TTL policies, cache invalidation, pub/sub, and sorted set leaderboards.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install redis-caching-patterns", logoUrl: null, brand: null, stars: null, version: null, homepage: "https://skills.sh/skills/redis-caching-patterns", installed: false },
	{ id: "skills-sh:openai-function-calling", name: "openai-function-calling", kind: "skill", description: "OpenAI function calling patterns with JSON schema definitions, streaming, and multi-turn tool orchestration.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install openai-function-calling", logoUrl: null, brand: "openai", stars: null, version: null, homepage: "https://skills.sh/skills/openai-function-calling", installed: false },
	{ id: "skills-sh:anthropic-tool-use", name: "anthropic-tool-use", kind: "skill", description: "Anthropic tool use integration with Claude including schema design, streaming, and agentic workflows.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install anthropic-tool-use", logoUrl: null, brand: "anthropic", stars: null, version: null, homepage: "https://skills.sh/skills/anthropic-tool-use", installed: false },
	{ id: "skills-sh:cloudflare-workers-guide", name: "cloudflare-workers-guide", kind: "skill", description: "Cloudflare Workers development with KV storage, Durable Objects, D1 databases, and R2 object storage.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install cloudflare-workers-guide", logoUrl: null, brand: "cloudflare", stars: null, version: null, homepage: "https://skills.sh/skills/cloudflare-workers-guide", installed: false },
	{ id: "skills-sh:linear-workflow-automation", name: "linear-workflow-automation", kind: "skill", description: "Linear workflow automation with issue templates, cycles, project views, and webhook-driven integrations.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install linear-workflow-automation", logoUrl: null, brand: "linear", stars: null, version: null, homepage: "https://skills.sh/skills/linear-workflow-automation", installed: false },
	{ id: "skills-sh:figma-to-code", name: "figma-to-code", kind: "skill", description: "Figma design-to-code workflows with component mapping, token extraction, and Code Connect templates.", provider: "skills.sh", source: "skills-sh", installCommand: "npx skills install figma-to-code", logoUrl: null, brand: "figma", stars: null, version: null, homepage: "https://skills.sh/skills/figma-to-code", installed: false },
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
