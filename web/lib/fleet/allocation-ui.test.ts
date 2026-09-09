import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as viewModel from "@/lib/fleet/view-model";
import * as schema from "@/lib/user-config/schema";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const node = value as Element;
	return [node, ...Object.values(node.props ?? {}).flatMap(elements)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}
const machine = {
	id: "allocation-fixture", name: "Worker", providerKind: "e2b" as const, providerLabel: "E2B", agentKind: "claude-code" as const,
	spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 }, model: "claude-sonnet-4-6", createdAt: "2026-09-09T07:00:00Z",
	apiUrl: null, hasApiKey: false, bootstrapState: schema.INITIAL_BOOTSTRAP_STATE, capabilities: null,
	live: { ok: true as const, state: "sleeping", rawPhase: "paused", lastError: null, spec: { vcpu: 2, memoryMib: 512 } },
};
const noOp = () => {};

function load(file: string, extraExports = "", customGlobals: Record<string, unknown> = {}, customReact: Record<string, unknown> = {}) {
	const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Element> };
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const react = {
		useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, noOp],
		useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn, useEffect: noOp, useRef: (current: unknown) => ({ current }),
		...customReact,
	};
	const source = readFileSync(resolve(process.cwd(), file), "utf8");
	runInNewContext(ts.transpileModule(`${source}\n${extraExports}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports, URLSearchParams, ...customGlobals,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id === "next/navigation" ? { useRouter: () => ({ push: noOp }), useSearchParams: () => new URLSearchParams() }
				: id.endsWith("fleet/view-model") ? viewModel : id.endsWith("user-config/schema") ? schema
					: id.endsWith("dashboard/MachineProvider") ? { useMachineContext: () => ({ machineId: machine.id, machine, isActive: true }) }
						: new Proxy({}, { get: () => () => null }),
	});
	return module.exports;
}

describe("actual allocation presentation", () => {
	it.each([
		["daytona", "/home/daytona"], ["e2b", "/home/user"],
		["sprites", "/home/sprite"], ["vercel", "/vercel/sandbox"],
	] as const)("uses %s's actual HOME for sleeping activity instead of a legacy provider path", (providerKind, home) => {
		const current = { ...machine, providerKind };
		for (const logs of [[], [{ at: "2026-09-09T07:00:00Z", message: "Completed a task", level: "info" as const, source: "worker" }]]) {
			const result = viewModel.buildTerminalLines(current, logs, null);
			expect(result.lines).toContain(`sleeping — state persisted to ${home}`);
			expect(result.streamActive).toBe(false);
		}
	});

	it("formats the provider's 2 vCPU / 512 MiB / unknown disk rather than requested 1 / 2048 / 10", () => {
		const card = viewModel.toFleetStreamCard(machine, [], { active: true });
		expect(card).toMatchObject({ cpu: "2 vCPU", mem: "512 MiB", disk: "— GiB" });
		for (const live of [undefined, { ok: false }, { error: "offline" }, { ok: true }, { ok: true, spec: {} }]) {
			expect(viewModel.compactSpec(viewModel.reportedMachineSpec(live))).toBe("—v · —G · —G");
		}
	});

	it.each([true, false])("renders card, monitor row, and table allocation from live data (available=%s)", (available) => {
		const current = { ...machine, live: available ? machine.live : { ok: false as const, reason: "provider unavailable" } };
		const expected = available ? "2v · 0.5G · —G" : "—v · —G · —G";
		const card = load("components/dashboard/MachineFleetCard.tsx").MachineFleetCard({ machine: current, card: viewModel.toFleetStreamCard(current, [], { active: true }), loadout: null, active: true, logsLoaded: false, editing: false, onChange: noOp, onToggleEdit: noOp, onSavedEdit: noOp, EditPanel: noOp });
		expect(elements(card).find((node) => node.props.label === "actual allocation")?.props.value).toBe(expected);
		const row = load("components/dashboard/FleetMonitor.tsx", "export { MachineRow };").MachineRow({ machine: current, active: true, onChange: noOp, onOpenDetails: noOp });
		expect(text(elements(row).find((node) => node.props.label === "actual allocation"))).toBe(expected);
		const table = load("components/dashboard/MachinesPanel.tsx", "export { MachineTable };").MachineTable({ machines: [current], activeMachineId: machine.id });
		expect(text(table)).toContain("Actual allocation");
		expect(text(table)).toContain(expected);
		expect(text(table)).not.toContain("1v · 2.0G · 10G");
	});

	it("labels creation sizing as requested and explains E2B's template-defined allocation", () => {
		const panel = load("components/dashboard/AgentMachineInfo.tsx").MachineInfoPanel({ provider: "e2b", spec: machine.spec, configured: true });
		expect(elements(panel).find((node) => node.type === "dl")?.props["aria-label"]).toBe("Requested sizing");
		expect(text(panel).replace(/\s+/g, " ")).toContain("E2B allocation is defined by its template");
		expect(text(panel).replace(/\s+/g, " ")).toContain("Sizing requests do not resize the sandbox");
	});

	it("the scoped runtime view clears a previously observed allocation after a failed probe", async () => {
		const cells: Array<{ value: unknown }> = [];
		let cursor = 0, unavailable = false;
		const component = load("components/dashboard/AgentViewScreen.tsx", "", {
			fetch: async (url: string) => {
				if (url === `/api/dashboard/machines/${machine.id}`) {
					if (unavailable) throw new Error("provider unavailable");
					return new Response(JSON.stringify({ ok: true, live: { ...machine.live, id: machine.id } }));
				}
				return new Response(JSON.stringify({ ok: false, error: "not part of allocation probe" }), { status: 503 });
			},
		}, {
			useState(initial: unknown) {
				const index = cursor++;
				const cell = cells[index] ?? (cells[index] = { value: typeof initial === "function" ? initial() : initial });
				return [cell.value, (value: unknown) => { cell.value = typeof value === "function" ? value(cell.value) : value; }];
			},
		});
		function render() { cursor = 0; return component.AgentViewScreen({}); }
		function values(tree: Element) {
			const panel = elements(tree).find((node) => node.props.title === "Actual allocation")!;
			return elements(panel).filter((node) => ["vCPU", "RAM", "Disk"].includes(String(node.props.label))).map((node) => node.props.value);
		}
		async function refresh(tree: Element) {
			const button = elements(tree).find((node) => text(node).trim() === "Refresh" && typeof node.props.onClick === "function")!;
			(button.props.onClick as () => void)();
			await new Promise((resolve) => setImmediate(resolve));
			return render();
		}
		expect(values(render())).toEqual(["—", "— GiB", "— GiB"]);
		let tree = await refresh(render());
		expect(values(tree)).toEqual(["2", "0.5 GiB", "— GiB"]);
		unavailable = true;
		tree = await refresh(tree);
		expect(values(tree)).toEqual(["—", "— GiB", "— GiB"]);
		const panel = elements(tree).find((node) => node.props.title === "Actual allocation")!;
		expect(elements(panel).find((node) => node.props.rows)?.props.rows).toContainEqual(["requested sizing", "1v · 2.0G · 10G"]);
	});

	it("the scoped overview polls actual axes and clears them on a failed response", async () => {
		const cells: Array<{ value: unknown }> = [], effects: Array<() => unknown> = [], timers: Array<() => void> = [];
		let cursor = 0, unavailable = false, collectingEffects = true;
		const component = load("app/dashboard/machines/[machineId]/page.tsx", "", {
			window: { setInterval: (fn: () => void) => { timers.push(fn); return timers.length; }, clearInterval: noOp },
			document: { visibilityState: "visible" },
			fetch: async (url: string) => url === `/api/dashboard/machines/${machine.id}`
				? new Response(JSON.stringify(unavailable ? { error: "unavailable" } : { ok: true, machine: { capabilities: { canSleep: true } }, live: machine.live }), { status: unavailable ? 503 : 200 })
				: new Response(JSON.stringify({ ok: false }), { status: 503 }),
		}, {
			useEffect: (effect: () => unknown) => { if (collectingEffects) effects.push(effect); },
			useState(initial: unknown) {
				const index = cursor++;
				const cell = cells[index] ?? (cells[index] = { value: typeof initial === "function" ? initial() : initial });
				return [cell.value, (value: unknown) => { cell.value = typeof value === "function" ? value(cell.value) : value; }];
			},
		});
		function render() { cursor = 0; return component.default({}); }
		function allocation(tree: Element) { return text(elements(tree).find((node) => node.props.label === "Actual allocation")); }
		function actionCapabilities(tree: Element) { return elements(tree).find((node) => node.props.machineId === machine.id && "active" in node.props && "capabilities" in node.props)?.props.capabilities; }
		const initial = render();
		expect(allocation(initial)).toBe("—v · —G · —G");
		expect(actionCapabilities(initial)).toBeNull();
		collectingEffects = false;
		for (const effect of effects) effect();
		await new Promise((resolve) => setImmediate(resolve));
		expect(allocation(render())).toBe("2v · 0.5G · —G");
		expect(actionCapabilities(render())).toEqual({ canSleep: true });
		unavailable = true;
		for (const timer of timers) timer();
		await new Promise((resolve) => setImmediate(resolve));
		expect(allocation(render())).toBe("—v · —G · —G");
		expect(actionCapabilities(render())).toBeNull();
	});
});
