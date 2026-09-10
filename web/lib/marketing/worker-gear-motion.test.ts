import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { WorkerGearMotion } from "@/components/WorkerGearMotion";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const source = readFileSync(resolve(process.cwd(), "components/WorkerGearMotion.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const gears = React.createElement("svg", { "aria-label": "Engine fixture" },
	React.createElement("g", { "data-worker-gear": "core", style: { animationDuration: "80s", animationDelay: "-7s" } }),
	React.createElement("g", { "data-worker-gear": "satellite", style: { animationDuration: "48s", animationDelay: "-3s" } }),
);

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...elements(value.props.children)];
}

// Execute the real component with only hooks and browser lifecycle APIs stubbed.
// Child SVG nodes retain their object identity and fixed CSS phases throughout.
function mountEngine({ observerAvailable = true, hidden = false } = {}) {
	const states: boolean[] = [];
	const refs: Array<{ current: unknown }> = [];
	const listeners = new Map<string, () => void>();
	let stateIndex = 0, refIndex = 0, mounted = false;
	let mountEffect: (() => void | (() => void)) | undefined;
	let cleanup: void | (() => void);
	let notify: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
	const observe = vi.fn();
	const disconnect = vi.fn();
	const observerCreated = vi.fn();
	const element = {};
	const document = {
		visibilityState: hidden ? "hidden" : "visible",
		addEventListener: vi.fn((name: string, listener: () => void) => { listeners.set(name, listener); }),
		removeEventListener: vi.fn((name: string, listener: () => void) => {
			expect(listeners.get(name)).toBe(listener);
			listeners.delete(name);
		}),
	};
	class FakeObserver {
		constructor(callback: typeof notify) { notify = callback; observerCreated(); }
		observe = observe;
		disconnect = disconnect;
	}
	const module = { exports: {} as { WorkerGearMotion: typeof WorkerGearMotion } };
	runInNewContext(compiled, {
		module, exports: module.exports, document,
		window: observerAvailable ? { IntersectionObserver: FakeObserver } : {},
		require: (id: string) => id === "react/jsx-runtime"
			? { jsx: React.createElement, jsxs: React.createElement }
			: id === "react" ? {
				useState(initial: boolean) {
					const index = stateIndex++;
					if (!(index in states)) states[index] = initial;
					return [states[index], (next: boolean) => { states[index] = next; }];
				},
				useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
				useEffect: (callback: typeof mountEffect) => { if (!mounted) mountEffect = callback; },
			} : id.endsWith("/cn") ? { cn: (...values: string[]) => values.filter(Boolean).join(" ") }
				: { Cog: () => null },
	});
	let tree: Element;
	const render = () => {
		stateIndex = 0; refIndex = 0;
		tree = module.exports.WorkerGearMotion({ children: gears }) as Element;
		return tree.props["data-gear-motion"];
	};
	render();
	return {
		render, observe, disconnect, observerCreated, document, listeners, element,
		nodes: () => elements(tree),
		children: () => (tree.props.children as unknown[])[1],
		checkbox: () => elements(tree).find((node) => node.type === "input")!,
		mount() { refs[0].current = element; cleanup = mountEffect?.(); mounted = true; },
		intersect(value: boolean) { notify([{ isIntersecting: value }]); },
		visibility(value: "visible" | "hidden") {
			document.visibilityState = value;
			listeners.get("visibilitychange")?.();
		},
		unmount() { cleanup?.(); },
	};
}

describe("Worker gear shared motion lifecycle", () => {
	it("server-renders the full diagram paused with a checked, natively labelled checkbox", () => {
		const html = renderToStaticMarkup(React.createElement(WorkerGearMotion, { children: gears }));
		expect(html).toContain('data-gear-motion="paused"');
		expect(html).toContain('aria-label="Engine fixture"');
		expect(html).toMatch(/<label\b[^>]*>[\s\S]*<input\b[^>]*type="checkbox"[^>]*checked=""[\s\S]*Animate engine[\s\S]*<\/label>/);
		expect(html.match(/data-worker-gear=/g)).toHaveLength(2);
	});

	it("waits for intersection and pauses immediately when the document or engine is hidden", () => {
		const engine = mountEngine();
		expect(engine.render()).toBe("paused");
		engine.mount();
		expect(engine.observe).toHaveBeenCalledExactlyOnceWith(engine.element);
		expect(engine.render()).toBe("paused");
		engine.intersect(true);
		expect(engine.render()).toBe("running");
		engine.visibility("hidden");
		expect(engine.render()).toBe("paused");
		engine.visibility("visible");
		expect(engine.render()).toBe("running");
		engine.intersect(false);
		expect(engine.render()).toBe("paused");
		engine.intersect(true);
		expect(engine.render()).toBe("running");
		engine.unmount();
	});

	it("does not start in an initially hidden tab even when the observer reports intersection", () => {
		const engine = mountEngine({ hidden: true });
		engine.mount(); engine.intersect(true);
		expect(engine.render()).toBe("paused");
		engine.visibility("visible");
		expect(engine.render()).toBe("running");
		engine.unmount();
	});

	it("retains the user's pause choice across visibility changes without replacing or rephasing children", () => {
		const engine = mountEngine();
		engine.mount(); engine.intersect(true); engine.render();
		const toggle = (checked: boolean) => {
			(engine.checkbox().props.onChange as (event: unknown) => void)({ currentTarget: { checked } });
		};
		toggle(false);
		expect(engine.render()).toBe("paused");
		expect(engine.checkbox().props.checked).toBe(false);
		engine.visibility("hidden"); engine.visibility("visible");
		engine.intersect(false); engine.intersect(true);
		expect(engine.render()).toBe("paused");
		expect(engine.children()).toBe(gears);
		toggle(true);
		expect(engine.render()).toBe("running");
		expect(engine.children()).toBe(gears);
		expect(elements(engine.children()).filter((node) => node.type === "g").map((node) => node.props.style)).toEqual([
			{ animationDuration: "80s", animationDelay: "-7s" },
			{ animationDuration: "48s", animationDelay: "-3s" },
		]);
		expect(engine.observerCreated).toHaveBeenCalledTimes(1);
		expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
		engine.unmount();
	});

	it("disconnects its single observer and removes the same visibility listener on unmount", () => {
		const engine = mountEngine();
		engine.mount(); engine.intersect(true); engine.render();
		expect(engine.listeners.size).toBe(1);
		engine.unmount();
		expect(engine.disconnect).toHaveBeenCalledTimes(1);
		expect(engine.document.removeEventListener).toHaveBeenCalledExactlyOnceWith("visibilitychange", engine.document.addEventListener.mock.calls[0][1]);
		expect(engine.listeners.size).toBe(0);
	});

	it("keeps a useful static diagram when IntersectionObserver is unavailable", () => {
		const engine = mountEngine({ observerAvailable: false });
		engine.mount();
		expect(engine.render()).toBe("paused");
		engine.visibility("hidden"); engine.visibility("visible");
		expect(engine.render()).toBe("paused");
		expect(engine.children()).toBe(gears);
		expect(engine.observerCreated).not.toHaveBeenCalled();
		engine.unmount();
		expect(engine.listeners.size).toBe(0);
	});

	it("offers a CSS reduced-motion explanation in place of the animation toggle", () => {
		const engine = mountEngine();
		const label = engine.nodes().find((node) => node.type === "label")!;
		const explanation = engine.nodes().find((node) => node.type === "p")!;
		expect(label.props.className).toContain("motion-reduce:hidden");
		expect(explanation.props.className).toContain("motion-reduce:inline-flex");
		expect(explanation.props.children).toContain("Reduced motion");
		expect(engine.checkbox().props.className).toContain("focus-visible:outline-2");
	});
});
