import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as usageMetrics from "./usage-metrics";
import * as schema from "@/lib/user-config/schema";
import * as fleetView from "@/lib/fleet/view-model";

type Element = { type: unknown; props: Record<string, unknown> };

/** Execute the real page and local chart rows with controlled hook state.
 * External visual components are inert; no effects, network or provider calls. */
function renderSource(file: string, states: unknown[], exposeSummary = false) {
	const module = { exports: {} as Record<string, (...args: any[]) => any> };
	let stateIndex = 0;
	const jsx = (type: unknown, props: Record<string, unknown>): Element => typeof type === "function" ? type(props) : { type, props };
	const source = readFileSync(resolve(process.cwd(), file), "utf8") + (exposeSummary ? "\nexport { usageSummary };" : "");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports,
		require: (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id === "react" ? { useState: () => [states[stateIndex++], () => {}], useEffect: () => {}, useMemo: (fn: () => unknown) => fn() }
				: id.endsWith("usage-metrics") ? usageMetrics
					: id.endsWith("fleet/view-model") ? fleetView
					: id.endsWith("user-config/schema") ? schema
						: id.endsWith("MachineProvider") ? { useMachineContext: () => ({ machineId: "qa-machine", isActive: true, machine: { id: "qa-machine", name: "QA", providerKind: "daytona", agentKind: "claude-code", model: "claude-sonnet-4-6", bootstrapState: { phase: "complete" }, spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 } } }) }
							: id.endsWith("/cn") ? { cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }
								: new Proxy({}, { get: (_, key) => (props: Record<string, unknown>) => ({ type: String(key), props }) }),
	});
	return module.exports;
}

function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const node = value as Element;
	return [node, ...elements(node.props.children)];
}

function noIntervalPayload() {
	return { resources: {
		cpu: { totalVcpuSeconds: null, buckets: [], evidence: "no_intervals" },
		memory: { totalGibSeconds: null, buckets: [], evidence: "no_intervals" },
		storage: { totalGibHours: null, buckets: [], evidence: "no_intervals" },
	} };
}

describe("sampled allocation UI (actual TSX)", () => {
	it("Overview renders no measured interval without zero or nonfinite chart values", () => {
		const usage = usageMetrics.normalizeMachineUsagePayload(noIntervalPayload(), 7);
		const tree = renderSource("app/dashboard/machines/[machineId]/page.tsx", [null, null, "complete", false, usage, false, 7, 0]).default();
		const nodes = elements(tree);
		const charts = nodes.filter((node) => node.type === "DashboardBarChart");
		expect(charts).toHaveLength(3);
		for (const chart of charts) expect(chart.props.data).toEqual([]);
		expect(nodes.filter((node) => node.type === "p" && node.props.children === "No measured interval yet")).toHaveLength(3);
		expect(JSON.stringify(tree)).not.toMatch(/0\.0|NaN|Infinity/);
	});
	it("Fleet usage cards and chart notes distinguish unknown allocation from measured zero", () => {
		const payload = noIntervalPayload();
		const usage = usageMetrics.normalizeUsagePayload(payload, 7);
		const tree = renderSource("app/dashboard/usage/page.tsx", [7, usage, false, null]).default();
		const cards = elements(tree).filter((node) => node.type === "StatCard" && String(node.props.label).endsWith("allocation"));
		expect(cards).toHaveLength(3);
		for (const card of cards) expect(card.props).toMatchObject({ value: "–", subtext: "No measured interval yet" });
	});
	it("Agent View summary preserves unknown, first-interval, explicit zero and partial evidence", () => {
		const summary = renderSource("components/dashboard/AgentViewScreen.tsx", [], true).usageSummary;
		expect(summary(null)).toMatchObject({ cpu: "Unknown", memory: "Unknown", storage: "Unknown", hasUsage: false });
		expect(summary(usageMetrics.normalizeMachineUsagePayload(noIntervalPayload(), 7))).toMatchObject({ cpu: "No interval yet", hasUsage: false });
		const usage = usageMetrics.normalizeMachineUsagePayload({ resources: { cpu: { totalVcpuSeconds: 0, evidence: "sampled" }, memory: { totalGibSeconds: 60, evidence: "partial" } } }, 7);
		expect(summary(usage)).toMatchObject({ cpu: "0 vCPU-hr", memory: "<0.1 GiB-hr · partial", storage: "Unknown", hasUsage: true });
	});
});
