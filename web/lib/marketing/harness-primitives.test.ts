import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HarnessComponentGrid, HarnessComponentsSection } from "@/components/marketing/HarnessComponents";
import { HARNESS_PRIMITIVES, harnessSourceHref } from "./harness-primitives";
import { FAQ, SITE } from "@/lib/seo/config";
import { PRODUCT } from "@/lib/platform/harness";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("source-backed harness building blocks", () => {
	it("links every primitive to actual implementation source and an existing dashboard page", () => {
		expect(HARNESS_PRIMITIVES).toHaveLength(6);
		expect(new Set(HARNESS_PRIMITIVES.map((block) => block.id)).size).toBe(6);
		for (const block of HARNESS_PRIMITIVES) {
			expect(existsSync(resolve(process.cwd(), "..", block.sourcePath)), block.sourcePath).toBe(true);
			expect(existsSync(resolve(process.cwd(), "app", block.dashboardHref.slice(1), "page.tsx")), block.dashboardHref).toBe(true);
			expect(block.boundary.length).toBeGreaterThan(50);
			expect(block.options.length).toBeGreaterThan(0);
		}
	});
	it("renders each named configure action and exact source link without fake install buttons", () => {
		const html = renderToStaticMarkup(React.createElement(HarnessComponentGrid));
		expect(html.match(/<article\b/g)).toHaveLength(6);
		for (const block of HARNESS_PRIMITIVES) {
			expect(html).toContain(`href="${block.dashboardHref}"`);
			expect(html).toContain(`href="${harnessSourceHref(block.sourcePath)}"`);
			expect(html).toContain(`aria-label="Inspect ${block.title.toLowerCase().replaceAll("&", "&amp;")} source"`);
		}
		expect(html).not.toContain("<button");
		expect(html).toContain("Creating a machine uses your connected provider and model accounts");
		expect(html).toContain("motion-reduce:transition-none");
	});
	it("keeps the same actual components in public and authenticated surfaces", () => {
		const publicHtml = renderToStaticMarkup(React.createElement(HarnessComponentGrid));
		const dashboardHtml = renderToStaticMarkup(React.createElement(HarnessComponentGrid, { dashboard: true }));
		expect(publicHtml.match(/<article[\s\S]*?<\/article>/g)).toEqual(dashboardHtml.match(/<article[\s\S]*?<\/article>/g));
		for (const file of ["app/components/page.tsx", "app/dashboard/components/page.tsx"]) {
			expect(readFileSync(resolve(process.cwd(), file), "utf8")).toContain("HarnessComponentGrid");
		}
	});
	it("uses canonical file and directory GitHub link forms", () => {
		expect(harnessSourceHref("src/mux/providers")).toContain("/tree/main/src/mux/providers");
		expect(harnessSourceHref("src/mux/types.ts")).toContain("/blob/main/src/mux/types.ts");
	});
	it("makes the component guide discoverable and labels the real adoption boundary", () => {
		const html = renderToStaticMarkup(React.createElement(HarnessComponentsSection));
		expect(html).toContain('aria-labelledby="building-blocks-title"');
		expect(html).toContain('href="/components"');
		for (const file of ["components/dashboard/CommandPalette.tsx", "app/sitemap.ts"]) {
			expect(readFileSync(resolve(process.cwd(), file), "utf8")).toContain(file.includes("CommandPalette") ? '"/dashboard/components"' : '"/components"');
		}
		const guide = readFileSync(resolve(process.cwd(), "app/components/page.tsx"), "utf8");
		expect(guide).toContain("does not launch compute or authenticate tools");
		expect(guide).toContain("not available yet");
	});
	it("uses modular source-first metadata and explicitly limits sharing and model compatibility", () => {
		expect(PRODUCT.tagline).toBe("Open-source building blocks for agent harnesses.");
		expect(SITE.description).toContain("inspect and extend the source");
		expect(SITE.keywords).not.toContain("agent template marketplace");
		expect(SITE.keywords).not.toContain("digital labor operating system");
		const inference = FAQ.find((entry) => entry.question.includes("inference"))!.answer;
		expect(inference).toContain("hosted dashboard");
		expect(inference).toContain("direct mux SDK");
		const sharing = FAQ.find((entry) => entry.question.includes("share or customize"))!.answer;
		expect(sharing).toContain("not available yet");
		expect(sharing).toContain("Markdown");
	});
});
