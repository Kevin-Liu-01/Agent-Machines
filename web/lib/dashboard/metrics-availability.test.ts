import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { cn } from "@/lib/cn";
import * as availability from "./metrics-availability";
import * as usageMetrics from "./usage-metrics";

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...elements(value.props.children)];
}
function text(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (React.isValidElement<Record<string, unknown>>(value)) return text(value.props.children);
	return "";
}

/** Actual request, retry, and cancellation wiring; all responses are local fixtures. */
function mount(file: string, exportName: string, fetch: (url: string, options: RequestInit) => Promise<Response>) {
	const values: unknown[] = [];
	let cursor = 0, effectCursor = 0;
	const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
	let queued: Array<() => void> = [];
	const module = { exports: {} as Record<string, (props?: Record<string, unknown>) => React.ReactNode> };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), file), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch, AbortController, URLSearchParams,
		require: (id: string) => id === "react/jsx-runtime" ? jsxRuntime
			: id === "react" ? {
				useState: (initial: unknown) => {
					const index = cursor++;
					if (!(index in values)) values[index] = initial;
					return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
				},
				useMemo: (callback: () => unknown) => callback(),
				useEffect: (callback: () => (() => void) | void, deps: unknown[]) => {
					const index = effectCursor++;
					if (effects[index] && deps.every((dep, i) => Object.is(dep, effects[index].deps[i]))) return;
					queued.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: callback() || undefined }; });
				},
			} : id.endsWith("/cn") ? { cn }
				: id.endsWith("/metrics-availability") ? availability
					: id.endsWith("/usage-metrics") ? usageMetrics
						: new Proxy({}, { get: (_target, key) => String(key) }),
	});
	return {
		render: () => { cursor = 0; effectCursor = 0; queued = []; const tree = module.exports[exportName]({ machineId: "owned-machine", days: 7 }); queued.forEach(effect => effect()); return tree; },
		unmount: () => effects.forEach(effect => effect.cleanup?.()),
	};
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const SURFACES = [
	{ label: "Usage", file: "components/dashboard/UsagePanel.tsx", exportName: "UsagePanel", retry: "Retry usage", empty: "No machine usage data for this period.", success: { ok: true, resources: { cpu: { totalVcpuSeconds: null, buckets: [], evidence: "no_intervals" }, memory: { totalGibSeconds: null, buckets: [], evidence: "no_intervals" }, storage: { totalGibHours: null, buckets: [], evidence: "no_intervals" } }, machineBreakdown: [] } },
	{ label: "Route outcomes", file: "components/dashboard/RouteOutcomesPanel.tsx", exportName: "RouteOutcomesPanel", retry: "Retry route outcomes", empty: "No traced runs in this window.", success: { ok: true, report: { totalRuns: 0, routes: [], gaps: [] } } },
] as const;

describe.each(SURFACES)("$label storage availability", surface => {
	it.each(["config_missing", "HTTP", "network", "malformed"])("does not turn %s failure into empty charts and retries the same scoped endpoint", async failure => {
		let attempt = 0;
		const request = vi.fn(async (_url: string, _options: RequestInit) => {
			if (++attempt > 1) return Response.json(surface.success);
			if (failure === "network") throw new Error("private database URL and service-key");
			if (failure === "malformed") return new Response("not valid JSON", { status: 200 });
			return Response.json({ ok: false, reason: failure === "config_missing" ? "config_missing" : "unavailable", error: "private database URL and service-key" }, { status: 503 });
		});
		const component = mount(surface.file, surface.exportName, request);
		component.render(); await settle();
		let tree = component.render();
		expect(text(tree)).toContain(failure === "config_missing" ? "Usage storage is not configured" : "Usage data is unavailable");
		if (failure === "config_missing") expect(text(tree)).toContain("deployment administrator");
		expect(text(tree)).not.toContain(surface.empty);
		expect(text(tree)).not.toContain("private database URL");
		expect(elements(tree).some(element => element.type === "StatCard" || element.type === "table" || typeof element.type === "function" && element.type.name === "ResourceChartRow")).toBe(false);
		const retry = elements(tree).find(element => element.type === "ReticleButton" && text(element) === surface.retry)!;
		expect(retry).toBeDefined();
		(retry.props.onClick as () => void)();
		component.render(); await settle(); tree = component.render();
		expect(attempt).toBe(2);
		expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]);
		if (surface.label === "Route outcomes") expect(request.mock.calls[1][0]).toContain("machineId=owned-machine");
		expect(text(tree)).not.toContain("Usage storage is not configured");
		expect(text(tree)).not.toContain("Usage data is unavailable");
		expect(text(tree)).toContain(surface.empty);
		component.unmount();
		for (const [, options] of request.mock.calls) expect(options.signal?.aborted).toBe(true);
	});
});

describe("public metrics failure contract", () => {
	it("only trusts a known reason and never echoes arbitrary server messages", () => {
		for (const input of [null, "secret", { reason: "private-url" }, { error: "config_missing" }]) expect(availability.metricsFailureReason(input)).toBe("unavailable");
		expect(availability.metricsFailureReason({ reason: "config_missing", message: "service-key" })).toBe("config_missing");
		expect(availability.missingMetricsStorage(new Error("other secret failure"))).toBe(false);
	});
});
