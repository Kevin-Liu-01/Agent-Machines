import type { ServiceSlug } from "@/components/ServiceIcon";

export type ServicePattern = {
	slug: ServiceSlug | string;
	label: string;
	patterns: RegExp[];
};

export const SERVICE_PATTERNS: ServicePattern[] = [
	{ slug: "cloudflare", label: "Cloudflare", patterns: [/cloudflare/i, /cloudflared/i, /tunnel/i] },
	{ slug: "openai", label: "OpenAI", patterns: [/openai/i, /\bgpt-/i, /codex/i] },
	{ slug: "anthropic", label: "Anthropic", patterns: [/anthropic/i, /claude/i] },
	{ slug: "github", label: "GitHub", patterns: [/github/i, /\bgh /i, /issue #/i, /pr #/i] },
	{ slug: "clerk", label: "Clerk", patterns: [/clerk/i] },
	{ slug: "vercel", label: "Vercel", patterns: [/vercel/i] },
	{ slug: "figma", label: "Figma", patterns: [/figma/i] },
	{ slug: "linear", label: "Linear", patterns: [/linear/i] },
	{ slug: "shopify", label: "Shopify", patterns: [/shopify/i] },
	{ slug: "posthog", label: "PostHog", patterns: [/posthog/i] },
	{ slug: "sentry", label: "Sentry", patterns: [/sentry/i] },
	{ slug: "stripe", label: "Stripe", patterns: [/stripe/i] },
	{ slug: "firebase", label: "Firebase", patterns: [/firebase/i] },
	{ slug: "slack", label: "Slack", patterns: [/slack/i] },
	{ slug: "supabase", label: "Supabase", patterns: [/supabase/i] },
	{ slug: "playwright", label: "Playwright", patterns: [/playwright/i] },
	{ slug: "clickhouse", label: "ClickHouse", patterns: [/clickhouse/i] },
	{ slug: "threedotjs", label: "Three.js", patterns: [/three\.?js/i, /threejs/i] },
	{ slug: "playcanvas", label: "PlayCanvas", patterns: [/playcanvas/i] },
	{ slug: "gsap", label: "GSAP", patterns: [/gsap/i] },
	{ slug: "framer", label: "Framer", patterns: [/framer/i] },
	{ slug: "typescript", label: "TypeScript", patterns: [/typescript/i, /\.tsx?\b/i] },
	{ slug: "tailwindcss", label: "Tailwind", patterns: [/tailwind/i] },
];

export function detectServices(text: string): string[] {
	const hits: string[] = [];
	for (const entry of SERVICE_PATTERNS) {
		if (entry.patterns.some((p) => p.test(text))) hits.push(entry.slug);
	}
	if (/cursor_agent/i.test(text)) hits.push("cursor");
	return hits;
}
