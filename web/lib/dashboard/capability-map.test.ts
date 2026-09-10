import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { DASHBOARD_CAPABILITIES, DASHBOARD_CAPABILITY_GROUPS } from "./capabilities";

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function content(value: unknown): string {
	if (Array.isArray(value)) return value.map(content).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? content((value as Element).props?.children) : "";
}

/** Actual TSX, with only hook scheduling and browser focus controlled. */
function mountMap(hasMachine = false, prefix = "capability-fixture") {
	const cells: Array<{ value: any }> = [];
	let cursor = 0, tree: Element, focused: string | null = null;
	const requests = vi.fn(() => { throw new Error("Category navigation must not make requests"); });
	const react = {
		useId: () => prefix,
		useState(initial: unknown) {
			const index = cursor++;
			const cell = cells[index] ?? (cells[index] = { value: typeof initial === "function" ? initial() : initial });
			return [cell.value, (value: unknown) => { cell.value = typeof value === "function" ? value(cell.value) : value; }];
		},
		useRef(initial: unknown) {
			const index = cursor++;
			return (cells[index] ?? (cells[index] = { value: { current: initial } })).value;
		},
	};
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { CapabilityMap: (props: { hasMachine: boolean }) => Element } };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/CapabilityMap.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch: requests,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("dashboard/capabilities") ? { DASHBOARD_CAPABILITIES, DASHBOARD_CAPABILITY_GROUPS }
				: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
					: id === "next/link" ? { default: "a", __esModule: true }
						: new Proxy({}, { get: () => () => null }),
	});
	function render() {
		cursor = 0;
		tree = module.exports.CapabilityMap({ hasMachine });
		for (const node of nodes(tree)) {
			if (node.props.role === "tab" && typeof node.props.ref === "function") {
				node.props.ref({ focus: () => { focused = node.props.id; } });
			}
		}
	}
	const tabs = () => nodes(tree).filter((node) => node.props.role === "tab");
	const panels = () => nodes(tree).filter((node) => node.props.role === "tabpanel");
	render();
	return {
		tabs, panels, requests,
		active: () => panels().filter((panel) => !panel.props.hidden),
		focused: () => focused,
		click(index: number) { tabs()[index].props.onClick(); render(); },
		key(index: number, key: string, modifiers: Record<string, boolean> = {}) {
			const preventDefault = vi.fn();
			tabs()[index].props.onKeyDown({ key, preventDefault, ...modifiers });
			render();
			return preventDefault;
		},
		setMachine(value: boolean) { hasMachine = value; render(); },
	};
}

describe("capability category navigation (actual TSX)", () => {
	it("invariant_one_category_is_visible_and_the_tab_and_panel_are_linked", () => {
		const map = mountMap();
		expect(map.tabs()).toHaveLength(4);
		expect(map.tabs().filter((tab) => tab.props["aria-selected"])).toHaveLength(1);
		expect(map.tabs().map((tab) => tab.props.tabIndex)).toEqual([0, -1, -1, -1]);
		expect(map.active()).toHaveLength(1);
		for (const tab of map.tabs()) {
			expect(tab.type).toBe("button");
			expect(tab.props.type).toBe("button");
			expect(map.panels().find((panel) => panel.props.id === tab.props["aria-controls"])?.props["aria-labelledby"]).toBe(tab.props.id);
		}
	});

	it("invariant_every_category_retains_its_real_links_descriptions_and_proof", () => {
		const map = mountMap(true);
		const reached: string[] = [];
		DASHBOARD_CAPABILITY_GROUPS.forEach((group, index) => {
			map.click(index);
			expect(map.active()).toHaveLength(1);
			expect(map.tabs()[index].props["aria-selected"]).toBe(true);
			const links = nodes(map.active()[0]).filter((node) => node.type === "a");
			const expected = DASHBOARD_CAPABILITIES.filter((item) => item.group === group.id);
			expect(links.map((link) => link.props.href)).toEqual(expected.map((item) => item.href));
			expected.forEach((item, itemIndex) => {
				expect(content(links[itemIndex])).toContain(item.label);
				expect(content(links[itemIndex])).toContain(item.description);
				expect(content(links[itemIndex])).toContain(item.proof);
				reached.push(item.id);
			});
		});
		expect(new Set(reached).size).toBe(19);
		expect(map.requests).not.toHaveBeenCalled();
	});

	it("invariant_arrow_and_boundary_keys_select_and_focus_immediately", () => {
		const map = mountMap();
		for (const [from, key, to] of [[0, "ArrowLeft", 3], [3, "ArrowRight", 0], [0, "End", 3], [3, "Home", 0], [0, "ArrowRight", 1]] as const) {
			expect(map.key(from, key)).toHaveBeenCalledOnce();
			expect(map.tabs()[to].props["aria-selected"]).toBe(true);
			expect(map.tabs()[to].props.tabIndex).toBe(0);
			expect(map.focused()).toBe(map.tabs()[to].props.id);
		}
	});

	it("invariant_tab_and_modified_arrow_keys_keep_native_navigation", () => {
		const map = mountMap();
		expect(map.key(0, "Tab")).not.toHaveBeenCalled();
		expect(map.key(0, "ArrowRight", { altKey: true })).not.toHaveBeenCalled();
		expect(map.tabs()[0].props["aria-selected"]).toBe(true);
		expect(map.focused()).toBeNull();
	});

	it("invariant_machine_prerequisites_remain_visible_without_disabling_the_links", () => {
		const map = mountMap(false);
		map.click(1);
		let links = nodes(map.active()[0]).filter((node) => node.type === "a");
		const consoleLink = links.find((link) => link.props.href === "/dashboard/chat")!;
		expect(content(consoleLink)).toContain("launch a machine first");
		expect(consoleLink.props["aria-disabled"]).toBeUndefined();
		map.setMachine(true);
		expect(map.tabs()[1].props["aria-selected"]).toBe(true);
		links = nodes(map.active()[0]).filter((node) => node.type === "a");
		expect(content(links.find((link) => link.props.href === "/dashboard/chat"))).toContain("machine-scoped");
	});

	it("invariant_separate_maps_have_independent_accessibility_ids", () => {
		const first = mountMap(false, "first-map");
		const second = mountMap(false, "second-map");
		expect(first.tabs().map((tab) => tab.props.id).filter((id) => second.tabs().some((tab) => tab.props.id === id))).toEqual([]);
		first.click(2);
		expect(second.tabs()[0].props["aria-selected"]).toBe(true);
	});
});
