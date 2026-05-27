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
				operatingSystem: "Web",
				description: SITE.description,
				url: SITE.url,
				featureList: [
					"Persistent agent-on-a-machine combined primitive",
					"Stateful filesystem at /home/machine/.agent-machines",
					"Hermes, OpenClaw, Claude Code, and Codex agent runtimes",
					"Dedalus Machines, E2B Sandbox, Sprites.dev, and Vercel Sandbox providers",
					"Registry-driven harness: skills, service routes, MCP, CLIs, task routes",
					"OpenAI-compatible /v1/chat/completions endpoint",
					`${HARNESS.skillCount} SKILL.md skills in the protocol library`,
					`${HARNESS.serviceRouteCount} ranked service routes (MCP → CLI → skills)`,
					`${HARNESS.mcpServerCount} MCP catalog servers (${HARNESS.mcpTiers.core} core + ${HARNESS.mcpTiers.bundled} bundled)`,
					`${HARNESS.cliCount}+ closed-loop CLIs for verification`,
					`${HARNESS.nativeToolMin}–${HARNESS.nativeToolMax} agent-native tools depending on runtime`,
					"Optional Cursor SDK delegation via cursor-bridge",
					"Visual observation: sessions, tool calls, logs, cost attribution",
					"Sleep / wake lifecycle with persistent disk",
					"Programmatic MCP/CLI orchestration surface (roadmap)",
				],
				offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
				author: { "@id": ID.person },
				publisher: { "@id": ID.org },
				codeRepository: SITE.githubUrl,
				license: "https://opensource.org/licenses/MIT",
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
