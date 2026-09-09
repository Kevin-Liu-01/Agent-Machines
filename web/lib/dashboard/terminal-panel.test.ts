import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Element = { type: unknown; key?: string; props: Record<string, any> };
type Hook = { value?: any; deps?: unknown[]; cleanup?: () => void };
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
	return { promise, resolve, reject };
}
const historyKey = (id: string) => `agent-machines:terminal:history:${encodeURIComponent(id)}`;
const scrollKey = (id: string) => `agent-machines:terminal:scrollback:${encodeURIComponent(id)}`;
const entry = (label: string, state = "done") => ({
	id: label, command: `echo ${label}`, startedAt: "2026-09-09T22:00:00Z", finishedAt: "2026-09-09T22:00:01Z",
	stdout: `${label} output`, stderr: "", elapsedMs: 1, exitCode: state === "done" ? 0 : null, state,
});

/** Run the actual component and its keyed child lifecycle; control only React's
 * scheduling, storage, and HTTP. Fetch deliberately ignores abort so stale
 * replies exercise the component's ownership checks too. */
function mountTerminal(initialMachineId: string | null = "first", seed: Record<string, unknown> = {}, initialCommand?: string) {
	let hooks: Hook[] = [], cursor = 0, dirty = false, mounted = true;
	let key: unknown, machineId = initialMachineId, tree: Element;
	let effects: Array<() => void> = [];
	const timers = new Map<number, () => void>();
	let timerId = 0;
	const storage = new Map(Object.entries(seed).map(([name, value]) => [name, JSON.stringify(value)]));
	const requests: Array<{
		body: { command: string; machineId?: string }; signal?: AbortSignal;
		respond: (status?: number) => void; errorBody: (body: unknown) => void;
		event: (name: string, body: unknown) => void; end: () => void; fail: (error: Error) => void;
	}> = [];
	const same = (a?: unknown[], b?: unknown[]) => a !== undefined && b !== undefined && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
	const next = () => hooks[cursor++] ?? (hooks[cursor - 1] = {});
	const react = {
		useState(initial: unknown) {
			const hook = next();
			if (!("value" in hook)) hook.value = typeof initial === "function" ? initial() : initial;
			return [hook.value, (value: any) => { hook.value = typeof value === "function" ? value(hook.value) : value; dirty = true; }];
		},
		useRef(initial: unknown) { const hook = next(); return hook.value ?? (hook.value = { current: initial }); },
		useCallback(fn: unknown, deps: unknown[]) { const hook = next(); if (!same(hook.deps, deps)) { hook.deps = deps; hook.value = fn; } return hook.value; },
		useMemo(fn: () => unknown, deps: unknown[]) { const hook = next(); if (!same(hook.deps, deps)) { hook.deps = deps; hook.value = fn(); } return hook.value; },
		useEffect(effect: () => void | (() => void), deps: unknown[]) {
			const hook = next();
			if (!same(hook.deps, deps)) { hook.deps = deps; effects.push(() => { hook.cleanup?.(); hook.cleanup = effect() || undefined; }); }
		},
	};
	const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => ({ type, props, key });
	const module = { exports: {} as { TerminalPanel: (props: { initialCommand?: string }) => Element } };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/TerminalPanel.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, AbortController, TextDecoder,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("/MachineProvider") ? { useOptionalMachineContext: () => machineId ? { machineId } : null }
				: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
					: new Proxy({}, { get: (_, name) => String(name) }),
		window: { sessionStorage: { getItem: (name: string) => storage.get(name) ?? null, setItem: (name: string, value: string) => storage.set(name, value), removeItem: (name: string) => storage.delete(name) } },
		setTimeout(callback: () => void) { const id = ++timerId; timers.set(id, callback); return id; },
		clearTimeout(id: number) { timers.delete(id); },
		fetch: (_url: string, init: { body: string; signal?: AbortSignal }) => {
			const response = deferred<unknown>(), errorBody = deferred<unknown>();
			const chunks: Array<{ value?: Uint8Array; done: boolean }> = [];
			let pending: ReturnType<typeof deferred<{ value?: Uint8Array; done: boolean }>> | null = null;
			const push = (chunk: { value?: Uint8Array; done: boolean }) => { if (pending) { pending.resolve(chunk); pending = null; } else chunks.push(chunk); };
			const reader = { read: () => chunks.length ? Promise.resolve(chunks.shift()) : (pending = deferred()).promise, cancel: async () => {}, releaseLock() {} };
			requests.push({
				body: JSON.parse(init.body), signal: init.signal,
				respond: (status = 200) => response.resolve({ ok: status < 400, status, body: status < 400 ? { getReader: () => reader } : null, json: () => errorBody.promise }),
				errorBody: errorBody.resolve,
				event: (name, body) => push({ value: new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(body)}\n\n`), done: false }),
				end: () => push({ done: true }), fail: (error) => response.reject(error),
			});
			return response.promise;
		},
	});
	const render = () => {
		cursor = 0; dirty = false; effects = [];
		const root = module.exports.TerminalPanel({ initialCommand });
		if (typeof root.type === "function") {
			if (root.key !== key) { for (const hook of hooks) hook.cleanup?.(); hooks = []; key = root.key; }
			cursor = 0; effects = [];
			tree = root.type(root.props);
		} else {
			if (key !== undefined) { for (const hook of hooks) hook.cleanup?.(); hooks = []; key = undefined; }
			tree = root;
		}
		for (const effect of effects) effect();
	};
	const nodes = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" && "props" in value ? [value as Element, ...nodes((value as Element).props.children)] : [];
	const input = () => nodes(tree).find((node) => node.type === "input")!;
	render();
	return {
		requests, storage, input,
		entries: () => nodes(tree).filter((node) => typeof node.type === "function" && node.type.name === "EntryRow").map((node) => node.props.entry),
		async flush() { for (let i = 0; i < 8; i++) { await new Promise(setImmediate); if (dirty && mounted) render(); } },
		switch(id: string | null) { machineId = id; render(); },
		timers() { const due = [...timers.values()]; timers.clear(); for (const timer of due) timer(); },
		type(value: string) { input().props.onChange({ target: { value } }); },
		key(name: string) { input().props.onKeyDown({ key: name, preventDefault() {} }); },
		click(label: string) { nodes(tree).find((node) => node.props.children === label && typeof node.props.onClick === "function")!.props.onClick(); },
		unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
	};
}

describe("one-shot terminal machine ownership", () => {
	it("invariant_unattributed_legacy_storage_is_never_shown_or_assigned_to_a_machine", async () => {
		const panel = mountTerminal("first", { "agent-machines:terminal:history": ["echo old secret"], "agent-machines:terminal:scrollback": [entry("old secret")] });
		try { await panel.flush(); expect(panel.entries()).toEqual([]); panel.key("ArrowUp"); await panel.flush(); expect(panel.input().props.value).toBe(""); } finally { panel.unmount(); }
	});
	it("invariant_machine_switch_restores_only_its_own_history_and_scrollback", async () => {
		const panel = mountTerminal("first", { [historyKey("first")]: ["echo first"], [scrollKey("first")]: [entry("first")], [historyKey("second")]: ["echo second"], [scrollKey("second")]: [entry("second")] });
		try {
			await panel.flush(); expect(panel.entries().map((e) => e.command)).toEqual(["echo first"]);
			panel.switch("second"); await panel.flush(); expect(panel.entries().map((e) => e.command)).toEqual(["echo second"]);
			panel.key("ArrowUp"); await panel.flush(); expect(panel.input().props.value).toBe("echo second");
			expect(JSON.parse(panel.storage.get(scrollKey("first"))!)[0].stdout).toBe("first output");
		} finally { panel.unmount(); }
	});
	it("invariant_new_commands_target_the_current_machine_after_switching", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.switch("second"); await panel.flush(); panel.type("echo second-only"); await panel.flush(); panel.key("Enter"); await panel.flush();
			expect(panel.requests).toHaveLength(1); expect(panel.requests[0].body).toEqual({ command: "echo second-only", machineId: "second" });
		} finally { panel.unmount(); }
	});
	it("invariant_old_streams_cannot_update_new_machine_output_or_drafts", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.type("echo first-only"); await panel.flush(); panel.key("Enter"); await panel.flush();
			panel.requests[0].respond(); await panel.flush(); panel.requests[0].event("output", { stdout: "first output" }); await panel.flush();
			panel.switch("second"); await panel.flush(); panel.type("second draft"); await panel.flush();
			expect(panel.requests[0].signal?.aborted).toBe(true);
			panel.requests[0].event("done", { exitCode: 0, stdout: "late first output" }); panel.requests[0].end(); await panel.flush();
			expect(panel.entries()).toEqual([]); expect(panel.input().props.value).toBe("second draft");
			expect(panel.storage.get(scrollKey("second"))).not.toContain("first");
		} finally { panel.unmount(); }
	});
	it("invariant_late_rejected_headers_cannot_clear_a_new_machine_draft", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.type("first command"); await panel.flush(); panel.key("Enter"); await panel.flush();
			panel.requests[0].respond(503); await panel.flush(); panel.switch("second"); await panel.flush(); panel.type("second draft"); await panel.flush();
			panel.requests[0].errorBody({ error: "first machine offline" }); await panel.flush();
			expect(panel.input().props.value).toBe("second draft"); expect(panel.entries()).toEqual([]);
		} finally { panel.unmount(); }
	});
	it("invariant_unconfirmed_restored_commands_are_not_reported_complete", async () => {
		const panel = mountTerminal("first", { [scrollKey("first")]: [entry("uncertain", "running")] });
		try {
			await panel.flush(); expect(panel.entries()).toHaveLength(1); expect(panel.entries()[0]).toMatchObject({ state: "error", exitCode: null });
			expect(panel.entries()[0].error).toMatch(/completion.*not confirmed|completion was confirmed/i);
			panel.timers(); await panel.flush(); expect(panel.requests).toHaveLength(0);
		} finally { panel.unmount(); }
	});
	it("invariant_stream_eof_without_a_valid_exit_is_not_success", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.type("run uncertain"); await panel.flush(); panel.key("Enter"); await panel.flush(); panel.requests[0].respond(); panel.requests[0].end(); await panel.flush();
			expect(panel.entries()[0]).toMatchObject({ state: "error", exitCode: null });
		} finally { panel.unmount(); }
	});
	it("invariant_diagnostics_stop_after_the_owning_machine_is_left", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.click("run all"); await panel.flush(); expect(panel.requests).toHaveLength(1);
			panel.switch("second"); await panel.flush(); panel.requests[0].respond(); panel.requests[0].event("done", { exitCode: 0 }); panel.requests[0].end(); await panel.flush();
			expect(panel.requests).toHaveLength(1);
		} finally { panel.unmount(); }
	});
	it("invariant_no_machine_context_never_falls_back_to_the_global_active_machine", async () => {
		const panel = mountTerminal(null);
		try { await panel.flush(); panel.timers(); await panel.flush(); expect(panel.requests).toHaveLength(0); } finally { panel.unmount(); }
	});
	it("design_initial_command_is_only_a_draft_and_startup_is_bound_to_the_selected_machine", async () => {
		const panel = mountTerminal("first", {}, "echo explicit draft");
		try {
			await panel.flush(); expect(panel.input().props.value).toBe("echo explicit draft"); expect(panel.requests).toHaveLength(0);
			panel.timers(); await panel.flush(); expect(panel.requests).toHaveLength(1); expect(panel.requests[0].body.machineId).toBe("first");
			expect(panel.requests[0].body.command).not.toBe("echo explicit draft");
			panel.timers(); await panel.flush(); expect(panel.requests).toHaveLength(1);
		} finally { panel.unmount(); }
	});
	it("invariant_startup_diagnostics_do_not_duplicate_work_after_a_manual_command", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.type("echo manual"); await panel.flush(); panel.key("Enter"); await panel.flush();
			panel.timers(); await panel.flush(); expect(panel.requests).toHaveLength(1); expect(panel.requests[0].body.command).toBe("echo manual");
		} finally { panel.unmount(); }
	});
	it.each([0, 7, undefined])("invariant_only_an_explicit_integer_exit_confirms_completion: %s", async (exitCode) => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.type("echo complete"); await panel.flush(); panel.key("Enter"); await panel.flush();
			panel.requests[0].respond(); panel.requests[0].event("done", { exitCode, stdout: "final output" }); panel.requests[0].end(); await panel.flush();
			expect(panel.entries()[0]).toMatchObject({ stdout: "final output", exitCode: exitCode ?? null, state: exitCode === undefined ? "error" : "done" });
			if (exitCode === undefined) expect(panel.entries()[0].error).toContain("not confirmed");
		} finally { panel.unmount(); }
	});
	it("invariant_malformed_scoped_restore_is_ignored_without_reusing_another_machine", async () => {
		const panel = mountTerminal("first", { [historyKey("first")]: [null, "echo valid"], [scrollKey("first")]: [null, {}, { ...entry("bad"), stdout: {} }, entry("valid")] });
		try {
			await panel.flush(); expect(panel.entries().map((e) => e.command)).toEqual(["echo valid"]);
			panel.key("ArrowUp"); await panel.flush(); expect(panel.input().props.value).toBe("echo valid");
		} finally { panel.unmount(); }
	});
	it("invariant_switching_before_startup_cancels_the_previous_machine_timer", async () => {
		const panel = mountTerminal();
		try {
			await panel.flush(); panel.switch("second"); await panel.flush(); panel.timers(); await panel.flush();
			expect(panel.requests).toHaveLength(1); expect(panel.requests[0].body.machineId).toBe("second");
		} finally { panel.unmount(); }
	});
	it("invariant_automatic_startup_uses_home_and_never_launches_an_agent_or_network_client", async () => {
		const panel = mountTerminal("fixture-machine");
		const fixture = mkdtempSync(join(tmpdir(), "am-terminal-startup-"));
		try {
			const bin = join(fixture, "bin"), appData = join(fixture, ".agent-machines");
			mkdirSync(bin); mkdirSync(appData);
			writeFileSync(join(appData, "fixture-state.txt"), "fixture");
			for (const name of ["hermes", "claude", "codex", "openclaw", "curl", "wget"]) {
				writeFileSync(join(bin, name), "#!/bin/sh\nprintf 'FORBIDDEN_STARTUP_EXECUTION\\n' >> \"$HOME/forbidden-startup-execution\"\nexit 79\n", { mode: 0o700 });
			}
			await panel.flush(); panel.timers(); await panel.flush();
			expect(panel.requests).toHaveLength(1);
			const command = panel.requests[0].body.command;
			const result = spawnSync("/bin/bash", ["-c", command], {
				cwd: fixture, env: { NODE_ENV: "test", HOME: fixture, PATH: `${bin}:/usr/bin:/bin` }, encoding: "utf8", timeout: 2000,
			});
			expect(result.error).toBeUndefined();
			expect(existsSync(join(fixture, "forbidden-startup-execution"))).toBe(false);
			expect(result.status).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("fixture-state.txt");
			expect(result.stdout).toContain(fixture);
			expect(command).not.toContain("/home/machine");
			expect(command).not.toContain("--version");
		} finally { panel.unmount(); rmSync(fixture, { recursive: true, force: true }); }
	});
});
