import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { StatusHeader } from "@/components/dashboard/StatusHeader";
import { StatusPill } from "@/components/dashboard/StatusPill";
import * as Icons from "@/components/ui/icons";
import { runtimeUsesGateway } from "@/lib/agents/runtime-capabilities";
import { cn } from "@/lib/cn";
import { withMachineId } from "./api-url";
import { DASHBOARD_SHELL_HEADER_ROW } from "./shell-chrome";
import type { GatewaySummary, MachineSummary } from "./types";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/StatusHeader.tsx"), "utf8"), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown, omitDetails = false): Element[] {
	if (Array.isArray(value)) return value.flatMap((child) => elements(child, omitDetails));
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	if (omitDetails && value.type === "details") return [];
	return [value, ...elements(value.props.children, omitDetails)];
}

const machine: MachineSummary = {
	machineId: "fixture-worker", phase: "running", desired: "running",
	vcpu: 1, memoryMib: 2048, storageGib: 10,
	createdAt: "2026-09-09T20:00:00Z", configuredAt: null,
	endAt: "2026-09-10T20:00:00Z", lifecycle: { onTimeout: "kill", autoResume: false },
	reason: null, statusReason: null, lastTransitionAt: null, lastProgressAt: null,
};

// Execute the actual header TSX and render the real phase pill. Only hook state
// and unrelated child components are replaced; effects never run, so these
// presentation regressions cannot poll an endpoint or touch external state.
function renderHeader({
	summary = machine,
	error = null,
	pathname = "/dashboard/machines/fixture-worker/terminal",
}: { summary?: MachineSummary | null; error?: string | null; pathname?: string } = {}) {
	const state: { machine: MachineSummary | null; gateway: GatewaySummary | null; error: string | null } = {
		machine: summary, gateway: null, error,
	};
	const module = { exports: {} as { StatusHeader: typeof StatusHeader } };
	const placeholder = () => React.createElement("span", { "data-test-placeholder": true });
	runInNewContext(compiled, {
		module, exports: module.exports, process: { env: {} },
		require: (id: string) => {
			if (id === "react/jsx-runtime") return jsxRuntime;
			if (id === "react") return { useState: () => [state, vi.fn()], useEffect: () => {}, useRef: () => ({ current: null }) };
			if (id === "next/navigation") return { usePathname: () => pathname };
			if (id === "next/link") return { default: (props: React.ComponentProps<"a">) => React.createElement("a", props) };
			if (id.endsWith("/icons")) return Icons;
			if (id.endsWith("/cn")) return { cn };
			if (id.endsWith("/api-url")) return { withMachineId };
			if (id.endsWith("/runtime-capabilities")) return { runtimeUsesGateway };
			if (id.endsWith("/shell-chrome")) return { DASHBOARD_SHELL_HEADER_ROW };
			if (id === "./StatusPill") return { StatusPill };
			if (["@/components/Logo", "@/components/ThemeToggle", "./CommandPalette", "./DeferredClerkUserButton", "./FleetStatusStrip", "./GatewayStrip"].includes(id)) {
				return { [id.split("/").at(-1)!]: placeholder };
			}
			throw new Error(`Unexpected import: ${id}`);
		},
	});
	const tree = module.exports.StatusHeader({ machines: [] }) as Element;
	return {
		tree,
		nodes: elements(tree),
		header: elements(tree).find((node) => node.type === "header")!,
		html: renderToStaticMarkup(tree),
	};
}

describe("dashboard header warning presentation", () => {
	it.each([
		["/dashboard/agents", "Studio"],
		["/dashboard/workers", "Agent setups"],
		["/dashboard/components", "Building blocks"],
	])("names the %s page and setup action consistently", (pathname, label) => {
		const view = renderHeader({ pathname });
		expect(view.html).toContain(`title="${label}"`);
		expect(view.html).toContain('aria-label="New setup"');
		expect(view.html).not.toMatch(/Agent templates|New Worker/);
	});

	it("does not show a cached healthy phase anywhere after its status request fails", () => {
		const view = renderHeader({ error: "Machine status unavailable (HTTP 502)" });
		expect(view.nodes.filter((node) => node.type === StatusPill)).toHaveLength(0);
		expect(view.html).not.toMatch(/>running<|>Ready<|bg-\[var\(--ret-green\)\]/);
		expect(view.html).toContain("Status unavailable");
	});

	it("exposes the error on the visible summary and outside the closed details", () => {
		const view = renderHeader({ error: "fetch_failed" });
		const summary = view.nodes.find((node) => node.type === "summary")!;
		expect(summary.props["aria-label"]).toBe("Dashboard options — Worker status unavailable");
		const cue = elements(summary).map((node) => node.props.className ?? "").join(" ");
		expect(cue).toContain("text-[var(--ret-amber)]");
		const visibleStatuses = elements(view.header, true).filter((node) => node.props.role === "status");
		expect(visibleStatuses.some((node) => renderToStaticMarkup(node).includes("Status unavailable"))).toBe(true);
	});

	it("retains actual normal phase pills and ordinary options naming without an error", () => {
		const view = renderHeader();
		const pills = view.nodes.filter((node) => node.type === StatusPill);
		expect(pills.length).toBeGreaterThan(0);
		expect(pills.every((node) => node.props.phase === "running")).toBe(true);
		expect(view.html).toContain(">running</span>");
		expect(view.html).not.toContain("Status unavailable");
		expect(view.nodes.find((node) => node.type === "summary")!.props["aria-label"]).toBe("Dashboard options");
	});

	it("keeps the destructive timeout warning outside the fixed header and sticky directly beneath it", () => {
		const view = renderHeader();
		const alert = view.nodes.find((node) => node.props.role === "alert")!;
		expect(alert).toBeDefined();
		expect(elements(view.header)).not.toContain(alert);
		expect(String(alert.props.className).split(" ")).toEqual(expect.arrayContaining(["sticky", "top-12", "z-30"]));
		expect(renderToStaticMarkup(alert)).toContain("deletes its disk at timeout");
		expect(renderToStaticMarkup(alert)).toContain("Pause it to preserve its state");
		expect(String(view.header.props.className).split(" ")).toEqual(expect.arrayContaining(["h-12", "max-h-12", "flex-nowrap"]));
	});

	it.each(["destroyed", "destroying"] as const)("omits the timeout alert when the Worker is %s", (phase) => {
		const view = renderHeader({ summary: { ...machine, phase } });
		expect(view.nodes.some((node) => node.props.role === "alert")).toBe(false);
	});

	it.each([
		{ label: "pause-on-timeout Worker", summary: { ...machine, lifecycle: { onTimeout: "pause" as const, autoResume: true } } },
		{ label: "unknown lifecycle", summary: { ...machine, lifecycle: undefined } },
		{ label: "fleet route", pathname: "/dashboard/agents" },
	])("does not invent a destructive timeout warning for $label", (options) => {
		expect(renderHeader(options).nodes.some((node) => node.props.role === "alert")).toBe(false);
	});
});
