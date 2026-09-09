import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Executes the actual hook/effects with deterministic requests and timers.
// No copied polling or transition implementation is under test here.
function mountControl() {
	type Hook = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
	const hooks: Hook[] = [], timers = new Map<number, () => void>();
	const requests: Array<{ url: string; method: string; respond: (body: unknown, status?: number) => void }> = [];
	let cursor = 0, sequence = 0, dirty = false, machineId = "first", effects: Array<() => void> = [];
	let result: { machine: { phase: string; machineId: string } | null; pending: string | null; wake: () => Promise<void>; sleep: () => Promise<void> };
	const same = (a?: unknown[], b?: unknown[]) => a !== undefined && b !== undefined && a.length === b.length && a.every((value,index)=>Object.is(value,b[index]));
	const next = () => hooks[cursor++] ?? (hooks[cursor-1] = {});
	const react = {
		useState(initial: unknown) { const hook = next(); if (!("value" in hook)) hook.value = initial; return [hook.value, (value: unknown) => { hook.value = typeof value === "function" ? value(hook.value) : value; dirty = true; }]; },
		useRef(initial: unknown) { const hook = next(); return hook.value ?? (hook.value = { current: initial }); },
		useCallback(callback: unknown, deps: unknown[]) { const hook = next(); if (!same(hook.deps,deps)) { hook.deps = deps; hook.value = callback; } return hook.value; },
		useEffect(effect: () => void | (() => void), deps: unknown[]) { const hook = next(); if (!same(hook.deps,deps)) { hook.deps = deps; effects.push(()=>{ hook.cleanup?.(); hook.cleanup = effect() || undefined; }); } },
	};
	const module = { exports: {} as { useMachineControl: (id:string) => typeof result } };
	const source = readFileSync(resolve(process.cwd(), "lib/dashboard/use-machine-control.ts"), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
		module, exports: module.exports, AbortController,
		require: (id:string) => id === "react" ? react : { withMachineId: (url:string,id:string) => `${url}?machineId=${id}` },
		window: { setTimeout(tick:()=>void) { const id=++sequence; timers.set(id,tick); return id; }, clearTimeout(id:number) { timers.delete(id); } },
		fetch: (url:string, options?:{method?:string}) => new Promise((resolveResponse)=>requests.push({ url, method:options?.method??"GET", respond:(body,status=200)=>resolveResponse({ ok:status<400, status, json:async()=>body }) })),
	});
	const render = () => { cursor=0; dirty=false; effects=[]; result=module.exports.useMachineControl(machineId); for (const effect of effects) effect(); };
	render();
	return {
		requests,
		state:()=>result,
		async flush() { await new Promise(setImmediate); if (dirty) render(); await new Promise(setImmediate); },
		tick() { for (const [id,tick] of [...timers]) { timers.delete(id); tick(); } },
		switch(id:string) { machineId=id; render(); },
		unmount() { for (const hook of hooks) hook.cleanup?.(); },
	};
}

describe("machine-control read versus explicit actions", () => {
	it("mounting and repeated reads of a paused Worker never POST wake", async () => {
		const hook=mountControl();
		try {
			hook.requests[0].respond({ machineId:"first", phase:"sleeping" }); await hook.flush();
			expect(hook.requests.every(request=>request.method === "GET")).toBe(true);
			expect(hook.state().pending).toBe(null);
			hook.tick(); hook.requests.at(-1)!.respond({ machineId:"first", phase:"sleeping" }); await hook.flush();
			expect(hook.requests.every(request=>request.method === "GET")).toBe(true);
		} finally { hook.unmount(); }
	});
	it("only the explicit Wake action submits the machine-scoped transition", async () => {
		const hook=mountControl();
		try {
			hook.requests[0].respond({ machineId:"first", phase:"sleeping" }); await hook.flush();
			const wake=hook.state().wake(); await hook.flush();
			expect(hook.requests.at(-1)).toMatchObject({ method:"POST", url:"/api/dashboard/machines/first/wake" });
			hook.requests.at(-1)!.respond({ summary:{ machineId:"first", phase:"running" } }); await wake; await hook.flush();
			expect(hook.state().machine?.phase).toBe("running");
		} finally { hook.unmount(); }
	});
	it("a deleted Worker clears a pending transition instead of looking permanently starting", async () => {
		const hook=mountControl();
		try {
			hook.requests[0].respond({ machineId:"first", phase:"running" }); await hook.flush();
			const wake=hook.state().wake(); await hook.flush();
			hook.requests.at(-1)!.respond({ summary:{ machineId:"first", phase:"destroyed" } }); await wake; await hook.flush();
			hook.tick(); hook.requests.at(-1)!.respond({ machineId:"first", phase:"destroyed" }); await hook.flush();
			expect(hook.state().machine?.phase).toBe("destroyed"); expect(hook.state().pending).toBe(null);
		} finally { hook.unmount(); }
	});
	it("late reads for a previous Worker cannot replace the newly selected Worker", async () => {
		const hook=mountControl();
		try {
			hook.switch("second"); hook.requests.at(-1)!.respond({ machineId:"second", phase:"sleeping" }); await hook.flush();
			hook.requests[0].respond({ machineId:"first", phase:"running" }); await hook.flush();
			expect(hook.state().machine?.machineId).toBe("second");
		} finally { hook.unmount(); }
	});
});
