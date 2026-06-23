import type { MetadataRoute } from "next";

import {
	AGENT_TEMPLATES,
	PRODUCT_FEATURES,
	RESOURCE_PAGES,
} from "@/lib/marketing/public-site";
import { SITE } from "@/lib/seo/config";

/**
 * Sitemap for crawlers + AI engines. Public marketing surfaces only --
 * the dashboard tree is gated by Clerk and shouldn't appear in any
 * index. Each entry uses an explicit `lastModified` so search engines
 * have a freshness signal beyond the build timestamp.
 *
 * The landing page anchors (#capabilities / #runtime / #loadout / ...)
 * aren't separate URLs but we surface them as alternates of `/` via
 * the WebSite + BreadcrumbList JSON-LD instead.
 */

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();
	const publicRoutes = [
		{ path: "/product", priority: 0.8, changeFrequency: "monthly" as const },
		...PRODUCT_FEATURES.map((feature) => ({
			path: feature.href,
			priority: 0.75,
			changeFrequency: "monthly" as const,
		})),
		{ path: "/agents", priority: 0.85, changeFrequency: "weekly" as const },
		...AGENT_TEMPLATES.map((agent) => ({
			path: agent.href,
			priority: agent.slug === "deep-research" ? 0.85 : 0.72,
			changeFrequency: "weekly" as const,
		})),
		{ path: "/pricing", priority: 0.85, changeFrequency: "monthly" as const },
		{ path: "/registry", priority: 0.75, changeFrequency: "weekly" as const },
		...RESOURCE_PAGES.map((page) => ({
			path: page.href,
			priority: page.slug === "docs" ? 0.78 : 0.66,
			changeFrequency: "monthly" as const,
		})),
	];
	return [
		{
			url: SITE.url,
			lastModified: now,
			changeFrequency: "daily",
			priority: 1.0,
		},
		...publicRoutes.map((route) => ({
			url: `${SITE.url}${route.path}`,
			lastModified: now,
			changeFrequency: route.changeFrequency,
			priority: route.priority,
		})),
		{
			url: `${SITE.url}/sign-in`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.4,
		},
		{
			url: `${SITE.url}/onboarding`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${SITE.url}/faq`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.7,
		},
		{
			url: `${SITE.url}/terms`,
			lastModified: now,
			changeFrequency: "yearly",
			priority: 0.3,
		},
		{
			url: `${SITE.url}/privacy`,
			lastModified: now,
			changeFrequency: "yearly",
			priority: 0.3,
		},
	];
}
