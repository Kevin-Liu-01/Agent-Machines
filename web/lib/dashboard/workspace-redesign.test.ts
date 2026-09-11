import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { cn } from "@/lib/cn";
import { isValidSchedule } from "@/lib/cron/expr";
import { SCHEDULE_STARTERS } from "@/components/dashboard/ScheduleStarters";
import { INSIGHT_TABS, STUDIO_TABS, TOOLKIT_TABS } from "@/components/dashboard/WorkspaceTabs";

type Element = React.ReactElement<Record<string, any>>;
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...nodes(value.props.children)];
}
function text(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(text).join("");
	return React.isValidElement<Record<string, unknown>>(value) ? text(value.props.children) : "";
}

/** Run actual selection callbacks, isolated from user data and provider accounts. */
function mount(name: string, props: Record<string, unknown> = {}) {
	const values: unknown[] = [];
	let cursor = 0;
	const fetch = vi.fn(() => { throw new Error("Preview must not make requests"); });
	const module = { exports: {} as Record<string, (props: any) => unknown> };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), `components/dashboard/${name}.tsx`), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, fetch,
		require: (id: string) => id === "react/jsx-runtime" ? jsxRuntime : id === "react" ? {
			useState: (initial: unknown) => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value: unknown) => { values[index] = value; }]; },
		} : id.endsWith("/cn") ? { cn } : id === "next/link" ? { default: "a" } : new Proxy({}, { get: (_, name) => String(name) }),
	});
	return { fetch, render: () => { cursor = 0; return module.exports[name](props); } };
}

describe("consolidated workspaces", () => {
	it("keeps library and analysis sections inside three URL-backed hubs", () => {
		for (const [items, base] of [[STUDIO_TABS, "/dashboard/agents"], [TOOLKIT_TABS.filter(item => item.id !== "loadout"), "/dashboard/registry"], [INSIGHT_TABS, "/dashboard/usage"]] as const) {
			for (const item of items) expect(new URL(item.href, "https://agent-machines.dev").pathname).toBe(base);
		}
		for (const [legacy, destination] of [["memory", "/dashboard/agents?tab=memory"], ["skills", "/dashboard/registry?tab=skills"], ["mcps", "/dashboard/registry?tab=mcps"], ["benchmarks", "/dashboard/usage?tab=benchmarks"]]) {
			expect(readFileSync(resolve(process.cwd(), `app/dashboard/${legacy}/page.tsx`), "utf8")).toContain(`redirect("${destination}")`);
		}
	});
	it("Studio changes its explanation and next action with the selected component", () => {
		const app = mount("StudioBlueprint");
		let tree = app.render();
		nodes(tree).find(node => node.type === "button" && text(node) === "Memory")!.props.onClick();
		tree = app.render();
		expect(text(tree)).toContain("Bring context into the work.");
		expect(nodes(tree).filter(node => node.props["aria-pressed"]).map(text)).toEqual(["Memory"]);
		expect(nodes(tree).find(node => text(node) === "Open memory" && node.type === "a")?.props.href).toBe("/dashboard/agents?tab=memory");
		expect(app.fetch).not.toHaveBeenCalled();
	});
	it("the empty workbench previews files without inventing a filesystem or launching anything", () => {
		const onCreate = vi.fn();
		const app = mount("WorkspacePreview", { onCreate });
		let tree = app.render();
		nodes(tree).find(node => node.props.role === "tab" && text(node) === "Files")!.props.onClick();
		tree = app.render();
		expect(text(tree)).toContain("No files have been created.");
		expect(nodes(tree).filter(node => node.props["aria-selected"]).map(text)).toEqual(["Files"]);
		expect(onCreate).not.toHaveBeenCalled();
		nodes(tree).find(node => node.type === "button" && text(node) === "Create a workspace")!.props.onClick();
		expect(onCreate).toHaveBeenCalledOnce();
		expect(app.fetch).not.toHaveBeenCalled();
	});
	it("schedule starters select a valid, editable UTC draft without enabling it", () => {
		const onSelect = vi.fn();
		const app = mount("ScheduleStarters", { onSelect });
		for (const starter of SCHEDULE_STARTERS) {
			let tree = app.render();
			nodes(tree).find(node => node.type === "button" && text(node).startsWith(starter.name))!.props.onClick();
			tree = app.render();
			expect(text(tree)).toContain(starter.prompt);
			expect(text(tree)).toContain("Nothing runs from this preview.");
			nodes(tree).find(node => node.type === "button" && text(node) === "Use this schedule")!.props.onClick();
			expect(onSelect).toHaveBeenLastCalledWith({ name: starter.name, schedule: starter.schedule, prompt: starter.prompt });
			expect(isValidSchedule(starter.schedule)).toBe(true);
		}
		expect(app.fetch).not.toHaveBeenCalled();
	});
	it("schedule preview without a machine leads to Workspaces instead of presenting a save button", () => {
		const tree = mount("ScheduleStarters").render();
		expect(nodes(tree).find(node => node.type === "a")?.props.href).toBe("/dashboard/machines");
		expect(nodes(tree).some(node => node.type === "button" && text(node) === "Use this schedule")).toBe(false);
	});
});
