import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { parse, type Rule } from "postcss";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const stylesheet = () => parse(readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8"));
const declaration = (rule: Rule, property: string) => {
	let value: string | undefined;
	rule.walkDecls(property, (node) => { value = node.value; });
	return value;
};

describe("site-wide scrollbar styling", () => {
	it("uses the global 2px token for both axes with no wider component override", () => {
		const css = stylesheet();
		const sizes: string[] = [];
		let rootSize: string | undefined;
		css.walkDecls("--ret-scrollbar-size", (node) => {
			sizes.push(node.value);
			if (node.parent?.type === "rule" && node.parent.selectors.includes(":root")) rootSize = node.value;
		});
		expect(rootSize).toBe("2px");
		expect(sizes.length).toBeGreaterThan(0);
		expect(new Set(sizes)).toEqual(new Set(["2px"]));

		let globalRule: Rule | undefined;
		css.walkRules((rule) => {
			if (rule.selector === "*::-webkit-scrollbar") globalRule = rule;
			if (!rule.selectors.some((selector) => selector.endsWith("::-webkit-scrollbar"))) return;
			for (const axis of ["width", "height"]) {
				const value = declaration(rule, axis);
				if (value !== undefined) expect(["var(--ret-scrollbar-size)", "2px", "0", "0px"]).toContain(value);
			}
		});
		expect(globalRule).toBeDefined();
		expect(declaration(globalRule!, "width")).toBe("var(--ret-scrollbar-size)");
		expect(declaration(globalRule!, "height")).toBe("var(--ret-scrollbar-size)");
	});

	it("lets WebKit pixel sizing apply globally, including html and body, without unhiding exceptions", () => {
		const css = stylesheet();
		const overrides: Rule[] = [];
		css.walkAtRules("supports", (block) => {
			if (block.params.replace(/\s/g, "") !== "selector(::-webkit-scrollbar)") return;
			block.walkRules((rule) => {
				if (declaration(rule, "scrollbar-width") === "auto") overrides.push(rule);
			});
		});
		// Universal selectors include html/body and have zero specificity. Keep
		// these declarations non-important so class-based hidden utilities win.
		expect(overrides.length).toBeGreaterThan(0);
		for (const rule of overrides) {
			expect(rule.selector).toBe("*");
			expect(rule.parent?.type).toBe("atrule");
			expect(declaration(rule, "scrollbar-color")).toBe("auto");
			rule.walkDecls(/^scrollbar-(?:width|color)$/, (node) => { expect(node.important).not.toBe(true); });
		}
	});

	it("retains the Firefox thin fallback and both hidden-scrollbar rules", () => {
		const css = stylesheet();
		let fallback: Rule | undefined, hidden: Rule | undefined, webkitHidden: Rule | undefined;
		css.walkRules((rule) => {
			if (rule.selector === "*" && rule.parent?.type === "root" && declaration(rule, "scrollbar-width") === "thin") fallback = rule;
			if (rule.selector === ".ret-scrollbar-hidden") hidden = rule;
			if (rule.selector === ".ret-scrollbar-hidden::-webkit-scrollbar") webkitHidden = rule;
		});
		expect(fallback).toBeDefined();
		expect(declaration(fallback!, "scrollbar-color")).toBe("var(--ret-scrollbar-thumb) var(--ret-scrollbar-track)");
		expect(hidden).toBeDefined();
		expect(declaration(hidden!, "scrollbar-width")).toBe("none");
		expect(declaration(hidden!, "-ms-overflow-style")).toBe("none");
		expect(webkitHidden).toBeDefined();
		expect(declaration(webkitHidden!, "display")).toBe("none");
	});

	it("initializes xterm's own scrollbar from the inherited global token, with a 2px fallback", () => {
		const source = readFileSync(new URL("../../components/dashboard/InteractiveConsole.tsx", import.meta.url), "utf8");
		const file = ts.createSourceFile("InteractiveConsole.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		let options: ts.Expression | undefined;
		const visit = (node: ts.Node) => {
			if (ts.isNewExpression(node) && node.expression.getText(file) === "Terminal") options = node.arguments?.[0];
			ts.forEachChild(node, visit);
		};
		visit(file);
		const property = (object: ts.Expression | undefined, name: string) => {
			if (!object || !ts.isObjectLiteralExpression(object)) throw new Error(`Missing ${name} terminal option`);
			const entry = object.properties.find((node) => ts.isPropertyAssignment(node) && node.name.getText(file) === name);
			if (!entry || !ts.isPropertyAssignment(entry)) throw new Error(`Missing ${name} terminal option`);
			return entry.initializer;
		};
		const width = property(property(options, "overviewRuler"), "width").getText(file);
		const host = {};
		for (const [token, expected] of [["2px", 2], ["3px", 3], ["", 2]] as const) {
			const result = runInNewContext(width, {
				hostRef: { current: host },
				getComputedStyle: (element: unknown) => {
					expect(element).toBe(host);
					return { getPropertyValue: (name: string) => {
						expect(name).toBe("--ret-scrollbar-size");
						return token;
					} };
				},
			});
			expect(result).toBe(expected);
		}
	});
});
