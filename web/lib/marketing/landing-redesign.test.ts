import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Footer } from "@/components/Footer";
import { HeroBlock } from "@/components/HeroBlock";
import { PublicNavbar } from "@/components/PublicNavbar";
import { HarnessComponentsSection } from "@/components/marketing/HarnessComponents";
import { SetupJourney } from "@/components/marketing/SetupJourney";
import { cn } from "@/lib/cn";
import { listPresets } from "@/lib/dashboard/presets";
import { selectedPreset } from "@/lib/onboarding/preset-selection";
import { HARNESS_PRIMITIVES } from "./harness-primitives";
import * as starters from "./landing-starters";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...elements(value.props.children)];
}

describe("focused landing journey", () => {
	it("offers only actual preset configurations accepted by the destination route", () => {
		const presets = listPresets();
		expect(starters.LANDING_STARTERS).toHaveLength(3);
		for (const starter of starters.LANDING_STARTERS) {
			const target = new URL(starters.landingStarterHref(starter.id), "https://agent-machines.dev");
			expect(target.pathname).toBe("/dashboard/agents");
			expect([...target.searchParams.keys()]).toEqual(["preset"]);
			expect(selectedPreset(presets, target.searchParams.get("preset"))).toEqual(
				expect.objectContaining({ id: starter.id, agentKind: starter.runtime }),
			);
		}
		expect(starters.landingStarterHref("unknown" as starters.LandingStarterId)).toBe("/dashboard/agents");
	});

	it("restores the deployed hero and keeps its real starting destinations", () => {
		const html = renderToStaticMarkup(React.createElement(HeroBlock));
		expect(html.match(/<h1\b/g)).toHaveLength(1);
		expect(html).toContain('href="/agents"');
		expect(html).toContain('href="/sign-in"');
		expect(html).toContain("Choose a Worker");
		expect(html).toContain("Build your own");
		expect(html).not.toContain("data-starter-cta");
	});

	it("retains a three-step setup story and all six source-backed building block destinations", () => {
		const html = renderToStaticMarkup(React.createElement(SetupJourney));
		expect(html.match(/<ol\b/g)).toHaveLength(1);
		expect(html.match(/<li\b/g)).toHaveLength(3);
		expect([...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1])).toEqual(["/agents", "/components", "/dashboard"]);
		expect(html).toContain("real agent CLI");
		const blocks = renderToStaticMarkup(React.createElement(HarnessComponentsSection));
		for (const block of HARNESS_PRIMITIVES) expect(blocks).toContain(`href="/components#${block.id}"`);
		expect(blocks.match(/data-home-primitive=/g)).toHaveLength(6);
	});

	it("retains the deployed section order and its original artwork", () => {
		const page = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
		const components = ["HeroBlock", "WorkerSystemThesis", "FleetDemo", "ProductShowcase", "CapabilityAtlas", "StatsRow", "ContributionGrid", "FaqSection"];
		const positions = components.map(component => page.indexOf(`<${component}`));
		expect(positions.every(position => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(page).not.toMatch(/<SetupJourney|<HarnessComponentsSection/);
		for (const anchor of ["workflow", "capabilities", "sdk", "faq"]) expect(page).toContain(`id="${anchor}"`);
	});

	it("uses working local routes and safe external links in both responsive navigation and the footer", () => {
		const navbar = renderToStaticMarkup(React.createElement(PublicNavbar, { githubRepo: "Kevin-Liu-01/Agent-Machines" }));

		const footer = renderToStaticMarkup(React.createElement(Footer));
		for (const html of [navbar, footer]) {
			for (const [anchor, href] of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)) {
				if (href.startsWith("/")) {
					const pathname = new URL(href, "https://agent-machines.dev").pathname;
					const route = pathname.startsWith("/product/") ? "product/[slug]" : pathname.startsWith("/agents/") ? "agents/[slug]" : pathname === "/sign-in" ? "sign-in/[[...sign-in]]" : pathname.slice(1);
					expect(existsSync(resolve(process.cwd(), "app", route, "page.tsx")), href).toBe(true);
				} else {
					expect(href).toMatch(/^https:\/\//);
					if (anchor.includes('target="_blank"')) expect(anchor).toMatch(/rel="[^"]*noreferrer[^"]*"/);
				}
			}
			expect(html).not.toMatch(/free credits|href="#"/i);
		}
	});
});
