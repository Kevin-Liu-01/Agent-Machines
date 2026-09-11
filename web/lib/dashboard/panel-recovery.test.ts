import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
type Plan = { status?: number; body: any } | Error | Promise<{ status?: number; body: any }>;
type Cell = { value?: any; deps?: readonly unknown[]; cleanup?: () => void };
const deferred = () => {
	let resolve!: (value: { status?: number; body: any }) => void;
	const promise = new Promise<{ status?: number; body: any }>((done) => { resolve = done; });
	return { promise, resolve };
};
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

/** Actual TSX hooks and handlers, deterministic timers, fail-closed fetch plans.
 * Child primitives remain descriptors; root tests cover their rendered markup. */
function mount(file: string, exported: string, props: Record<string, any> = {}, options: { exports?: string; imports?: Record<string, any>; plans?: Record<string, Plan>; machineId?: string } = {}) {
	let cursor = 0, changed = false, tree: Element;
	const cells: Cell[] = [], effects: Array<() => void> = [];
	const plans = new Map(Object.entries(options.plans ?? {}));
	const timers = new Map<number, () => void>();
	let timerId = 0;
	const confirm = vi.fn(() => true), push = vi.fn();
	const request = vi.fn(async (url: string, init: { method?: string; signal?: AbortSignal; body?: string } = {}) => {
		const plan = plans.get(`${init.method ?? "GET"} ${url}`);
		if (!plan) throw new Error(`Unplanned mocked request: ${init.method ?? "GET"} ${url}`);
		if (plan instanceof Error) throw plan;
		const response = await plan;
		return { ok: (response.status ?? 200) < 400, status: response.status ?? 200, json: async () => response.body };
	});
	const same = (a?: readonly unknown[], b?: readonly unknown[]) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
	const react = {
		useState(initial: unknown) {
			const index = cursor++;
			if (!cells[index]) cells[index] = { value: typeof initial === "function" ? initial() : initial };
			return [cells[index].value, (next: unknown) => {
				const value = typeof next === "function" ? next(cells[index].value) : next;
				if (!Object.is(value, cells[index].value)) { cells[index].value = value; changed = true; }
			}];
		},
		useRef(initial: unknown) {
			const index = cursor++;
			if (!cells[index]) cells[index] = { value: { current: initial } };
			return cells[index].value;
		},
		useMemo(factory: () => unknown, deps?: readonly unknown[]) {
			const index = cursor++;
			if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: factory(), deps };
			return cells[index].value;
		},
		useCallback(callback: unknown, deps?: readonly unknown[]) { return react.useMemo(() => callback, deps); },
		useEffect(callback: () => void | (() => void), deps?: readonly unknown[]) {
			const index = cursor++;
			if (!cells[index] || !same(cells[index].deps, deps)) {
				const prior = cells[index]?.cleanup;
				cells[index] = { deps };
				effects.push(() => { prior?.(); const cleanup = callback(); if (cleanup) cells[index].cleanup = cleanup; });
			}
		},
	};
	const module = { exports: {} as Record<string, (props: Record<string, any>) => Element> };
	const source = readFileSync(resolve(process.cwd(), `components/dashboard/${file}.tsx`), "utf8");
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const interval = (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; };
	runInNewContext(ts.transpileModule(`${source}\n${options.exports ?? ""}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
		module, exports: module.exports, fetch: request, Error, AbortController, URLSearchParams,
		setInterval: interval, clearInterval: (id: number) => timers.delete(id),
		window: { setInterval: interval, clearInterval: (id: number) => timers.delete(id), confirm },
		document: { visibilityState: "visible" },
		require: (id: string) => options.imports?.[id] ?? (id === "react" ? react
			: id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
				: id === "next/link" ? { default: "a" }
					: id === "next/navigation" ? { useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams() }
						: id.endsWith("MachineProvider") ? { useOptionalMachineContext: () => options.machineId ? { machineId: options.machineId } : null }
							: id.endsWith("ReticleButton") ? { ReticleButton: "button" }
								: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
									: id.endsWith("/format") ? { formatAge: () => "just now", formatBytes: (value: number) => `${value} B`, formatDuration: (value: number) => `${value} ms` }
										: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` })),
	});
	const draw = () => {
		for (let index = 0; index < 8; index++) {
			changed = false; cursor = 0; tree = module.exports[exported](props);
			for (const effect of effects.splice(0)) effect();
			if (!changed) return tree;
		}
		throw new Error("Unstable mocked render");
	};
	const find = (predicate: (node: Element) => boolean) => {
		const found = nodes(tree).find(predicate);
		if (!found) throw new Error(`Missing element. Visible copy: ${text(tree)}`);
		return found;
	};
	const button = (label: string) => find(node => node.type === "button" && text(node).replace(/\s+/g, " ").trim() === label);
	draw();
	return {
		request, confirm, push, draw, find, button,
		all: () => nodes(tree), copy: () => text(tree),
		respond: (url: string, plan: Plan, method = "GET") => plans.set(`${method} ${url}`, plan),
		async settle() { draw(); await new Promise<void>(done => setImmediate(done)); return draw(); },
		click(label: string) { button(label).props.onClick(); return draw(); },
		change(label: string, value: string) { find(node => node.props["aria-label"] === label).props.onChange({ target: { value } }); return draw(); },
		update(next: Record<string, any>) { props = { ...props, ...next }; return draw(); },
		loading: () => nodes(tree).find(node => node.type === "stub-DashboardLoadingState")?.props.label,
		unmount() { cells.forEach(cell => cell.cleanup?.()); },
	};
}

const docs = { soul: "Persona", agentDocs: "Rules", memory: "Context", user: "Operator" };
const bundle = { id: "memory-one", name: "Review memory", description: "Existing instructions", source: "custom", docs, skillIds: [], toolIds: [], mcpServerIds: [], updatedAt: "2026-09-10T00:00:00Z" };
const emptyAbilities = { skills: [], tools: [], mcps: [] };
const memoryPath = "/api/dashboard/memory/memory-one";
function editor(plans: Record<string, Plan> = {}) {
	return mount("MemoryBundleEditor", "MemoryBundleEditor", { bundleId: bundle.id }, { plans: {
		[`GET ${memoryPath}`]: { body: { ok: true, bundle, abilities: emptyAbilities, available: emptyAbilities } },
		"GET /api/dashboard/machines": { body: { machines: [] } },
		...plans,
	} });
}

describe("memory editor recovery (actual TSX)", () => {
	it("invariant_loading_and_failed_reads_have_distinct_recovery_surfaces", async () => {
		const ui = editor({ [`GET ${memoryPath}`]: new Error("Read failed") });
		expect(ui.loading()).toBe("Loading memory bundle…");
		await ui.settle();
		const recovery = ui.find(node => node.type === "stub-EmptyState");
		expect(recovery.props.title).toBe("Could not load this memory bundle");
		expect(ui.loading()).toBeUndefined();
		ui.respond(memoryPath, { body: { ok: true, bundle, abilities: emptyAbilities, available: emptyAbilities } });
		recovery.props.onRetry();
		await ui.settle();
		expect(ui.find(node => node.props["aria-label"] === "Memory bundle name").props.value).toBe(bundle.name);
	});

	it.each([new Error("Connection lost"), { status: 503, body: { error: "Storage unavailable" } }, { body: { ok: true, bundle: { id: bundle.id } } }])("invariant_failed_save_keeps_edits_and_does_not_claim_success (%j)", async plan => {
		const ui = editor({ [`PATCH ${memoryPath}`]: plan });
		await ui.settle();
		ui.change("Memory bundle name", "My unsaved edits");
		ui.click("Save");
		await ui.settle();
		expect(ui.find(node => node.props["aria-label"] === "Memory bundle name").props.value).toBe("My unsaved edits");
		expect(ui.copy()).toContain("Unsaved changes");
		expect(ui.all().some(node => node.props.role === "alert")).toBe(true);
		expect(ui.all().some(node => node.type === "stub-EmptyState")).toBe(false);
		expect(ui.button("Export").props.disabled).toBe(true);
	});

	it("invariant_pending_save_is_single_flight_and_cannot_overwrite_newer_edits", async () => {
		const pending = deferred();
		const ui = editor({ [`PATCH ${memoryPath}`]: pending.promise });
		await ui.settle();
		ui.change("Memory bundle name", "Submitted edit");
		const save = ui.button("Save").props.onClick;
		save(); save(); ui.draw();
		expect(ui.request.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
		expect(ui.button("saving…").props.disabled).toBe(true);
		ui.change("Memory bundle name", "Typed while saving");
		pending.resolve({ body: { ok: true, bundle: { ...bundle, name: "Submitted edit" } } });
		await ui.settle();
		expect(ui.find(node => node.props["aria-label"] === "Memory bundle name").props.value).toBe("Typed while saving");
		expect(ui.copy()).toContain("Unsaved changes");
	});

	it("invariant_successful_save_enables_export_and_exports_fail_visibly", async () => {
		const ui = editor({ [`PATCH ${memoryPath}`]: { body: { ok: true, bundle: { ...bundle, name: "Saved edit" } } }, [`POST ${memoryPath}/export`]: new Error("Export unavailable") });
		await ui.settle();
		ui.change("Memory bundle name", "Saved edit"); ui.click("Save"); await ui.settle();
		expect(ui.copy()).not.toContain("Unsaved changes");
		expect(ui.button("Export").props.disabled).toBe(false);
		ui.click("Export"); await ui.settle();
		expect(text(ui.find(node => node.props.role === "alert"))).toContain("Export unavailable");
		expect(ui.button("Export").props.disabled).toBe(false);
		ui.respond(`${memoryPath}/export`, { body: { ok: true, prompt: "# Exported memory", filename: "review.md" } }, "POST");
		ui.click("Export"); await ui.settle();
		expect(ui.find(node => node.props.filename === "review.md").props.text).toBe("# Exported memory");
	});

	it("invariant_unknown_machine_list_is_not_an_empty_list_and_retry_recovers", async () => {
		const ui = editor({ "GET /api/dashboard/machines": new Error("Machine read failed") });
		await ui.settle();
		expect(ui.copy()).toContain("Could not load your machines");
		expect(ui.copy()).not.toContain("You can edit memory without a machine");
		expect(ui.button("Install to machine").props.disabled).toBe(true);
		ui.respond("/api/dashboard/machines", { body: { machines: [] } });
		ui.click("Retry machine list"); await ui.settle();
		expect(ui.copy()).toContain("You can edit memory without a machine");
		expect(ui.find(node => node.props.href === "/dashboard/setup")).toBeDefined();
	});

	it("invariant_install_uses_a_current_target_requires_confirmation_and_stays_single_flight", async () => {
		const pending = deferred();
		const ui = editor({ "GET /api/dashboard/machines": { body: { machines: [{ id: "archived", name: "Archived", archived: true }, { id: "worker/a", name: "Current" }] } }, [`POST ${memoryPath}/install`]: pending.promise });
		await ui.settle();
		const selector = ui.find(node => node.props.ariaLabel === "Install target machine");
		expect(selector.props.options).toEqual([{ value: "worker/a", label: "Current" }]);
		ui.confirm.mockReturnValueOnce(false); ui.click("Install to machine");
		expect(ui.request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
		const install = ui.button("Install to machine").props.onClick;
		install(); install(); ui.draw();
		const writes = ui.request.mock.calls.filter(([, init]) => init?.method === "POST");
		expect(writes).toHaveLength(1);
		expect(JSON.parse(writes[0][1]!.body!)).toEqual({ machineId: "worker/a" });
		selector.props.onChange("archived"); ui.draw();
		expect(ui.find(node => node.props.ariaLabel === "Install target machine").props.value).toBe("worker/a");
		expect(ui.button("installing…").props.disabled).toBe(true);
		pending.resolve({ status: 500, body: { ok: true } }); await ui.settle();
		expect(ui.copy()).not.toContain("Installed to machine.");
		expect(ui.copy()).toContain("Installation failed");
	});
});

describe("machine memory read ownership", () => {
	it("invariant_new_target_and_unmount_ignore_late_comparison_responses", async () => {
		const first = deferred(), second = deferred();
		const endpoint = "/api/dashboard/memory/on-machine";
		const ui = mount("OnMachineMemory", "OnMachineMemory", { machineId: "first", bundle }, { plans: { [`POST ${endpoint}`]: first.promise } });
		ui.respond(endpoint, second.promise, "POST"); ui.update({ machineId: "second" });
		expect(ui.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
		second.resolve({ body: { ok: true, docs } }); await ui.settle();
		expect(ui.copy()).toContain("in sync");
		first.resolve({ status: 503, body: { ok: false } }); await ui.settle();
		expect(ui.copy()).toContain("in sync");
		expect(ui.copy()).not.toContain("Machine is asleep");
		ui.unmount();
		expect(ui.request.mock.calls[1][1]?.signal?.aborted).toBe(true);
	});

	it("invariant_failed_comparison_has_retry_and_sleeping_machine_has_scoped_management", async () => {
		const endpoint = "/api/dashboard/memory/on-machine";
		const ui = mount("OnMachineMemory", "OnMachineMemory", { machineId: "worker/a", bundle }, { plans: { [`POST ${endpoint}`]: new Error("Read unavailable") } });
		await ui.settle();
		expect(text(ui.find(node => node.props.role === "alert"))).toBe("Read unavailable");
		ui.respond(endpoint, { status: 503, body: { ok: false } }, "POST");
		ui.click("Retry comparison"); await ui.settle();
		expect(ui.find(node => node.props.href === "/dashboard/machines/worker%2Fa")).toBeDefined();
		expect(ui.copy()).not.toContain("in sync");
	});
});

describe("data and library empty-state recovery", () => {
	it("invariant_live_read_failures_retry_the_same_endpoint_without_setup_or_compute_actions", async () => {
		const endpoint = "/api/dashboard/sessions?machineId=worker%2Fa";
		const ui = mount("LiveDataView", "LiveDataView", { endpoint, loadingLabel: "Loading saved conversations…", render: (data: any) => ({ type: "p", props: { children: data.message } }) }, { plans: { [`GET ${endpoint}`]: { body: { ok: false, reason: "exec_failed", message: "Try reading again" } } } });
		expect(ui.loading()).toBe("Loading saved conversations…"); await ui.settle();
		const empty = ui.find(node => node.type === "stub-EmptyState");
		expect(empty.props.action.href).toBe("/dashboard/machines/worker%2Fa");
		ui.respond(endpoint, { body: { ok: true, data: { message: "Conversation found" }, fetchedAt: "2026-09-10" } });
		empty.props.onRetry(); await ui.settle();
		expect(ui.copy()).toContain("Conversation found");
		expect(ui.request.mock.calls).toHaveLength(2);
		expect(ui.request.mock.calls.every(([url, init]) => url === endpoint && !init?.method)).toBe(true);
		ui.unmount();
		expect(ui.request.mock.calls[1][1]?.signal?.aborted).toBe(true);
	});

	it("invariant_logs_empty_state_leads_to_the_same_machine_and_follow_has_toggle_semantics", async () => {
		const ui = mount("LogsTail", "LogsTail", {}, { machineId: "worker/a", plans: { "GET /api/dashboard/logs?n=200&machineId=worker%2Fa": { body: { ok: true, data: { lines: [], files: [], tailLines: 200 }, fetchedAt: "2026-09-10" } } } });
		expect(ui.loading()).toBe("Loading logs…"); await ui.settle();
		expect(ui.button("Open agent console").props.href).toBe("/dashboard/machines/worker%2Fa/console");
		expect(ui.button("Following").props["aria-pressed"]).toBe(true);
		ui.click("Following");
		expect(ui.button("Paused").props["aria-pressed"]).toBe(false);
		ui.unmount();
	});

	it("invariant_file_read_failure_replaces_loading_with_retry_then_real_empty_state", async () => {
		const endpoint = "/api/dashboard/artifacts?machineId=worker%2Fa";
		const ui = mount("ArtifactsPanel", "MachineArtifacts", { machineId: "worker/a" }, { exports: "export { MachineArtifacts };", plans: { [`GET ${endpoint}`]: new Error("Files unavailable") } });
		expect(ui.loading()).toBe("Loading workspace files…");
		await ui.settle();
		expect(ui.loading()).toBeUndefined();
		expect(ui.copy()).not.toContain("No artifacts yet");
		ui.respond(endpoint, { body: { ok: true, artifacts: [], machineId: "worker/a" } });
		ui.click("Retry files"); await ui.settle();
		expect(ui.copy()).toContain("No artifacts yet");
		expect(ui.button("Open agent console").props.href).toBe("/dashboard/machines/worker%2Fa/console");
		expect(ui.request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
		ui.unmount();
	});

	it("invariant_memory_empty_state_offers_local_creation_and_filtered_empty_can_reset", async () => {
		const ui = mount("MemoryLibrary", "MemoryLibrary", {}, { plans: { "GET /api/dashboard/memory": { body: { ok: true, bundles: [] } } } });
		expect(ui.loading()).toBe("Loading memory bundles…"); await ui.settle();
		ui.click("Create a memory bundle");
		expect(ui.find(node => node.props.title === "New memory bundle")).toBeDefined();
		expect(ui.request).toHaveBeenCalledTimes(1);
		ui.find(node => node.props.title === "New memory bundle").props.onCancel(); ui.draw();
		ui.find(node => node.props.label === "Search memory").props.onChange("missing"); ui.draw();
		ui.click("Clear search");
		expect(ui.find(node => node.props.label === "Search memory").props.value).toBe("");
	});

	it.each(["McpLibrary", "SkillsBrowser"])("invariant_%s_filtered_empty_has_a_local_reset", (file) => {
		const props = file === "McpLibrary" ? { servers: [{ name: "Docs", owner: "Team", source: "docs", tools: [] }] } : { skills: [{ slug: "review", name: "Review", description: "Review code", category: "engineering" }], categories: ["engineering"] };
		const ui = mount(file, file, props);
		ui.find(node => node.props.label === (file === "McpLibrary" ? "Search servers and tools" : "Search skills")).props.onChange("missing"); ui.draw();
		ui.click(file === "McpLibrary" ? "Clear search" : "Clear filters");
		expect(ui.find(node => node.props.label === (file === "McpLibrary" ? "Search servers and tools" : "Search skills")).props.value).toBe("");
		expect(ui.request).not.toHaveBeenCalled();
	});

	it("invariant_schedule_history_failure_can_retry_without_creating_a_schedule", async () => {
		const ui = mount("CronPanel", "CronPanel", {}, { plans: { "GET /api/dashboard/machines": { body: { machines: [] } }, "GET /api/dashboard/crons": new Error("History unavailable") } });
		await ui.settle();
		expect(ui.copy()).toContain("History unavailable");
		ui.respond("/api/dashboard/crons", { body: { ok: true, crons: [], runs: [] } });
		ui.click("Retry run history"); await ui.settle();
		expect(ui.copy()).toContain("No recorded runs yet");
		expect(ui.request.mock.calls.filter(([url]) => url === "/api/dashboard/crons")).toHaveLength(2);
		expect(ui.request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
		ui.unmount();
	});
});
