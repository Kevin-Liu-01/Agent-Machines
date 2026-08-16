import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CODEX_THEME_ASSETS } from "./logo-assets";

describe("Codex logo asset", () => {
	it("uses black on light surfaces and white on dark surfaces", () => {
		expect(CODEX_THEME_ASSETS).toEqual({
			light: "/brand/thesvg/codex-light.svg",
			dark: "/brand/thesvg/codex-dark.svg",
		});

		const light = readFileSync(
			resolve(process.cwd(), "public", CODEX_THEME_ASSETS.light.slice(1)),
			"utf8",
		);
		const dark = readFileSync(
			resolve(process.cwd(), "public", CODEX_THEME_ASSETS.dark.slice(1)),
			"utf8",
		);
		expect(light).toContain('fill="#111"');
		expect(dark).toContain('fill="#fff"');
	});
});
