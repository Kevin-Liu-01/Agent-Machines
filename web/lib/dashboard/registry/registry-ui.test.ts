import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import type { RegistryItem, SourceStatus } from "./types";

type Element = { type: unknown; props: Record<string, any> };
type Component = (props: Record<string, any>) => Element;
type ResponseStub = { ok: boolean; status: number; json: () => Promise<unknown> };
type RequestOptions = { method?: string; body?: string; signal?: AbortSignal };
type Send = (url: string, options?: RequestOptions) => Promise<ResponseStub>;
type Effect = { dependencies?: unknown[]; cleanup?: () => void };
const response = (body: unknown, status = 200): ResponseStub => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}
function find(tree: Element, predicate: (node: Element) => boolean): Element {
	const match = nodes(tree).find(predicate);
	if (!match) throw new Error(`Expected element missing: ${text(tree)}`);
	return match;
}
function button(tree: Element, label: string): Element {
	return find(tree, (node) => {
		const name = text(node).replace(/\s+/g, " ").trim();
		return node.type === "button" && (name === label || (label === "Saved in these results" && /^Saved in these results \d+$/.test(name)));
	});
}
function activate(tree: Element, label: string) {
	const target = button(tree, label);
	if (typeof target.props.onClick === "function") target.props.onClick();
	else if (target.props.type === "submit") find(tree, (node) => node.type === "form" && nodes(node).includes(target)).props.onSubmit({ preventDefault() {} });
	else throw new Error(`Button has no handler: ${label}`);
}
const item = (values: Partial<RegistryItem> = {}): RegistryItem => ({
	id: "alpha", name: "Alpha tool", kind: "tool", description: "Local test fixture only", provider: "Fixture owner", source: "npm",
	installCommand: "echo fixture-only", logoUrl: null, brand: null, stars: null, version: "1.0.0", homepage: "https://example.invalid/alpha", installed: false, ...values,
});
const fixtures = [item(), item({ id: "middle", name: "Middle skill", source: "skills-sh", kind: "skill", installed: true }), item({ id: "zeta", name: "Zeta MCP", source: "bundled", kind: "mcp", installCommand: null })];
const healthy: SourceStatus[] = [{ id: "bundled", label: "Bundled", ok: true, count: 1 }, { id: "npm", label: "npm", ok: true, count: 1 }, { id: "skills-sh", label: "skills.sh", ok: true, count: 1 }];
const saved = { ok: true, status: "saved", installOk: false, machineId: null, installLog: "Saved to your library. No command was run and no runtime connection was configured." };

/** Actual browser + card TSX with persistent hook frames, effect dependencies,
 * abort signals and deterministic debounce time. Only visual imports and HTTP
 * are fakes; requests outside the three registry endpoints fail closed. */
function mount(options: {
	items?: RegistryItem[];
	sources?: SourceStatus[];
	search?: Send;
	initialQuery?: string;
	initialKind?: string;
	installedIds?: string[];
	machines?: Array<{ id: string; name: string; archived?: boolean }>;
	activeMachineId?: string | null;
} = {}) {
	const frames = new Map<string, Array<{ value: any }>>();
	const effects: Effect[] = [];
	const pendingEffects: Array<() => void> = [];
	let frame: Array<{ value: any }> = [], cursor = 0, dirty = false;
	let now = 0, timerId = 0;
	const timers = new Map<number, { due: number; callback: () => void }>();
	const setTimeout = vi.fn((callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; });
	const clearTimeout = vi.fn((id: number | undefined) => { if (id !== undefined) timers.delete(id); });
	const cell = (initial: unknown) => { const index = cursor++; return frame[index] ?? (frame[index] = { value: initial }); };
	const changed = (previous: unknown[] | undefined, dependencies: unknown[]) => !previous || dependencies.length !== previous.length || dependencies.some((value, index) => !Object.is(value, previous[index]));
	const react = {
		useState(initial: unknown) {
			const state = cell(typeof initial === "function" ? initial() : initial);
			return [state.value, (next: any) => {
				const value = typeof next === "function" ? next(state.value) : next;
				if (!Object.is(value, state.value)) { state.value = value; dirty = true; }
			}];
		},
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useMemo(callback: () => unknown, dependencies: unknown[]) {
			const state = cell({}).value;
			if (changed(state.dependencies, dependencies)) { state.dependencies = dependencies; state.value = callback(); }
			return state.value;
		},
		useCallback(callback: unknown, dependencies: unknown[]) { return react.useMemo(() => callback, dependencies); },
		useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
			const effect = cell({}).value as Effect;
			if (changed(effect.dependencies, dependencies)) {
				effect.dependencies = dependencies;
				pendingEffects.push(() => { effect.cleanup?.(); effect.cleanup = callback() || undefined; });
				if (!effects.includes(effect)) effects.push(effect);
			}
		},
	};
	const responders: Record<"search" | "add" | "remove", Send> = {
		search: options.search ?? (async () => response({ items: options.items ?? fixtures, sources: options.sources ?? healthy })),
		add: async () => response(saved),
		remove: async () => response({ ok: true }),
	};
	const fetch = vi.fn(async (url: string, init?: RequestOptions) => {
		if (url.startsWith("/api/dashboard/registry/search?") && !init?.method) return responders.search(url, init);
		if (url === "/api/dashboard/registry/add" && init?.method === "POST") return responders.add(url, init);
		if (url === "/api/dashboard/registry/remove" && init?.method === "DELETE") return responders.remove(url, init);
		throw new Error(`Unexpected mocked registry request: ${init?.method ?? "GET"} ${url}`);
	});
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	function load(path: string, imports: Record<string, unknown> = {}) {
		const module = { exports: {} as Record<string, Component> };
		runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), path), "utf8"), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
		}).outputText, {
			module, exports: module.exports, fetch, Error, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
			require: (id: string) => imports[id] ?? (id === "react" ? react
				: id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
					: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
						: id.endsWith("ReticleButton") ? { ReticleButton: "button" }
							: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` })),
		});
		return module.exports;
	}
	const cardComponent = load("components/dashboard/RegistryCard.tsx").RegistryCard;
	const browserComponent = load("components/dashboard/RegistryBrowser.tsx", { "./RegistryCard": { RegistryCard: cardComponent } }).RegistryBrowser;
	let props: Record<string, unknown> = { installedIds: options.installedIds ?? [], machines: options.machines ?? [{ id: "worker-1", name: "Fixture Worker" }], activeMachineId: options.activeMachineId === undefined ? "worker-1" : options.activeMachineId, initialQuery: options.initialQuery ?? "", initialKind: options.initialKind ?? "all" };
	let tree: Element;
	const cards = new Map<string, { element: Element; tree: Element }>();
	function renderComponent(component: Component, props: Record<string, unknown>, key: string) {
		frame = frames.get(key) ?? []; frames.set(key, frame); cursor = 0;
		return component(props);
	}
	function render() {
		let passes = 0;
		do {
			dirty = false; tree = renderComponent(browserComponent, props, "browser"); cards.clear();
			for (const node of nodes(tree).filter((node) => node.type === cardComponent)) cards.set(node.props.item.id, { element: node, tree: renderComponent(cardComponent, node.props, node.props.item.id) });
			for (const callback of pendingEffects.splice(0)) callback();
			if (++passes > 12) throw new Error("Registry effects did not settle");
		} while (dirty);
	}
	const field = (label: string) => find(tree, (node) => ["input", "select"].includes(String(node.type)) && node.props["aria-label"] === label);
	const card = (id: string) => { const value = cards.get(id); if (!value) throw new Error(`Missing card ${id}: ${[...cards.keys()]}`); return value; };
	render();
	return {
		fetch, timers, setTimeout, clearTimeout, render, field, card,
		all: () => nodes(tree),
		copy: () => text(tree).replace(/\s+/g, " "),
		ids: () => [...cards.keys()],
		button: (label: string) => button(tree, label),
		cardButton: (id: string, label: string) => button(card(id).tree, label),
		cardCopy: (id: string) => text(card(id).tree).replace(/\s+/g, " "),
		respond: (route: keyof typeof responders, send: Send) => { responders[route] = send; },
		setProps(next: Record<string, unknown>) { props = { ...props, ...next }; render(); },
		change(label: string, value: string) { field(label).props.onChange({ target: { value } }); render(); },
		click(label: string) { activate(tree, label); render(); },
		clickCard(id: string, label: string) { button(card(id).tree, label).props.onClick(); render(); },
		advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) { if (timer.due <= now) { timers.delete(id); timer.callback(); } } render(); },
		async settle() { await new Promise<void>((done) => setImmediate(done)); render(); },
		unmount() { for (const effect of effects) effect.cleanup?.(); },
	};
}

describe("Registry discovery controls (actual TSX)", () => {
	it("invariant_discovery_exposes_all_supported_source_and_kind_filters_with_accessible_names", async () => {
		const ui = mount(); await ui.settle();
		expect(nodes(ui.field("Filter registry source")).filter((node) => node.type === "option").map((node) => node.props.value)).toEqual(["all", "bundled", "skills-sh", "mcp-registry", "npm", "cursor-plugins", "github-repo", "url-manifest"]);
		for (const label of ["All items", "Skills", "MCP servers", "CLIs", "Tools", "Plugins", "Providers", "Sources"]) expect(ui.button(label)).toBeDefined();
		expect(ui.field("Search registry").props.type).toBe("search");
		expect(nodes(ui.field("Sort registry items")).filter((node) => node.type === "option").map((node) => node.props.value)).toEqual(["relevance", "name", "source"]);
		ui.unmount();
	});

	it("invariant_typing_debounces_the_latest_query_and_preserves_active_filters", async () => {
		const ui = mount({ initialQuery: "starting", initialKind: "skill" }); await ui.settle();
		ui.change("Filter registry source", "npm"); await ui.settle();
		ui.change("Search registry", "old query"); ui.advance(200); ui.change("Search registry", "final query");
		expect(ui.timers.size).toBe(1); expect(ui.fetch).toHaveBeenCalledTimes(2);
		ui.advance(349); expect(ui.fetch).toHaveBeenCalledTimes(2);
		ui.advance(1); await ui.settle();
		expect(Object.fromEntries(new URL(ui.fetch.mock.calls.at(-1)![0], "https://fixture.invalid").searchParams)).toEqual({ q: "final query", source: "npm", kind: "skill" });
		ui.unmount();
	});

	it("invariant_an_old_response_cannot_restore_results_after_the_query_changes", async () => {
		const old = deferred<ResponseStub>();
		const ui = mount({ search: () => old.promise });
		const oldSignal = ui.fetch.mock.calls[0][1]!.signal!;
		ui.change("Search registry", "new query");
		expect(oldSignal.aborted).toBe(true);
		old.resolve(response({ items: [item({ id: "obsolete" })], sources: healthy })); await ui.settle();
		expect(ui.ids()).not.toContain("obsolete");
		ui.respond("search", async () => response({ items: [item({ id: "current" })], sources: healthy }));
		ui.advance(350); await ui.settle(); expect(ui.ids()).toEqual(["current"]);
		ui.unmount();
	});

	it("invariant_source_and_kind_changes_cancel_pending_text_searches_and_use_the_current_query", async () => {
		const ui = mount(); await ui.settle();
		ui.change("Search registry", " pending query "); ui.change("Filter registry source", "skills-sh"); await ui.settle();
		expect(ui.timers.size).toBe(0);
		ui.click("MCP servers"); await ui.settle();
		const params = new URL(ui.fetch.mock.calls.at(-1)![0], "https://fixture.invalid").searchParams;
		expect(params.get("q")?.trim()).toBe("pending query"); expect(params.get("source")).toBe("skills-sh"); expect(params.get("kind")).toBe("mcp");
		expect(ui.button("MCP servers").props["aria-pressed"]).toBe(true);
		const requests = ui.fetch.mock.calls.length; ui.advance(500); expect(ui.fetch).toHaveBeenCalledTimes(requests);
		ui.unmount();
	});

	it("invariant_saved_filter_and_sort_apply_only_to_returned_results_without_network_requests", async () => {
		const ui = mount({ installedIds: ["not-returned", "zeta"] }); await ui.settle();
		expect(ui.ids()).toEqual(["alpha", "middle", "zeta"]);
		ui.click("Saved in these results"); expect(ui.ids()).toEqual(["middle", "zeta"]);
		expect(ui.copy()).toMatch(/returned|these results|current results/i);
		ui.change("Sort registry items", "name"); expect(ui.ids()).toEqual(["middle", "zeta"]);
		ui.click("Saved in these results"); ui.change("Sort registry items", "source"); expect(ui.ids()).toEqual(["zeta", "alpha", "middle"]);
		ui.change("Sort registry items", "relevance"); expect(ui.ids()).toEqual(["alpha", "middle", "zeta"]);
		expect(ui.fetch).toHaveBeenCalledOnce(); ui.unmount();
	});

	it.each([
		{ url: "https://github.com/fixture/repository", source: "github-repo" },
		{ url: "https://example.invalid/manifest.json", source: "url-manifest" },
		{ url: "https://example.invalid/github.com/fixture/repository", source: "url-manifest" },
		{ url: "https://github.com.example.invalid/fixture/repository", source: "url-manifest" },
	])("invariant_URL_preview_classifies_by_host_and_does_not_save ($url)", async ({ url, source }) => {
		const ui = mount({ initialKind: "skill" }); await ui.settle();
		ui.click("From URL"); ui.change("Repository or manifest URL", ` ${url} `); ui.click("Preview source"); await ui.settle();
		const params = new URL(ui.fetch.mock.calls.at(-1)![0], "https://fixture.invalid").searchParams;
		expect(params.get("q")).toBe(url); expect(params.get("source")).toBe(source); expect(params.has("kind")).toBe(false);
		expect(ui.button("All items").props["aria-pressed"]).toBe(true);
		expect(ui.fetch.mock.calls.every(([request, init]) => request.startsWith("/api/dashboard/registry/search?") && !init?.method)).toBe(true);
		ui.unmount();
	});

	it.each([
		"https://github.com/fixture/repository.git",
		"https://github.com/fixture/repository/?tab=readme-ov-file#readme",
		"https://github.com/fixture/repository.git?tab=readme-ov-file#readme",
	])("invariant_GitHub_repository_preview_normalizes_transport_suffix_and_page_state (%s)", async (url) => {
		const ui = mount(); await ui.settle();
		ui.click("From URL"); ui.change("Repository or manifest URL", url); ui.click("Preview source"); await ui.settle();
		const params = new URL(ui.fetch.mock.calls.at(-1)![0], "https://fixture.invalid").searchParams;
		expect(params.get("q")).toBe("https://github.com/fixture/repository");
		expect(params.get("source")).toBe("github-repo"); expect(params.has("kind")).toBe(false);
		expect(ui.field("Search registry").props.value).toBe("https://github.com/fixture/repository");
		expect(ui.fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true); ui.unmount();
	});

	it.each([
		"https://github.com/fixture/repository/tree/main",
		"https://github.com/fixture/repository/blob/main/README.md",
	])("invariant_GitHub_subpage_preview_is_rejected_with_repository_root_guidance (%s)", async (url) => {
		const ui = mount(); await ui.settle();
		ui.click("From URL"); ui.change("Repository or manifest URL", url); ui.click("Preview source"); await ui.settle();
		expect(ui.fetch).toHaveBeenCalledOnce(); expect(ui.field("Repository or manifest URL").props.value).toBe(url);
		const error = ui.all().find((node) => node.props.role === "alert");
		expect(error).toBeDefined(); expect(text(error)).toMatch(/repository root|root repository|owner\/repo|owner\/repository/i);
		ui.unmount();
	});

	it.each(["", "not a URL", "http://github.com/fixture/repository", "javascript:alert(1)"])("invariant_invalid_URL_preview_%s_never_fetches_or_closes_the_input", async (value) => {
		const ui = mount(); await ui.settle();
		ui.click("From URL"); ui.change("Repository or manifest URL", value); ui.click("Preview source"); await ui.settle();
		expect(ui.fetch).toHaveBeenCalledOnce();
		expect(ui.field("Repository or manifest URL").props.value).toBe(value);
		expect(ui.all().some((node) => node.props.role === "alert")).toBe(true);
		ui.unmount();
	});

	it("invariant_search_failures_offer_a_retry_without_mutating_the_library", async () => {
		const ui = mount({ search: async () => response({ error: "Fixture search unavailable" }, 503) }); await ui.settle();
		expect(ui.all().some((node) => node.props.role === "alert")).toBe(true);
		ui.respond("search", async () => response({ items: fixtures, sources: healthy }));
		ui.click("Try again"); await ui.settle();
		expect(ui.ids()).toEqual(["alpha", "middle", "zeta"]); expect(ui.fetch).toHaveBeenCalledTimes(2); ui.unmount();
	});

	it("invariant_partial_source_failure_keeps_available_results_and_identifies_the_failed_source", async () => {
		const ui = mount({ items: [fixtures[2]], sources: [healthy[0], { id: "npm", label: "npm", ok: false, count: 0, error: "Fixture source unavailable" }] }); await ui.settle();
		expect(ui.ids()).toEqual(["zeta"]);
		expect(ui.copy()).toMatch(/partial|unavailable|could not/i);
		expect(ui.copy()).toContain("npm"); expect(ui.copy()).toContain("Fixture source unavailable"); ui.unmount();
	});

	it("invariant_all_failed_sources_are_not_reported_as_a_successful_empty_search", async () => {
		const ui = mount({ items: [], sources: [{ id: "npm", label: "npm", ok: false, count: 0, error: "Fixture source unavailable" }] }); await ui.settle();
		expect(ui.ids()).toEqual([]); expect(ui.copy()).toMatch(/unavailable|failed|could not/i);
		expect(ui.copy()).not.toMatch(/no matching items|no results found/i);
		expect(ui.button("Retry search")).toBeDefined(); ui.unmount();
	});

	it("invariant_clear_filters_resets_the_query_source_kind_saved_filter_and_sort", async () => {
		const ui = mount({ initialQuery: "fixture", initialKind: "skill" }); await ui.settle();
		ui.change("Filter registry source", "npm"); await ui.settle();
		ui.click("Saved in these results"); ui.change("Sort registry items", "name"); ui.click("Clear filters"); await ui.settle();
		expect(ui.field("Search registry").props.value).toBe(""); expect(ui.field("Filter registry source").props.value).toBe("all");
		expect(ui.button("All items").props["aria-pressed"]).toBe(true); expect(ui.button("Saved in these results").props["aria-pressed"]).toBe(false);
		expect(ui.field("Sort registry items").props.value).toBe("relevance"); expect(ui.ids()).toEqual(["alpha", "middle", "zeta"]);
		expect(new URL(ui.fetch.mock.calls.at(-1)![0], "https://fixture.invalid").search).toBe(""); ui.unmount();
	});

	it("invariant_unmount_cancels_the_pending_debounce_and_inflight_search", async () => {
		const pending = deferred<ResponseStub>(); const ui = mount({ search: () => pending.promise });
		const signal = ui.fetch.mock.calls[0][1]!.signal!; ui.change("Search registry", "pending");
		expect(ui.timers.size).toBe(1); ui.unmount(); expect(ui.timers.size).toBe(0); expect(signal.aborted).toBe(true);
		pending.resolve(response({ items: [], sources: [] })); await ui.settle(); expect(ui.fetch).toHaveBeenCalledOnce();
	});
});

describe("Registry library and Worker actions (actual TSX)", () => {
	it.each(["save", "remove"] as const)("invariant_cross_card_save_then_%s_serializes_full_library_updates", async (secondAction) => {
		const firstWrite = deferred<void>();
		let persisted = secondAction === "remove" ? ["middle"] : [];
		let activeWrites = 0, maximumActiveWrites = 0, dispatchedWrites = 0;
		const ui = mount(); await ui.settle();
		const send: Send = async (_url, init) => {
			const body = JSON.parse(init!.body!);
			const snapshot = [...persisted];
			activeWrites++; maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
			if (++dispatchedWrites === 1) await firstWrite.promise;
			persisted = init!.method === "DELETE" ? snapshot.filter((id) => id !== body.itemId) : [...snapshot.filter((id) => id !== body.item.id), body.item.id];
			activeWrites--;
			return response(init!.method === "DELETE" ? { ok: true } : saved);
		};
		ui.respond("add", send); ui.respond("remove", send);
		ui.clickCard("alpha", "Save to library");
		ui.clickCard(secondAction === "remove" ? "middle" : "zeta", secondAction === "remove" ? "Remove from library" : "Save to library");
		await ui.settle();
		expect(dispatchedWrites).toBe(1); expect(activeWrites).toBe(1);
		expect(ui.cardCopy(secondAction === "remove" ? "middle" : "zeta")).toMatch(secondAction === "remove" ? /removing/i : /saving/i);
		firstWrite.resolve(); await ui.settle();
		expect(dispatchedWrites).toBe(2); expect(maximumActiveWrites).toBe(1); expect(activeWrites).toBe(0);
		expect(persisted).toEqual(secondAction === "remove" ? ["alpha"] : ["alpha", "zeta"]);
		expect(ui.cardButton("alpha", "Remove from library")).toBeDefined();
		expect(ui.cardButton(secondAction === "remove" ? "middle" : "zeta", secondAction === "remove" ? "Save to library" : "Remove from library")).toBeDefined();
		expect(ui.fetch.mock.calls.filter(([, init]) => init?.method).map(([, init]) => init!.method)).toEqual(["POST", secondAction === "remove" ? "DELETE" : "POST"]); ui.unmount();
	});

	it.each(["http", "network"])("invariant_first_write_%s_failure_does_not_poison_queued_library_saves", async (failure) => {
		const firstWrite = deferred<void>();
		const persisted: string[] = [];
		let dispatchedWrites = 0;
		const ui = mount(); await ui.settle();
		ui.respond("add", async (_url, init) => {
			if (++dispatchedWrites === 1) {
				await firstWrite.promise;
				if (failure === "network") throw new Error("Fixture first write unavailable");
				return response({ error: "Fixture first write rejected" }, 503);
			}
			persisted.push(JSON.parse(init!.body!).item.id);
			return response(saved);
		});
		ui.clickCard("alpha", "Save to library"); ui.clickCard("zeta", "Save to library"); await ui.settle();
		expect(dispatchedWrites).toBe(1);
		firstWrite.resolve(); await ui.settle();
		expect(dispatchedWrites).toBe(2); expect(persisted).toEqual(["zeta"]);
		expect(ui.cardButton("alpha", "Save to library").props.disabled).not.toBe(true);
		expect(nodes(ui.card("alpha").tree).some((node) => node.props.role === "alert")).toBe(true);
		expect(ui.cardButton("zeta", "Remove from library").props.disabled).not.toBe(true);
		ui.clickCard("alpha", "Save to library"); await ui.settle();
		expect(persisted).toEqual(["zeta", "alpha"]); expect(ui.cardButton("alpha", "Remove from library")).toBeDefined(); ui.unmount();
	});

	it("invariant_installation_keeps_its_card_visible_and_blocks_same_tick_search_and_filter_changes", async () => {
		const pending = deferred<ResponseStub>();
		const ui = mount({ initialQuery: "fixture", machines: [{ id: "worker-1", name: "Fixture Worker" }, { id: "worker-2", name: "Other fixture Worker" }] }); await ui.settle();
		ui.respond("add", () => pending.promise);
		const search = ui.field("Search registry").props.onChange;
		const source = ui.field("Filter registry source").props.onChange;
		const kind = ui.button("Skills").props.onClick;
		const savedFilter = ui.button("Saved in these results").props.onClick;
		const sort = ui.field("Sort registry items").props.onChange;
		const target = ui.all().find((node) => node.props.id === "registry-worker")!.props.onChange;
		const preview = ui.button("From URL").props.onClick;
		const clear = ui.button("Clear filters").props.onClick;
		ui.cardButton("alpha", "Run on selected Worker").props.onClick();
		search({ target: { value: "different" } }); source({ target: { value: "npm" } }); kind(); savedFilter();
		sort({ target: { value: "name" } }); target({ target: { value: "worker-2" } }); preview(); clear(); ui.render(); await ui.settle();
		expect(ui.fetch).toHaveBeenCalledTimes(2); expect(ui.timers.size).toBe(0);
		expect(ui.field("Search registry").props).toMatchObject({ value: "fixture", disabled: true });
		expect(ui.field("Filter registry source").props).toMatchObject({ value: "all", disabled: true });
		expect(ui.button("Saved in these results").props).toMatchObject({ "aria-pressed": false, disabled: true });
		expect(ui.field("Sort registry items").props).toMatchObject({ value: "relevance", disabled: true });
		expect(ui.all().find((node) => node.props.id === "registry-worker")!.props).toMatchObject({ value: "worker-1", disabled: true });
		expect(ui.button("From URL").props).toMatchObject({ "aria-expanded": false, disabled: true });
		expect(ui.ids()).toContain("alpha"); expect(ui.cardButton("alpha", "Installing…").props.disabled).toBe(true);
		pending.resolve(response({ ...saved, status: "command_succeeded", installOk: true, machineId: "worker-1", installLog: "Fixture install completed." }));
		await ui.settle(); expect(ui.cardCopy("alpha")).toContain("Fixture install completed.");
		expect(ui.field("Search registry").props.disabled).toBe(false); ui.unmount();
	});

	it("invariant_a_late_search_response_cannot_restore_removed_library_membership", async () => {
		const pendingRemoval = deferred<ResponseStub>();
		const pendingSearch = deferred<ResponseStub>();
		const ui = mount({ items: [item({ installed: true })], installedIds: ["alpha"] }); await ui.settle();
		ui.respond("remove", () => pendingRemoval.promise);
		ui.clickCard("alpha", "Remove from library");
		ui.respond("search", () => pendingSearch.promise); ui.change("Search registry", "reload"); ui.advance(350);
		pendingRemoval.resolve(response({ ok: true })); await ui.settle();
		pendingSearch.resolve(response({ items: [item({ installed: true })], sources: healthy })); await ui.settle();
		expect(ui.cardButton("alpha", "Save to library")).toBeDefined();
		ui.click("Saved in these results"); expect(ui.ids()).toEqual([]); ui.unmount();
	});

	it("invariant_saving_changes_library_membership_without_running_a_command", async () => {
		const ui = mount(); await ui.settle();
		ui.clickCard("alpha", "Save to library"); await ui.settle();
		const [url, init] = ui.fetch.mock.calls.at(-1)!;
		expect(url).toBe("/api/dashboard/registry/add"); expect(init?.method).toBe("POST");
		expect(JSON.parse(init!.body!)).toMatchObject({ item: { id: "alpha" }, install: false, machineId: null });
		expect(ui.cardButton("alpha", "Remove from library")).toBeDefined();
		expect(ui.cardCopy("alpha")).toContain("No command was run");
		expect(ui.cardCopy("alpha")).not.toMatch(/command succeeded|installed on/i);
		ui.click("Saved in these results"); expect(ui.ids()).toEqual(["alpha", "middle"]); ui.unmount();
	});

	it.each([
		{ action: "save", label: "Save to library", pending: /saving/i, installed: false },
		{ action: "remove", label: "Remove from library", pending: /removing/i, installed: true },
		{ action: "install", label: "Run on selected Worker", pending: /installing/i, installed: false },
	])("invariant_action_is_single_flight_and_locks_competing_card_actions ($action)", async ({ action, label, pending: pendingLabel, installed }) => {
		const pending = deferred<ResponseStub>();
		const ui = mount({ items: [item({ installed })] }); await ui.settle();
		ui.respond(action === "remove" ? "remove" : "add", () => pending.promise);
		const start = ui.cardButton("alpha", label).props.onClick;
		const other = ui.cardButton("alpha", action === "install" ? "Save to library" : "Run on selected Worker").props.onClick;
		start(); start(); other(); ui.render(); await ui.settle();
		expect(ui.fetch).toHaveBeenCalledTimes(2);
		expect(ui.cardCopy("alpha")).toMatch(pendingLabel);
		expect(nodes(ui.card("alpha").tree).filter((node) => node.type === "button").every((node) => node.props.disabled)).toBe(true);
		pending.resolve(response(action === "remove" ? { ok: true } : action === "install" ? { ...saved, status: "command_succeeded", installOk: true, machineId: "worker-1", installLog: "Fixture command completed. Runtime access not verified." } : saved));
		await ui.settle();
		expect(ui.cardButton("alpha", action === "remove" ? "Save to library" : "Remove from library").props.disabled).not.toBe(true);
		expect(ui.cardButton("alpha", "Run on selected Worker").props.disabled).not.toBe(true); ui.unmount();
	});

	it.each(["http", "network", "malformed"])("invariant_a_%s_save_failure_does_not_claim_library_membership", async (failure) => {
		const ui = mount({ items: [item()] }); await ui.settle();
		ui.respond("add", async () => {
			if (failure === "network") throw new Error("Fixture save response lost");
			return failure === "http" ? response({ error: "Fixture save rejected" }, 503) : response({ ok: true });
		});
		ui.clickCard("alpha", "Save to library"); await ui.settle();
		expect(ui.cardButton("alpha", "Save to library").props.disabled).not.toBe(true);
		expect(nodes(ui.card("alpha").tree).some((node) => node.props.role === "alert")).toBe(true);
		ui.click("Saved in these results"); expect(ui.ids()).toEqual([]); ui.unmount();
	});

	it("invariant_rejected_removal_preserves_membership_and_successful_removal_only_sends_the_item_id", async () => {
		const ui = mount({ items: [item({ installed: true })] }); await ui.settle();
		ui.respond("remove", async () => response({ error: "Fixture removal rejected" }, 503));
		ui.clickCard("alpha", "Remove from library"); await ui.settle();
		expect(ui.cardButton("alpha", "Remove from library")).toBeDefined(); expect(ui.cardCopy("alpha")).toContain("Fixture removal rejected");
		ui.respond("remove", async () => response({ ok: true })); ui.clickCard("alpha", "Remove from library"); await ui.settle();
		const [url, init] = ui.fetch.mock.calls.at(-1)!;
		expect(url).toBe("/api/dashboard/registry/remove"); expect(init?.method).toBe("DELETE"); expect(JSON.parse(init!.body!)).toEqual({ itemId: "alpha" });
		expect(ui.cardButton("alpha", "Save to library")).toBeDefined(); ui.unmount();
	});

	it.each([
		{ name: "unselected", activeMachineId: null, machines: [{ id: "worker-1", name: "Fixture Worker" }] },
		{ name: "missing", activeMachineId: "missing", machines: [{ id: "worker-1", name: "Fixture Worker" }] },
		{ name: "archived", activeMachineId: "worker-1", machines: [{ id: "worker-1", name: "Fixture Worker", archived: true }] },
	])("invariant_unavailable_target_cannot_run_a_command_even_if_its_disabled_callback_is_invoked ($name)", async (options) => {
		const ui = mount({ ...options, items: [item()] }); await ui.settle();
		expect(ui.cardButton("alpha", "Run on selected Worker").props.disabled).toBe(true);
		ui.clickCard("alpha", "Run on selected Worker"); await ui.settle(); expect(ui.fetch).toHaveBeenCalledOnce();
		expect(ui.cardButton("alpha", "Save to library").props.disabled).not.toBe(true); ui.unmount();
	});

	it("invariant_a_previously_selected_worker_that_disappears_is_not_a_valid_install_target", async () => {
		const ui = mount({ items: [item()] }); await ui.settle();
		expect(ui.cardButton("alpha", "Run on selected Worker").props.disabled).not.toBe(true);
		ui.setProps({ machines: [] }); expect(ui.cardButton("alpha", "Run on selected Worker").props.disabled).toBe(true);
		await expect(ui.card("alpha").element.props.onAdd(item(), true)).rejects.toThrow(/Worker|target/i);
		expect(ui.fetch).toHaveBeenCalledOnce(); ui.unmount();
	});

	it.each(["mcp", "plugin", "provider", "source"] as const)("invariant_%s_entries_never_expose_a_shell_command_action", async (kind) => {
		const ui = mount({ items: [item({ kind })] }); await ui.settle();
		expect(nodes(ui.card("alpha").tree).some((node) => node.type === "button" && text(node).includes("Run on selected Worker"))).toBe(false);
		expect(ui.cardCopy("alpha")).toMatch(/setup|library entry only/i);
		expect(ui.cardButton("alpha", "Save to library")).toBeDefined(); ui.unmount();
	});

	it.each([
		{ status: "command_succeeded", installOk: true, expected: /command completed|command succeeded/i },
		{ status: "machine_offline", installOk: false, expected: /offline/i },
		{ status: "failed", installOk: false, expected: /failed/i },
		{ status: "manual_setup", installOk: false, expected: /manual setup/i },
	])("invariant_outcome_is_reported_separately_from_saved_library_membership ($status)", async ({ status, installOk, expected }) => {
		const ui = mount({ items: [item()] }); await ui.settle();
		const log = status === "command_succeeded" ? "Fixture command completed; runtime availability is not verified." : `Fixture ${status.replaceAll("_", " ")}. Nothing is queued automatically.`;
		ui.respond("add", async () => response({ ...saved, status, installOk, machineId: "worker-1", installLog: log }));
		expect(nodes(ui.card("alpha").tree).some((node) => node.type === "summary" && text(node).trim() === "Review install command")).toBe(true);
		expect(ui.cardCopy("alpha")).toContain("echo fixture-only");
		ui.clickCard("alpha", "Run on selected Worker"); await ui.settle();
		expect(JSON.parse(ui.fetch.mock.calls.at(-1)![1]!.body!)).toMatchObject({ install: true, machineId: "worker-1" });
		expect(ui.cardButton("alpha", "Remove from library")).toBeDefined();
		expect(ui.cardCopy("alpha")).toMatch(expected); expect(ui.cardCopy("alpha")).toContain(log);
		expect(ui.cardCopy("alpha")).toContain("Fixture Worker");
		expect(ui.cardCopy("alpha")).not.toMatch(/runtime connected|installed and verified/i); ui.unmount();
	});
});
