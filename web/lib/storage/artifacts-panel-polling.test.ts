import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Element = { type: unknown; props: Record<string, unknown> };
type Hook = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

/** Run the real TSX effects with controlled I/O, without a browser or fake
 * duplicate of refresh(). Hook state and dependency comparisons are retained
 * between renders, so interval reconfiguration follows the component itself. */
function mountPanel() {
	const hooks: Hook[] = [];
	const intervals = new Map<number, { tick: () => void; ms: number }>();
	const requests: Array<{ url: string; method: string; signal: AbortSignal; respond: (body: unknown) => void }> = [];
	let cursor = 0, nextInterval = 0, dirty = false, mounted = true;
	let effects: Array<() => void> = [];
	let tree: Element;
	const sameDeps = (left?: unknown[], right?: unknown[]) => left !== undefined && right !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
	const hook = () => hooks[cursor] ?? (hooks[cursor] = {});
	const react = {
		useState(initial: unknown) {
			const current = hook(); cursor += 1;
			if (!("value" in current)) current.value = initial;
			return [current.value, (value: unknown) => { current.value = typeof value === "function" ? value(current.value) : value; dirty = true; }];
		},
		useRef(initial: unknown) {
			const current = hook(); cursor += 1;
			return current.value ?? (current.value = { current: initial });
		},
		useCallback(callback: unknown, deps: unknown[]) {
			const current = hook(); cursor += 1;
			if (!sameDeps(current.deps, deps)) { current.value = callback; current.deps = deps; }
			return current.value;
		},
		useEffect(effect: () => void | (() => void), deps: unknown[]) {
			const current = hook(); cursor += 1;
			if (!sameDeps(current.deps, deps)) {
				current.deps = deps;
				effects.push(() => { current.cleanup?.(); current.cleanup = effect() || undefined; });
			}
		},
	};
	const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
	const module = { exports: {} as { ArtifactsPanel: () => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/ArtifactsPanel.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, AbortController,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("MachineProvider") ? { useOptionalMachineContext: () => ({ machineId: "viewed-machine" }) }
				: new Proxy({}, { get: () => () => null }),
		window: {
			setInterval(tick: () => void, ms: number) { const id = ++nextInterval; intervals.set(id, { tick, ms }); return id; },
			clearInterval(id: number) { intervals.delete(id); },
		},
		document: { visibilityState: "visible" },
		fetch: (url: string, options: { signal?: AbortSignal; method?: string }) => new Promise((resolveResponse, reject) => {
			const signal = options.signal ?? new AbortController().signal;
			requests.push({ url, method: options.method ?? "GET", signal, respond: (body) => resolveResponse({ ok: true, json: async () => body }) });
			signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		}),
	});
	const instance = module.exports.ArtifactsPanel();
	const render = () => {
		cursor = 0; dirty = false; effects = [];
		tree = (instance.type as (props: Record<string, unknown>) => Element)(instance.props);
		for (const effect of effects) effect();
	};
	const findBanner = (element: unknown): Element | undefined => {
		if (Array.isArray(element)) return element.map(findBanner).find(Boolean);
		if (!element || typeof element !== "object") return undefined;
		const node = element as Element;
		if (typeof node.type === "function" && node.type.name === "MachineStateBanner") return node;
		return findBanner(node.props?.children);
	};
	render();
	return {
		requests,
		async flush() { await new Promise(setImmediate); if (dirty && mounted) render(); await new Promise(setImmediate); },
		tick() { for (const interval of [...intervals.values()]) interval.tick(); },
		cadence() { return [...intervals.values()].map((interval) => interval.ms); },
		state() { return findBanner(tree)?.props.state; },
		wake() { return (findBanner(tree)?.props.onWake as () => Promise<void>)(); },
		unmount() { mounted = false; for (const current of hooks) current.cleanup?.(); },
	};
}

describe("ArtifactsPanel request lifecycle", () => {
	it("leaves paused storage at a steady read cadence and wakes only on explicit action", async () => {
		const panel = mountPanel();
		try {
			panel.requests[0].respond({ ok: false, reason: "machine_asleep", message: "Paused", machineId: "viewed-machine", artifacts: [] });
			await panel.flush(); expect(panel.cadence()).toEqual([30000]); expect(panel.requests).toHaveLength(1);
			const wake = panel.wake(); await panel.flush();
			expect(panel.requests[1]).toMatchObject({ method: "POST", url: "/api/dashboard/machines/viewed-machine/wake" });
			panel.requests[1].respond({ summary: { phase: "running" } }); await panel.flush();
			panel.requests[2].respond({ ok: true, artifacts: [], machineId: "viewed-machine" }); await wake; await panel.flush();
			expect(panel.state()).toMatchObject({ ok: true });
		} finally { panel.unmount(); }
	});
	it("allows a ready inventory read to finish even when slower than the three-second starting poll", async () => {
		const panel = mountPanel();
		try {
			expect(panel.requests[0].url).toBe("/api/dashboard/artifacts?machineId=viewed-machine");
			panel.requests[0].respond({ ok: false, reason: "machine_starting", message: "Waking", artifacts: [] });
			await panel.flush();
			expect(panel.cadence()).toEqual([3000]);
			panel.tick(); await panel.flush();
			panel.tick(); await panel.flush();
			panel.tick(); await panel.flush();
			expect(panel.requests).toHaveLength(2);
			expect(panel.requests[1].signal.aborted).toBe(false);
			panel.requests[1].respond({ ok: true, artifacts: [], machineId: "viewed-machine", warnings: [] });
			await panel.flush();
			expect(panel.state()).toEqual({ ok: true, reason: null, message: null });
			expect(panel.cadence()).toEqual([30000]);
		} finally { panel.unmount(); }
	});

	it("aborts a pending read and removes polling on machine-view unmount", async () => {
		const panel = mountPanel();
		expect(panel.requests).toHaveLength(1);
		panel.unmount();
		await panel.flush();
		expect(panel.requests[0].signal.aborted).toBe(true);
		expect(panel.cadence()).toEqual([]);
	});
});
