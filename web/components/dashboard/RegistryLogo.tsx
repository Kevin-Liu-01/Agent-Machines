"use client";

import { useState } from "react";

import { ServiceIcon, isServiceSlug, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory, TrustedAddOnKind } from "@/lib/dashboard/loadout";

/**
 * Logo resolver for registry items. Cascades through:
 *   1. Known brand → ServiceIcon (27+ SVGs already in /brand/services/)
 *   2. Explicit logoUrl → <img> with error fallback
 *   3. Simple Icons CDN → 3000+ brand marks, free, no API key
 *   4. ToolIcon by category → always resolves
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
	size?: number;
	className?: string;
};

export function RegistryLogo({
	brand,
	logoUrl,
	kind,
	name,
	size = 18,
	className,
}: Props) {
	const [imgError, setImgError] = useState(false);
	const dim = `${size}px`;

	if (brand && isServiceSlug(brand)) {
		return (
			<ServiceIcon slug={brand} size={size} tone="color" className={className} />
		);
	}

	if (logoUrl && !imgError) {
		return (
			<span
				className={className}
				style={{ width: dim, height: dim, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={logoUrl}
					alt=""
					width={size}
					height={size}
					className="object-contain"
					onError={() => setImgError(true)}
				/>
			</span>
		);
	}

	const simpleIconSlug = guessSimpleIconSlug(name);
	if (simpleIconSlug && !imgError) {
		const cdnUrl = `https://cdn.simpleicons.org/${simpleIconSlug}`;
		return (
			<span
				className={className}
				style={{ width: dim, height: dim, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={cdnUrl}
					alt=""
					width={size}
					height={size}
					className="object-contain"
					onError={() => setImgError(true)}
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
