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
					"Per-account persistent microVM",
					"Stateful filesystem at /home/machine",
					"Hermes and OpenClaw agent runtimes",
					"Dedalus Machines provider live today",
					"MachineProvider abstraction for Vercel Sandbox and Fly Machines",
					"OpenAI-compatible /v1/chat/completions endpoint",
					"96 SKILL.md skills auto-loaded by intent",
					"17 service routes across MCP, CLI, plugin skills, and personal skills",
					"23 built-in agent tools (shell, filesystem, browser, vision, code, memory, schedule, search)",
					"Optional Cursor SDK delegation for code edits",
					"Sleep / wake lifecycle with persistent disk",
					"Clerk-tied private metadata for fleet identity",
					"FTS5 search across all prior conversations",
					"Cron scheduling that wakes the VM on tick",
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
