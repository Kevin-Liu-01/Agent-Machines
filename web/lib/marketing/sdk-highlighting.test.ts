import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CopyCodeButton } from "@/components/CopyCodeButton";
import { INSTALL_CODE, SDK_EXAMPLE, StatsRow } from "@/components/StatsRow";
import { LANDING_INSET, LANDING_SPLIT, LANDING_TITLE } from "./layout";
import { highlightTypeScript } from "./sdk-syntax.server";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	return [value, ...elements(value.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join("");
	if (React.isValidElement<Record<string, unknown>>(value)) return text(value.props.children);
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function htmlText(html: string): string {
	const entities: Record<string, string> = { "&quot;": '"', "&#x27;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
	return html.replace(/<[^>]*>/g, "").replace(/&quot;|&#x27;|&lt;|&gt;|&amp;/g, (entity) => entities[entity]);
}
function serverElements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(serverElements);
	if (!React.isValidElement<Record<string, unknown>>(value)) return [];
	if (value.type === CopyCodeButton) return [value];
	if (typeof value.type === "function") return serverElements((value.type as (props: Record<string, unknown>) => React.ReactNode)(value.props));
	return [value, ...serverElements(value.props.children)];
}
function syntaxValues(css: string): string[] {
	return [...css.matchAll(/--syntax-[a-z]+:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]);
}
function contrast(first: string, second: string): number {
	const luminance = (hex: string) => {
		const linear = hex.slice(1).match(/../g)!.map((part) => {
			const value = parseInt(part, 16) / 255;
			return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
		});
		return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
	};
	const a = luminance(first), b = luminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("server TypeScript syntax highlighting", () => {
	it("uses real grammar scopes for keywords, strings, function names, types, numbers and multiline comments", () => {
		const source = '/* across lines\nconst hidden = 7;\n*/\ntype State = "ready" | "paused";\nconst attempts: number = 3;\nfunction describe(name: string): string {\n  return `Worker ${name}: // string text`;\n}';
		const highlighted = highlightTypeScript(source);
		const scoped = (scope: string) => elements(highlighted).filter((node) => String(node.props.className).split(" ").includes(scope)).map(text);
		expect(text(highlighted)).toBe(source);
		expect(scoped("hljs-keyword")).toEqual(expect.arrayContaining(["type", "const", "function", "return"]));
		expect(scoped("hljs-string")).toEqual(expect.arrayContaining(['"ready"', '"paused"', '`Worker ${name}: // string text`']));
		expect(scoped("hljs-title")).toContain("describe");
		expect(scoped("hljs-built_in")).toContain("number");
		expect(scoped("hljs-number")).toContain("3");
		expect(scoped("hljs-comment")).toEqual(["/* across lines\nconst hidden = 7;\n*/"]);
	});

	it.each([SDK_EXAMPLE, "", "\n\n", "\tconst count = 42;\r\n\r\n// final line\r\n"])("preserves every source character through tokenization (%#)", (source) => {
		expect(text(highlightTypeScript(source))).toBe(source);
	});

	it("escapes hostile source as React text and emits only safe span wrappers", () => {
		const source = 'const html = "</code><script>alert(1)</script><img src=x onerror=alert(2)>";\n// <svg onload=alert(3)>&';
		const highlighted = highlightTypeScript(source);
		const html = renderToStaticMarkup(React.createElement("code", {}, highlighted));
		expect(text(highlighted)).toBe(source);
		expect(htmlText(html)).toBe(source);
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toMatch(/<script\b|<img\b|<svg\b/);
		for (const node of elements(highlighted)) {
			expect(node.type).toBe("span");
			expect(Object.keys(node.props).sort()).toEqual(["children", "className"]);
		}
	});

	it("keeps the real SDK snippet valid TypeScript without running it", () => {
		const result = ts.transpileModule(SDK_EXAMPLE, {
			fileName: "setup.ts", reportDiagnostics: true,
			compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
		});
		expect(result.diagnostics?.filter((entry) => entry.category === ts.DiagnosticCategory.Error)).toEqual([]);
		expect(result.outputText).toContain("for await");
	});

	it("renders the exact clipboard source with a separate, non-selectable line-number gutter", () => {
		const nodes = serverElements(React.createElement(StatsRow));
		const pre = nodes.find((node) => node.type === "pre" && node.props["aria-label"] === "TypeScript agent setup example")!;
		const code = elements(pre).find((node) => node.type === "code")!;
		const gutter = elements(pre).find((node) => node.props["aria-hidden"] === "true")!;
		const copy = nodes.filter((node) => node.type === CopyCodeButton);
		expect(copy.map((node) => ({ text: node.props.text, label: node.props.label }))).toEqual([
			{ text: INSTALL_CODE, label: "Copy install command" },
			{ text: SDK_EXAMPLE, label: "Copy SDK example" },
		]);
		expect(text(code)).toBe(SDK_EXAMPLE);
		expect(htmlText(renderToStaticMarkup(code))).toBe(SDK_EXAMPLE);
		expect(elements(code)).not.toContain(gutter);
		expect(text(gutter)).toBe(SDK_EXAMPLE.split("\n").map((_, i) => i + 1).join("\n"));
		expect(gutter.props.className).toContain("select-none");
		expect(gutter.props.className).toContain("pointer-events-none");
		expect(pre.props.tabIndex).toBe(0);
		expect(pre.props.className).toContain("overflow-x-auto");
		expect(pre.props.className).toContain("min-w-0");
		expect(pre.props.className).toContain("text-sm");
	});

	it("uses the same column rails for SDK and routing headings, with aligned panel row boundaries", () => {
		const nodes = serverElements(React.createElement(StatsRow));
		for (const id of ["sdk-heading", "routing-heading"]) {
			const section = nodes.find((node) => node.props["aria-labelledby"] === id)!;
			const header = elements(section).find((node) => node.type === "header")!;
			const title = elements(header).find((node) => node.props.id === id)!;
			for (const token of LANDING_INSET.split(" ")) expect(section.props.className).toContain(token);
			for (const token of LANDING_SPLIT.split(" ")) expect(header.props.className).toContain(token);
			for (const token of LANDING_TITLE.split(" ")) expect(title.props.className).toContain(token);
		}
		const panels = nodes.filter((node) => String(node.props.className).split(" ").includes("lg:grid-rows-subgrid"));
		const panelGrid = nodes.find((node) => String(node.props.className).includes("lg:grid-rows-[auto_1fr_auto]"))!;
		expect(panelGrid.props.className).toContain("lg:gap-y-0");
		expect(panelGrid.props.className).toContain("xl:gap-y-0");
		expect(panels).toHaveLength(2);
		for (const panel of panels) {
			expect(panel.props.className).toContain("lg:row-span-3");
			expect(React.Children.toArray(panel.props.children as React.ReactNode)).toHaveLength(3);
		}
	});

	it("defines distinct light/dark grammar colors with readable contrast on the actual code surfaces", () => {
		const css = readFileSync(resolve(process.cwd(), "lib/marketing/sdk-syntax.module.css"), "utf8");
		const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
		const colors = syntaxValues(css);
		const backgrounds = [...globals.matchAll(/--ret-bg-mid:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]);
		expect(colors).toHaveLength(21);
		expect(new Set(colors.slice(0, 7)).size).toBe(7);
		expect(new Set(colors.slice(7, 14)).size).toBe(7);
		for (const [index, color] of colors.entries()) expect(contrast(color, backgrounds[index < 7 ? 0 : 1]), color).toBeGreaterThanOrEqual(4.5);
		expect(css).toContain(':global(:root[data-theme="dark"])');
		expect(css).toContain(':root:not([data-theme="light"])');
		for (const scope of ["keyword", "string", "title", "comment", "number"]) expect(css).toContain(`.hljs-${scope}`);
	});

	it("keeps the grammar import on the server component path and out of the clipboard client", () => {
		const panel = readFileSync(resolve(process.cwd(), "components/StatsRow.tsx"), "utf8");
		const helper = readFileSync(resolve(process.cwd(), "lib/marketing/sdk-syntax.server.ts"), "utf8");
		const clipboard = readFileSync(resolve(process.cwd(), "components/CopyCodeButton.tsx"), "utf8");
		expect(panel).not.toContain('"use client"');
		expect(helper).not.toMatch(/use client|dangerouslySetInnerHTML/);
		expect(helper).toContain('from "rehype-highlight"');
		expect(clipboard).not.toMatch(/rehype|lowlight|highlightTypeScript/);
	});
});
