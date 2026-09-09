import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Element = { type: unknown; props: Record<string, unknown> };
type Hook = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
function mountConsole() {
	const hooks: Hook[] = [], intervals = new Map<number, () => void>();
	const requests: Array<{ url: string; signal?: AbortSignal; respond: (body: unknown, status?: number) => void }> = [];
	let cursor = 0, nextInterval = 0, dirty = false, mounted = true;
	let effects: Array<() => void> = [];
	let tree: Element;
	let machineId = "viewed-machine";
	const same = (a?: unknown[], b?: unknown[]) => a !== undefined && b !== undefined && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
	const hook = () => hooks[cursor] ?? (hooks[cursor] = {});
	const react = {
		useState(initial: unknown) {
			const current = hook(); cursor++;
			if (!("value" in current)) current.value = initial;
			return [current.value, (next: unknown) => { current.value = typeof next === "function" ? next(current.value) : next; dirty = true; }];
		},
		useRef(initial: unknown) { const current = hook(); cursor++; return current.value ?? (current.value = { current: initial }); },
		useCallback(fn: unknown, deps: unknown[]) {
			const current = hook(); cursor++;
			if (!same(current.deps, deps)) { current.value = fn; current.deps = deps; }
			return current.value;
		},
		useEffect(effect: () => void | (() => void), deps: unknown[]) {
			const current = hook(); cursor++;
			if (!same(current.deps, deps)) { current.deps = deps; effects.push(() => { current.cleanup?.(); current.cleanup = effect() || undefined; }); }
		},
	};
	function ActivityStream() { return null; }
	const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
	const module = { exports: {} as { AgentConsole: (props: Record<string, unknown>) => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/agent-console/AgentConsole.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, AbortController,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("/ActivityStream") ? { ActivityStream }
				: id.endsWith("/protocol") ? { makeEventId: () => "new-conversation" }
					: id.endsWith("persistent-ui-state") ? { activeAgentConsoleKey: (id: string) => id, readStoredId: () => null, writeStoredId: () => {} }
						: new Proxy({}, { get: () => () => null }),
		setInterval(tick: () => void) { const id = ++nextInterval; intervals.set(id, tick); return id; },
		clearInterval(id: number) { intervals.delete(id); },
		fetch: (url: string, options: { signal?: AbortSignal } = {}) => new Promise((resolveResponse, reject) => {
			requests.push({ url, signal: options.signal, respond: (body, status = 200) => resolveResponse({ ok: status < 400, status, json: async () => body }) });
			options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		}),
	});
	const render = () => {
		cursor = 0; dirty = false; effects = [];
		tree = module.exports.AgentConsole({ activeMachineId: machineId, model: "claude-sonnet-4-6", agentKind: "claude-code" });
		for (const effect of effects) effect();
	};
	const activity = (value: unknown): Element | undefined => {
		if (Array.isArray(value)) return value.map(activity).find(Boolean);
		if (!value || typeof value !== "object") return undefined;
		const element = value as Element;
		return element.type === ActivityStream ? element : activity(element.props?.children);
	};
	render();
	return {
		requests,
		storage: () => requests.filter((request) => request.url.startsWith("/api/dashboard/chats")),
		health: () => requests.filter((request) => request.url.startsWith("/api/agents/run")),
		props: () => activity(tree)!.props,
		async flush() { for (let i = 0; i < 6; i++) { await new Promise(setImmediate); if (dirty && mounted) render(); } },
		tick() { for (const tick of [...intervals.values()]) tick(); },
		switchMachine(id: string) { machineId = id; render(); },
		unmount() { mounted = false; for (const current of hooks) current.cleanup?.(); },
	};
}

describe("actual Console storage recovery effects", () => {
	it("recovers a failed first storage read while runtime health remains ready, without adding phantom turns", async () => {
		const console = mountConsole();
		try {
			console.health()[0].respond({ ok: true, message: "Runtime installed and machine reachable." });
			console.storage()[0].respond({ ok: false, message: "Conversation storage temporarily unavailable" }, 502);
			await console.flush();
			expect(console.props()).toMatchObject({ disabled: true, storageError: "Conversation storage temporarily unavailable", turns: [] });
			console.tick(); await console.flush();
			console.health().at(-1)!.respond({ ok: true, message: "Runtime installed and machine reachable." });
			console.storage().at(-1)!.respond({ ok: true, chats: [], machineId: "viewed-machine" });
			await console.flush();
			expect(console.props()).toMatchObject({ disabled: false, storageError: null, turns: [], activeMachineId: "viewed-machine" });
			expect(console.storage().every((request) => request.url.endsWith("machineId=viewed-machine"))).toBe(true);
		} finally { console.unmount(); }
	});

	it("does not supersede a slow storage request on polling ticks and aborts it on unmount", async () => {
		const console = mountConsole();
		console.health()[0].respond({ ok: true }); await console.flush();
		console.tick(); await console.flush(); console.tick(); await console.flush();
		expect(console.storage()).toHaveLength(1);
		expect(console.storage()[0].signal?.aborted).toBe(false);
		console.unmount(); await console.flush();
		expect(console.storage()[0].signal?.aborted).toBe(true);
	});

	it("discards stale responses and storage errors when moving to another explicit machine", async () => {
		const console = mountConsole();
		try {
			const prior = console.storage()[0];
			console.switchMachine("next-machine"); await console.flush();
			expect(prior.signal?.aborted).toBe(true);
			prior.respond({ ok: false, message: "OLD MACHINE ERROR" }, 502);
			console.health().at(-1)!.respond({ ok: true });
			console.storage().at(-1)!.respond({ ok: true, chats: [], machineId: "next-machine" });
			await console.flush();
			expect(console.props()).toMatchObject({ disabled: false, storageError: null, activeMachineId: "next-machine", turns: [] });
			expect(console.storage().at(-1)!.url).toBe("/api/dashboard/chats?machineId=next-machine");
		} finally { console.unmount(); }
	});
});
