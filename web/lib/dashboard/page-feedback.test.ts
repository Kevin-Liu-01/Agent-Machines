import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { MachineRequired } from "@/components/dashboard/MachineRequired";
import DashboardLoading from "@/app/dashboard/loading";
import PageLoading from "@/app/loading";
import * as usage from "@/lib/dashboard/usage-metrics";
import * as schema from "@/lib/user-config/schema";
import * as fleet from "@/lib/fleet/view-model";
import { cn } from "@/lib/cn";

vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigForRequest: async () => ({ customLoadout: [], machines: [], activeMachineId: null }) }));

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("page feedback primitives", () => {
	it.each(["skill", "mcp", "cli", "tool", "plugin", "provider", "source", "invalid"])("preserves supported catalog kind %s in the dashboard handoff", async (kind) => {
		const { default: RegistryPage } = await import("@/app/dashboard/registry/page");
		const tree = await RegistryPage({ searchParams: Promise.resolve({ q: "A tool & CLI", kind }) });
		const catalog = nodes(tree).find((node) => node.props.initialQuery === "A tool & CLI");
		expect(catalog?.props.initialKind).toBe(kind === "invalid" ? "all" : kind);
	});
	it.each(["cards", "table", "editor"] as const)("announces %s loading once without fake controls or data", (variant) => {
		const html = renderToStaticMarkup(React.createElement(DashboardLoadingState, { label: "Loading test data…", variant }));
		expect(html.match(/role="status"/g)).toHaveLength(1);
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("Loading test data…");
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("ret-skeleton");
		expect(html).not.toMatch(/<button|<a |No results|\$0|0 records/);
	});
	it("covers root and dashboard route transitions, with reduced-motion skeletons", () => {
		for (const component of [DashboardLoading, PageLoading]) {
			const html = renderToStaticMarkup(React.createElement(component));
			expect(html).toContain('role="status"');
			expect(html).toContain("ret-skeleton");
		}
		const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
		expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\.ret-skeleton::after\s*{\s*animation: none/);
	});
	it("gives machine-scoped shortcuts a real fleet or setup destination", () => {
		const html = renderToStaticMarkup(React.createElement(MachineRequired, { title: "Logs", description: "Inspect recent output." }));
		expect(html).toContain('href="/dashboard/machines"');
		expect(html).toContain('href="/dashboard/setup"');
		expect(html).toContain("Choose a machine to continue");
		expect(html).not.toContain("ret-skeleton");
	});
	it("allows retry alongside a safe navigation action without hiding either", () => {
		const html = renderToStaticMarkup(React.createElement(EmptyState, { title: "Unavailable", description: "Try loading again.", onRetry: vi.fn(), action: { label: "Open fleet", href: "/dashboard/machines" } }));
		expect(html).toContain("Try again");
		expect(html).toContain("Open fleet");
	});
});

type Node = { type: any; props: Record<string, any> };
function nodes(value: unknown): Node[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Node;
	return [element, ...nodes(element.props.children), ...nodes(element.props.right)];
}
function words(value: unknown): string {
	if (Array.isArray(value)) return value.map(words).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? words((value as Node).props?.children) : "";
}
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const pending = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

/** Real page callbacks, entirely mocked requests. Never contacts a provider. */
function machinePage({ missing = false, statusCode = 200 } = {}) {
	let cursor = 0;
	const cells: Array<{ value: any }> = [], effects: Array<() => void> = [];
	const cell = (initial: unknown) => { const index = cursor++; return cells[index] ?? (cells[index] = { value: initial }); };
	const react = {
		useState(initial: unknown) { const state = cell(initial); return [state.value, (next: any) => { state.value = typeof next === "function" ? next(state.value) : next; }]; },
		useMemo(fn: () => unknown) { cell(null); return fn(); },
		useEffect(fn: () => void | (() => void), dependencies: unknown[]) { const state = cell({}).value; if (!state.dependencies || dependencies.some((value, index) => !Object.is(value, state.dependencies[index]))) { state.dependencies = dependencies; effects.push(() => { state.cleanup?.(); state.cleanup = fn(); }); } },
	};
	const machine = missing ? null : { id: "machine-a", name: "Review", providerKind: "daytona", agentKind: "codex", model: "model", spec: schema.DEFAULT_MACHINE_SPEC, bootstrapState: { phase: "succeeded" } };
	let load = async () => reply({ ok: false }, 503);
	const fetch = vi.fn(async (url: string) => {
		if (url === "/api/dashboard/metrics/collect") return reply({ ok: true });
		if (url.includes("/usage?")) return load();
		if (url === "/api/dashboard/machines/machine-a") return reply({ ok: true, live: { state: "ready" } }, statusCode);
		throw new Error(`Unexpected test request: ${url}`);
	});
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { default: () => Node } };
	const source = readFileSync(resolve(process.cwd(), "app/dashboard/machines/[machineId]/page.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, fetch, window: { setInterval: () => 1, clearInterval: vi.fn() }, document: { visibilityState: "visible" },
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
			: id.endsWith("MachineProvider") ? { useMachineContext: () => ({ machineId: "machine-a", machine, isActive: true }) }
				: id.endsWith("usage-metrics") ? usage : id.endsWith("user-config/schema") ? schema : id.endsWith("fleet/view-model") ? fleet : id.endsWith("/cn") ? { cn }
					: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` }),
	});
	let tree: Node;
	const render = () => { cursor = 0; tree = module.exports.default(); for (const effect of effects.splice(0)) effect(); cursor = 0; tree = module.exports.default(); };
	render();
	return {
		fetch, render, nodes: () => nodes(tree), text: () => words(tree).replace(/\s+/g, " "),
		respond: (fn: typeof load) => { load = fn; },
		async settle() { await new Promise<void>((done) => setImmediate(done)); render(); },
	};
}

describe("machine page request states", () => {
	it("does not render a blank page for a missing machine", () => {
		const page = machinePage({ missing: true });
		expect(page.nodes()[0].props.title).toBe("Machine not available");
		expect(page.nodes()[0].props.action.href).toBe("/dashboard/machines");
	});
	it("renders an unavailable state for failed usage and lets Retry recover to a genuine empty history", async () => {
		const page = machinePage(); await page.settle(); await page.settle();
		expect(page.text()).toContain("Usage data is unavailable");
		expect(page.text()).not.toContain("No status changes recorded");
		expect(page.nodes().some((node) => node.type?.name === "UsageChartRow")).toBe(false);
		page.respond(async () => reply({ ok: true, transitions: [] }));
		page.nodes().find((node) => words(node).trim() === "Retry usage" && node.props.onClick)!.props.onClick();
		page.render();
		expect(page.text()).toContain("Loading allocation and activity");
		await page.settle();
		expect(page.text()).not.toContain("Usage data is unavailable");
		expect(page.text()).toContain("No status changes recorded for this period");
	});
	it("does not leave the status loading forever when the machine returns 404", async () => {
		const page = machinePage({ statusCode: 404 }); await page.settle();
		expect(page.text()).toContain("This machine is no longer available");
		expect(page.nodes().find((node) => node.type === "stub-MachineActions")?.props.state).toBe("unknown");
	});
	it("keeps date-range controls usable after a failed request", async () => {
		const page = machinePage(); await page.settle(); await page.settle();
		expect(page.text()).toContain("Usage data is unavailable");
		page.respond(async () => reply({ ok: true, transitions: [] }));
		page.nodes().find((node) => node.type === "stub-TimeRangeSelector")!.props.onSelect(1); page.render(); await page.settle();
		expect(page.fetch).toHaveBeenCalledWith("/api/dashboard/metrics/machines/machine-a/usage?days=1", { cache: "no-store" });
		expect(page.text()).not.toContain("Usage data is unavailable");
		expect(page.nodes().find((node) => node.type === "stub-TimeRangeSelector")!.props.selected).toBe(1);
	});
	it("keeps an older date-range response from replacing a newer request", async () => {
		const page = machinePage(); await page.settle(); await page.settle();
		page.respond(async () => reply({ ok: true, transitions: [] }));
		page.nodes().find((node) => words(node).trim() === "Retry usage" && node.props.onClick)!.props.onClick(); page.render(); await page.settle();
		const old = pending<ReturnType<typeof reply>>();
		page.respond(() => old.promise);
		const range = () => page.nodes().find((node) => node.type === "stub-TimeRangeSelector")!;
		range().props.onSelect(14); page.render();
		page.respond(async () => reply({ ok: true, transitions: [{ label: "New period", timestamp: "2026-09-10T00:00:00Z" }] }));
		range().props.onSelect(30); page.render(); await page.settle();
		old.resolve(reply({ ok: true, transitions: [{ label: "Stale period", timestamp: "2026-09-01T00:00:00Z" }] })); await page.settle();
		expect(page.text()).toContain("New period"); expect(page.text()).not.toContain("Stale period");
	});
});
