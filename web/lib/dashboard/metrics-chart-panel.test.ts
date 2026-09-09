import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { withMachineId } from "./api-url";

type Element = { type: unknown; props: Record<string, unknown> };
type Hook = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

/** Executes the actual TSX and hook lifetimes; only I/O and chart painting are
 * controlled. Headers and JSON can finish separately to force cleanup races. */
function mountMetrics(initialMachineId = "first") {
	const hooks: Hook[] = [];
	const intervals = new Map<number, () => void>();
	const requests: Array<{
		url: string; method: string;
		headers: (status?: number) => void;
		body: (body: unknown) => void;
		respond: (body: unknown, status?: number) => void;
	}> = [];
	let cursor = 0, sequence = 0, dirty = false, mounted = true;
	let machineId = initialMachineId, tree: Element;
	let effects: Array<() => void> = [];
	const same = (left?: unknown[], right?: unknown[]) => left !== undefined && right !== undefined && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
	const next = () => hooks[cursor++] ?? (hooks[cursor - 1] = {});
	const react = {
		useState(initial: unknown) {
			const hook = next();
			if (!("value" in hook)) hook.value = typeof initial === "function" ? initial() : initial;
			return [hook.value, (value: unknown) => { hook.value = typeof value === "function" ? value(hook.value) : value; dirty = true; }];
		},
		useRef(initial: unknown) { const hook = next(); return hook.value ?? (hook.value = { current: initial }); },
		useMemo(callback: () => unknown, deps: unknown[]) {
			const hook = next();
			if (!same(hook.deps, deps)) { hook.deps = deps; hook.value = callback(); }
			return hook.value;
		},
		useEffect(effect: () => void | (() => void), deps: unknown[]) {
			const hook = next();
			if (!same(hook.deps, deps)) {
				hook.deps = deps;
				effects.push(() => { hook.cleanup?.(); hook.cleanup = effect() || undefined; });
			}
		},
	};
	const jsx = (type: unknown, props: Record<string, unknown>): Element => typeof type === "function" ? type(props) : { type, props };
	const module = { exports: {} as { MetricsChartPanel: (props: { activeMachineId: string }) => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/MetricsChartPanel.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, AbortController,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("/api-url") ? { withMachineId }
				: new Proxy({}, { get: (_, key) => (props: Record<string, unknown>) => ({ type: String(key), props }) }),
		window: {
			setInterval(tick: () => void) { const id = ++sequence; intervals.set(id, tick); return id; },
			clearInterval(id: number) { intervals.delete(id); },
		},
		document: { visibilityState: "visible" },
		fetch: (url: string, options?: { method?: string }) => {
			const response = deferred<unknown>(), body = deferred<unknown>();
			const headers = (status = 200) => response.resolve({ ok: status < 400, status, json: () => body.promise });
			requests.push({ url, method: options?.method ?? "GET", headers, body: body.resolve, respond: (value, status = 200) => { headers(status); body.resolve(value); } });
			return response.promise;
		},
	});
	const render = () => {
		cursor = 0; dirty = false; effects = [];
		tree = module.exports.MetricsChartPanel({ activeMachineId: machineId });
		for (const effect of effects) effect();
	};
	render();
	return {
		requests,
		tree: () => tree,
		async flush() { await new Promise(setImmediate); while (dirty && mounted) render(); await new Promise(setImmediate); },
		tick() { for (const tick of [...intervals.values()]) tick(); },
		switch(id: string) { machineId = id; render(); },
		unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
	};
}

function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const node = value as Element;
	return [node, ...elements(node.props.children)];
}

function chart(panel: ReturnType<typeof mountMetrics>, name: string) {
	return elements(panel.tree()).find((node) => node.type === name)?.props.data;
}

function latencyValues(panel: ReturnType<typeof mountMetrics>) {
	return elements(panel.tree()).filter((node) => node.type === "span" && node.props.className === "text-[var(--ret-text)] tracking-tight").map((node) => node.props.children);
}

function gateway(latencyMs: number) {
	return { ok: true, status: 200, model: "fixture", apiHost: "fixture", latencyMs, modelCount: 1 };
}

function logs(...sources: string[]) {
	return { ok: true, data: { lines: sources.map((source) => ({ at: new Date().toISOString(), level: "info", source, message: "fixture" })), files: [], tailLines: 200 } };
}

describe("MetricsChartPanel actual-source invariants", () => {
	it("invariant missing latency is not measured zero", async () => {
		const panel = mountMetrics();
		try {
			expect(latencyValues(panel)).toEqual(["Not measured", "Not measured", "Not measured", "Not measured"]);
			panel.requests[0].respond(gateway(0)); panel.requests[1].respond(logs()); await panel.flush();
			expect(latencyValues(panel)).toEqual(["0 ms", "0 ms", "0 ms", "0 ms"]);
		} finally { panel.unmount(); }
	});

	it("invariant both reads are pinned to the viewed machine", () => {
		const panel = mountMetrics("machine /?#");
		try {
			expect(panel.requests.map(({ url }) => url)).toEqual([
				"/api/dashboard/gateway?machineId=machine%20%2F%3F%23",
				"/api/dashboard/logs?n=200&machineId=machine%20%2F%3F%23",
			]);
		} finally { panel.unmount(); }
	});

	it("invariant an unavailable gateway does not discard or stop live logs", async () => {
		const panel = mountMetrics();
		try {
			panel.requests[0].respond({ error: "no_gateway" }, 404); panel.requests[1].respond(logs("codex")); await panel.flush();
			expect(chart(panel, "Pie")).toEqual([{ name: "codex", value: 1, color: "var(--ret-text-dim)" }]);
			panel.tick(); await panel.flush();
			expect(panel.requests.map(({ url }) => url.split("?")[0])).toEqual(["/api/dashboard/gateway", "/api/dashboard/logs", "/api/dashboard/logs"]);
			expect(panel.requests.every(({ method }) => method === "GET")).toBe(true);
		} finally { panel.unmount(); }
	});

	it("invariant unavailable logs do not discard or stop measured gateway samples", async () => {
		const panel = mountMetrics();
		try {
			panel.requests[0].respond(gateway(8)); panel.requests[1].respond({}, 404); await panel.flush();
			expect(chart(panel, "AreaChart")).toEqual([{ idx: 0, ms: 8 }]);
			panel.tick(); await panel.flush();
			expect(panel.requests.map(({ url }) => url.split("?")[0])).toEqual(["/api/dashboard/gateway", "/api/dashboard/logs", "/api/dashboard/gateway"]);
		} finally { panel.unmount(); }
	});

	it("invariant a slow read neither blocks the other endpoint nor overlaps itself", async () => {
		const panel = mountMetrics();
		try {
			// The gateway remains unresolved while logs arrive and poll again.
			panel.requests[1].respond(logs("codex")); await panel.flush();
			expect(chart(panel, "Pie")).toEqual([{ name: "codex", value: 1, color: "var(--ret-text-dim)" }]);
			panel.tick(); await panel.flush(); panel.tick(); await panel.flush();
			expect(panel.requests.map(({ url }) => url.split("?")[0])).toEqual(["/api/dashboard/gateway", "/api/dashboard/logs", "/api/dashboard/logs"]);
			expect(panel.requests.every(({ method }) => method === "GET")).toBe(true);
		} finally { panel.unmount(); }
	});

	it("invariant endpoint availability is reset for a newly viewed machine", async () => {
		const panel = mountMetrics();
		try {
			panel.requests[0].respond({}, 404); panel.requests[1].respond(logs("codex")); await panel.flush();
			panel.switch("second");
			expect(panel.requests.slice(2).map(({ url }) => url)).toEqual([
				"/api/dashboard/gateway?machineId=second", "/api/dashboard/logs?n=200&machineId=second",
			]);
			panel.requests[2].respond(gateway(6)); panel.requests[3].respond(logs("hermes")); await panel.flush();
			expect(chart(panel, "AreaChart")).toEqual([{ idx: 0, ms: 6 }]);
		} finally { panel.unmount(); }
	});

	it("invariant switching machines clears the previous machine's visible history and logs", async () => {
		const panel = mountMetrics();
		try {
			panel.requests[0].respond(gateway(18)); panel.requests[1].respond(logs("hermes")); await panel.flush();
			panel.switch("second");
			expect(chart(panel, "AreaChart")).toEqual([]);
			expect(chart(panel, "Pie")).toBeUndefined();
			await panel.flush();
			expect(chart(panel, "AreaChart")).toEqual([]);
			expect(chart(panel, "Pie")).toBeUndefined();
			expect(latencyValues(panel)).toEqual(["Not measured", "Not measured", "Not measured", "Not measured"]);
			panel.requests[2].respond(gateway(4)); panel.requests[3].respond(logs("codex")); await panel.flush();
			expect(chart(panel, "AreaChart")).toEqual([{ idx: 0, ms: 4 }]);
		} finally { panel.unmount(); }
	});

	it("invariant JSON finishing after a machine switch cannot replace the new machine's state", async () => {
		const panel = mountMetrics();
		try {
			panel.requests[0].headers(); panel.requests[1].headers(); await panel.flush();
			panel.switch("second");
			panel.requests[2].respond(gateway(4)); panel.requests[3].respond(logs("codex")); await panel.flush();
			panel.requests[0].body(gateway(99)); panel.requests[1].body(logs("hermes")); await panel.flush();
			expect(chart(panel, "AreaChart")).toEqual([{ idx: 0, ms: 4 }]);
			expect(chart(panel, "Pie")).toEqual([{ name: "codex", value: 1, color: "var(--ret-text-dim)" }]);
		} finally { panel.unmount(); }
	});

	it("invariant unknown log sources never become an invented runtime", async () => {
		const panel = mountMetrics();
		try {
			panel.requests[0].respond(gateway(1)); panel.requests[1].respond(logs("hermes", "telemetry", "agent", "", "unrecognized")); await panel.flush();
			expect(chart(panel, "Pie")).toEqual([
				{ name: "hermes", value: 1, color: "var(--ret-purple)" },
				{ name: "other", value: 4, color: "var(--ret-text-muted)" },
			]);
		} finally { panel.unmount(); }
	});
});
