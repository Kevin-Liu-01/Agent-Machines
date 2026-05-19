import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	serverExternalPackages: ["e2b", "@fly/sprites"],
	experimental: {
		optimizePackageImports: ["react-markdown", "rehype-highlight"],
	},
};

export default config;
