import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { McpLibrary } from "@/components/dashboard/McpLibrary";
import { cn } from "@/lib/cn";
import * as expressions from "@/lib/cron/expr";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

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

/** Run actual component effects against stub responses; never reach a provider. */
function mountPanel(fetch: (url: string, options?: RequestInit) => Promise<Response>) {
	const state: unknown[] = [];
	let stateCursor = 0, effectCursor = 0;
	const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
	let queued: Array<() => void> = [];
	const timers = new Set<() => void>();
	const module = { exports: {} as { CronPanel: () => React.ReactNode } };
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/CronPanel.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch, AbortController,
		setInterval: (callback: () => void) => { timers.add(callback); return callback; },
		clearInterval: (callback: () => void) => timers.delete(callback),
		require: (id: string) => id === "react/jsx-runtime" ? jsxRuntime
			: id === "react" ? {
				useState: (initial: unknown) => {
					const index = stateCursor++;
					if (!(index in state)) state[index] = initial;
					return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
				},
				useEffect: (callback: () => (() => void) | void, deps: unknown[]) => {
					const index = effectCursor++;
					if (effects[index] && deps.every((dep, i) => Object.is(dep, effects[index].deps[i]))) return;
					queued.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: callback() || undefined }; });
				},
			} : id === "next/link" ? { default: "a" }
				: id.endsWith("/cn") ? { cn }
					: new Proxy({}, { get: (_target, key) => String(key) }),
	});
	return {
		render: () => { stateCursor = 0; effectCursor = 0; queued = []; const tree = module.exports.CronPanel(); queued.forEach(effect => effect()); return tree; },
		tick: () => timers.forEach(callback => callback()),
		unmount: () => effects.forEach(effect => effect.cleanup?.()),
	};
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const history = () => Response.json({ ok: true, crons: [], runs: [] });
const hasSetupAction = (tree: unknown) => elements(tree).some(element => element.type === "ScheduleStarters");

describe("schedule machine selection states", () => {
	it("does not interpret an unresolved machine request as an empty fleet", async () => {
		const request = vi.fn((url: string) => url.endsWith("/machines") ? new Promise<Response>(() => {}) : Promise.resolve(history()));
		const panel = mountPanel(request);
		panel.render(); await settle();
		const tree = panel.render();
		expect(elements(tree).some(element => element.type === "DashboardLoadingState" && element.props.label === "Loading your machines…" && element.props.variant === "table")).toBe(true);
		expect(hasSetupAction(tree)).toBe(false);
		expect(text(tree)).not.toContain("A schedule needs a machine");
		panel.unmount();
		expect(request.mock.calls).toHaveLength(2);
	});

	it.each(["HTTP", "network", "malformed"])("keeps %s failure distinct from empty and retries the actual machine endpoint", async failure => {
		let attempt = 0;
		const request = vi.fn(async (url: string) => {
			if (!url.endsWith("/machines")) return history();
			if (++attempt === 1) {
				if (failure === "network") throw new Error("Connection lost");
				if (failure === "malformed") return Response.json({ error: "No machine list returned" });
				return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
			}
			return Response.json({ machines: [{ id: "old", name: "Archived", archived: true }, { id: "actual", name: "My machine", archived: false }] });
		});
		const panel = mountPanel(request);
		panel.render(); await settle();
		let tree = panel.render();
		expect(text(tree)).toContain("Could not load your machines");
		expect(hasSetupAction(tree)).toBe(false);
		const retry = elements(tree).find(element => element.type === "button" && text(element).includes("Retry machine list"))!;
		(retry.props.onClick as () => void)();
		panel.render(); await settle(); tree = panel.render();
		expect(attempt).toBe(2);
		expect(text(tree)).not.toContain("Could not load your machines");
		expect(elements(tree).filter(element => element.type === "CronManager").map(element => element.props.machineId)).toEqual(["actual"]);
		expect(elements(tree).filter(element => element.type === "option").map(element => element.props.value)).toEqual(["actual"]);
		expect(hasSetupAction(tree)).toBe(false);
		panel.unmount();
	});

	it("shows setup only for a successfully empty fleet and retains evidence of deleted schedules", async () => {
		const request = vi.fn(async (url: string) => url.endsWith("/machines") ? Response.json({ machines: [] }) : Response.json({
			ok: true, crons: [], runs: [{ operationId: "run-1", scheduleId: "deleted", status: "failed", createdAt: "2026-09-10T00:00:00Z", startedAt: null, summary: "Recorded failure", output: "Captured output", exitCode: 1 }],
		}));
		const panel = mountPanel(request);
		panel.render(); await settle();
		const tree = panel.render();
		expect(hasSetupAction(tree)).toBe(true);
		for (const expected of ["Fleet run history", "Deleted schedule", "Recorded failure", "Captured output", "run-1", "exit 1"]) expect(text(tree)).toContain(expected);
		expect(text(tree)).not.toContain("Open a machine console");
		expect(elements(tree).filter(element => element.type === "details")).toHaveLength(1);
		panel.unmount();
	});

	it("keeps schedule management available if history fails and recovers history through polling", async () => {
		let historyAttempt = 0;
		const request = vi.fn(async (url: string) => url.endsWith("/machines") ? Response.json({ machines: [{ id: "actual", name: "My machine" }] })
			: ++historyAttempt === 1 ? Response.json({ error: "History unavailable" }, { status: 503 }) : history());
		const panel = mountPanel(request);
		panel.render(); await settle();
		let tree = panel.render();
		expect(elements(tree).some(element => element.type === "CronManager")).toBe(true);
		expect(text(tree)).toContain("History unavailable");
		panel.tick(); await settle(); tree = panel.render();
		expect(historyAttempt).toBe(2);
		expect(text(tree)).not.toContain("History unavailable");
		expect(text(tree)).toContain("No recorded runs yet");
		panel.unmount();
	});
});

describe("honest mutation boundaries", () => {
	it.each([true, false])("keeps execution and charge notice beside Save when creating=%s", creating => {
		const module = { exports: {} as { CronForm: (props: Record<string, unknown>) => React.ReactNode } };
		const source = readFileSync(resolve(process.cwd(), "components/agent-console/CronManager.tsx"), "utf8");
		runInNewContext(ts.transpileModule(`${source}\nexport { CronForm };`, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
		}).outputText, {
			module, exports: module.exports,
			require: (id: string) => id === "react/jsx-runtime" ? jsxRuntime : id.endsWith("/cn") ? { cn } : id.endsWith("/expr") ? expressions : new Proxy({}, { get: (_target, key) => String(key) }),
		});
		const tree = module.exports.CronForm({ creating, draft: { name: "Digest", schedule: "0 9 * * *", prompt: "Summarize the workspace" }, setDraft: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), saving: false });
		const notice = elements(tree).find(element => element.props.id === "schedule-execution-notice")!;
		expect(text(notice)).toContain(creating ? "Saving enables automatic execution" : "Enabled schedules run automatically");
		expect(text(notice)).toContain("provider and model charges");
		expect(text(notice)).toContain("UTC");
		const save = elements(tree).find(element => element.type === "ReticleButton")!;
		expect(save.props["aria-describedby"]).toBe(notice.props.id);
		expect(save.props.disabled).toBe(false);
		expect(source).toMatch(/editing === "new"[\s\S]*?<CronForm\s+creating/);
	});

	it("labels MCP handoff as setup, not an implemented installer", () => {
		const html = renderToStaticMarkup(React.createElement(McpLibrary, { servers: [{ name: "Example & Tools", transport: "stdio", source: "library", tools: [] }] }));
		expect(html).toContain("Review setup");
		expect(html).not.toContain("Review setup &amp; install");
		expect(html).toContain('href="/dashboard/registry?kind=mcp&amp;q=Example%20%26%20Tools"');
		expect(html).toContain("Library entries, not connection checks.");
	});
});
