import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ContributionGrid } from "@/components/ContributionGrid";
import { FleetDemo } from "@/components/FleetDemo";
import { FleetStreamCard } from "@/components/fleet/FleetStreamCard";
import * as heatmap from "@/components/heatmap/HeatmapGridCell";
import * as services from "@/components/ServiceIcon";
import { AGENTS } from "@/lib/agents";
import { cn } from "@/lib/cn";
import * as data from "@/lib/contribution-data";
import * as layout from "@/lib/marketing/layout";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}

/** Real component callbacks, with deterministic sample dates and inert rendering. */
function activityHarness() {
	let cursor = 0;
	const state: unknown[] = [];
	const generated = vi.fn((count: number) => data.generateContributionGrid(count, new Date("2026-09-09T00:00:00Z")));
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as Record<string, (props?: Record<string, unknown>) => Element> };
	const source = readFileSync(new URL("../../components/ContributionGrid.tsx", import.meta.url), "utf8");
	runInNewContext(ts.transpileModule(`${source}\nexport { CellSwatch, PartnerSwatch, BrandChip, DayDetail };`, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports,
		require: (name: string) => name === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: name === "react" ? {
				useMemo: (callback: () => unknown) => callback(),
				useState: (initial: unknown) => {
					const index = cursor++;
					if (!(index in state)) state[index] = initial;
					return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
				},
			} : name === "@/lib/contribution-data" ? { ...data, generateContributionGrid: generated }
				: name === "@/lib/cn" ? { cn }
					: name === "@/lib/marketing/layout" ? layout
						: name === "@/components/heatmap/HeatmapGridCell" ? heatmap
							: name === "@/components/ServiceIcon" ? services
								: new Proxy({}, { get: () => () => null }),
	});
	return { components: module.exports, generated, render: () => { cursor = 0; return module.exports.ContributionGrid(); } };
}

describe("aligned landing examples", () => {
	it.each([
		[FleetDemo, "A workspace for each specialist.", "Sample fleet"],
		[ContributionGrid, "A history you can inspect.", "Sample history"],
	] as const)("uses the shared section rails and heading scale in %s", (Component, title, eyebrow) => {
		const html = renderToStaticMarkup(React.createElement(Component));
		expect(html).toContain(layout.LANDING_INSET);
		expect(html).toContain(layout.LANDING_SECTION_SPACE);
		expect(html).toContain(layout.LANDING_TITLE);
		expect(html).toContain("items-end");
		expect(html).toContain(title);
		expect(html).toContain(eyebrow);
	});

	it("retains all four documented runtime cards, sample output, links, and non-live mode", () => {
		const cards = nodes(FleetDemo()).filter((node) => node.type === FleetStreamCard);
		expect(cards).toHaveLength(4);
		expect(cards.map((node) => node.props.card.id)).toEqual(AGENTS.map((agent) => agent.id));
		for (const [index, node] of cards.entries()) {
			expect(node.props.live).toBe(false);
			expect(node.props.external).toBe(true);
			expect(node.props.delaySec).toBe(index * 0.8);
			expect(node.props.card.href).toBe(AGENTS[index].docsUrl);
			expect(node.props.card.lines).toHaveLength(7);
		}
		const html = renderToStaticMarkup(React.createElement(FleetDemo));
		expect(html).toContain("not live Workers or provider benchmarks");
		expect(html).toContain("grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4");
		expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(4);
		expect(html).toContain("focus-visible:outline-offset-4");
	});

	it("keeps the complete 182-day, seven-row topology and a keyboard-scrollable calendar", () => {
		const harness = activityHarness(), tree = harness.render();
		expect(harness.generated).toHaveBeenCalledWith(182);
		const weeks = harness.generated.mock.results[0].value as data.ContributionDay[][];
		const slots = nodes(tree).filter((node) => node.type === heatmap.HeatmapGridSlot);
		expect(slots).toHaveLength(weeks.length * 7);
		expect(slots.map((node) => [node.props.weekIdx, node.props.dayIdx])).toEqual(weeks.flatMap((_, index) => Array.from({ length: 7 }, (_, day) => [index, day])));
		const cells = nodes(tree).filter((node) => node.type === harness.components.CellSwatch);
		expect(cells.map((node) => node.props.day)).toEqual(weeks.flat());
		const region = nodes(tree).find((node) => node.props["aria-label"] === "Sample activity calendar")!;
		expect(region.props.tabIndex).toBe(0);
		expect(region.props.className).toContain("overflow-x-auto");
		expect(region.props.className).toContain("focus-visible:outline-2");
	});

	it("preserves partner/service toggle filters, combined dimming, and clearing", () => {
		const harness = activityHarness();
		let tree = harness.render();
		const byType = (type: unknown) => nodes(tree).filter((node) => node.type === type);
		const partner = () => byType(harness.components.PartnerSwatch).find((node) => node.props.partner === "daytona")!;
		expect(byType(harness.components.PartnerSwatch)).toHaveLength(6);
		const brands = byType(harness.components.BrandChip);
		expect(brands.length).toBeGreaterThan(0);
		const slug = brands[0].props.slug;
		partner().props.onClick(); tree = harness.render();
		expect(partner().props.active).toBe(true);
		byType(harness.components.BrandChip).find((node) => node.props.slug === slug)!.props.onClick(); tree = harness.render();
		for (const slot of byType(heatmap.HeatmapGridSlot)) {
			const cell = nodes(slot).find((node) => node.type === harness.components.CellSwatch);
			if (!cell) continue;
			const day = cell.props.day as data.ContributionDay;
			expect(slot.props.className.includes("opacity-20")).toBe(day.partner !== "daytona" || !day.events.some((event) => event.brand === slug));
		}
		byType(harness.components.BrandChip).find((node) => node.props.slug === slug)!.props.onClick(); tree = harness.render();
		expect(byType(harness.components.BrandChip).some((node) => node.props.active)).toBe(false);
		partner().props.onClick(); tree = harness.render();
		expect(byType(harness.components.PartnerSwatch).some((node) => node.props.active)).toBe(false);
		partner().props.onClick(); tree = harness.render();
		byType(harness.components.BrandChip)[0].props.onClick(); tree = harness.render();
		nodes(tree).find((node) => node.props.title === "Clear filter")!.props.onClick(); tree = harness.render();
		expect(byType(harness.components.PartnerSwatch).some((node) => node.props.active)).toBe(false);
		expect(byType(harness.components.BrandChip).some((node) => node.props.active)).toBe(false);
	});

	it("preserves cell click and hover inspection and accessible pressed filters", () => {
		const harness = activityHarness(), tree = harness.render();
		const sample = nodes(tree).find((node) => node.type === harness.components.CellSwatch)!;
		const onSelect = vi.fn();
		const cell = harness.components.CellSwatch({ ...sample.props, onSelect });
		cell.props.onMouseEnter(); cell.props.onClick();
		expect(onSelect.mock.calls).toEqual([[sample.props.day], [sample.props.day]]);
		sample.props.onSelect(sample.props.day);
		expect(nodes(harness.render()).find((node) => node.type === harness.components.DayDetail)!.props.day).toBe(sample.props.day);
		for (const type of [harness.components.PartnerSwatch, harness.components.BrandChip]) {
			const filter = nodes(tree).find((node) => node.type === type)!;
			const button = type({ ...filter.props, active: true });
			expect(button.type).toBe("button");
			expect(button.props["aria-pressed"]).toBe(true);
			expect(button.props.className).toContain("text-sm");
			expect(button.props.className).toContain("focus-visible:outline-2");
		}
	});

	it("labels generated history honestly and keeps filter/detail text readable", () => {
		const html = renderToStaticMarkup(React.createElement(ContributionGrid));
		expect(html).toContain("This is sample data, not your Workers’ history, live uptime, or benchmark results.");
		expect(html).toContain('aria-label="Selected sample day"');
		expect(html).toContain("Agents and platforms");
		expect(html).toContain("Services and tools");
		expect(html).not.toMatch(/text-\[(?:9|10|11)px\]|animate-pulse|repeating-linear-gradient/);
	});
});
