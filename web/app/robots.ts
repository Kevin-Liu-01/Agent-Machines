import type { MetadataRoute } from "next";

import { SITE } from "@/lib/seo/config";

/**
 * Allow every search and AI crawler. Blanket-blocking AI bots is
 * self-sabotage if the goal is to be cited by ChatGPT / Claude /
 * Perplexity / Copilot / Google AI Overview. The dashboard tree is
 * gated separately at the middleware layer (Clerk session check); we
 * don't repeat that here, we just disallow the crawl path so bots
 * spend their budget on the public marketing surfaces.
 */

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "Twitterbot",
				allow: ["/opengraph-image", "/api/og", "/api/og-home"],
			},
			// Generic catch-all (Bingbot etc. fall through here).
			{
				userAgent: "*",
				allow: ["/"],
				disallow: [
					"/dashboard/",
					"/onboarding",
					"/sign-in",
					"/api/",
				],
			},
			// Standard search bots
			{ userAgent: "Googlebot", allow: ["/"] },
			{ userAgent: "Bingbot", allow: ["/"] },
			{ userAgent: "DuckDuckBot", allow: ["/"] },
			// Google's AI training crawler (separate from Googlebot).
			// Allowing this is a yes-vote for AI Overview citations.
			{ userAgent: "Google-Extended", allow: ["/"] },
			// OpenAI / ChatGPT
			{ userAgent: "GPTBot", allow: ["/"] },
			{ userAgent: "ChatGPT-User", allow: ["/"] },
			{ userAgent: "OAI-SearchBot", allow: ["/"] },
			// Anthropic / Claude
			{ userAgent: "ClaudeBot", allow: ["/"] },
			{ userAgent: "Claude-Web", allow: ["/"] },
			{ userAgent: "anthropic-ai", allow: ["/"] },
			// Perplexity
			{ userAgent: "PerplexityBot", allow: ["/"] },
			{ userAgent: "Perplexity-User", allow: ["/"] },
			// Apple Intelligence / Apple Search
			{ userAgent: "Applebot", allow: ["/"] },
			{ userAgent: "Applebot-Extended", allow: ["/"] },
			// xAI / Grok
			{ userAgent: "xAI-Bot", allow: ["/"] },
			{ userAgent: "Grokbot", allow: ["/"] },
			// You.com, Brave (Claude pulls from Brave too)
			{ userAgent: "YouBot", allow: ["/"] },
			{ userAgent: "Bravebot", allow: ["/"] },
			// Common Crawl powers many model training corpora
			{ userAgent: "CCBot", allow: ["/"] },
		],
		sitemap: `${SITE.url}/sitemap.xml`,
		host: SITE.url,
	};
}
