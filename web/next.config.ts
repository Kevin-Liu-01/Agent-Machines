import { resolve } from "node:path";
import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { RESPONSE_SECURITY_HEADERS } from "./lib/security/response-headers";

// Next only loads env files from the app directory. Agent Machines keeps its
// provider/runtime keys at the workspace root so the SDK and dashboard share
// one credential source; load those as a fallback without overriding web or
// process-level values supplied by Vercel.
loadEnv({
	path: [
		resolve(import.meta.dirname, "../.env.local"),
		resolve(import.meta.dirname, "../.env"),
	],
	override: false,
	quiet: true,
});

const config: NextConfig = {
	reactStrictMode: true,
	async headers() {
		return [{ source: "/:path*", headers: RESPONSE_SECURITY_HEADERS }];
	},
	allowedDevOrigins: ["127.0.0.1"],
	htmlLimitedBots:
		/Googlebot|Bingbot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Applebot|Applebot-Extended|YouBot|Bravebot|CCBot|Twitterbot|facebookexternalhit|Slackbot|LinkedInBot/i,
	serverExternalPackages: ["e2b", "@fly/sprites", "@vercel/sandbox", "ws"],
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
