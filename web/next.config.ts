import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	serverExternalPackages: ["@vercel/sandbox", "e2b"],
	experimental: {
		optimizePackageImports: ["react-markdown", "rehype-highlight"],
	},
};

export default config;
