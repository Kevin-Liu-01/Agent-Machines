import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...elements(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}

/** Execute the actual TSX and action handlers with hook cells and an inert DOM. */
function mount(props: Record<string, unknown>) {
	const cells: unknown[] = [];
	let cursor = 0;
	const fetch = vi.fn(async () => new Response(JSON.stringify({ operation: { id: "pause-operation" } }), { status: 202 }));
	const wait = vi.fn(async () => {}), changed = vi.fn();
	const module = { exports: {} as { MachineActions: (props: Record<string, unknown>) => Element } };
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/MachineActions.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, fetch,
		require: (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id === "react" ? { useCallback: (fn: unknown) => fn, useState: (initial: unknown) => { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], (value: unknown) => { cells[index] = value; }]; } }
				: id.endsWith("control-plane/client") ? { waitForControlPlaneOperation: wait }
					: id.endsWith("deletion-warning") ? { deletionStorageWarning: () => null }
						: { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
	});
	return {
		fetch, wait, changed,
		render(overrides: Record<string, unknown> = {}) { cursor = 0; return module.exports.MachineActions({ machineId: "target-machine", providerKind: "e2b", state: "ready", active: true, onChange: changed, ...props, ...overrides }); },
	};
}
function action(tree: Element, label: string) { return elements(tree).find((element) => element.props.label === label); }

describe("manual pause controls", () => {
	it.each([undefined, null, {}, { canSleep: false }])("does not offer Sleep with unknown or unsupported capabilities: %j", (capabilities) => {
		const ui = mount({ capabilities });
		expect(action(ui.render(), "sleep")).toBeUndefined();
		expect(ui.fetch).not.toHaveBeenCalled();
	});

	it.each(["sprites", "dedalus"])("explains unavailable %s pause without promising compute stopped", (providerKind) => {
		const ui = mount({ providerKind, capabilities: { canSleep: false } });
		const tree = ui.render();
		expect(action(tree, "sleep")).toBeUndefined();
		expect(text(tree)).toContain("Manual pause is unavailable");
		if (providerKind === "sprites") {
			expect(text(tree)).toContain("automatic idle suspension");
			expect(text(tree)).toContain("active work or traffic can keep it running");
		} else expect(text(tree)).toContain("does not stop compute");
	});

	it.each(["e2b", "vercel"])("offers %s Sleep only when ready and explicitly supported, and waits for the journal", async (providerKind) => {
		const ui = mount({ providerKind, capabilities: { canSleep: true } });
		expect(action(ui.render({ state: "starting" }), "sleep")).toBeUndefined();
		expect(action(ui.render({ state: "sleeping" }), "sleep")).toBeUndefined();
		const sleep = action(ui.render(), "sleep")!;
		expect(sleep).toBeDefined();
		(sleep.props.onClick as () => void)();
		await new Promise(setImmediate);
		expect(ui.fetch).toHaveBeenCalledExactlyOnceWith("/api/dashboard/machines/target-machine/sleep", { method: "POST" });
		expect(ui.wait).toHaveBeenCalledExactlyOnceWith("pause-operation");
		expect(ui.changed).toHaveBeenCalledTimes(1);
	});

	it("surfaces a server capability rejection rather than reporting success", async () => {
		const ui = mount({ capabilities: { canSleep: true } });
		ui.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "not_supported", message: "Manual pause is unavailable. No compute was stopped." }), { status: 409 }));
		(action(ui.render(), "sleep")!.props.onClick as () => void)();
		await new Promise(setImmediate);
		expect(text(ui.render())).toContain("Manual pause is unavailable. No compute was stopped.");
		expect(ui.wait).not.toHaveBeenCalled();
		expect(ui.changed).not.toHaveBeenCalled();
	});
});
