import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	htmlLimitedBots:
		/Googlebot|Bingbot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Applebot|Applebot-Extended|YouBot|Bravebot|CCBot|Twitterbot|facebookexternalhit|Slackbot|LinkedInBot/i,
	serverExternalPackages: ["e2b", "@fly/sprites", "@vercel/sandbox"],
	turbopack: {
		// web/ has its own lockfile; keep Turbopack rooted here, not the monorepo parent.
		root: import.meta.dirname,
	},
	experimental: {
		optimizePackageImports: ["react-markdown", "rehype-highlight"],
	},
};

export default config;
