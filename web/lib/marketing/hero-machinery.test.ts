import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { HeroMachinery } from "@/components/marketing/HeroMachinery";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = { type: unknown; props: Record<string, any> };
type Effect = { dependencies?: unknown[]; cleanup?: () => void };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	if (typeof element.type === "function") return nodes(element.type(element.props));
	return [element, ...nodes(element.props.children)];
}

/** Run the real TSX callbacks/effects against deterministic lifecycle signals.
 * Only the visual orbit and logos are inert. Timers are local callbacks, not
 * wall-clock waits, and any attempted launch/network request fails closed. */
function mount({ hidden = false, reducedMotion = false, observerAvailable = true } = {}) {
	const cells: Array<{ value: any }> = [];
	const effects: Effect[] = [];
	const pendingEffects: Array<() => void> = [];
	const documentListeners = new Map<string, () => void>();
	const mediaListeners = new Map<string, () => void>();
	const timers = new Map<number, () => void>();
	let cursor = 0, nextTimer = 0, dirty = false;
	let notifyIntersection: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
	const element = {};
	const cell = (initial: unknown) => { const index = cursor++; return cells[index] ?? (cells[index] = { value: initial }); };
	const react = {
		useState(initial: unknown) {
			const state = cell(typeof initial === "function" ? initial() : initial);
			return [state.value, (next: any) => {
				const value = typeof next === "function" ? next(state.value) : next;
				if (!Object.is(state.value, value)) { state.value = value; dirty = true; }
			}];
		},
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
			const effect = cell({}).value as Effect;
			if (!effect.dependencies || dependencies.some((value, index) => !Object.is(value, effect.dependencies![index]))) {
				effect.dependencies = dependencies;
				pendingEffects.push(() => { effect.cleanup?.(); effect.cleanup = callback() || undefined; });
				if (!effects.includes(effect)) effects.push(effect);
			}
		},
	};
	const document = {
		visibilityState: hidden ? "hidden" : "visible",
		addEventListener: vi.fn((name: string, listener: () => void) => { documentListeners.set(name, listener); }),
		removeEventListener: vi.fn((name: string, listener: () => void) => {
			expect(documentListeners.get(name)).toBe(listener); documentListeners.delete(name);
		}),
	};
	const media = {
		matches: reducedMotion,
		addEventListener: vi.fn((name: string, listener: () => void) => { mediaListeners.set(name, listener); }),
		removeEventListener: vi.fn((name: string, listener: () => void) => {
			expect(mediaListeners.get(name)).toBe(listener); mediaListeners.delete(name);
		}),
	};
	const matchMedia = vi.fn((_query: string) => media);
	const setInterval = vi.fn((callback: () => void, _delay: number) => { const id = ++nextTimer; timers.set(id, callback); return id; });
	const clearInterval = vi.fn((id: number) => { timers.delete(id); });
	const observe = vi.fn(), disconnect = vi.fn();
	class Observer {
		constructor(callback: typeof notifyIntersection) { notifyIntersection = callback; }
		observe = observe;
		disconnect = disconnect;
	}
	const fetch = vi.fn(() => { throw new Error("Hero previews must not make network requests"); });
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { HeroMachinery: () => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/marketing/HeroMachinery.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch, document,
		IntersectionObserver: observerAvailable ? Observer : undefined,
		window: { matchMedia, setInterval, clearInterval },
		require: (id: string) => id === "react" ? react
			: id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
				: id === "next/dynamic" ? { default: () => "hero-orbit" }
					: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
						: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` }),
	});
	let tree: Element;
	function render() {
		let passes = 0;
		do {
			dirty = false; cursor = 0; tree = module.exports.HeroMachinery();
			if (tree.props.ref) tree.props.ref.current = element;
			for (const callback of pendingEffects.splice(0)) callback();
			if (++passes > 10) throw new Error("Hero effects did not settle");
		} while (dirty);
		return tree.props["data-motion"];
	}
	const all = () => nodes(tree);
	const button = (label: string) => {
		const found = all().find((node) => node.type === "button" && node.props["aria-label"] === label);
		if (!found) throw new Error(`Missing hero button: ${label}`);
		return found;
	};
	render();
	return {
		all, button, render, fetch, observe, disconnect, element, timers, setInterval, clearInterval, matchMedia, media, document,
		orbit: () => all().find((node) => node.type === "hero-orbit")!.props,
		selected: (label: string) => nodes(all().find((node) => node.props["aria-label"] === `Preview ${label}`))
			.filter((node) => node.type === "button" && node.props["aria-pressed"])
			.map((node) => node.props["aria-label"]),
		click(label: string) { button(label).props.onClick(); return render(); },
		intersect(value: boolean) { notifyIntersection([{ isIntersecting: value }]); return render(); },
		visibility(value: "visible" | "hidden") { document.visibilityState = value; documentListeners.get("visibilitychange")?.(); return render(); },
		motion(reduce: boolean) { media.matches = reduce; mediaListeners.get("change")?.(); return render(); },
		tick() { for (const callback of [...timers.values()]) callback(); return render(); },
		unmount() { for (const effect of effects) effect.cleanup?.(); },
	};
}

describe("Hero machinery preview lifecycle", () => {
	it("invariant_server_markup_is_paused_with_named_keyboard_controls_and_real_logos", () => {
		const html = renderToStaticMarkup(React.createElement(HeroMachinery));
		expect(html).toContain('<figure aria-label="Explore the runtime and compute machinery"');
		expect(html).toContain('data-motion="paused"');
		expect(html).toContain("<figcaption");
		for (const group of ["runtime", "compute"]) expect(html).toContain(`role="group" aria-label="Preview ${group}"`);
		for (const label of ["Claude Code", "Codex", "Hermes", "OpenClaw", "Daytona", "E2B", "Sprites", "Vercel Sandbox"]) {
			expect(html).toContain(`aria-label="Preview ${label}"`);
		}
		expect(html.match(/<button\b[^>]*type="button"/g)).toHaveLength(9);
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
		expect(html).toContain('aria-hidden="true" inert=""');
		expect(html).toContain("focus-visible:outline");
		expect(html).toContain("motion-reduce:transition-none");
		for (const asset of ["claude-code", "codex", "nous-mark", "openclaw", "daytona", "e2b", "sprites"]) expect(html).toContain(asset);
		expect(html).toContain("does not launch a machine");
		expect(html).not.toMatch(/<form\b|<iframe\b|aria-live=|href="\/dashboard/);
	});

	it("invariant_animation_waits_for_visibility_and_intersection_before_starting_one_timer", () => {
		const ui = mount();
		expect(ui.render()).toBe("paused");
		expect(ui.orbit()).toMatchObject({ activeAgent: "claude-code", activeSubstrate: "daytona", animated: false });
		expect(ui.timers.size).toBe(0);
		expect(ui.matchMedia).toHaveBeenCalledExactlyOnceWith("(prefers-reduced-motion: reduce)");
		expect(ui.observe).toHaveBeenCalledExactlyOnceWith(ui.element);
		expect(ui.intersect(true)).toBe("running");
		expect(ui.orbit().animated).toBe(true);
		expect(ui.timers.size).toBe(1);
		expect(ui.setInterval.mock.calls[0][1]).toBe(6500);
		ui.intersect(true); ui.visibility("visible"); ui.motion(false);
		expect(ui.setInterval).toHaveBeenCalledOnce();
		ui.unmount();
	});

	it("invariant_each_running_tick_advances_both_previews_and_wraps_with_one_selection_per_group", () => {
		const ui = mount(); ui.intersect(true);
		for (const [agent, provider] of [["Codex", "E2B"], ["Hermes", "Sprites"], ["OpenClaw", "Vercel Sandbox"], ["Claude Code", "Daytona"]]) {
			ui.tick();
			expect(ui.selected("runtime")).toEqual([`Preview ${agent}`]);
			expect(ui.selected("compute")).toEqual([`Preview ${provider}`]);
		}
		expect(ui.timers.size).toBe(1);
		expect(ui.fetch).not.toHaveBeenCalled();
		ui.unmount();
	});

	it.each([
		{ label: "Codex", agent: "codex", provider: "daytona" },
		{ label: "Sprites", agent: "claude-code", provider: "sprites" },
	])("invariant_selecting_$label_pauses_rotation_without_launching_or_changing_the_other_group", ({ label, agent, provider }) => {
		const ui = mount(); ui.intersect(true);
		expect(ui.click(`Preview ${label}`)).toBe("paused");
		expect(ui.orbit()).toMatchObject({ activeAgent: agent, activeSubstrate: provider, animated: false });
		expect(ui.button("Play hero animation")).toBeDefined();
		expect(ui.timers.size).toBe(0);
		ui.tick(); ui.visibility("hidden"); ui.visibility("visible"); ui.intersect(false); ui.intersect(true); ui.motion(true); ui.motion(false);
		expect(ui.render()).toBe("paused");
		expect(ui.orbit()).toMatchObject({ activeAgent: agent, activeSubstrate: provider });
		expect(ui.fetch).not.toHaveBeenCalled();
		expect(ui.click("Play hero animation")).toBe("running");
		expect(ui.timers.size).toBe(1);
		ui.unmount();
	});

	it("invariant_explicit_pause_survives_automatic_environment_changes_until_play", () => {
		const ui = mount(); ui.intersect(true); ui.tick();
		expect(ui.click("Pause hero animation")).toBe("paused");
		ui.visibility("hidden"); ui.intersect(false); ui.motion(true);
		ui.visibility("visible"); ui.intersect(true); ui.motion(false);
		expect(ui.render()).toBe("paused");
		expect(ui.selected("runtime")).toEqual(["Preview Codex"]);
		expect(ui.timers.size).toBe(0);
		expect(ui.click("Play hero animation")).toBe("running");
		ui.tick(); expect(ui.selected("runtime")).toEqual(["Preview Hermes"]);
		ui.unmount();
	});

	it("invariant_offscreen_or_hidden_illustrations_stop_advancing_and_resume_without_duplicate_timers", () => {
		const ui = mount(); ui.intersect(true); ui.tick();
		for (const pause of [() => ui.visibility("hidden"), () => ui.intersect(false)]) {
			expect(pause()).toBe("paused");
			expect(ui.timers.size).toBe(0);
			ui.tick(); expect(ui.selected("runtime")).toEqual(["Preview Codex"]);
			ui.visibility("visible"); ui.intersect(true);
			expect(ui.render()).toBe("running");
			expect(ui.timers.size).toBe(1);
		}
		ui.unmount();
	});

	it.each([
		{ name: "hidden tab", hidden: true, reducedMotion: false },
		{ name: "reduced motion", hidden: false, reducedMotion: true },
	])("invariant_initial_$name_blocks_animation_even_when_the_hero_is_in_view", (options) => {
		const ui = mount(options); ui.intersect(true);
		expect(ui.render()).toBe("paused");
		expect(ui.orbit().animated).toBe(false);
		expect(ui.setInterval).not.toHaveBeenCalled();
		ui.click("Pause hero animation"); ui.click("Play hero animation");
		expect(ui.render()).toBe("paused");
		expect(ui.timers.size).toBe(0);
		ui.visibility("visible"); ui.motion(false);
		expect(ui.render()).toBe("running");
		expect(ui.timers.size).toBe(1);
		ui.unmount();
	});

	it("invariant_live_reduced_motion_changes_gate_both_rotation_and_the_orbit", () => {
		const ui = mount(); ui.intersect(true); ui.tick();
		expect(ui.motion(true)).toBe("paused");
		expect(ui.orbit().animated).toBe(false);
		expect(ui.timers.size).toBe(0);
		ui.tick(); expect(ui.selected("runtime")).toEqual(["Preview Codex"]);
		ui.intersect(false); expect(ui.motion(false)).toBe("paused");
		expect(ui.timers.size).toBe(0);
		expect(ui.intersect(true)).toBe("running");
		expect(ui.orbit().animated).toBe(true);
		ui.unmount();
	});

	it("invariant_missing_intersection_support_keeps_a_usable_static_preview", () => {
		const ui = mount({ observerAvailable: false });
		expect(ui.render()).toBe("paused");
		ui.visibility("hidden"); ui.visibility("visible"); ui.motion(true); ui.motion(false);
		ui.click("Preview Hermes"); ui.click("Preview E2B"); ui.click("Play hero animation");
		expect(ui.orbit()).toMatchObject({ activeAgent: "hermes", activeSubstrate: "e2b", animated: false });
		expect(ui.timers.size).toBe(0);
		expect(ui.observe).not.toHaveBeenCalled();
		expect(ui.fetch).not.toHaveBeenCalled();
		ui.unmount();
	});

	it("invariant_unmount_clears_timers_and_removes_the_registered_observer_and_listeners", () => {
		const ui = mount(); ui.intersect(true);
		expect(ui.timers.size).toBe(1);
		ui.unmount();
		expect(ui.timers.size).toBe(0);
		expect(ui.disconnect).toHaveBeenCalledOnce();
		expect(ui.clearInterval).toHaveBeenCalledOnce();
		expect(ui.media.removeEventListener).toHaveBeenCalledExactlyOnceWith("change", ui.media.addEventListener.mock.calls[0][1]);
		expect(ui.document.removeEventListener).toHaveBeenCalledExactlyOnceWith("visibilitychange", ui.document.addEventListener.mock.calls[0][1]);
	});
});
