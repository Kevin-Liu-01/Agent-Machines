import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CAPABILITY_GROUPS, CapabilityAtlas } from "@/components/CapabilityAtlas";
import { LANDING_INSET, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const render = () => renderToStaticMarkup(React.createElement(CapabilityAtlas));
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const figures = (html: string) => [...html.matchAll(/<figure\b[^>]*data-capability-diagram="([^"]+)"[^>]*>[\s\S]*?<\/figure>/g)];

describe("capability diagrams (actual rendered section)", () => {
	it("invariant_each_capability_group_has_its_own_labeled_example_figure", () => {
		const diagrams = figures(render());
		expect(diagrams.map((figure) => figure[1])).toEqual(CAPABILITY_GROUPS.map((group) => group.id));
		for (const [html] of diagrams) {
			expect(html).toMatch(/<figcaption\b/);
			expect(text(html)).toContain("Illustration · Not live data");
			expect(html).not.toMatch(/<text\b|<foreignObject\b|<button\b|<input\b|<a\b|aria-live=/);
		}
	});

	it("invariant_diagram_relationships_are_named_in_html_and_connectors_are_decorative", () => {
		const required: Record<string, string[]> = {
			compose: ["Agent", "Model connection", "Sandbox", "Research Worker", "Memory", "Tools", "Schedule"],
			operate: ["Run", "Pause", "Resume", "Operation journal", "Requested", "Progress", "Result", "provider supports"],
			work: ["Worker terminal", "codex", "report.md", "Saved session", "Artifact", "Same Worker"],
			extend: ["SKILL.md", "Memory", "Worker loadout", "GitHub", "Slack", "Playwright", "require configuration"],
			observe: ["Dashboard", "SDK", "CLI", "Worker", "Agent / provider", "State", "Research", "Build", "Review"],
			protect: ["Account boundary", "Saved credentials", "Settings", "Presence, not secret values", "Persistent files", "Process memory", "provider-dependent"],
		};
		const diagrams = figures(render());
		expect(diagrams).toHaveLength(6);
		for (const [html, id] of diagrams) {
			for (const label of required[id]) expect(text(html), `${id}: ${label}`).toContain(label);
			const connectors = html.match(/<svg\b[^>]*data-diagram-connector=""[^>]*>/g) ?? [];
			expect(connectors.length, `${id}: explicit connections`).toBeGreaterThan(0);
			for (const connector of connectors) {
				expect(connector).toContain('aria-hidden="true"');
				expect(connector).toContain('focusable="false"');
			}
		}
	});

	it("invariant_all_24_capability_destinations_and_limitations_remain_visible_and_actionable", () => {
		const html = render();
		const links = [...html.matchAll(/<a\b(?=[^>]*data-capability=)[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
		const capabilities = CAPABILITY_GROUPS.flatMap((group) => group.capabilities);
		expect(links).toHaveLength(24);
		capabilities.forEach((capability, index) => {
			expect(links[index]).toContain(`href="${capability.href}"`);
			expect(links[index]).toContain(`data-capability="${capability.dashboardId}"`);
			expect(text(links[index])).toContain(capability.title);
			expect(text(links[index])).toContain(capability.description);
			expect(text(links[index])).toContain(capability.meta);
			expect(links[index]).not.toMatch(/<button\b|<input\b|<summary\b|<select\b/);
		});
	});

	it("invariant_section_headers_and_diagram_columns_share_the_landing_rails", () => {
		const html = render();
		expect(text(html)).toContain("Build a Worker. Run a fleet.");
		expect(html).toContain(LANDING_TITLE);
		for (const group of CAPABILITY_GROUPS) {
			const section = html.match(new RegExp(`<section\\b[^>]*aria-labelledby="capability-${group.id}"[^>]*>[\\s\\S]*?</section>`))![0];
			expect(section).toContain(LANDING_INSET);
			expect(section.split(LANDING_SPLIT)).toHaveLength(3);
		}
	});
});
