import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ProductShowcase } from "@/components/ProductShowcase";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const SCREENSHOTS = [
	"dashboard-conversation-claude.png",
	"dashboard-worker-configure.png",
	"dashboard-conversation-openclaw.png",
	"dashboard-live-fleet.png",
	"dashboard-provider-routing.png",
	"console-hermes.png",
	"console-codex.png",
];

const render = () => renderToStaticMarkup(React.createElement(ProductShowcase));

describe("product screenshot walkthrough", () => {
	it("preserves all seven existing screenshots as real full-resolution links", () => {
		const html = render();
		const links = [...html.matchAll(/<a\s[^>]*href="(\/screenshots\/[^\"]+)"[^>]*>/g)];
		expect(links.map((link) => link[1]).sort()).toEqual(SCREENSHOTS.map((name) => `/screenshots/${name}`).sort());
		for (const link of links) {
			expect(link[0]).toContain('target="_blank"');
			expect(link[0]).toContain('rel="noopener noreferrer"');
			expect(link[0]).toContain("view full-size screenshot (opens in a new tab)");
			expect(existsSync(fileURLToPath(new URL(`../../public${link[1]}`, import.meta.url)))).toBe(true);
		}
	});

	it("aligns the paired screenshots and gives the fleet a full-width uncropped frame", () => {
		const html = render();
		expect(html.match(/aspect-\[3\/2\]/g)).toHaveLength(6);
		expect(html.match(/aspect-\[16\/9\]/g)).toHaveLength(1);
		const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([image]) => image).filter((image) => image.includes("screenshots"));
		expect(images).toHaveLength(7);
		for (const image of images) expect(image).toContain('class="object-contain"');
		expect(html).not.toMatch(/object-cover|group-hover:scale|duration-500|text-\[(?:9|10)px\]/);
		const captions = [...html.matchAll(/<figcaption[^>]*>(.*?)<\/figcaption>/gs)];
		expect(captions).toHaveLength(7);
		for (const [, caption] of captions) {
			expect(caption).toMatch(/<p class="[^"]*text-base[^"]*leading-7/);
			expect(caption).toContain("View full size");
		}
		const fleet = html.slice(html.indexOf('aria-labelledby="showcase-fleet"'), html.indexOf("<footer"));
		expect(fleet).toContain('sizes="100vw"');
		expect(fleet).not.toMatch(/lg:grid-cols|<aside/);
	});

	it("organizes the examples into named setup, agent, and fleet sections", () => {
		const html = render();
		expect(html).toContain('aria-labelledby="product-showcase-heading"');
		for (const id of ["showcase-setup", "showcase-agents", "showcase-fleet"]) {
			expect(html).toContain(`aria-labelledby="${id}"`);
			expect(html).toContain(`id="${id}"`);
			expect(html).toContain(`href="#${id}"`);
		}
		expect(html).toContain('aria-label="Product walkthrough"');
		expect(html).not.toContain("foreignObject");
	});

	it("lets evidence lead with short captions instead of repeated explanatory paragraphs", () => {
		const html = render();
		const paragraphs = [...html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gs)].map(([, content]) => content.replace(/<[^>]+>/g, "").trim());
		// Eyebrow + short setup context, one recorded-view note, seven captions,
		// and one migration boundary. Evidence still leads the section.
		expect(paragraphs).toHaveLength(11);
		for (const paragraph of paragraphs) expect(paragraph.split(/\s+/).length).toBeLessThanOrEqual(20);
		expect(html).not.toMatch(/Know where it runs|Inspect what it did|Manage the next step|Keep the Worker\. Choose the machinery\./);
	});

	it("distinguishes recorded views and retired providers from current support", () => {
		const html = render();
		expect(html).toContain("Recorded product views, not live status.");
		expect(html).toContain("This older capture includes retired Dedalus");
		const footer = html.slice(html.indexOf("<footer"));
		for (const label of ["Claude Code", "Codex", "OpenClaw", "Hermes"]) expect(html).toContain(label);
		for (const label of ["E2B", "Sprites", "Daytona", "Vercel"]) {
			expect(footer).toContain(label);
		}
		expect(footer).not.toContain("Dedalus");
		expect(footer).toContain("Migration moves saved state—not running processes or RAM.");
	});

	it("limits pointer feedback to a short border transition with immediate keyboard focus", () => {
		const html = render();
		const links = [...html.matchAll(/<a\s[^>]*href="\/screenshots\/[^\"]+"[^>]*>/g)];
		for (const [link] of links) {
			expect(link).toContain("motion-safe:transition-[border-color]");
			expect(link).toContain("motion-safe:duration-150");
			expect(link).toContain("focus-visible:transition-none");
			expect(link).toContain("focus-visible:outline-2");
		}
		expect(html).not.toMatch(/transition-all|animate-|scale-\[/);
	});
});
