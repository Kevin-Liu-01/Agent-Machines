import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { fleetRegion } from "@/lib/fleet/agent-styling";
import * as fleetStyling from "@/lib/fleet/agent-styling";
import { AGENTS } from "@/lib/agents";
import { DEFAULT_MODEL } from "@/lib/user-config/schema";
import { providerLogoMark } from "@/lib/fleet/logos";

type Element = { type: unknown; props: Record<string, unknown> };
function component(file: string) {
	const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Element> };
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), file), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports,
		require: (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
				: id.endsWith("logo-assets") ? { CODEX_THEME_ASSETS: {} }
					: id.endsWith("lib/agents") ? { AGENTS }
						: id.endsWith("fleet/agent-styling") ? fleetStyling
							: id.endsWith("user-config/schema") ? { DEFAULT_MODEL }
					: new Proxy({}, { get: () => () => null }),
	});
	return module.exports;
}

describe("official Daytona provider branding (actual TSX)", () => {
	it("names the Daytona documentation link without the retired provider acronym", () => {
		const tree = component("components/Footer.tsx").Footer({});
		function elements(value: unknown): Element[] {
			if (Array.isArray(value)) return value.flatMap(elements);
			if (!value || typeof value !== "object" || !("props" in value)) return [];
			const node = value as Element;
			return [node, ...elements(node.props.children)];
		}
		const links = elements(tree).filter((node) => node.props.href === "https://www.daytona.io/docs/");
		expect(links).toHaveLength(1);
		expect(links[0].props.label).toBe("Daytona docs");
		expect(JSON.stringify(tree)).not.toMatch(/"DCS"|Dedalus/);
	});

	it("labels the landing fleet as illustrative and does not display inherited Daytona resource or region data", () => {
		const tree = component("components/FleetDemo.tsx").FleetDemo({});
		function elements(value: unknown): Element[] {
			if (Array.isArray(value)) return value.flatMap(elements);
			if (!value || typeof value !== "object" || !("props" in value)) return [];
			const node = value as Element;
			return [node, ...elements(node.props.children)];
		}
		const nodes = elements(tree);
		const disclaimer = nodes.find((node) => node.type === "p"
			&& typeof node.props.children === "string"
			&& node.props.children.includes("not live Workers or provider benchmarks"));
		expect(disclaimer?.props.children).toBe("Illustrative activity and uptime, not live Workers or provider benchmarks. Open a card for the runtime’s documentation.");
		const cards = nodes.filter((node) => node.props.card);
		expect(cards).toHaveLength(AGENTS.length);
		for (const node of cards) {
			expect(node.props.live).toBe(false);
			expect(node.props.card).toMatchObject({ providerKind: "daytona", region: "—", cpu: "— vCPU", mem: "— MiB", disk: "— GiB" });
		}
	});

	it("maps current and legacy providers without converting an old machine identity", () => {
		expect(providerLogoMark("daytona")).toBe("daytona");
		expect(providerLogoMark("dedalus")).toBe("retired");
		expect(fleetRegion("daytona")).toBe("—");
		expect(fleetRegion("dedalus")).toBe("—");
	});
	it.each([undefined, "auto", "currentColor"])("keeps the glyph theme-adaptive with tone %s", (tone) => {
		const mark = component("components/Logo.tsx").Logo({ mark: "daytona", size: 24, tone });
		expect(mark.props).toMatchObject({ role: "img", "aria-label": "Daytona" });
		expect(mark.props.className).toContain("currentColor");
		expect(mark.props.style).toMatchObject({ width: "24px", height: "24px", maskImage: "url(/brand/services/daytona.svg)", WebkitMaskImage: "url(/brand/services/daytona.svg)" });
	});

	it("uses the same theme-aware official asset in service chips", () => {
		const mark = component("components/ServiceIcon.tsx").ServiceIcon({ slug: "daytona", size: 18, tone: "color" });
		expect(mark.props["aria-label"]).toBe("Daytona");
		expect(mark.props.className).toContain("currentColor");
		expect(mark.props.style).toMatchObject({ maskImage: "url(/brand/services/daytona.svg)" });
	});

	it.each(["dedalus", "retired"])("renders %s only as an unbranded retired provider", (mark) => {
		const result = component("components/Logo.tsx").Logo({ mark });
		expect(result.props["aria-label"]).toBe("Retired provider");
		expect(result.props).not.toHaveProperty("src");
		expect(result.props).not.toHaveProperty("style");
	});

	it("ships the glyph without the presentation-board background, scripts, or external dependencies", () => {
		const svg = readFileSync(resolve(process.cwd(), "public/brand/services/daytona.svg"), "utf8");
		expect(svg).toContain('viewBox="188 119 78 82"');
		expect(svg.match(/<path /g)).toHaveLength(3);
		expect(svg).not.toMatch(/<script|<image|href=|M0 0h454v320H0z/);
		const provenance = readFileSync(resolve(process.cwd(), "public/brand/DAYTONA-SOURCE.md"), "utf8");
		expect(provenance).toContain("https://www.daytona.io/brand");
		expect(provenance).toContain("zEFS9o7MWBdO4bXzDSIDr3euk.svg");
	});
});
