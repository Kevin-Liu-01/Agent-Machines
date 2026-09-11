import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import type { CommandPalette } from "@/components/dashboard/CommandPalette";
import { SearchOutline } from "@/components/ui/icons";
import { AGENT_LABEL } from "@/lib/user-config/schema";

const source = readFileSync(resolve(process.cwd(), "components/dashboard/CommandPalette.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
type Element = React.ReactElement<Record<string, unknown>>;
type Handler = (event?: unknown) => void;
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...elements(value.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join("");
	if (React.isValidElement<Record<string, unknown>>(value)) return text(value.props.children);
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function invoke(node: Element, eventName: string, event?: unknown) {
	(node.props[eventName] as Handler)(event);
}
const settle = () => new Promise<void>((done) => setImmediate(done));

// Run the actual TSX with minimal hook/DOM ports. Browser-native dialog trapping
// still requires real-browser verification; this checks showModal, focus targets,
// cancellation, event cleanup and asynchronous request lifetimes without a DOM dependency.
function palette({ pathname = "/dashboard/agents", compact = false } = {}) {
	const states: unknown[] = [];
	const refs: Array<{ current: FakeElement | null }> = [];
	const effects: Array<{ deps: unknown[]; cleanup?: void | (() => void); callback: () => void | (() => void) }> = [];
	const pending = new Set<number>();
	const listeners = new Map<string, Handler>();
	const dom = new Map<object, FakeElement>();
	const unreferencedDom = new Map<unknown, FakeElement>();
	let stateIndex = 0, refIndex = 0, effectIndex = 0, dirty = false;
	class FakeElement {
		isConnected = true;
		open = false;
		focus = vi.fn(() => { document.activeElement = this; });
		showModal = vi.fn(() => { this.open = true; });
		close = vi.fn(() => { this.open = false; });
		scrollIntoView = vi.fn();
	}
	const priorFocus = new FakeElement();
	const document = { activeElement: priorFocus, body: {} };
	const window = {
		addEventListener: vi.fn((name: string, handler: Handler) => { listeners.set(name, handler); }),
		removeEventListener: vi.fn((name: string, handler: Handler) => {
			expect(listeners.get(name)).toBe(handler); listeners.delete(name);
		}),
	};
	const requests: Array<(value: unknown) => void> = [];
	const fetch = vi.fn(() => new Promise<unknown>((done) => { requests.push(done); }));
	const push = vi.fn();
	const module = { exports: {} as { CommandPalette: typeof CommandPalette } };
	runInNewContext(compiled, {
		module, exports: module.exports, window, document, HTMLElement: FakeElement, AbortController, fetch,
		require: (id: string) => {
			if (id === "react/jsx-runtime") return jsxRuntime;
			if (id === "react") return {
				useState(initial: unknown) {
					const index = stateIndex++;
					if (!(index in states)) states[index] = initial;
					return [states[index], (next: unknown) => {
						const value = typeof next === "function" ? next(states[index]) : next;
						if (!Object.is(value, states[index])) { states[index] = value; dirty = true; }
					}];
				},
				useRef: (initial: null) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
				useId: () => "palette-fixture",
				useMemo: (callback: () => unknown) => callback(),
				useCallback: (callback: unknown) => callback,
				useEffect(callback: () => void | (() => void), deps: unknown[]) {
					const index = effectIndex++;
					if (!effects[index] || deps.some((dep, i) => !Object.is(dep, effects[index].deps[i]))) {
						effects[index] = { ...effects[index], deps, callback }; pending.add(index);
					}
				},
			};
			if (id === "react-dom") return { createPortal: (child: unknown) => child };
			if (id === "next/navigation") return { usePathname: () => pathname, useRouter: () => ({ push }) };
			if (id.endsWith("/cn")) return { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") };
			if (id.endsWith("/icons")) return { SearchOutline };
			if (id.endsWith("/schema")) return { AGENT_LABEL };
			throw new Error(`Unexpected import: ${id}`);
		},
	});
	let tree: Element;
	function render() {
		stateIndex = 0; refIndex = 0; effectIndex = 0;
		tree = module.exports.CommandPalette({ compact, className: "palette-slot" }) as Element;
	}
	function flush() {
		for (let pass = 0; pass < 20; pass += 1) {
			dirty = false; render();
			refs.forEach((ref) => { ref.current = null; });
			for (const node of elements(tree)) {
				const ref = node.props.ref as { current: FakeElement | null } | undefined;
				if (!ref || typeof node.type !== "string") continue;
				if (!dom.has(ref)) dom.set(ref, new FakeElement());
				ref.current = dom.get(ref)!;
			}
			const queued = [...pending]; pending.clear();
			for (const index of queued) {
				effects[index].cleanup?.(); effects[index].cleanup = effects[index].callback();
			}
			if (!dirty) return;
		}
		throw new Error("Palette did not settle");
	}
	render();
	const nodes = () => elements(tree);
	const trigger = () => nodes().find((node) => node.props["aria-haspopup"] === "dialog")!;
	const input = () => nodes().find((node) => node.type === "input")!;
	const dialog = () => nodes().find((node) => node.type === "dialog")!;
	const options = () => nodes().filter((node) => node.props.role === "option");
	return {
		flush, nodes, trigger, input, dialog, options, push, fetch, requests, priorFocus, document, window, listeners,
		markup: () => renderToStaticMarkup(tree),
		domFor: (node: Element) => {
			const ref = node.props.ref as { current: FakeElement } | undefined;
			if (ref) return ref.current;
			const key = node.props.id ?? node.props["aria-label"] ?? node.type;
			if (!unreferencedDom.has(key)) unreferencedDom.set(key, new FakeElement());
			return unreferencedDom.get(key)!;
		},
		open() { invoke(trigger(), "onClick"); flush(); },
		query(value: string) { invoke(input(), "onChange", { target: { value } }); flush(); },
		key(key: string, overrides = {}) {
			const event = { key, preventDefault: vi.fn(), nativeEvent: { isComposing: false }, ...overrides };
			invoke(input(), "onKeyDown", event); flush(); return event;
		},
		dialogKey(key: string, overrides = {}) {
			const event = { key, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, preventDefault: vi.fn(), nativeEvent: { isComposing: false }, ...overrides };
			(dialog().props.onKeyDown as Handler | undefined)?.(event); flush(); return event;
		},
		shortcut(overrides = {}) {
			const event = { key: "k", metaKey: true, ctrlKey: false, altKey: false, isComposing: false, repeat: false, preventDefault: vi.fn(), ...overrides };
			listeners.get("keydown")?.(event); flush(); return event;
		},
		async respond(payload: unknown, index = 0) {
			requests[index]({ ok: true, json: async () => payload }); await settle(); flush();
		},
		unmount() { effects.forEach((effect) => effect.cleanup?.()); refs.forEach((ref) => { ref.current = null; }); },
	};
}

const machine = (id: string, name: string, archived = false) => ({ id, name, agentKind: "codex", providerLabel: "Daytona", archived, live: { ok: true, state: "stopped" } });

describe("dashboard command palette", () => {
	it("server-renders a compact accessible trigger with a hollow icon and visible shortcut, without fetching", () => {
		const app = palette();
		expect(app.markup()).toContain('data-icon-weight="regular"');
		expect(app.markup()).toContain("⌘K");
		expect(app.markup()).toContain("Search…");
		expect(app.trigger().props).toMatchObject({ "aria-expanded": false, "aria-haspopup": "dialog", "aria-keyshortcuts": "Meta+K Control+K" });
		expect(app.trigger().props.className).toContain("min-w-0");
		expect(app.trigger().props.className).toContain("h-9");
		expect(app.trigger().props.className).toContain("palette-slot");
		const shortcut = app.nodes().find((node) => node.type === "kbd")!;
		expect(shortcut.props.className).not.toContain("hidden");
		expect(app.dialog()).toBeUndefined();
		expect(app.fetch).not.toHaveBeenCalled();
		const compact = palette({ compact: true });
		expect(compact.nodes().find((node) => node.type === "span" && text(node) === "Search…")!.props.className).toMatch(/(?:^| )hidden(?: |$)/);
	});

	it("opens a native modal with immediate input focus and restores the prior focus on Escape", () => {
		const app = palette(); app.flush(); app.open();
		const dialog = app.domFor(app.dialog());
		expect(dialog.showModal).toHaveBeenCalledTimes(1);
		expect(app.document.activeElement).toBe(app.domFor(app.input()));
		expect(app.dialog().props["aria-modal"]).toBe("true");
		expect(app.trigger().props["aria-controls"]).toBe(app.dialog().props.id);
		app.key("Escape");
		expect(dialog.close).toHaveBeenCalledTimes(1);
		expect(app.document.activeElement).toBe(app.priorFocus);
		expect(app.priorFocus.focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(app.dialog()).toBeUndefined();
		expect(source).not.toMatch(/setTimeout|requestAnimationFrame/);
		app.unmount();
	});

	it("supports Cmd and Ctrl K without repeat, Alt or IME toggles, then removes the same listener", () => {
		const app = palette(); app.flush();
		app.shortcut({ isComposing: true }); app.shortcut({ altKey: true }); app.shortcut({ repeat: true });
		expect(app.dialog()).toBeUndefined();
		expect(app.shortcut().preventDefault).toHaveBeenCalledTimes(1);
		expect(app.dialog()).toBeDefined();
		app.shortcut({ repeat: true }); expect(app.dialog()).toBeDefined();
		app.shortcut({ metaKey: false, ctrlKey: true }); expect(app.dialog()).toBeUndefined();
		app.shortcut({ metaKey: false, ctrlKey: true, key: "K" }); expect(app.dialog()).toBeDefined();
		app.unmount(); expect(app.listeners.size).toBe(0);
		expect(app.window.removeEventListener).toHaveBeenCalledTimes(1);
	});

	it("cycles Tab and Shift+Tab deterministically between the input and close button", () => {
		const app = palette(); app.flush(); app.open();
		const input = app.domFor(app.input());
		const closeButton = app.domFor(app.nodes().find((node) => node.props["aria-label"] === "Close search (Esc)")!);
		for (const shiftKey of [false, true]) {
			input.focus();
			expect(app.dialogKey("Tab", { shiftKey }).preventDefault).toHaveBeenCalledTimes(1);
			expect(app.document.activeElement).toBe(closeButton);
			expect(app.dialogKey("Tab", { shiftKey }).preventDefault).toHaveBeenCalledTimes(1);
			expect(app.document.activeElement).toBe(input);
		}
		expect(app.nodes().find((node) => node.props.role === "listbox")!.props.tabIndex).toBe(-1);
		app.unmount();
	});

	it("returns mouse-focused results or the dialog itself to the two-control tab cycle", () => {
		const app = palette(); app.flush(); app.open();
		const input = app.domFor(app.input());
		const closeButton = app.domFor(app.nodes().find((node) => node.props["aria-label"] === "Close search (Esc)")!);
		for (const outsideCycle of [app.domFor(app.options()[0]), app.domFor(app.dialog())]) {
			outsideCycle.focus(); app.dialogKey("Tab"); expect(app.document.activeElement).toBe(input);
			outsideCycle.focus(); app.dialogKey("Tab", { shiftKey: true }); expect(app.document.activeElement).toBe(closeButton);
		}
		app.unmount();
	});

	it("does not hijack IME input, arrows, Escape or modified browser shortcuts at the dialog boundary", () => {
		const app = palette(); app.flush(); app.open();
		const input = app.domFor(app.input());
		for (const [key, overrides] of [
			["Tab", { nativeEvent: { isComposing: true } }], ["Tab", { ctrlKey: true }],
			["Tab", { metaKey: true }], ["Tab", { altKey: true }],
			["ArrowDown", {}], ["ArrowUp", {}], ["Escape", {}], ["k", { metaKey: true }],
		] as const) {
			expect(app.dialogKey(key, overrides).preventDefault).not.toHaveBeenCalled();
			expect(app.document.activeElement).toBe(input);
		}
		app.key("ArrowDown"); expect(app.options()[1].props["aria-selected"]).toBe(true);
		app.key("Escape"); expect(app.document.activeElement).toBe(app.priorFocus);
		app.unmount();
	});

	it("handles native cancellation, close button and backdrop without closing on content clicks", () => {
		const app = palette(); app.flush(); app.open();
		invoke(app.dialog(), "onClick", { target: {}, currentTarget: {} }); app.flush();
		expect(app.dialog()).toBeDefined();
		const preventDefault = vi.fn(); invoke(app.dialog(), "onCancel", { preventDefault }); app.flush();
		expect(preventDefault).toHaveBeenCalledTimes(1); expect(app.dialog()).toBeUndefined();
		app.open(); invoke(app.nodes().find((node) => node.props["aria-label"] === "Close search (Esc)")!, "onClick"); app.flush();
		expect(app.dialog()).toBeUndefined();
		app.open(); const backdrop = {}; invoke(app.dialog(), "onClick", { target: backdrop, currentTarget: backdrop }); app.flush();
		expect(app.dialog()).toBeUndefined(); app.unmount();
	});

	it("returns focus to the trigger if the original target was removed, including an open unmount", () => {
		const app = palette(); app.flush(); app.open(); app.priorFocus.isConnected = false;
		const trigger = app.domFor(app.trigger()); app.key("Escape");
		expect(app.document.activeElement).toBe(trigger);
		app.open(); const dialog = app.domFor(app.dialog()); app.unmount();
		expect(dialog.close).toHaveBeenCalled(); expect(app.document.activeElement).toBe(trigger);
	});

	it("keeps machine reads lazy, aborts on close and ignores stale responses from a prior opening", async () => {
		const app = palette(); app.flush(); expect(app.fetch).not.toHaveBeenCalled(); app.open();
		const args = app.fetch.mock.calls[0] as unknown as [string, { cache: string; signal: AbortSignal; method?: string }];
		expect(args[0]).toBe("/api/dashboard/machines"); expect(args[1].cache).toBe("no-store");
		expect(args[1].method).toBeUndefined(); expect(args[1].signal.aborted).toBe(false);
		app.key("Escape"); expect(args[1].signal.aborted).toBe(true); app.open();
		await app.respond({ ok: true, machines: [machine("fresh", "Fresh Worker")], activeMachineId: "fresh" }, 1);
		await app.respond({ ok: true, machines: [machine("stale", "Stale Worker")], activeMachineId: "stale" }, 0);
		expect(app.options().map(text)).toContainEqual(expect.stringContaining("Fresh Worker"));
		expect(app.options().map(text).join(" ")).not.toContain("Stale Worker");
		app.unmount();
	});

	it("keeps combobox selection coherent through arrows, filtering and no results", () => {
		const app = palette(); app.flush(); app.open();
		const selectedId = () => app.options().find((node) => node.props["aria-selected"])!.props.id;
		expect(app.input().props["aria-activedescendant"]).toBe(selectedId());
		app.key("ArrowDown"); expect(app.input().props["aria-activedescendant"]).toBe(selectedId());
		expect(selectedId()).toBe(app.options()[1].props.id);
		app.key("ArrowUp"); app.key("ArrowUp"); expect(selectedId()).toBe(app.options().at(-1)!.props.id);
		expect(app.options().every((node) => node.props.tabIndex === -1)).toBe(true);
		app.query("no-match-zzzzzz"); expect(app.options()).toHaveLength(0);
		expect(app.input().props["aria-activedescendant"]).toBeUndefined();
		expect(app.nodes().some((node) => node.props.role === "status")).toBe(true);
		app.key("ArrowDown"); app.key("Enter"); expect(app.push).not.toHaveBeenCalled();
		app.query("Settings"); app.key("Enter", { nativeEvent: { isComposing: true } }); expect(app.push).not.toHaveBeenCalled();
		app.key("Enter"); expect(app.push).toHaveBeenCalledWith("/dashboard/settings");
		expect(app.dialog()).toBeUndefined(); app.unmount();
	});

	it("navigates contextual surfaces using the viewed machine instead of the active one", async () => {
		const app = palette({ pathname: "/dashboard/machines/viewed/agents" }); app.flush(); app.open();
		await app.respond({ ok: true, machines: [machine("active", "Active Worker"), machine("viewed", "Viewed Worker"), machine("archived", "Archived Worker", true)], activeMachineId: "active" });
		app.query("termnl"); expect(app.options()).toHaveLength(2);
		expect(app.options().map(text)).toEqual(["TerminalViewed WorkerGo", "TerminalActive machine or fleetGo"]);
		app.key("Enter");
		expect(app.push).toHaveBeenCalledExactlyOnceWith("/dashboard/machines/viewed/terminal");
		app.open(); app.query("Archived Worker"); expect(app.options()).toHaveLength(0);
		app.query("Active Worker"); invoke(app.options().find((node) => text(node).startsWith("Active WorkerCodex"))!, "onClick"); app.flush();
		expect(app.push).toHaveBeenLastCalledWith("/dashboard/machines/active"); app.unmount();
	});

	it("reaches the rail's fleet pages without an active machine and makes Workers library searchable", () => {
		const app = palette(); app.flush();
		for (const [label, href] of [
			["Agent templates", "/dashboard/agents"], ["Agent setups", "/dashboard/agents"], ["Building blocks", "/dashboard/components"],
			["Memory", "/dashboard/agents?tab=memory"], ["Loadouts", "/dashboard/loadout"],
			["Console", "/dashboard/chat"], ["Terminal", "/dashboard/terminal"], ["Logs", "/dashboard/logs"],
			["Sessions", "/dashboard/sessions"], ["Artifacts", "/dashboard/artifacts"],
		]) {
			app.open(); app.query(label); app.key("Enter");
			expect(app.push).toHaveBeenLastCalledWith(href);
		}
		app.open(); app.query("Workers library"); expect(app.options()).toHaveLength(1);
		expect(text(app.options()[0])).toBe("Agent setupsGo"); app.key("Enter");
		expect(app.push).toHaveBeenLastCalledWith("/dashboard/agents");
		app.unmount();
	});

	it("preserves every existing page destination and sends creation to setup without creating resources", () => {
		const app = palette(); app.flush();
		for (const [label, href] of [
			["Overview", "/dashboard"], ["Workspaces", "/dashboard/machines"], ["Insights", "/dashboard/usage"],
			["Benchmarks", "/dashboard/usage?tab=benchmarks"], ["Learning", "/dashboard/usage?tab=benchmarks#learning"],
			["Skills", "/dashboard/registry?tab=skills"], ["MCP servers", "/dashboard/registry?tab=mcps"], ["Automations", "/dashboard/cron"],
			["Toolkit", "/dashboard/registry"], ["Settings", "/dashboard/settings"], ["Quickstart", "/dashboard/setup"],
			["Configure an agent setup", "/dashboard/setup"],
		]) {
			app.open(); invoke(app.options().find((node) => text(node) === `${label}${label === "Configure an agent setup" ? "Set up" : "Go"}`)!, "onClick"); app.flush();
			expect(app.push).toHaveBeenLastCalledWith(href);
		}
		for (const alias of ["Create a Worker", "New Worker", "New setup"]) {
			app.open(); app.query(alias);
			expect(app.options()).toHaveLength(1);
			expect(text(app.options()[0])).toBe("Configure an agent setupSet up");
			app.key("Enter");
			expect(app.push).toHaveBeenLastCalledWith("/dashboard/setup");
		}
		expect(app.fetch.mock.calls.every((args) => (args as unknown[])[0] === "/api/dashboard/machines")).toBe(true);
		app.unmount();
	});
});
