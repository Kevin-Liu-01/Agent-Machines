import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
type Component = (props: Record<string, any>) => Element;
type ResponsePlan = { status: number; body: unknown } | Error;
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const node = value as Element;
	return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}
function find(tree: Element, predicate: (node: Element) => boolean): Element {
	const found = nodes(tree).find(predicate);
	if (!found) throw new Error(`Expected node missing from ${text(tree)}`);
	return found;
}
function button(tree: Element, label: string) {
	return find(tree, (node) => ["button", "reticle-button"].includes(String(node.type)) && text(node).trim() === label);
}
const settle = () => new Promise<void>((done) => setImmediate(done));

/**
 * Executes real component functions and event callbacks with persistent hook
 * cells. All fetches are mocked and unknown requests fail closed. This checks
 * callback/state contracts, not browser layout or native focus trapping.
 */
function harness() {
	const frames = new Map<string, unknown[]>();
	let frame: unknown[] = [], cursor = 0;
	const effects: Array<() => void | (() => void)> = [];
	const cleanups: Array<() => void> = [];
	const push = vi.fn(), refresh = vi.fn();
	let responsePlan: ResponsePlan = { status: 200, body: { ok: true, bundle: { id: "memory-fixture" } } };
	const request = vi.fn(async (url: string, options?: { method?: string; body?: string }) => {
		if (url === "/api/dashboard/memory" && options?.method !== "POST") return new Response(JSON.stringify({ ok: true, bundles: [] }));
		if (["/api/dashboard/memory", "/api/dashboard/memory/import"].includes(url) && options?.method === "POST") {
			if (responsePlan instanceof Error) throw responsePlan;
			return new Response(JSON.stringify(responsePlan.body), { status: responsePlan.status });
		}
		if (url.startsWith("/api/dashboard/registry/search?")) return new Response(JSON.stringify({ items: [], sources: [] }));
		throw new Error(`Unexpected mocked request: ${url}`);
	});
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const react = {
		useState(initial: unknown) {
			const currentFrame = frame, index = cursor++;
			if (!(index in currentFrame)) currentFrame[index] = typeof initial === "function" ? initial() : initial;
			return [currentFrame[index], (next: unknown) => { currentFrame[index] = typeof next === "function" ? next(currentFrame[index]) : next; }];
		},
		useRef(initial: unknown) {
			const index = cursor++;
			if (!(index in frame)) frame[index] = { current: initial };
			return frame[index];
		},
		useId: () => `test-dialog-title-${cursor++}`,
		useCallback: (callback: unknown) => callback,
		useMemo: (callback: () => unknown) => callback(),
		useEffect(callback: () => void | (() => void)) {
			const index = cursor++;
			if (!(index in frame)) { frame[index] = true; effects.push(callback); }
		},
	};
	function load(file: string, extraExports = "", imports: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
		const module = { exports: {} as Record<string, Component> };
		const source = readFileSync(resolve(process.cwd(), file), "utf8");
		runInNewContext(ts.transpileModule(`${source}\n${extraExports}`, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
		}).outputText, {
			module, exports: module.exports, fetch: request, Error, URLSearchParams, AbortController, setTimeout, clearTimeout, ...globals,
			require: (id: string) => imports[id] ?? (id === "react" ? react
				: id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
					: id === "next/navigation" ? { useRouter: () => ({ push, refresh }) }
						: id === "next/link" ? { default: "a" }
							: id.endsWith("ReticleButton") ? { ReticleButton: "reticle-button" }
								: id.endsWith("DashboardDialog") ? { DashboardDialog: "dashboard-dialog" }
									: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
										: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` })),
		});
		return module.exports;
	}
	function render(component: Component, props: Record<string, unknown> = {}, key = component.name) {
		frame = frames.get(key) ?? [];
		frames.set(key, frame);
		cursor = 0;
		return component(props);
	}
	return {
		load, render, request, push, refresh,
		respond: (plan: ResponsePlan) => { responsePlan = plan; },
		flushEffects: () => { for (const callback of effects.splice(0)) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); } },
		cleanup: () => { for (const cleanup of cleanups.splice(0)) cleanup(); },
	};
}

async function memoryFixture(mode: "new" | "import") {
	const ui = harness();
	const components = ui.load("components/dashboard/MemoryLibrary.tsx", "export { NameModal, ImportModal };");
	let root = ui.render(components.MemoryLibrary);
	ui.flushEffects();
	await settle();
	root = ui.render(components.MemoryLibrary);
	button(root, mode === "new" ? "New bundle" : "Import").props.onClick();
	let modal: Element;
	function draw() {
		root = ui.render(components.MemoryLibrary);
		const child = find(root, (node) => node.type === components[mode === "new" ? "NameModal" : "ImportModal"]);
		modal = ui.render(child.type as Component, child.props, mode);
		return modal;
	}
	draw();
	return {
		...ui, draw,
		root: () => root,
		field: (id: string) => find(modal, (node) => node.props.id === id),
		change(id: string, value: string) { find(modal, (node) => node.props.id === id).props.onChange({ target: { value } }); draw(); },
		async submit() { button(modal, mode === "new" ? "Create" : "Import").props.onClick(); await settle(); return draw(); },
	};
}

describe("memory save and import failures (actual TSX)", () => {
	it.each(["new", "import"] as const)("keeps the %s dialog and user input after a server rejection, then routes a successful retry exactly once", async (mode) => {
		const ui = await memoryFixture(mode);
		const nameId = mode === "new" ? "memory-name" : "import-name";
		const instructions = "# Existing instructions\n\nKeep my whitespace.  \n";
		ui.change(nameId, "  My review memory  ");
		if (mode === "import") ui.change("import-text", instructions);
		ui.respond({ status: 422, body: { ok: false, error: "Storage rejected this save. Retry when available." } });
		let modal = await ui.submit();
		expect(modal.type).toBe("dashboard-dialog");
		expect(modal.props.busy).toBe(false);
		expect(ui.field(nameId).props.value).toBe("  My review memory  ");
		if (mode === "import") expect(ui.field("import-text").props.value).toBe(instructions);
		expect(text(find(modal, (node) => node.props.role === "alert"))).toBe("Storage rejected this save. Retry when available.");
		expect(ui.push).not.toHaveBeenCalled();
		expect(button(modal, mode === "new" ? "Create" : "Import").props.disabled).toBe(false);
		const savedRequests = ui.request.mock.calls.filter(([, options]) => options?.method === "POST");
		expect(savedRequests).toHaveLength(1);
		expect(savedRequests[0][0]).toBe(mode === "new" ? "/api/dashboard/memory" : "/api/dashboard/memory/import");
		expect(JSON.parse(savedRequests[0][1]!.body!)).toEqual(mode === "new" ? { name: "My review memory" } : { name: "My review memory", text: instructions });
		ui.respond({ status: 200, body: { ok: true, bundle: { id: "memory-saved-123" } } });
		modal = await ui.submit();
		expect(ui.push).toHaveBeenCalledExactlyOnceWith("/dashboard/memory/memory-saved-123");
		expect(nodes(modal).some((node) => node.props.role === "alert")).toBe(false);
	});

	it.each(["new", "import"] as const)("handles a network failure in %s without navigation or losing input", async (mode) => {
		const ui = await memoryFixture(mode);
		const id = mode === "new" ? "memory-name" : "import-text";
		ui.change(id, "Instructions I must not lose");
		ui.respond(new Error("Network is unavailable"));
		const modal = await ui.submit();
		expect(modal.type).toBe("dashboard-dialog");
		expect(ui.field(id).props.value).toBe("Instructions I must not lose");
		expect(text(find(modal, (node) => node.props.role === "alert"))).toBe("Network is unavailable");
		expect(ui.push).not.toHaveBeenCalled();
	});

	it.each((["new", "import"] as const).flatMap((mode) => [
		{ mode, body: { ok: true } },
		{ mode, body: { ok: true, bundle: {} } },
		{ mode, body: { ok: true, bundle: { id: "" } } },
		{ mode, body: { ok: true, bundle: { id: 123 } } },
	]))("rejects a success-shaped $mode response without a bundle identity", async ({ mode, body }) => {
		const ui = await memoryFixture(mode);
		const id = mode === "new" ? "memory-name" : "import-text";
		ui.change(id, "Retained input");
		ui.respond({ status: 200, body });
		const modal = await ui.submit();
		expect(text(find(modal, (node) => node.props.role === "alert"))).toContain("Your input is still here");
		expect(ui.field(id).props.value).toBe("Retained input");
		expect(ui.push).not.toHaveBeenCalled();
	});

	it("disables blank create/import submissions and uses labelled instruction fields", async () => {
		const create = await memoryFixture("new");
		create.change("memory-name", "   ");
		expect(button(create.draw(), "Create").props.disabled).toBe(true);
		create.field("memory-name").props.onKeyDown({ key: "Enter" });
		expect(create.request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
		const imported = await memoryFixture("import");
		imported.change("import-text", " \n  ");
		const modal = imported.draw();
		expect(button(modal, "Import").props.disabled).toBe(true);
		expect(text(find(modal, (node) => node.type === "label" && node.props.htmlFor === "import-text"))).toBe("Instructions");
	});
});

function searchableFixture(file: string, exported: string, props: Record<string, unknown>, extraExports = "") {
	const ui = harness();
	const search = ui.load("components/dashboard/LibrarySearch.tsx").LibrarySearch;
	const components = ui.load(file, extraExports, { "./LibrarySearch": { LibrarySearch: search } });
	let tree = ui.render(components[exported], props);
	const draw = () => { tree = ui.render(components[exported], props); return tree; };
	const searchTree = () => ui.render(search, find(tree, (node) => node.type === search).props, "search");
	return {
		...ui, components, draw,
		search(query: string) { find(searchTree(), (node) => node.type === "input").props.onChange({ target: { value: query } }); return draw(); },
		clear() { find(searchTree(), (node) => node.type === "button" && String(node.props["aria-label"]).startsWith("Clear ")).props.onClick(); return draw(); },
		searchTree,
	};
}

const servers = [
	{ name: "Acme Docs / Search", owner: "Acme Team", source: "acme-package", transport: "stdio", link: "https://example.com/docs", tools: [{ name: "find_document", title: "Find documents", description: "Search contracts and invoices" }] },
	{ name: "Source Control", owner: "Engineering", source: "git-server", transport: "http", tools: [{ name: "list_branches", title: "Repository branches", description: "List git refs" }] },
];

describe("MCP search, clear, and registry handoff", () => {
	it.each(["  ACME TEAM  ", "find_document", "Find documents", "invoices", "acme-package"])("finds a server by %s without a network request", (query) => {
		const ui = searchableFixture("components/dashboard/McpLibrary.tsx", "McpLibrary", { servers });
		let tree = ui.search(query);
		expect(nodes(tree).filter((node) => node.type === "details")).toHaveLength(1);
		expect(text(tree)).toContain("Acme Docs / Search");
		expect(text(tree)).not.toContain("Source Control");
		expect(text(find(tree, (node) => node.props.role === "status")).replace(/\s+/g, " ")).toContain("1 of 2 servers");
		tree = ui.clear();
		expect(nodes(tree).filter((node) => node.type === "details")).toHaveLength(2);
		expect(find(ui.searchTree(), (node) => node.type === "input").props.value).toBe("");
		expect(nodes(ui.searchTree()).some((node) => node.type === "button")).toBe(false);
		expect(ui.request).not.toHaveBeenCalled();
	});

	it("keeps an encoded server name and MCP kind in the review handoff", async () => {
		const ui = searchableFixture("components/dashboard/McpLibrary.tsx", "McpLibrary", { servers });
		const tree = ui.draw();
		const link = find(tree, (node) => node.type === "a" && String(node.props.href).includes("&q="));
		expect(text(link).trim()).toBe("Review setup");
		expect(link.props.href).toBe("/dashboard/registry?kind=mcp&q=Acme%20Docs%20%2F%20Search");
		const page = ui.load("app/dashboard/registry/page.tsx", "", {
			"@/lib/user-config/clerk": { getUserConfigForRequest: async () => ({ customLoadout: [{ id: "owned-entry" }], machines: [{ id: "owned-machine", name: "Owned" }, { id: "archived-machine", name: "Archived", archived: true }], activeMachineId: "owned-machine" }) },
		});
		const params = Object.fromEntries(new URL(link.props.href, "https://fixture.invalid").searchParams);
		const route = await page.default({ searchParams: Promise.resolve(params) });
		const browser = find(route, (node) => node.props.initialKind === "mcp");
		expect(browser.props).toMatchObject({ initialQuery: servers[0].name, initialKind: "mcp", installedIds: ["owned-entry"], activeMachineId: "owned-machine", machines: [{ id: "owned-machine", name: "Owned" }] });
		const registry = ui.load("components/dashboard/RegistryBrowser.tsx");
		ui.render(registry.RegistryBrowser, browser.props);
		ui.flushEffects();
		await settle();
		expect(ui.request).toHaveBeenCalledTimes(1);
		const requestUrl = new URL(ui.request.mock.calls[0][0], "https://fixture.invalid");
		expect(requestUrl.pathname).toBe("/api/dashboard/registry/search");
		expect(requestUrl.searchParams.get("q")).toBe(servers[0].name);
		expect(requestUrl.searchParams.get("kind")).toBe("mcp");
		ui.cleanup();
	});

	it("distinguishes a search miss from an empty catalog and retains the add destination", () => {
		const ui = searchableFixture("components/dashboard/McpLibrary.tsx", "McpLibrary", { servers });
		expect(text(ui.search("no-such-server"))).toContain("No matching servers");
		expect(find(ui.draw(), (node) => node.type === "a" && text(node).includes("Add MCP server")).props.href).toBe("/dashboard/registry?kind=mcp");
		const empty = searchableFixture("components/dashboard/McpLibrary.tsx", "McpLibrary", { servers: [] });
		expect(text(empty.draw())).toContain("Connect your tools");
	});
});

const skills = [
	{ slug: "code-review", name: "Code review", description: "Inspect patches for regressions", category: "engineering", tags: [], bytes: 2048 },
	{ slug: "research-notes", name: "Research notes", description: "Summarize collected sources", category: "content", tags: [], bytes: 1024 },
];
const customSkills = [
	{ id: "custom-skill:custom/runbook", name: "Operations runbook", description: "Recover a paused service", kind: "skill", enabled: true },
	{ id: "custom-skill:custom/disabled", name: "Disabled skill", description: "Never show this entry", kind: "skill", enabled: false },
	{ id: "custom-tool", name: "Not a skill", description: "A different entry kind", kind: "tool", enabled: true },
];

describe("skill search and category controls", () => {
	it("combines search/category filters and clears only the query", () => {
		const ui = searchableFixture("components/dashboard/SkillsBrowser.tsx", "SkillsBrowser", { skills, categories: ["engineering", "content"], customSkills }, "export { SkillCard, CustomSkillCard, Chip };");
		const cards = (tree: Element) => nodes(tree).filter((node) => node.props.skill || node.props.entry);
		expect(cards(ui.draw())).toHaveLength(3);
		let tree = ui.search("  REGRESSIONS  ");
		expect(cards(tree).map((node) => node.props.skill?.slug)).toEqual(["code-review"]);
		const chip = find(tree, (node) => node.props.label === "content (1)");
		chip.props.onClick();
		tree = ui.draw();
		expect(cards(tree)).toHaveLength(0);
		expect(text(tree)).toContain("No skills match this search and category");
		tree = ui.clear();
		expect(cards(tree).map((node) => node.props.skill?.slug)).toEqual(["research-notes"]);
		expect(find(tree, (node) => node.props.label === "content (1)").props.active).toBe(true);
		const card = ui.render(ui.components.SkillCard, cards(tree)[0].props);
		expect(card.props.href).toBe("/dashboard/skills/research-notes");
		expect(ui.request).not.toHaveBeenCalled();
	});

	it("searches enabled custom skills and retains the add-success refresh callback", () => {
		const ui = searchableFixture("components/dashboard/SkillsBrowser.tsx", "SkillsBrowser", { skills, categories: ["engineering", "content"], customSkills });
		let tree = ui.draw();
		find(tree, (node) => node.props.label === "custom (1)").props.onClick();
		tree = ui.search("PAUSED");
		expect(nodes(tree).filter((node) => node.props.entry).map((node) => node.props.entry.id)).toEqual(["custom-skill:custom/runbook"]);
		expect(nodes(tree).filter((node) => node.props.skill)).toHaveLength(0);
		const addPanel = find(tree, (node) => typeof node.props.onAdded === "function");
		expect(addPanel.props.customSkills.map((entry: { id: string }) => entry.id)).toEqual(["custom-skill:custom/runbook"]);
		addPanel.props.onAdded();
		expect(ui.refresh).toHaveBeenCalledOnce();
		expect(ui.request).not.toHaveBeenCalled();
	});
});

describe("shared native dialog contract", () => {
	it.each([false, true])("prevents native Escape dismissal while busy=%s and exposes the labelled close control", (busy) => {
		const ui = harness(), onClose = vi.fn(), preventDefault = vi.fn();
		const component = ui.load("components/dashboard/DashboardDialog.tsx").DashboardDialog;
		const tree = ui.render(component, { title: "Save memory", children: "Body", onClose, busy });
		expect(tree.type).toBe("dialog");
		expect(tree.props["aria-busy"]).toBe(busy);
		expect(find(tree, (node) => node.type === "h2").props.id).toBe(tree.props["aria-labelledby"]);
		const close = find(tree, (node) => node.props["aria-label"] === "Close dialog");
		expect(close.props.disabled).toBe(busy);
		tree.props.onCancel({ preventDefault });
		expect(preventDefault).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledTimes(busy ? 0 : 1);
	});

	it.each([false, true])("opens/closes the native dialog and restores a still-connected trigger (connected=%s)", (connected) => {
		const ui = harness();
		class FakeElement { isConnected = connected; focus = vi.fn(); }
		const trigger = new FakeElement();
		const node = { showModal: vi.fn(), close: vi.fn() };
		const component = ui.load("components/dashboard/DashboardDialog.tsx", "", {}, { document: { activeElement: trigger }, HTMLElement: FakeElement }).DashboardDialog;
		const tree = ui.render(component, { title: "Save memory", children: "Body", onClose: vi.fn() });
		tree.props.ref.current = node;
		ui.flushEffects();
		expect(node.showModal).toHaveBeenCalledOnce();
		ui.cleanup();
		expect(node.close).toHaveBeenCalledOnce();
		expect(trigger.focus).toHaveBeenCalledTimes(connected ? 1 : 0);
	});
});
