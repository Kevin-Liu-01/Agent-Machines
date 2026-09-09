import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Node = { type: unknown; props: Record<string, any> };
/** Run the real component's event handlers/effects without a DOM dependency. */
function mountPicker() {
	type Hook = { value?: any; deps?: unknown[]; cleanup?: () => void };
	const hooks: Hook[] = [];
	let cursor = 0, dirty = false, effects: Array<() => void> = [], target = "first-worker", tree: Node;
	const next = () => hooks[cursor++] ?? (hooks[cursor - 1] = {});
	const equal = (a?: unknown[], b?: unknown[]) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
	const react = {
		useState(initial: unknown) { const h = next(); if (!("value" in h)) h.value = initial; return [h.value, (v: any) => { h.value = typeof v === "function" ? v(h.value) : v; dirty = true; }]; },
		useRef(initial: unknown) { const h = next(); return h.value ?? (h.value = { current: initial }); },
		useCallback(fn: unknown, deps: unknown[]) { const h = next(); if (!equal(h.deps, deps)) { h.deps = deps; h.value = fn; } return h.value; },
		useEffect(effect: () => void | (() => void), deps: unknown[]) { const h = next(); if (!equal(h.deps, deps)) { h.deps = deps; effects.push(() => { h.cleanup?.(); h.cleanup = effect() || undefined; }); } },
	};
	const catalog = [{ id: "current-model", label: "Current" }, { id: "next-model", label: "Next" }];
	const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/models")
		? { ok: true, models: catalog, source: "fixture" }
		: { ok: true, machines: [{ id: "first-worker", model: "current-model" }, { id: "second-worker", model: "current-model" }], activeMachineId: "different-active-worker" } }));
	let complete!: (message: string) => void;
	let fail!: (error: Error) => void;
	const update = vi.fn((_target: string, _selection: unknown, progress?: (message: string) => void) => {
		progress?.("Runtime update queued…");
		return new Promise<string>((resolveRequest, rejectRequest) => { complete = resolveRequest; fail = rejectRequest; });
	});
	const refreshRouter = vi.fn();
	const module = { exports: {} as { ModelSwitcher: (props: { activeMachineId: string }) => Node } };
	const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
	const imports: Record<string, unknown> = {
		react, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/navigation": { useRouter: () => ({ refresh: refreshRouter }) },
		"@/components/Logo": { Logo: () => null }, "@/lib/cn": { cn: () => "" },
		"@/lib/dashboard/model-catalog": { MODEL_CATALOG: catalog, groupedModelCatalog: (models: unknown[]) => [{ group: "fixture", label: "Models", models }], modelDisplayLabel: (id: string) => id, modelOptionFromId: (value: unknown) => value, modelProviderMark: () => null },
		"@/lib/dashboard/sidebar-popover": { useSidebarPopoverStyle: () => undefined },
		"@/lib/dashboard/header-chrome": { headerControlTrigger: () => "" },
		"@/lib/dashboard/machine-runtime-update": { requestMachineRuntimeUpdate: update },
	};
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/ModelSwitcher.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, Error, require: (id: string) => { if (!(id in imports)) throw new Error(`Unexpected import: ${id}`); return imports[id]; },
		fetch: fetchMock, window: { setInterval: () => 1, clearInterval: () => undefined },
		document: { visibilityState: "visible", addEventListener: () => undefined, removeEventListener: () => undefined },
	});
	const render = () => { cursor = 0; dirty = false; effects = []; tree = module.exports.ModelSwitcher({ activeMachineId: target }); for (const effect of effects) effect(); };
	const nodes = (node: unknown): Node[] => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" && "props" in node ? [node as Node, ...nodes((node as Node).props.children)] : [];
	const texts = (node: unknown): string => Array.isArray(node) ? node.map(texts).join(" ") : node && typeof node === "object" && "props" in node ? texts((node as Node).props.children) : typeof node === "string" ? node : "";
	const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(setImmediate); if (dirty) render(); } };
	render();
	return {
		fetchMock, update, refreshRouter, flush,
		async choose() {
			await flush(); nodes(tree).find((node) => node.type === "button" && node.props["aria-haspopup"] === "listbox")!.props.onClick(); await flush();
			nodes(tree).filter((node) => node.props.role === "option")[1].props.onClick(); await flush();
		},
		text: () => texts(tree),
		complete: (message: string) => complete(message), fail: (error: Error) => fail(error),
		switch: (id: string) => { target = id; render(); },
		unmount: () => { for (const hook of hooks) hook.cleanup?.(); },
	};
}

it("invariant_picker_pins_the_viewed_worker_and_waits_without_changing_the_global_draft", async () => {
	const picker = mountPicker();
	try {
		await picker.choose();
		expect(picker.update).toHaveBeenCalledWith("first-worker", { model: "next-model" }, expect.any(Function));
		expect(picker.fetchMock.mock.calls.every(([url]) => !url.includes("/admin/setup"))).toBe(true);
		expect(picker.text()).toContain("Runtime update queued");
		expect(picker.refreshRouter).not.toHaveBeenCalled();
		picker.complete("Saved for next wake. The Worker remains paused."); await picker.flush();
		expect(picker.text()).toContain("Saved for next wake");
		expect(picker.refreshRouter).toHaveBeenCalledOnce();
	} finally { picker.unmount(); }
});
it("invariant_failed_runtime_change_remains_visible_and_does_not_refresh_as_success", async () => {
	const picker = mountPicker();
	try {
		await picker.choose(); picker.fail(new Error("Selected model was rejected")); await picker.flush();
		expect(picker.text()).toContain("Selected model was rejected");
		expect(picker.text()).not.toContain("Runtime update queued");
		expect(picker.refreshRouter).not.toHaveBeenCalled();
	} finally { picker.unmount(); }
});
it("invariant_an_old_worker_operation_cannot_update_the_newly_viewed_picker", async () => {
	const picker = mountPicker();
	try {
		await picker.choose(); picker.switch("second-worker"); await picker.flush();
		picker.complete("Runtime configuration applied."); await picker.flush();
		expect(picker.text()).not.toContain("Runtime configuration applied");
		expect(picker.refreshRouter).not.toHaveBeenCalled();
	} finally { picker.unmount(); }
});
