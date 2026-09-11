import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { WorkerSystemMap } from "@/components/dashboard/WorkerSystemMap";
import { WorkersLibrary } from "@/components/dashboard/WorkersLibrary";
import { listPresets } from "@/lib/dashboard/presets";
import { AGENT_LABEL, PROVIDER_LABEL } from "@/lib/user-config/schema";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function content(value: unknown): string {
	if (Array.isArray(value)) return value.map(content).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? content((value as Element).props?.children) : "";
}

/** Run the actual launch UI with in-memory configuration and no provider access. */
function launchFixture(configured: boolean) {
	let cursor = 0;
	const cells: Array<{ value: any }> = [];
	const push = vi.fn();
	const request = vi.fn(async () => ({
		ok: true,
		json: async () => ({ worker: { id: "fixture-worker" }, operation: { id: "fixture-operation" } }),
	}));
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const react = {
		useState(initial: unknown) {
			const index = cursor++;
			const cell = cells[index] ?? (cells[index] = { value: initial });
			return [cell.value, (value: unknown) => { cell.value = value; }];
		},
		useMemo: (create: () => unknown) => create(),
	};
	const module = { exports: {} as { WorkerLaunchpad: () => Element } };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/WorkerLaunchpad.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch: request,
		require: (id: string) => id === "react" ? react
			: id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
				: id === "next/navigation" ? { useRouter: () => ({ push, refresh: vi.fn() }) }
					: id.endsWith("DashboardConfigProvider") ? { useDashboardConfig: () => ({ providers: { e2b: { configured } } }) }
						: id.endsWith("agents/credentials") ? { validateAgentCredentials: () => ({ ok: true }) }
							: id.endsWith("user-config/schema") ? { AGENT_LABEL, PROVIDER_LABEL }
								: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
									: new Proxy({}, { get: () => () => null }),
	});
	const render = () => { cursor = 0; return module.exports.WorkerLaunchpad(); };
	const button = (tree: Element, label: string) => nodes(tree).find((node) => node.type === "button" && content(node).replace(/\s+/g, " ").includes(label))!;
	return { render, button, request, push };
}

describe("inspectable agent setup messaging", () => {
	it("links concrete setup paths without a planned autonomous-worker promise", () => {
		const html = renderToStaticMarkup(React.createElement(WorkerSystemMap));
		for (const href of ["/dashboard/agents", "#launch-worker", "/dashboard/components"]) expect(html).toContain(`href="${href}"`);
		expect(html).toContain("Open-source building blocks for agent harnesses");
		expect(html).toContain("A Worker is the saved record for your configured workspace");
		expect(html).toContain("does not transfer running processes or translate runtime-specific memory");
		expect(html).not.toMatch(/tested role|Describe the job|Planned|Generate a proposed|One identity/);
	});

	it("makes a template an editable configuration and a saved setup distinct from compute", () => {
		const presets = listPresets();
		const html = renderToStaticMarkup(React.createElement(WorkersLibrary, { presets, initialPresetId: presets[0].id }));
		expect(html).toContain("Templates supply instructions and selected tools, not finished work");
		expect(html).toContain("Your saved setups");
		expect(html).toContain("Save an agent setup");
		expect(html).toContain("Save setup");
		expect(html).not.toMatch(/durable specialist|tested role|Take a Worker off the shelf/);
	});

	it("keeps template cards on the compact summary rather than public-page long copy", () => {
		const preset = { ...listPresets()[0], description: "Compact template summary", longDescription: "Extended public-page explanation" };
		const html = renderToStaticMarkup(React.createElement(WorkersLibrary, { presets: [preset] }));
		expect(html).toContain(preset.description);
		expect(html).not.toContain(preset.longDescription);
	});

	it("keeps runtime and provider selection local until the explicit launch action", async () => {
		const fixture = launchFixture(true);
		let tree = fixture.render();
		expect(content(tree)).toContain("Your providers bill you directly");
		expect(fixture.button(tree, "Launch workspace").props.disabled).toBe(true);
		expect(fixture.button(tree, "E2B Sandbox").props.disabled).toBe(true);
		fixture.button(tree, "Claude Code").props.onClick();
		tree = fixture.render();
		expect(fixture.request).not.toHaveBeenCalled();
		expect(fixture.button(tree, "E2B Sandbox").props.disabled).toBe(false);
		fixture.button(tree, "E2B Sandbox").props.onClick();
		expect(fixture.request).not.toHaveBeenCalled();
		tree = fixture.render();
		expect(fixture.button(tree, "Launch workspace").props.disabled).toBe(false);
		fixture.button(tree, "Launch workspace").props.onClick();
		await vi.waitFor(() => expect(fixture.push).toHaveBeenCalledWith("/dashboard/workers/fixture-worker?launch=fixture-operation"));
		expect(fixture.request).toHaveBeenCalledOnce();
		expect(fixture.request).toHaveBeenCalledWith("/api/dashboard/control-plane/workers", expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ runtime: "claude-code", sandbox: "e2b", name: "Claude Code worker", migrationPolicy: "live" }),
		}));
	});

	it("preserves missing-credential gating without issuing a launch request", () => {
		const fixture = launchFixture(false);
		fixture.button(fixture.render(), "Claude Code").props.onClick();
		fixture.button(fixture.render(), "E2B Sandbox").props.onClick();
		const tree = fixture.render();
		expect(content(tree)).toContain(`Add ${PROVIDER_LABEL.e2b} credentials in Settings`);
		expect(fixture.request).not.toHaveBeenCalled();
		expect(fixture.button(tree, "Launch workspace").props.disabled).toBe(true);
	});
});
