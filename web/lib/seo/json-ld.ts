import { HARNESS } from "@/lib/platform/harness";

import { FAQ, SITE } from "./config";

/**
 * Builds the canonical schema.org `@graph` for the site root. One
 * `@graph` block keeps every entity in the same JSON-LD island so AI
 * crawlers can resolve cross-references via `@id` instead of guessing.
 *
 * Entities included:
 *   - Organization (Agent Machines + sameAs to GitHub)
 *   - Person (Kevin Liu, the author)
 *   - WebSite (with sitelinks-search action)
 *   - SoftwareApplication (the product)
 *   - FAQPage (mirrors the visible FAQ section on the landing -- one
 *     of the highest-yield GEO signals per Princeton GEO methods)
 *   - BreadcrumbList (single-entry root)
 */

type JsonLdValue =
	| string
	| number
	| boolean
	| null
	| ReadonlyArray<JsonLdValue>
	| { [key: string]: JsonLdValue };

export type JsonLdGraph = {
	"@context": "https://schema.org";
	"@graph": ReadonlyArray<{ [key: string]: JsonLdValue }>;
};

const ID = {
	site: `${SITE.url}/#site`,
	org: `${SITE.url}/#organization`,
	person: `${SITE.url}/#author`,
	app: `${SITE.url}/#product`,
	faq: `${SITE.url}/#faq`,
	breadcrumb: `${SITE.url}/#breadcrumb`,
};

export function buildRootJsonLd(): JsonLdGraph {
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "Organization",
				"@id": ID.org,
				name: SITE.name,
				url: SITE.url,
				logo: `${SITE.url}/icon.png`,
				description: SITE.description,
				sameAs: [SITE.githubUrl, SITE.authorUrl],
				founder: { "@id": ID.person },
				knowsAbout: SITE.keywords as unknown as ReadonlyArray<JsonLdValue>,
			},
			{
				"@type": "Person",
				"@id": ID.person,
				name: SITE.authorName,
				url: SITE.authorUrl,
				sameAs: [SITE.authorUrl, "https://twitter.com/kevin_liu_01"],
			},
			{
				"@type": "WebSite",
				"@id": ID.site,
				url: SITE.url,
				name: SITE.name,
				description: SITE.description,
				inLanguage: "en-US",
				publisher: { "@id": ID.org },
				potentialAction: {
					"@type": "SearchAction",
					target: {
						"@type": "EntryPoint",
						urlTemplate: `${SITE.url}/dashboard/loadout?filter={search_term_string}`,
					},
					"query-input": "required name=search_term_string",
				},
			},
			{
				"@type": "SoftwareApplication",
				"@id": ID.app,
				name: SITE.name,
				applicationCategory: "DeveloperApplication",
				applicationSubCategory: "AI agent infrastructure",
				operatingSystem: "Web",
				description: SITE.longDescription,
				url: SITE.url,
				image: `${SITE.url}${SITE.ogImage}`,
				keywords: SITE.keywords as unknown as ReadonlyArray<JsonLdValue>,
				featureList: [
					"Harness-agnostic agent runtime switchboard",
					"Sandbox-agnostic machine provider switchboard",
					"Model path routing through Dedalus, OpenRouter, Vercel AI Gateway, native keys, or OpenAI-compatible endpoints",
					"TypeScript SDK with am.create(...) and agent.run(...)",
					"REST API surface for provisioning, bootstrap, lifecycle, logs, usage, artifacts, and agent runs",
					"Persistent agent-on-a-machine worker primitive",
					"Stateful filesystem at /home/machine/.agent-machines",
					"Hermes, OpenClaw, Claude Code, and Codex agent runtimes",
					"Dedalus Machines, E2B Sandbox, Sprites.dev, and Vercel Sandbox providers",
					"Registry-driven loadout: skills, service lanes, MCP servers, CLIs, plugins, task lanes",
					"OpenAI-compatible /v1/chat/completions endpoint",
					`${HARNESS.skillCount} SKILL.md skills in the protocol library`,
					`${HARNESS.serviceRouteCount} ranked service lanes (MCP → CLI → skills)`,
					`${HARNESS.mcpServerCount} MCP catalog servers (${HARNESS.mcpTiers.core} core + ${HARNESS.mcpTiers.bundled} bundled)`,
					`${HARNESS.cliCount}+ closed-loop CLIs for verification`,
					`${HARNESS.nativeToolMin}–${HARNESS.nativeToolMax} agent-native tools depending on runtime`,
					"Worker presets and portable Memory bundles",
					"Browser terminal, command surface, and tmux-backed PTY streaming",
					"Logs, usage, cron, sessions, artifacts, and fleet observability",
					"Optional Cursor SDK delegation via cursor-bridge",
					"Visual observation: sessions, tool calls, logs, cost attribution",
					"Sleep / wake lifecycle with persistent disk",
					"Programmatic MCP/CLI orchestration surface (roadmap)",
				],
				about: [
					{ "@type": "Thing", name: "persistent AI agents" },
					{ "@type": "Thing", name: "agent runtime routing" },
					{ "@type": "Thing", name: "sandbox provider routing" },
					{ "@type": "Thing", name: "model gateway routing" },
					{ "@type": "Thing", name: "MCP tools and skills" },
				],
				audience: [
					{ "@type": "Audience", audienceType: "AI engineers" },
					{ "@type": "Audience", audienceType: "developer tooling teams" },
					{ "@type": "Audience", audienceType: "agent platform builders" },
				],
				offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
				author: { "@id": ID.person },
				publisher: { "@id": ID.org },
				codeRepository: SITE.githubUrl,
				license: "https://opensource.org/licenses/MIT",
				softwareHelp: `${SITE.url}/docs`,
				mainEntityOfPage: { "@id": ID.site },
			},
			{
				"@type": "FAQPage",
				"@id": ID.faq,
				mainEntity: FAQ.map((item) => ({
					"@type": "Question",
					name: item.question,
					acceptedAnswer: {
						"@type": "Answer",
						text: item.answer,
					},
				})),
				about: { "@id": ID.app },
				isPartOf: { "@id": ID.site },
			},
			{
				"@type": "BreadcrumbList",
				"@id": ID.breadcrumb,
				itemListElement: [
					{
						"@type": "ListItem",
						position: 1,
						name: "Home",
						item: SITE.url,
					},
				],
			},
		],
	};
}
