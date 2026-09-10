import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { RobotIcon } from "@phosphor-icons/react/dist/ssr/Robot";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import * as Icons from "@/components/ui/icons";

const innerSvg = (html: string) => html.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
const webRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("shared filled interface icons", () => {
	it("renders every public glyph except the explicit search-field outline as actual filled SVG geometry", () => {
		expect(Object.keys(Icons).length).toBeGreaterThanOrEqual(117);
		for (const [name, Icon] of Object.entries(Icons)) {
			if (name === "SearchOutline") continue;
			const html = renderToStaticMarkup(createElement(Icon));
			expect(html, name).toContain('data-icon-family="phosphor"');
			expect(html, name).toContain('data-icon-weight="fill"');
			expect(html, name).toContain('fill="currentColor"');
			expect(html, name).toContain('stroke="none"');
			expect(html, name).toMatch(/<(?:path|circle|rect|polygon)\b/);
			expect(html, name).not.toContain('fill="none"');
		}
	});

	it("uses an actual hollow lens only for the named search-field exception", () => {
		const html = renderToStaticMarkup(createElement(Icons.SearchOutline, { "aria-label": "Search", size: 20 }));
		const regular = innerSvg(renderToStaticMarkup(createElement(MagnifyingGlassIcon, { weight: "regular" })));
		const filled = innerSvg(renderToStaticMarkup(createElement(MagnifyingGlassIcon, { weight: "fill" })));
		expect(innerSvg(html)).toBe(regular);
		expect(innerSvg(html)).not.toBe(filled);
		expect(innerSvg(renderToStaticMarkup(createElement(Icons.Search)))).toBe(filled);
		expect(html).toContain('data-icon-weight="regular"');
		expect(html).toContain('width="20"');
		expect(html).toContain('aria-label="Search"');
		expect(html).not.toContain("aria-hidden");
	});

	it("uses the upstream filled silhouette, not a CSS-filled outline", () => {
		const actual = innerSvg(renderToStaticMarkup(createElement(Icons.Bot)));
		const filled = innerSvg(renderToStaticMarkup(createElement(RobotIcon, { weight: "fill" })));
		const outline = innerSvg(renderToStaticMarkup(createElement(RobotIcon, { weight: "regular" })));
		expect(actual).toBe(filled);
		expect(actual).not.toBe(outline);
	});

	it("preserves size, color, class and accessible names while ignoring old outline props", () => {
		const html = renderToStaticMarkup(createElement(Icons.FolderOpen, {
			size: 32,
			color: "rebeccapurple",
			className: "folder-icon",
			"aria-label": "Open folder",
			stroke: "red",
			strokeWidth: 9,
			absoluteStrokeWidth: true,
			fill: "none",
		}));
		expect(html).toContain('width="32"');
		expect(html).toContain('height="32"');
		expect(html).toContain('fill="rebeccapurple"');
		expect(html).toContain('class="folder-icon"');
		expect(html).toContain('aria-label="Open folder"');
		expect(html).toContain('focusable="false"');
		expect(html).not.toMatch(/aria-hidden|stroke-width|absoluteStrokeWidth|stroke="red"|fill="none"/);
	});

	it("hides decorative glyphs but preserves explicit accessibility overrides", () => {
		expect(renderToStaticMarkup(createElement(Icons.Check))).toContain('aria-hidden="true"');
		expect(renderToStaticMarkup(createElement(Icons.Check, { "aria-hidden": false }))).toContain('aria-hidden="false"');
		expect(renderToStaticMarkup(createElement(Icons.Check, { "aria-labelledby": "check-label" }))).not.toContain("aria-hidden");
	});

	it("imports individual context-free modules, with no whole-library barrel", () => {
		const source = readFileSync(new URL("../../components/ui/icons.tsx", import.meta.url), "utf8");
		const runtimeImports = [...source.matchAll(/import (?!type\b)[^;]+from "(@phosphor-icons\/react[^\"]*)"/g)];
		expect(runtimeImports.length).toBeGreaterThan(90);
		for (const [, path] of runtimeImports) expect(path).toMatch(/^@phosphor-icons\/react\/dist\/ssr\/[A-Za-z]+$/);
		expect(source).not.toMatch(/use client|IconContext|from "lucide-react"/);
	});

	it("tree-shakes an isolated consumer to its one used icon", async () => {
		// Use the project's existing test bundler; this adds no runtime dependency.
		const webRequire = createRequire(new URL("../../package.json", import.meta.url));
		const vitestRequire = createRequire(webRequire.resolve("vitest"));
		const viteRequire = createRequire(vitestRequire.resolve("vite"));
		const esbuild = viteRequire("esbuild") as {
			build: (options: Record<string, unknown>) => Promise<{
				outputFiles: Array<{ text: string }>;
				metafile: { outputs: Record<string, { inputs: Record<string, { bytesInOutput: number }> }> };
			}>;
		};
		const built = await esbuild.build({
			stdin: {
				contents: 'export { Check } from "./components/ui/icons";',
				resolveDir: webRoot,
				sourcefile: "filled-icon-consumer.ts",
				loader: "ts",
			},
			bundle: true,
			write: false,
			metafile: true,
			platform: "browser",
			format: "esm",
			external: ["react"],
			treeShaking: true,
		});
		const retainedIcons = Object.values(built.metafile.outputs).flatMap((output) => Object.entries(output.inputs))
			.filter(([path, meta]) => /\/dist\/ssr\/[^/]+\.es\.js$/.test(path) && meta.bytesInOutput > 0)
			.map(([path]) => path.split("/").at(-1));
		expect(retainedIcons).toEqual(["Check.es.js"]);
		expect(built.outputFiles[0].text.length).toBeLessThan(20_000);
	});
});
