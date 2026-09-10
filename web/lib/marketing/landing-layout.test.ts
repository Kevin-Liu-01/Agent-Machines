import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FaqSection } from "@/components/FaqSection";
import { ProductShowcase } from "@/components/ProductShowcase";
import { WorkerSystemThesis } from "@/components/WorkerSystemThesis";
import { FAQ } from "@/lib/seo/config";
import { LANDING_INSET, LANDING_SPLIT, LANDING_TITLE } from "./layout";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("landing-page alignment", () => {
	it("shares one responsive heading scale across architecture, product views, and FAQ", () => {
		for (const Component of [WorkerSystemThesis, ProductShowcase, FaqSection]) {
			const html = renderToStaticMarkup(React.createElement(Component));
			const heading = html.match(/<h2\b[^>]*class="([^"]+)"/)?.[1];
			expect(heading).toBeDefined();
			for (const token of LANDING_TITLE.split(" ")) expect(heading?.split(" ")).toContain(token);
			const header = html.match(/<header\b[^>]*data-landing-header[^>]*class="([^"]+)"/)?.[1];
			for (const token of LANDING_SPLIT.split(" ")) expect(header?.split(" ")).toContain(token);
		}
	});

	it("keeps section content on the same mobile, tablet, and desktop insets", () => {
		for (const Component of [WorkerSystemThesis, ProductShowcase, FaqSection]) {
			const html = renderToStaticMarkup(React.createElement(Component));
			const wrapper = html.match(/<(?:section|header)\b[^>]*class="([^"]*px-5[^"]*)"/)?.[1];
			for (const token of LANDING_INSET.split(" ")) expect(wrapper?.split(" ")).toContain(token);
		}
	});

	it("preserves every FAQ question and answer as visible semantic content", () => {
		const html = renderToStaticMarkup(React.createElement(FaqSection));
		expect(html.match(/<dt>/g)).toHaveLength(FAQ.length);
		expect(html.match(/<dd\b/g)).toHaveLength(FAQ.length);
		for (const { question, answer } of FAQ) {
			for (const text of [question, answer]) {
				const escaped = renderToStaticMarkup(React.createElement("span", {}, text)).replace(/^<span>|<\/span>$/g, "");
				expect(html).toContain(escaped);
			}
		}
		for (const [definition] of html.matchAll(/<dd\b[^>]*>/g)) {
			expect(definition).not.toMatch(/aria-hidden|\bhidden(?:\s|[="'])/);
		}
	});
});
