import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { DASHBOARD_SHELL_HEADER_ROW } from "./shell-chrome";

const route = vi.hoisted(() => ({ pathname: "/dashboard/agents" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn() }) }));
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}

function mountChrome() {
	let expanded = false;
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { DashboardChrome: (props: Record<string, unknown>) => Element } };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/DashboardChrome.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports,
		require: (id: string) => id === "react" ? { useState: () => [expanded, (value: boolean | ((old: boolean) => boolean)) => { expanded = typeof value === "function" ? value(expanded) : value; }] }
			: id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
				: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
					: id.endsWith("shell-chrome") ? { DASHBOARD_SHELL_HEADER_ROW }
						: new Proxy({}, { get: (_, name) => String(name) }),
	});
	const render = () => module.exports.DashboardChrome({ machines: [], setupComplete: false, children: "Dashboard content" });
	return { render };
}

describe("custom dashboard chrome", () => {
	it("uses one fixed48px, non-wrapping row for both headers", () => {
		expect(DASHBOARD_SHELL_HEADER_ROW.split(" ")).toEqual(expect.arrayContaining(["h-12", "min-h-12", "max-h-12", "flex-nowrap"]));
		const source = readFileSync(resolve(process.cwd(), "components/dashboard/StatusHeader.tsx"), "utf8");
		expect(source).toContain("DASHBOARD_SHELL_HEADER_ROW");
		expect(source).not.toMatch(/flex-wrap|flex-\[1_1_/);
	});

	it("starts with a72px rail and expands immediately without changing destinations or content", () => {
		const chrome = mountChrome();
		let tree = chrome.render();
		expect(tree.props["data-sidebar-expanded"]).toBe(false);
		expect(tree.props.className).toContain("lg:grid-cols-[72px_minmax(0,1fr)]");
		const button = nodes(tree).find(node => node.props["aria-label"] === "Expand sidebar")!;
		expect(button.props["aria-expanded"]).toBe(false);
		expect(nodes(tree).some(node => node.props.id === button.props["aria-controls"])).toBe(true);
		button.props.onClick();
		tree = chrome.render();
		expect(tree.props["data-sidebar-expanded"]).toBe(true);
		expect(tree.props.className).toContain("lg:grid-cols-[224px_minmax(0,1fr)]");
		expect(nodes(tree).find(node => node.type === "SidebarNav")?.props.compact).toBe(false);
		expect(nodes(tree).find(node => node.type === "main")?.props.children).toBe("Dashboard content");
		nodes(tree).find(node => node.props["aria-label"] === "Collapse sidebar")!.props.onClick();
		expect(chrome.render().props["data-sidebar-expanded"]).toBe(false);
	});

	it("retains every labeled fleet destination and active state in the compact rail", () => {
		route.pathname = "/dashboard/agents";
		const compact = renderToStaticMarkup(React.createElement(SidebarNav, { setupComplete: false, machines: [], compact: true }));
		const expanded = renderToStaticMarkup(React.createElement(SidebarNav, { setupComplete: false, machines: [], compact: false }));
		const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
		expect(hrefs(compact)).toEqual(hrefs(expanded));
		expect(hrefs(compact)).toHaveLength(18);
		for (const label of ["Overview", "Agent templates", "Machines", "Settings", "Schedules", "MCP servers"]) {
			expect(compact).toContain(`title="${label}"`);
			expect(compact).toContain(`>${label}</span>`);
		}
		expect(compact.match(/aria-current="page"/g)).toHaveLength(1);
		expect(compact).toContain("Needs setup");
	});

	it("keeps machine controls reachable from the compact rail", () => {
		route.pathname = "/dashboard/machines/fixture-worker/terminal";
		const html = renderToStaticMarkup(React.createElement(SidebarNav, { setupComplete: true, machines: [], compact: true, onExpand: vi.fn() }));
		expect(html).toContain('aria-label="Show controls for fixture-work"');
		expect(html).toContain('href="/dashboard/machines/fixture-worker/terminal"');
		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		route.pathname = "/dashboard/agents";
	});
});
