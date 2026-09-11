import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
type Method = "GET" | "POST" | "DELETE";
type ResponseStub = { ok: boolean; status: number; json: () => Promise<unknown> };
const response = (body: unknown, status = 200): ResponseStub => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
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

/** Execute the actual DeveloperApiKey component and event handlers. React hook
 * state is persistent, while HTTP, confirmation and clipboard are local fakes.
 * Unknown HTTP requests fail closed; no endpoint, provider or credential runs. */
function mount(options: {
	load?: () => Promise<ResponseStub>;
	confirm?: boolean;
	copy?: () => Promise<void>;
} = {}) {
	const cells: Array<{ value: any }> = [];
	const effects: Array<() => void> = [];
	const effectStates: Array<{ dependencies?: unknown[]; cleanup?: () => void }> = [];
	let cursor = 0;
	function cell(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { value: initial }); }
	const react = {
		useState(initial: unknown) {
			const state = cell(typeof initial === "function" ? initial() : initial);
			return [state.value, (value: any) => { state.value = typeof value === "function" ? value(state.value) : value; }];
		},
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useCallback: (callback: unknown) => callback,
		useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
			const state = cell({}).value as { dependencies?: unknown[]; cleanup?: () => void };
			if (!state.dependencies || dependencies.some((value, index) => !Object.is(value, state.dependencies![index]))) {
				state.dependencies = dependencies;
				effects.push(() => { state.cleanup?.(); state.cleanup = callback() || undefined; });
				if (!effectStates.includes(state)) effectStates.push(state);
			}
		},
	};
	const responders = new Map<Method, () => Promise<ResponseStub>>([
		["GET", options.load ?? (async () => response({ configured: false, key: null }))],
	]);
	const fetch = vi.fn(async (url: string, init?: { method?: string; cache?: string }) => {
		const method = (init?.method ?? "GET") as Method;
		if (url !== "/api/dashboard/api-key" || !responders.has(method)) throw new Error(`Unexpected mocked request: ${method} ${url}`);
		return responders.get(method)!();
	});
	const confirm = vi.fn((_message: string) => options.confirm ?? true);
	const writeText = vi.fn(async (_value: string) => options.copy?.());
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { DeveloperApiKey: () => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/SettingsPanel.tsx"), "utf8");
	runInNewContext(ts.transpileModule(`${source}\nexport { DeveloperApiKey };`, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch, Error, AbortController, window: { confirm }, navigator: { clipboard: { writeText } },
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
			: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
				: id.endsWith("ReticleButton") ? { ReticleButton: "button" }
					: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` }),
	});
	let tree: Element;
	const render = () => {
		cursor = 0; tree = module.exports.DeveloperApiKey();
		if (effects.length) {
			for (const callback of effects.splice(0)) callback();
			cursor = 0; tree = module.exports.DeveloperApiKey();
		}
	};
	const all = () => nodes(tree);
	const button = (label: string) => all().find((node) => node.type === "button" && text(node).trim() === label);
	render();
	return {
		all, button, fetch, confirm, writeText, render,
		copy: () => text(tree).replace(/\s+/g, " "),
		respond: (method: Method, send: () => Promise<ResponseStub>) => responders.set(method, send),
		click(label: string) {
			const target = button(label);
			if (!target) throw new Error(`Missing button ${label}: ${text(tree)}`);
			target.props.onClick(); render();
		},
		async settle() { await new Promise<void>((done) => setImmediate(done)); render(); },
		unmount() { for (const state of effectStates) state.cleanup?.(); },
	};
}

const savedKey = { prefix: "am_test_", lastFour: "1234", createdAt: "2026-08-01T00:00:00.000Z" };
const newKey = { prefix: "am_test_", lastFour: "5678", createdAt: "2026-08-02T00:00:00.000Z" };
const oneTimeToken = "not-a-real-key-one-time-fixture";
const created = { ok: true, key: savedKey, token: oneTimeToken };

describe("Developer API key (actual Settings TSX)", () => {
	it("invariant_loading_status_is_not_presented_as_an_empty_account", async () => {
		const load = deferred<ResponseStub>();
		const ui = mount({ load: () => load.promise });
		expect(ui.copy()).toMatch(/checking|loading/i);
		expect(ui.copy()).not.toContain("No key yet");
		expect(ui.button("Create key")).toBeUndefined();
		expect(ui.fetch).toHaveBeenCalledOnce();
		load.resolve(response({ configured: false, key: null })); await ui.settle();
		expect(ui.copy()).toContain("No key yet");
		expect(ui.button("Create key")?.props.disabled).not.toBe(true);
	});

	it.each(["http", "network", "malformed"])("invariant_%s_load_failures_remain_unknown_and_retryable", async (failure) => {
		const ui = mount({ load: async () => {
			if (failure === "network") throw new Error("Fixture connection unavailable");
			return failure === "http" ? response({ message: "Fixture key lookup unavailable" }, 503) : response({});
		} });
		await ui.settle();
		expect(ui.button("Create key")).toBeUndefined();
		expect(ui.copy()).not.toContain("No key yet");
		expect(ui.all().some((node) => node.props.role === "alert")).toBe(true);
		expect(ui.button("Retry key status")).toBeDefined();
		ui.respond("GET", async () => response({ configured: true, key: savedKey }));
		ui.click("Retry key status"); await ui.settle();
		expect(ui.fetch).toHaveBeenCalledTimes(2);
		expect(ui.copy()).toContain("am_test_••••1234");
		expect(ui.button("Rotate key")).toBeDefined();
		expect(ui.button("Revoke key")).toBeDefined();
	});

	it("invariant_unauthenticated_status_offers_sign_in_and_no_key_mutation", async () => {
		const ui = mount({ load: async () => response({ message: "Unauthorized" }, 401) });
		await ui.settle();
		expect(ui.copy()).toMatch(/sign in/i);
		expect(ui.copy()).not.toContain("No key yet");
		for (const label of ["Create key", "Rotate key", "Revoke key"]) expect(ui.button(label)).toBeUndefined();
		expect(ui.all().find((node) => node.type === "a" && /sign.in/i.test(node.props.href))?.props.href).toContain("/sign-in");
		expect(ui.fetch).toHaveBeenCalledOnce();
	});

	it("invariant_create_is_single_flight_and_reveals_the_key_only_after_success", async () => {
		const pending = deferred<ResponseStub>();
		const ui = mount(); await ui.settle();
		ui.respond("POST", () => pending.promise);
		const create = ui.button("Create key")!.props.onClick;
		create(); create(); ui.render();
		expect(ui.fetch).toHaveBeenCalledTimes(2);
		expect(ui.confirm).not.toHaveBeenCalled();
		expect(ui.button("Creating…")?.props.disabled).toBe(true);
		expect(ui.all().filter((node) => node.type === "button").every((node) => node.props.disabled)).toBe(true);
		expect(ui.copy()).not.toContain(oneTimeToken);
		pending.resolve(response(created)); await ui.settle();
		expect(ui.copy()).toContain(oneTimeToken);
		expect(ui.copy()).toContain("will not be shown again");
		expect(ui.button("Copy key")).toBeDefined();
		expect(ui.button("Create key")).toBeUndefined();
		expect(ui.button("Rotate key")?.props.disabled).not.toBe(true);
	});

	it.each(["Rotate key", "Revoke key"])("invariant_cancelling_%s_changes_nothing_and_sends_no_mutation", async (label) => {
		const ui = mount({ load: async () => response({ configured: true, key: savedKey }), confirm: false }); await ui.settle();
		ui.click(label); await ui.settle();
		expect(ui.confirm).toHaveBeenCalledOnce();
		expect(ui.confirm.mock.calls[0][0]).toMatch(/stop|fail|invalid|access/i);
		expect(ui.fetch).toHaveBeenCalledOnce();
		expect(ui.copy()).toContain("am_test_••••1234");
		expect(ui.button("Rotate key")?.props.disabled).not.toBe(true);
		expect(ui.button("Revoke key")?.props.disabled).not.toBe(true);
	});

	it.each(["Rotate key", "Revoke key"])("invariant_%s_serializes_competing_and_repeated_mutations", async (label) => {
		const pending = deferred<ResponseStub>();
		const ui = mount({ load: async () => response({ configured: true, key: savedKey }) }); await ui.settle();
		ui.respond("POST", () => pending.promise); ui.respond("DELETE", () => pending.promise);
		const rotate = ui.button("Rotate key")!.props.onClick;
		const revoke = ui.button("Revoke key")!.props.onClick;
		const start = label === "Rotate key" ? rotate : revoke;
		start(); rotate(); revoke(); ui.render();
		expect(ui.fetch).toHaveBeenCalledTimes(2);
		expect(ui.fetch.mock.calls[1][1]?.method).toBe(label === "Rotate key" ? "POST" : "DELETE");
		expect(ui.confirm).toHaveBeenCalledOnce();
		expect(ui.button(label === "Rotate key" ? "Rotating…" : "Revoking…")?.props.disabled).toBe(true);
		expect(ui.all().filter((node) => node.type === "button").every((node) => node.props.disabled)).toBe(true);
		pending.resolve(response(label === "Rotate key" ? { ok: true, key: newKey, token: "not-a-real-rotated-key" } : { ok: true }));
		await ui.settle();
		if (label === "Rotate key") {
			expect(ui.copy()).toContain("am_test_••••5678");
			expect(ui.copy()).toContain("not-a-real-rotated-key");
		} else {
			expect(ui.copy()).toContain("No key yet");
			expect(ui.copy()).toContain("revoked");
			expect(ui.button("Revoke key")).toBeUndefined();
		}
	});

	it.each(["http", "network", "malformed"])("invariant_failed_%s_rotation_preserves_the_one_time_token", async (failure) => {
		const ui = mount(); await ui.settle();
		ui.respond("POST", async () => response(created)); ui.click("Create key"); await ui.settle();
		ui.respond("POST", async () => {
			if (failure === "network") throw new Error("Fixture response lost");
			return failure === "http" ? response({ message: "Fixture rotation rejected" }, 500) : response({ key: newKey });
		});
		ui.click("Rotate key"); await ui.settle();
		expect(ui.copy()).toContain(oneTimeToken);
		expect(ui.copy()).toContain("Status unavailable");
		expect(ui.copy()).toContain("Any previously displayed key may no longer work");
		expect(ui.all().some((node) => node.props.role === "alert")).toBe(true);
		expect(ui.button("Rotate key")).toBeUndefined();
		expect(ui.button("Retry key status")).toBeDefined();
		expect(ui.button("Copy key")).toBeDefined();
	});

	it.each([
		{ name: "unchanged", key: savedKey, keepToken: true },
		{ name: "replaced", key: newKey, keepToken: false },
		{ name: "revoked", key: null, keepToken: false },
	])("invariant_retry_reconciles_a_$name_key_before_allowing_more_mutations", async ({ key, keepToken }) => {
		const ui = mount(); await ui.settle();
		ui.respond("POST", async () => response(created)); ui.click("Create key"); await ui.settle();
		ui.respond("POST", async () => { throw new Error("Fixture rotation response lost"); });
		ui.click("Rotate key"); await ui.settle();
		const pending = deferred<ResponseStub>();
		ui.respond("GET", () => pending.promise);
		const retry = ui.button("Retry key status")!.props.onClick;
		retry(); retry(); ui.render();
		expect(ui.fetch).toHaveBeenCalledTimes(4);
		expect(ui.copy()).toContain("Checking…");
		for (const label of ["Create key", "Rotate key", "Revoke key"]) expect(ui.button(label)).toBeUndefined();
		expect(ui.button("Copy key")?.props.disabled).toBe(true);
		pending.resolve(response({ configured: key !== null, key })); await ui.settle();
		if (keepToken) expect(ui.copy()).toContain(oneTimeToken);
		else expect(ui.copy()).not.toContain(oneTimeToken);
		expect(ui.button(key ? "Rotate key" : "Create key")?.props.disabled).not.toBe(true);
		expect(ui.copy()).not.toContain("Status unavailable");
	});

	it.each(["POST", "DELETE"] as const)("invariant_expired_sign_in_during_%s_hides_the_token_and_mutations", async (method) => {
		const ui = mount(); await ui.settle();
		ui.respond("POST", async () => response(created)); ui.click("Create key"); await ui.settle();
		ui.respond(method, async () => response({ message: "Unauthorized" }, 401));
		ui.click(method === "POST" ? "Rotate key" : "Revoke key"); await ui.settle();
		expect(ui.copy()).toContain("Sign-in required");
		expect(ui.copy()).not.toContain(oneTimeToken);
		for (const label of ["Create key", "Rotate key", "Revoke key", "Copy key"]) expect(ui.button(label)).toBeUndefined();
		expect(ui.all().some((node) => node.props.href === "/sign-in?redirect_url=%2Fdashboard%2Fsettings")).toBe(true);
	});

	it("invariant_failed_revoke_retains_the_visible_key_and_success_clears_it", async () => {
		const ui = mount(); await ui.settle();
		ui.respond("POST", async () => response(created)); ui.click("Create key"); await ui.settle();
		ui.respond("DELETE", async () => response({ message: "Fixture revoke rejected" }, 503));
		ui.click("Revoke key"); await ui.settle();
		expect(ui.copy()).toContain(oneTimeToken);
		expect(ui.copy()).toContain("Status unavailable");
		expect(ui.copy()).toContain("Could not confirm revocation");
		expect(ui.button("Revoke key")).toBeUndefined();
		ui.respond("GET", async () => response({ configured: true, key: savedKey }));
		ui.click("Retry key status"); await ui.settle();
		expect(ui.copy()).toContain(oneTimeToken);
		ui.respond("DELETE", async () => response({ ok: true })); ui.click("Revoke key"); await ui.settle();
		expect(ui.copy()).not.toContain(oneTimeToken);
		expect(ui.copy()).toContain("No key yet");
		expect(ui.button("Copy key")).toBeUndefined();
		expect(ui.button("Create key")).toBeDefined();
	});

	it("invariant_copy_is_single_flight_and_reports_confirmed_clipboard_success", async () => {
		const pending = deferred<void>();
		const ui = mount({ copy: () => pending.promise }); await ui.settle();
		ui.respond("POST", async () => response(created)); ui.click("Create key"); await ui.settle();
		const copy = ui.button("Copy key")!.props.onClick;
		const rotate = ui.button("Rotate key")!.props.onClick;
		const revoke = ui.button("Revoke key")!.props.onClick;
		copy(); copy(); rotate(); revoke(); ui.render();
		expect(ui.writeText).toHaveBeenCalledExactlyOnceWith(oneTimeToken);
		expect(ui.confirm).not.toHaveBeenCalled();
		expect(ui.fetch).toHaveBeenCalledTimes(2);
		expect(ui.button("Rotate key")?.props.disabled).toBe(true);
		expect(ui.button("Revoke key")?.props.disabled).toBe(true);
		expect(ui.copy()).toMatch(/copying/i);
		expect(ui.button("Copying…")?.props.disabled).toBe(true);
		expect(ui.copy()).not.toMatch(/copied/i);
		pending.resolve(); await ui.settle();
		expect(ui.copy()).toMatch(/copied/i);
		expect(ui.copy()).toContain(oneTimeToken);
		expect(ui.fetch).toHaveBeenCalledTimes(2);
	});

	it("invariant_clipboard_failure_keeps_the_token_available_for_manual_copy_and_retry", async () => {
		let rejectCopy = true;
		const ui = mount({ copy: async () => { if (rejectCopy) throw new Error("Fixture clipboard unavailable"); } }); await ui.settle();
		ui.respond("POST", async () => response(created)); ui.click("Create key"); await ui.settle();
		ui.click("Copy key"); await ui.settle();
		expect(ui.copy()).toContain(oneTimeToken);
		expect(ui.copy()).toMatch(/copy.*manually|select.*copy|clipboard/i);
		expect(ui.copy()).not.toMatch(/copied/i);
		expect(ui.button("Copy key")?.props.disabled).not.toBe(true);
		rejectCopy = false; ui.click("Copy key"); await ui.settle();
		expect(ui.writeText).toHaveBeenCalledTimes(2);
		expect(ui.copy()).toMatch(/copied/i);
		expect(ui.fetch).toHaveBeenCalledTimes(2);
	});
});
