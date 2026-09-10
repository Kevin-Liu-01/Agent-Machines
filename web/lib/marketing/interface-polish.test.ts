import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CopyCodeButton } from "@/components/CopyCodeButton";
import { MuxDiagram } from "@/components/MuxDiagram";
import { SDK_EXAMPLE, StatsRow } from "@/components/StatsRow";
import { HARNESS_CAPABILITIES, SUBSTRATE_CAPABILITIES } from "@/lib/mux/capabilities";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function textContent(html: string) {
	const entities: Record<string, string> = {
		"&quot;": '"', "&#x27;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&",
	};
	return html.replace(/<[^>]*>/g, "").replace(/&quot;|&#x27;|&lt;|&gt;|&amp;/g, (entity) => entities[entity]);
}

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...elements(value.props.children)];
}

// Inspect the actual server component tree without mounting the interactive
// clipboard component or executing any SDK example.
function copyControls(value: unknown): Array<{ text: string; label: string }> {
	if (Array.isArray(value)) return value.flatMap(copyControls);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	if (value.type === CopyCodeButton) return [value.props as { text: string; label: string }];
	if (typeof value.type === "function") {
		return copyControls((value.type as (props: Record<string, unknown>) => React.ReactNode)(value.props));
	}
	return copyControls(value.props.children);
}

describe("SDK and routing explanation (actual rendered components)", () => {
	it("keeps named sections, readable headings, and native documentation/dashboard actions", () => {
		const html = renderToStaticMarkup(React.createElement(StatsRow));
		for (const id of ["sdk-heading", "routing-heading"]) {
			expect(html).toContain(`aria-labelledby="${id}"`);
			expect(html).toMatch(new RegExp(`<h2\\b[^>]*id="${id}"[^>]*>[^<]+</h2>`));
		}
		expect(html).toMatch(/<a\b[^>]*href="\/docs"[^>]*>Read the SDK docs/);
		expect(html).toMatch(/<a\b[^>]*href="\/dashboard"[^>]*>Try the dashboard/);
		expect(html).toContain('aria-label="SDK setup steps"');
		expect(html).toMatch(/<ol\b/);
		for (const label of ["Install the SDK", "Connect your providers", "Create the Worker", "Run and inspect"]) {
			expect(html).toMatch(new RegExp(`<h3\\b[^>]*>${label}</h3>`));
		}
		expect(textContent(html)).toContain(`${HARNESS_CAPABILITIES.length} runtimes`);
		expect(textContent(html)).toContain(`${SUBSTRATE_CAPABILITIES.length} providers`);
	});

	it("renders runtime and provider names as text from the supported capability lists", () => {
		const html = renderToStaticMarkup(React.createElement(MuxDiagram, {}));
		for (const item of [...HARNESS_CAPABILITIES, ...SUBSTRATE_CAPABILITIES]) {
			expect(html).toMatch(new RegExp(`<p\\b[^>]*>${item.label}</p>`));
		}
		for (const title of ["Agent runtimes", "One routing decision", "Sandbox providers"]) {
			expect(textContent(html)).toContain(title);
		}
		expect(textContent(html)).not.toMatch(/Dedalus/i);
		expect(html).not.toContain("foreignObject");
	});

	it("qualifies the diagram as an illustration and credential preflight as presence only", () => {
		const html = renderToStaticMarkup(React.createElement(MuxDiagram, {}));
		const caption = textContent(html.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/)![1]);
		expect(caption).toMatch(/routing illustration/i);
		expect(caption).toMatch(/examples, not live status/i);
		expect(caption).toMatch(/configuration, capabilities, and provider health/i);
		expect(caption).toMatch(/key presence, not vendor credential validity/i);
		expect(textContent(html)).toContain("Retry routing-safe creation failures.");
	});

	it("copies the same install command and TypeScript example that the page displays", () => {
		const controls = copyControls(React.createElement(StatsRow));
		expect(controls).toEqual([
			expect.objectContaining({ label: "Copy install command", text: "npm i agent-machines" }),
			expect.objectContaining({ label: "Copy SDK example", text: SDK_EXAMPLE }),
		]);
		const html = renderToStaticMarkup(React.createElement(StatsRow));
		expect(html).toMatch(/<code\b[^>]*>npm i agent-machines<\/code>/);
		const pre = html.match(/<pre\b[^>]*aria-label="TypeScript Worker example"[^>]*>([\s\S]*?)<\/pre>/)!;
		expect(pre).not.toBeNull();
		expect(pre[0]).toContain('tabindex="0"');
		const withoutLineNumbers = pre[1].replace(/<span\b(?=[^>]*aria-hidden="true")[^>]*>[\s\S]*?<\/span>/g, "");
		// Each displayed line terminates with a newline, including the last.
		expect(textContent(withoutLineNumbers).replace(/\n$/, "")).toBe(SDK_EXAMPLE);
	});

	it("keeps the shared example syntactically valid TypeScript without executing it", () => {
		const result = ts.transpileModule(SDK_EXAMPLE, {
			fileName: "reviewer.ts",
			reportDiagnostics: true,
			compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
		});
		expect(result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
		expect(result.outputText).toContain('import { createMux } from "agent-machines"');
		expect(result.outputText).toContain("for await");
	});

	it("pairs the code with a visual configuration, not a fabricated running Worker", () => {
		const html = renderToStaticMarkup(React.createElement(StatsRow));
		const example = html.match(/<figure\b[^>]*>[\s\S]*?Example configuration[\s\S]*?<\/figure>/)![0];
		expect(example).toBeDefined();
		for (const label of ["reviewer", "Claude Code", "Automatic", "Review my repo"]) {
			expect(textContent(example)).toContain(label);
		}
		expect(SDK_EXAMPLE).toContain('name: "reviewer"');
		expect(SDK_EXAMPLE).toContain('agent: "claude-code"');
		expect(SDK_EXAMPLE).toContain('sandbox: "auto"');
		expect(SDK_EXAMPLE).toContain('worker.run("Review my repo")');
		expect(textContent(example)).not.toMatch(/running|completed|verified|live/i);
		expect(example).not.toMatch(/<button\b|aria-live=/);
	});

	it("server-renders an accessible, non-submitting copy action and polite feedback region", () => {
		const html = renderToStaticMarkup(React.createElement(CopyCodeButton, { text: SDK_EXAMPLE, label: "Copy SDK example" }));
		expect(html).toMatch(/<button\b[^>]*type="button"[^>]*aria-label="Copy SDK example"/);
		expect(html).toContain('aria-busy="false"');
		expect(html).not.toContain("disabled=");
		expect(html).toMatch(/role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
		expect(textContent(html)).toBe("Copy");
	});
});

// Tiny deterministic hook/clipboard harness around the real TSX. It exercises
// promise ordering, rapid input, and cleanup without a DOM or clipboard access.
function mountCopyButton() {
	let state = "idle", refIndex = 0, effectIndex = 0;
	const refs: Array<{ current: unknown }> = [];
	const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
	let scheduled: Array<() => void> = [];
	const timers = new Map<number, () => void>();
	let nextTimer = 0;
	const setState = vi.fn((next: string) => { state = next; });
	const writeText = vi.fn((_text: string): Promise<void> => Promise.resolve());
	const module = { exports: {} as { CopyCodeButton: typeof CopyCodeButton } };
	const source = readFileSync(resolve(process.cwd(), "components/CopyCodeButton.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports,
		require: (id: string) => id === "react/jsx-runtime" ? { jsx: React.createElement, jsxs: React.createElement }
			: id === "react" ? {
				useState: () => [state, setState],
				useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
				useEffect: (callback: () => (() => void) | void, deps: unknown[]) => {
					const index = effectIndex++;
					if (effects[index] && deps.every((dep, i) => Object.is(dep, effects[index].deps[i]))) return;
					scheduled.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: callback() || undefined }; });
				},
			} : id.endsWith("/cn") ? { cn: (...parts: string[]) => parts.filter(Boolean).join(" ") }
				: new Proxy({}, { get: () => () => null }),
		navigator: { clipboard: { writeText } },
		window: {
			setTimeout(callback: () => void) { timers.set(++nextTimer, callback); return nextTimer; },
			clearTimeout(id: number) { timers.delete(id); },
		},
	});
	let tree: React.ReactNode;
	const render = () => {
		refIndex = 0; effectIndex = 0; scheduled = [];
		tree = module.exports.CopyCodeButton({ text: SDK_EXAMPLE, label: "Copy SDK example" });
		scheduled.forEach((effect) => effect());
	};
	render();
	return {
		writeText, setState, timers, render,
		button: () => elements(tree).find((element) => element.type === "button")!,
		status: () => elements(tree).find((element) => element.props.role === "status")!,
		unmount: () => effects.forEach((effect) => effect.cleanup?.()),
	};
}

// Async functions in the VM adopt promises from the host realm. Let that
// complete through the event-loop boundary, rather than assuming one microtask.
const settleClipboard = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("copy feedback lifecycle (actual TSX, no real clipboard)", () => {
	it("deduplicates rapid presses and only announces success after the write resolves", async () => {
		const copy = mountCopyButton();
		let resolveWrite!: () => void;
		copy.writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
		const press = copy.button().props.onClick as () => void;
		press(); press();
		copy.render();
		expect(copy.writeText).toHaveBeenCalledTimes(1);
		expect(copy.writeText).toHaveBeenCalledWith(SDK_EXAMPLE);
		expect(copy.button().props.disabled).toBe(true);
		expect(copy.button().props["aria-busy"]).toBe(true);
		expect(copy.status().props.children).toBe("");
		resolveWrite(); await settleClipboard(); copy.render();
		expect(copy.button().props.disabled).toBe(false);
		expect(copy.status().props.children).toBe("Copy SDK example: copied to clipboard.");
		copy.unmount();
	});

	it("offers manual recovery on rejection and permits a successful retry", async () => {
		const copy = mountCopyButton();
		copy.writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
		(copy.button().props.onClick as () => void)();
		await settleClipboard(); copy.render();
		expect(copy.button().props.disabled).toBe(false);
		expect(copy.status().props.children).toMatch(/Select the code to copy it manually/);
		(copy.button().props.onClick as () => void)();
		await settleClipboard(); copy.render();
		expect(copy.writeText).toHaveBeenCalledTimes(2);
		expect(copy.status().props.children).toMatch(/copied to clipboard/);
		copy.unmount();
	});

	it("clears old success feedback when copying again and releases timers on unmount", async () => {
		const copy = mountCopyButton();
		(copy.button().props.onClick as () => void)();
		await settleClipboard(); copy.render();
		expect(copy.timers.size).toBe(1);
		let resolveWrite!: () => void;
		copy.writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
		(copy.button().props.onClick as () => void)(); copy.render();
		expect(copy.timers.size).toBe(0);
		copy.unmount();
		copy.setState.mockClear();
		resolveWrite(); await settleClipboard();
		expect(copy.setState).not.toHaveBeenCalled();
	});
});
