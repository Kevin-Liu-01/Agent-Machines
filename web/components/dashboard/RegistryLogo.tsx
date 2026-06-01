"use client";

import { useState } from "react";

import { ServiceIcon, isServiceSlug, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory, TrustedAddOnKind } from "@/lib/dashboard/loadout";

/**
 * Logo resolver for registry items. Cascades through:
 *   1. Known brand → ServiceIcon (27+ SVGs already in /brand/services/)
 *   2. Explicit logoUrl → <img>
 *   3. Simple Icons CDN → 3000+ brand marks, free, no API key
 *   4. Dynamic favicon / GitHub owner avatar derived from the homepage
 *   5. ToolIcon by category → always resolves
 *
 * Image candidates (2-4) are tried in order, advancing on each error, so a
 * failed favicon still falls through to the category icon.
 */

const KIND_TO_CATEGORY: Record<TrustedAddOnKind, ToolCategory> = {
	skill: "memory",
	mcp: "delegate",
	cli: "shell",
	tool: "code",
	plugin: "code",
	provider: "filesystem",
	source: "search",
};

type Props = {
	brand: ServiceSlug | string | null;
	logoUrl: string | null;
	kind: TrustedAddOnKind;
	name: string;
	/** Source/docs URL used to derive a favicon or GitHub owner avatar. */
	homepage?: string | null;
	size?: number;
	className?: string;
};

/** Derive a logo from a homepage: GitHub owner avatar (distinct per org)
 *  or the host's favicon via Google's favicon service. */
function faviconFromHomepage(homepage: string | null | undefined): string | null {
	if (!homepage) return null;
	try {
		const u = new URL(homepage);
		if (u.hostname === "github.com") {
			const owner = u.pathname.split("/").filter(Boolean)[0];
			if (owner) return `https://github.com/${owner}.png?size=64`;
		}
		return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
	} catch {
		return null;
	}
}

export function RegistryLogo({
	brand,
	logoUrl,
	kind,
	name,
	homepage,
	size = 18,
	className,
}: Props) {
	const [failed, setFailed] = useState(0);
	const dim = `${size}px`;

	if (brand && isServiceSlug(brand)) {
		return (
			<ServiceIcon slug={brand} size={size} tone="color" className={className} />
		);
	}

	const candidates: string[] = [];
	if (logoUrl) candidates.push(logoUrl);
	const simpleIconSlug = guessSimpleIconSlug(name);
	if (simpleIconSlug) candidates.push(`https://cdn.simpleicons.org/${simpleIconSlug}`);
	const favicon = faviconFromHomepage(homepage);
	if (favicon) candidates.push(favicon);

	const src = candidates[failed];
	if (src) {
		return (
			<span
				className={className}
				style={{ width: dim, height: dim, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={src}
					alt=""
					width={size}
					height={size}
					className="object-contain"
					onError={() => setFailed((f) => f + 1)}
				/>
			</span>
		);
	}

	return (
		<ToolIcon
			name={KIND_TO_CATEGORY[kind] ?? "code"}
			size={size}
			className={className ?? "text-[var(--ret-text-muted)]"}
		/>
	);
}

const SIMPLE_ICON_MAP: Record<string, string> = {
	react: "react",
	nextjs: "nextdotjs",
	"next.js": "nextdotjs",
	vue: "vuedotjs",
	angular: "angular",
	svelte: "svelte",
	astro: "astro",
	tailwind: "tailwindcss",
	prisma: "prisma",
	drizzle: "drizzle",
	redis: "redis",
	mongodb: "mongodb",
	docker: "docker",
	kubernetes: "kubernetes",
	python: "python",
	rust: "rust",
	go: "go",
	deno: "deno",
	bun: "bun",
	eslint: "eslint",
	prettier: "prettier",
	vitest: "vitest",
	jest: "jest",
	turbo: "turborepo",
	turborepo: "turborepo",
	biome: "biome",
};

function guessSimpleIconSlug(name: string): string | null {
	const lower = name.toLowerCase();
	for (const [key, slug] of Object.entries(SIMPLE_ICON_MAP)) {
		if (lower.includes(key)) return slug;
	}
	return null;
}
