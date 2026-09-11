import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadSeedSnapshot, assembleSnapshot } from "@/lib/benchmarks/store";
import { synthesizeDemoRun } from "@/lib/benchmarks/demo";
import * as model from "@/lib/dashboard/benchmarks-view";
import * as constants from "@/lib/benchmarks/constants";
import { cn } from "@/lib/cn";
import { BenchmarkComparisonBars } from "@/components/dashboard/benchmarks/BenchmarkComparisonBars";
import { BenchmarkLeaderboard } from "@/components/dashboard/benchmarks/BenchmarkLeaderboard";
import { CapabilityMatrix } from "@/components/dashboard/benchmarks/CapabilityMatrix";
import { PricingMatrix } from "@/components/dashboard/benchmarks/PricingMatrix";
import { ScoreRanking } from "@/components/dashboard/benchmarks/ScoreRanking";
import { MethodologyPanel } from "@/components/dashboard/benchmarks/MethodologyPanel";
import { formatBenchmarkTime, isCompletedRun } from "@/components/dashboard/benchmarks/BenchmarksClient";
import * as ui from "@/components/dashboard/benchmarks/BenchmarkUi";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const seed = loadSeedSnapshot();
const seedView = model.buildBenchmarksView(seed);
type Element = { type: unknown; props: Record<string, any> };
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const response = (body: unknown, status = 200): Reply => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children), ...nodes(element.props.right)];
}
function words(value: unknown): string {
	if (Array.isArray(value)) return value.map(words).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? `${words((value as Element).props?.children)} ${words((value as Element).props?.right)}` : "";
}

/** Execute the actual TSX handlers against persistent hook state and local
 * HTTP fakes. This harness cannot call provider APIs or incur benchmark costs. */
function mount(file = "BenchmarksClient", options: { load?: () => Promise<Reply>; confirm?: boolean; props?: unknown } = {}) {
	let cursor = 0;
	const cells: Array<{ value: any }> = [];
	const effects: Array<() => void> = [];
	const cleanups: Array<{ cleanup?: () => void }> = [];
	const cell = (initial: unknown) => { const index = cursor++; return cells[index] ?? (cells[index] = { value: initial }); };
	const react = {
		useState(initial: unknown) { const state = cell(typeof initial === "function" ? initial() : initial); return [state.value, (next: any) => { state.value = typeof next === "function" ? next(state.value) : next; }]; },
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useMemo(callback: () => unknown) { cell(null); return callback(); },
		useCallback(callback: unknown, dependencies: unknown[]) { const state = cell({}).value; if (!state.dependencies || dependencies.some((value, index) => !Object.is(value, state.dependencies[index]))) { state.dependencies = dependencies; state.callback = callback; } return state.callback; },
		useEffect(callback: () => void | (() => void), dependencies: unknown[]) { const state = cell({}).value; if (!state.dependencies || dependencies.some((value, index) => !Object.is(value, state.dependencies[index]))) { state.dependencies = dependencies; effects.push(() => { state.cleanup?.(); state.cleanup = callback(); }); if (!cleanups.includes(state)) cleanups.push(state); } },
	};
	let load = options.load ?? (async () => response(seed));
	let post = async (): Promise<Reply> => { throw new Error("Unexpected benchmark mutation in test"); };
	const fetch = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
		if (url === "/api/dashboard/admin/route-recommendation") return response({}, 403);
		if (url === "/api/dashboard/benchmarks" && !init?.method) return load();
		if (url === "/api/dashboard/benchmarks/run" && init?.method === "POST") return post();
		throw new Error(`Unexpected mocked URL: ${url}`);
	});
	const confirm = vi.fn((_message: string) => options.confirm ?? true);
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as Record<string, (props?: any) => Element> };
	const source = readFileSync(resolve(process.cwd(), `components/dashboard/benchmarks/${file}.tsx`), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
		module, exports: module.exports, Error, fetch, window: { confirm },
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
			: id.endsWith("/benchmarks-view") ? model : id.endsWith("/constants") ? constants : id.endsWith("/cn") ? { cn }
				: id === "./BenchmarkUi" ? { ...ui, BenchmarkPanel: "section", BenchmarkNotice: "notice", SourceTag: "source" }
					: new Proxy({}, { get: (_target, name) => `stub-${String(name)}` }),
	});
	const expand = (value: unknown): any => {
		if (Array.isArray(value)) return value.map(expand);
		if (!value || typeof value !== "object" || !("props" in value)) return value;
		const element = value as Element;
		if (typeof element.type === "function") return expand(element.type(element.props));
		return { ...element, props: { ...element.props, children: expand(element.props.children), right: expand(element.props.right) } };
	};
	let tree: Element;
	const render = () => { cursor = 0; tree = expand(module.exports[file](options.props)); for (const effect of effects.splice(0)) effect(); cursor = 0; tree = expand(module.exports[file](options.props)); };
	render();
	return {
		fetch, confirm, render, all: () => nodes(tree), text: () => words(tree).replace(/\s+/g, " "),
		button: (label: string) => nodes(tree).find((node) => node.type === "button" && (words(node).trim() === label || node.props["aria-label"] === label)),
		respondLoad: (fn: () => Promise<Reply>) => { load = fn; }, respondPost: (fn: () => Promise<Reply>) => { post = fn; },
		async settle() { await new Promise<void>((done) => setImmediate(done)); render(); },
		unmount() { cleanups.forEach((state) => state.cleanup?.()); },
	};
}

describe("benchmark presentation and provenance", () => {
	it("keeps historical reference, demo, and missing values explicit", () => {
		const comparison = seedView.comparisonsByCategory[0].comparisons[0];
		const html = renderToStaticMarkup(React.createElement(BenchmarkComparisonBars, { comparison }));
		expect(html).toContain("Reference"); expect(html).toContain("Unavailable"); expect(html).toContain("No result for this metric."); expect(html).toContain("Lower is better");
		expect(html).not.toMatch(/font-mono|uppercase|transition-\[width\]/);
		const demo = model.buildBenchmarksView(assembleSnapshot([synthesizeDemoRun()]));
		expect(renderToStaticMarkup(React.createElement(BenchmarkLeaderboard, { leaderboard: demo.leaderboard, scores: demo.scores, scoreSource: "demo" })).match(/>Demo</g)?.length).toBeGreaterThan(1);
		expect(renderToStaticMarkup(React.createElement(ScoreRanking, { scores: demo.scores, source: "demo" }))).toContain("Demo");
	});
	it("uses a common p50/p95 scale without drawing zero as a positive bar", () => {
		const original = seedView.comparisonsByCategory[0].comparisons[0];
		const comparison = { ...original, cells: [{ ...original.cells[0], value: 20, p95: 100 }, { ...original.cells[1], value: 0, p95: null }] };
		const html = renderToStaticMarkup(React.createElement(BenchmarkComparisonBars, { comparison }));
		expect(html).toContain('data-bar-fraction="0.2"'); expect(html).toContain('data-bar-fraction="0"'); expect(html).toContain("p95:");
	});
	it("distinguishes unsupported capabilities from unknown and preserves fractional memory", () => {
		const profile = { ...seed.profiles[0], defaultSpec: { vcpu: 1, memoryMib: 512, storageGib: 1 }, capabilities: { persistentDisk: false, streamingExec: true } };
		const html = renderToStaticMarkup(React.createElement(CapabilityMatrix, { profiles: [profile] }));
		expect(html).toContain("Not supported"); expect(html).toContain("Supported"); expect(html).toContain("Not documented"); expect(html).toContain("0.5 GiB");
		expect(html).toContain('role="region"'); expect(html).toContain('tabindex="0"'); expect(html).toContain('scope="row"'); expect(html).toContain(profile.isolation);
	});
	it("keeps all pricing notes and storage rates available on small screens", () => {
		const html = renderToStaticMarkup(React.createElement(PricingMatrix, { profiles: seed.profiles }));
		expect(html).toContain("Storage / GiB-hour"); expect(html).toContain("Not supplied"); expect(html).toContain("Verify with provider"); expect(html).not.toMatch(/class="[^"]*(?:^|\s)hidden(?:\s|")/);
		for (const profile of seed.profiles) if (profile.pricing.note) expect(html).toContain(profile.pricing.note.replace(/'/g, "&#x27;"));
	});
	it("retains methodology citations and honest empty scores", () => {
		const html = renderToStaticMarkup(React.createElement(MethodologyPanel, { methodology: seed.methodology, profiles: seed.profiles }));
		for (const profile of seed.profiles) for (const citation of profile.citations) expect(html).toContain(`href="${citation.url}"`);
		expect(html).toContain('rel="noopener noreferrer"');
		expect(renderToStaticMarkup(React.createElement(ScoreRanking, { scores: seedView.scores }))).toContain("Not enough run data");
		expect(formatBenchmarkTime("invalid")).toBe("Date unavailable"); expect(formatBenchmarkTime("2026-01-01T00:00:00Z")).toContain("2026"); expect(formatBenchmarkTime("2026-01-01T00:00:00Z")).toContain("UTC");
	});
});

describe("benchmark comparison controls (actual TSX)", () => {
	it("selects every metric, filters providers, and restores the empty selection without requests", () => {
		const page = mount("ComparisonExplorer", { props: { view: seedView } });
		const selector = () => page.all().find((node) => node.type === "select")!;
		expect(page.all().filter((node) => node.type === "option")).toHaveLength(constants.METRIC_DEFINITIONS.length);
		selector().props.onChange({ target: { value: "execP95Ms" } }); page.render();
		expect(page.all().find((node) => node.type === "stub-BenchmarkComparisonBars")!.props.comparison.id).toBe("execP95Ms");
		for (const profile of seed.profiles) { page.button(`Compare ${profile.label}`)!.props.onClick(); page.render(); }
		expect(page.text()).toContain("Choose a provider to compare");
		page.button("Show all providers")!.props.onClick(); page.render();
		expect(page.all().find((node) => node.type === "stub-BenchmarkComparisonBars")!.props.comparison.cells).toHaveLength(seed.profiles.length);
		expect(page.fetch).not.toHaveBeenCalled();
	});
});

describe("benchmark request controls (mocked network only)", () => {
	it("keeps loading distinct and allows retry after a failed GET", async () => {
		const pending = deferred<Reply>(); const page = mount("BenchmarksClient", { load: () => pending.promise });
		expect(page.text()).toContain("Loading benchmark results"); expect(page.button("Run benchmark")!.props.disabled).toBe(true);
		pending.resolve(response({}, 503)); await page.settle(); expect(page.text()).toContain("could not be loaded"); expect(page.text()).not.toContain("No measured run is available");
		page.respondLoad(async () => response(seed)); page.button("Try again")!.props.onClick(); await page.settle();
		expect(page.text()).toContain("Published reference dataset"); expect(page.text()).toContain("Routing insights are not available"); expect(page.text()).not.toContain("0 run traces");
	});
	it("retains previous results after refresh errors instead of showing fake empty results", async () => {
		const page = mount(); await page.settle(); page.respondLoad(async () => response({}, 500));
		page.button("Refresh benchmark results")!.props.onClick(); await page.settle();
		expect(page.text()).toContain("The previous dataset is still shown below."); expect(page.text()).toContain("Published reference dataset"); expect(page.button("Run benchmark")!.props.disabled).toBe(true);
	});
	it("cancelling paid confirmation sends no POST", async () => {
		const page = mount("BenchmarksClient", { confirm: false }); await page.settle();
		page.button("Run benchmark")!.props.onClick(); await page.settle();
		expect(page.confirm).toHaveBeenCalledOnce(); expect(page.confirm.mock.calls[0][0]).toContain("provider credits"); expect(page.fetch.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
	});
	it("serializes run clicks and labels unpersisted demo results correctly", async () => {
		const page = mount(); await page.settle(); const pending = deferred<Reply>(); page.respondPost(() => pending.promise);
		const click = page.button("Try demo data")!.props.onClick; click(); click(); page.render();
		expect(page.fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1); expect(page.confirm).not.toHaveBeenCalled(); expect(page.button("Preparing…")!.props.disabled).toBe(true);
		pending.resolve(response({ ok: true, run: synthesizeDemoRun(), stored: 0 })); await page.settle();
		expect(page.text()).toContain("Synthetic demo results are ready. No provider credits were used."); expect(page.text()).toContain("this session only"); expect(page.text()).toContain("Synthetic results · not measurements");
	});
	it("blocks stale refresh callbacks during a run but refreshes internally after persistence", async () => {
		const page = mount(); await page.settle(); const pending = deferred<Reply>(); page.respondPost(() => pending.promise);
		const refresh = page.button("Refresh benchmark results")!.props.onClick;
		page.button("Try demo data")!.props.onClick(); refresh(); refresh(); page.render();
		expect(page.fetch.mock.calls.filter((call) => call[0] === "/api/dashboard/benchmarks")).toHaveLength(1);
		const run = synthesizeDemoRun(); page.respondLoad(async () => response({ ...seed, latest: run }));
		pending.resolve(response({ ok: true, run, stored: 1 })); await page.settle();
		expect(page.fetch.mock.calls.filter((call) => call[0] === "/api/dashboard/benchmarks")).toHaveLength(2);
		expect(page.text()).toContain("Saved to run history.");
	});
	it("blocks a stale run callback while a refresh is pending", async () => {
		const page = mount(); await page.settle(); const pending = deferred<Reply>(); page.respondLoad(() => pending.promise);
		const run = page.button("Run benchmark")!.props.onClick;
		page.button("Refresh benchmark results")!.props.onClick(); run(); page.render();
		expect(page.confirm).not.toHaveBeenCalled(); expect(page.fetch.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
		pending.resolve(response(seed)); await page.settle();
	});
	it("does not claim completion when a success response lacks a verified run", async () => {
		const page = mount(); await page.settle(); page.respondPost(async () => response({ ok: true })); page.button("Try demo data")!.props.onClick(); await page.settle();
		expect(page.text()).toContain("response could not be confirmed"); expect(page.text()).not.toContain("results are ready"); expect(page.text()).toContain("Published reference dataset");
		expect(isCompletedRun(synthesizeDemoRun(), "live")).toBe(false);
	});
	it("reports partial paid runs without implying every provider or probe succeeded", async () => {
		const page = mount(); await page.settle();
		const demo = synthesizeDemoRun();
		const run = { ...demo, source: "measured", providers: demo.providers.map((provider, index) => ({ ...provider, source: "measured", ok: index !== 0 })) };
		page.respondPost(async () => response({ ok: true, run, stored: 0, skipped: [{ provider: "daytona" }] }));
		page.button("Run benchmark")!.props.onClick(); await page.settle();
		expect(page.text()).toContain("completion does not mean every probe succeeded");
		expect(page.text()).toContain("1 provider result(s) contain failed or unsupported probes");
		expect(page.text()).toContain("1 provider(s) were skipped");
		expect(page.text()).toContain("Recorded benchmark run");
	});
	it("retains the prior dataset and warns about unknown paid outcomes after a lost response", async () => {
		const page = mount(); await page.settle();
		page.respondPost(async () => { throw new Error("fixture response lost"); });
		page.button("Run benchmark")!.props.onClick(); await page.settle();
		expect(page.text()).toContain("may still have created resources or incurred charges");
		expect(page.text()).toContain("Published reference dataset");
	});
	it("history changes only the inspected dataset and never sends a run request", async () => {
		const history = synthesizeDemoRun(); const page = mount("BenchmarksClient", { load: async () => response({ ...seed, history: [history] }) }); await page.settle();
		page.all().find((node) => node.props.id === "benchmark-dataset")!.props.onChange({ target: { value: history.runId } }); page.render();
		expect(page.text()).toContain("Synthetic results · not measurements"); expect(page.fetch.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
	});
});
