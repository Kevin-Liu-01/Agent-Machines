import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	htmlLimitedBots:
		/Googlebot|Bingbot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Applebot|Applebot-Extended|YouBot|Bravebot|CCBot|Twitterbot|facebookexternalhit|Slackbot|LinkedInBot/i,
	serverExternalPackages: ["e2b", "@fly/sprites", "@vercel/sandbox"],
	turbopack: {
		// The repo is one pnpm workspace (see ../pnpm-workspace.yaml), so web's
		// dependency store lives in the root's .pnpm and `next` itself resolves
		// from above this directory. Rooting Turbopack here would put its own
		// dependencies outside the project and fail with "We couldn't find the
		// Next.js package" -- measured. The root is the workspace root.
		root: resolve(import.meta.dirname, ".."),
	},
	experimental: {
		optimizePackageImports: ["react-markdown", "rehype-highlight"],
	},
};

export default config;
