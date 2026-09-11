import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PublicRegistryBrowser, isPublicRegistryResult, publicRegistryHomepage } from "@/components/PublicRegistryBrowser";
import { MarketingHero, FlowSteps, TerminalPanel, LinkCard } from "@/components/marketing/MarketingPage";
import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { PricingCalculator, illustrativeComputeEstimate } from "@/components/marketing/PricingCalculator";
import { RESOURCE_PAGES } from "./public-site";
import type { RegistryItem } from "@/lib/dashboard/registry";
import { bundledAdapter } from "@/lib/dashboard/registry/bundled";

vi.mock("@/components/GitHubStarLink", () => ({ GitHubStarLink: () => null }));
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = { type: unknown; props: Record<string, any> };
type Effect = { deps?: unknown[]; cleanup?: () => void };
type Response = { ok: boolean; json: () => Promise<unknown> };
type Send = (url: string, init: { signal: AbortSignal }) => Promise<Response>;
const response = (body: unknown, ok = true): Response => ({ ok, json: async () => body });
const item = (id: string): RegistryItem => ({ id, name: `Tool ${id}`, kind: "tool", description: "Source-provided tool", provider: "Fixture", source: "bundled", brand: null, homepage: "https://example.invalid/tool", logoUrl: null, installCommand: "echo inspect-only", installed: false, version: null, stars: null });
const result = (items = [item("one")]) => ({ items, sources: [{ id: "bundled", label: "Bundled", ok: true, count: items.length }] });
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	if (typeof element.type === "function") return nodes(element.type(element.props));
	return [element, ...nodes(element.props.children)];
}
function copy(value: unknown): string {
	if (Array.isArray(value)) return value.map(copy).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (!value || typeof value !== "object" || !("props" in value)) return "";
	const element = value as Element;
	return typeof element.type === "function" ? copy(element.type(element.props)) : copy(element.props.children);
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

/** Real public TSX with deterministic timers/effects. Every request is mocked,
 * and anything except a public, read-only catalog search fails closed. */
function mount(send: Send = async () => response(result()), component = "PublicRegistryBrowser") {
	const cells: Array<{ value: any }> = [], effects: Effect[] = [], pending: Array<() => void> = [];
	let cursor = 0, dirty = false, now = 0, timerId = 0;
	const timers = new Map<number, { due: number; callback: () => unknown }>();
	const timeout = (callback: () => unknown, delay: number) => { const id = ++timerId; timers.set(id, { due: now + delay, callback }); return id; };
	const cell = (initial: unknown) => cells[cursor++] ?? (cells[cursor - 1] = { value: initial });
	const react = {
		useState(initial: unknown) { const state = cell(initial); return [state.value, (next: any) => { const value = typeof next === "function" ? next(state.value) : next; if (!Object.is(value, state.value)) { state.value = value; dirty = true; } }]; },
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useEffect(callback: () => void | (() => void), deps: unknown[]) {
			const effect = cell({}).value as Effect;
			if (!effect.deps || deps.some((value, index) => !Object.is(value, effect.deps![index]))) {
				effect.deps = deps; pending.push(() => { effect.cleanup?.(); effect.cleanup = callback() || undefined; });
				if (!effects.includes(effect)) effects.push(effect);
			}
		},
	};
	let responder = send;
	const fetch = vi.fn((url: string, init: { signal: AbortSignal }) => {
		if (!url.startsWith("/api/registry/search?")) throw new Error(`Unexpected request: ${url}`);
		return responder(url, init);
	});
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as Record<string, () => Element> };
	const path = component === "PricingCalculator" ? "components/marketing/PricingCalculator.tsx" : "components/PublicRegistryBrowser.tsx";
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), path), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, fetch, URL, URLSearchParams, AbortController, Error,
		setTimeout: timeout, clearTimeout: (id: number) => timers.delete(id),
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
			: id === "next/link" ? { default: "a" } : id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") } : new Proxy({}, { get: (_target, name) => `stub-${String(name)}` }),
	});
	let tree: Element;
	function render() {
		let count = 0;
		do { dirty = false; cursor = 0; tree = module.exports[component](); pending.splice(0).forEach((fn) => fn()); if (++count > 8) throw new Error("Effects did not settle"); } while (dirty);
	}
	const all = () => nodes(tree);
	function button(label: string) { const found = all().find((node) => node.type === "button" && copy(node).replace(/\s+/g, " ").trim() === label); if (!found) throw new Error(`Missing button ${label}: ${copy(tree)}`); return found; }
	render();
	return {
		all, fetch, button, render, timers,
		text: () => copy(tree).replace(/\s+/g, " "),
		respond: (next: Send) => { responder = next; },
		click(label: string) { button(label).props.onClick(); render(); },
		change(label: string, value: string) { const node = all().find((element) => element.props["aria-label"] === label)!; node.props.onChange({ target: { value } }); render(); },
		input(index: number, value: string) { all().filter((element) => element.type === "input")[index].props.onChange({ target: { value } }); render(); },
		advance(ms = 0) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } render(); },
		async settle() { await new Promise<void>((done) => setImmediate(done)); render(); },
		unmount() { effects.forEach((effect) => effect.cleanup?.()); },
	};
}

describe("Public catalog states and actions", () => {
	it("renders a named skeleton immediately instead of a blank or false empty result", () => {
		const html = renderToStaticMarkup(React.createElement(PublicRegistryBrowser));
		expect(html).toContain('role="status" aria-label="Loading catalog" aria-busy="true"');
		expect(html.match(/ret-skeleton/g)).toHaveLength(30);
		expect(html).not.toContain("No matching entries");
		expect(html).toContain('aria-label="Search the catalog"');
		expect(html).not.toContain("Cursor Plugins");
	});
	it("loads bundled entries by default and sends only read-only requests", async () => {
		const ui = mount(); ui.advance(); await ui.settle();
		expect(ui.fetch.mock.calls[0][0]).toBe("/api/registry/search?source=bundled");
		expect(ui.text()).toContain("Showing 1 of 1 returned entries");
		expect(ui.text()).toContain("Source-provided command. Inspect it before execution.");
		expect(ui.all().find((node) => node.type === "a" && copy(node).includes("Review in dashboard"))!.props.href).toBe("/dashboard/registry?q=Tool+one&kind=tool");
		expect(ui.all().some((node) => node.type === "button" && /install/i.test(copy(node)))).toBe(false);
		ui.unmount();
	});
	it("debounces input and aborts stale results when filters change", async () => {
		const old = deferred<Response>();
		const ui = mount(async () => old.promise); ui.advance();
		const oldSignal = ui.fetch.mock.calls[0][1].signal;
		ui.respond(async () => response(result([item("new")])));
		ui.change("Search the catalog", "git"); ui.advance(200); ui.change("Search the catalog", "github"); ui.advance(299);
		expect(ui.fetch).toHaveBeenCalledTimes(1);
		expect(oldSignal.aborted).toBe(true);
		ui.click("MCP servers"); ui.advance(300); await ui.settle();
		expect(ui.fetch.mock.calls[1][0]).toBe("/api/registry/search?q=github&kind=mcp");
		old.resolve(response(result([item("old")]))); await ui.settle();
		expect(ui.text()).toContain("Tool new"); expect(ui.text()).not.toContain("Tool old");
		ui.unmount();
	});
	it("offers retry after HTTP failure and rejects malformed success data", async () => {
		const ui = mount(async () => response({}, false)); ui.advance(); await ui.settle();
		expect(ui.text()).toContain("Catalog unavailable");
		ui.respond(async () => response({ items: [null], sources: [] })); ui.click("Retry search"); ui.advance(); await ui.settle();
		expect(ui.text()).toContain("incomplete response");
		ui.respond(async () => response(result())); ui.click("Retry search"); ui.advance(); await ui.settle();
		expect(ui.text()).toContain("Tool one"); ui.unmount();
	});
	it("distinguishes no matches, partial failures, and completely unavailable sources", async () => {
		const failed = { id: "npm", label: "npm", ok: false, count: 0, error: "private diagnostic" };
		const ui = mount(async () => response({ items: [], sources: [failed] })); ui.advance(); await ui.settle();
		expect(ui.text()).toContain("Sources unavailable"); expect(ui.text()).not.toContain("No matching entries");
		expect(ui.text()).not.toContain("private diagnostic");
		ui.respond(async () => response({ ...result(), sources: [...result().sources, failed] })); ui.click("Retry search"); ui.advance(); await ui.settle();
		expect(ui.text()).toContain("Some sources are unavailable"); expect(ui.text()).toContain("Tool one");
		ui.respond(async () => response(result([]))); ui.click("Retry sources"); ui.advance(); await ui.settle();
		expect(ui.text()).toContain("No matching entries"); ui.click("Clear filters"); ui.advance(); await ui.settle();
		expect(ui.fetch.mock.calls.at(-1)![0]).toBe("/api/registry/search?source=bundled"); ui.unmount();
	});
	it("retains exact query and kind in the dashboard handoff and only paginates locally", async () => {
		const ui = mount(async () => response(result(Array.from({ length: 28 }, (_, index) => item(String(index))))));
		ui.change("Search the catalog", "a&b"); ui.click("Skills"); ui.advance(300); await ui.settle();
		expect(ui.all().filter((node) => node.type === "article")).toHaveLength(24);
		ui.click("Show 4 more"); expect(ui.all().filter((node) => node.type === "article")).toHaveLength(28);
		expect(ui.fetch).toHaveBeenCalledTimes(1);
		expect(ui.all().find((node) => node.type === "a" && copy(node).includes("Open in dashboard"))!.props.href).toBe("/dashboard/registry?q=a%26b&kind=skill"); ui.unmount();
	});
	it("cleans up pending debounce and requests on unmount", async () => {
		const ui = mount(); ui.change("Search the catalog", "pending"); ui.unmount(); ui.advance(400);
		expect(ui.fetch).not.toHaveBeenCalled(); expect(ui.timers.size).toBe(0);
		const pending = deferred<Response>(); const second = mount(async () => pending.promise); second.advance();
		const signal = second.fetch.mock.calls[0][1].signal; second.unmount(); expect(signal.aborted).toBe(true);
		pending.resolve(response(result())); await second.settle(); expect(second.text()).not.toContain("Tool one");
	});
	it("times out a hanging request with recovery guidance", async () => {
		const ui = mount(async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Aborted")))));
		ui.advance(); ui.advance(20000); await ui.settle(); expect(ui.text()).toContain("Search took too long"); expect(ui.button("Retry search")).toBeDefined(); ui.unmount();
	});
	it("validates catalog structure and never exposes executable external links", () => {
		expect(isPublicRegistryResult(result())).toBe(true);
		for (const value of [null, {}, { items: [{}], sources: [] }, { items: [], sources: [{ ok: true, count: -1 }] }]) expect(isPublicRegistryResult(value)).toBe(false);
		for (const url of ["javascript:alert(1)", "data:text/html,test", "http://example.com", "https://secret@example.com", "#", null]) expect(publicRegistryHomepage(url)).toBeUndefined();
		expect(publicRegistryHomepage("https://example.com/tool")).toBe("https://example.com/tool");
	});
	it("accepts the real bundled catalog including provider and source-code entries", async () => {
		// The bundled adapter reads checked-in data only; no external provider request.
		const items = await bundledAdapter.search({ query: "", limit: 1600 });
		expect(items.length).toBeGreaterThan(100);
		expect(isPublicRegistryResult(result(items))).toBe(true);
		expect(new Set(items.map((entry) => entry.kind))).toEqual(new Set(["skill", "mcp", "tool", "plugin", "source", "provider", "cli"]));
	});
});

describe("Readable public templates and honest result paths", () => {
	it("uses one heading and no empty second column when no hero visual exists", () => {
		const html = renderToStaticMarkup(React.createElement(MarketingHero, { kicker: "./Agents", title: "Choose a job.", description: "Configure before launch." }));
		expect(html.match(/<h1\b/g)).toHaveLength(1); expect(html).not.toContain("lg:grid-cols"); expect(html).toContain("Agents"); expect(html).not.toContain("ret-page-enter");
		expect(renderToStaticMarkup(React.createElement(MarketingHero, { kicker: "./API", title: "API guide", description: "Credentials required." }))).toContain(">API</p>");
	});
	it("keeps flow descriptions and long endpoint text readable without fake completed status", () => {
		const flow = renderToStaticMarkup(React.createElement(FlowSteps, { steps: [{ label: "Connect", body: "Credentials required." }] }));
		expect(flow).toContain("<ol"); expect(flow).toContain("Credentials required."); expect(flow).not.toContain("CheckCircle");
		const terminal = renderToStaticMarkup(React.createElement(TerminalPanel, { title: "Endpoint examples", lines: ["GET /api/dashboard/control-plane/operations/:id"] }));
		expect(terminal).not.toContain("truncate"); expect(terminal).toContain("[overflow-wrap:anywhere]"); expect(terminal).not.toContain(">trace<");
		const card = renderToStaticMarkup(React.createElement(LinkCard, { title: "Review tools", href: "/registry", description: "Inspect before installing.", icon: "boxes" }));
		expect(card).toContain("focus-visible:outline"); expect(card).toContain('href="/registry"');
	});
	it("gives contact and blog accurate states, real destinations, and visible privacy guidance", () => {
		const render = (slug: string) => renderToStaticMarkup(React.createElement(ResourcePageContent, { page: RESOURCE_PAGES.find((page) => page.slug === slug)!, terminalLines: ["legacy illustration"] }));
		const blog = render("blog"), contact = render("contact"), api = render("api-reference");
		expect(blog).toContain("No posts published yet."); expect(blog).toContain("docs/WHITEPAPER.md"); expect(blog).not.toContain("legacy illustration");
		expect(contact).toContain("/issues/new/choose"); expect(contact).toContain("GitHub issues are public."); expect(contact).toContain("Do not include API keys");
		expect(api).toContain('href="/dashboard/settings"'); expect(api).toContain("Hosted endpoints require authentication."); expect(api).toContain("Hosted memory/profile integration is not supplied");
	});
	it("calculates sample costs without implying a live quote or executing any run", () => {
		expect(illustrativeComputeEstimate({ cpu: "1", memory: "2", hours: "8" })).toBeCloseTo(0.6336);
		for (const invalid of ["", "NaN", "-1", "Infinity", "129"]) expect(illustrativeComputeEstimate({ cpu: invalid, memory: "2", hours: "8" })).toBeNull();
		expect(illustrativeComputeEstimate({ cpu: "1", memory: "2", hours: "0" })).toBe(0);
		const ui = mount(undefined, "PricingCalculator"); expect(ui.text()).toContain("$0.6336"); ui.input(0, "2"); expect(ui.text()).toContain("$1.152");
		ui.click("Per second"); expect(ui.text()).toContain("GiB-month"); expect(ui.text()).toContain("$1.152"); expect(ui.fetch).not.toHaveBeenCalled(); ui.input(2, ""); expect(ui.text()).toContain("Enter values within the ranges"); ui.unmount();
		const html = renderToStaticMarkup(React.createElement(PricingCalculator)); expect(html).toContain("Not a live quote"); expect(html).toContain("Excludes storage, network, model calls, taxes, and provider minimums.");
		const pricingPage = readFileSync(resolve(process.cwd(), "app/pricing/page.tsx"), "utf8");
		expect(pricingPage).toContain('title="Illustrative usage records"');
		for (const destination of ["/dashboard/usage", "/dashboard/benchmarks", "/dashboard/setup"]) expect(pricingPage).toContain(`href="${destination}"`);
		expect(pricingPage).not.toContain('title="dashboard surfaces"');
	});
});
