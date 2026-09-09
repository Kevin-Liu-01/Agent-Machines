import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CODEX_THEME_ASSETS } from "./logo-assets";

it("declares the SVG namespace required to decode Vercel as a standalone image", () => {
	// Browsers accept an inline <svg> in HTML without xmlns, but Image.decode()
	// rejects the same unnamespaced bytes served as image/svg+xml. Settings
	// uses an <img>, unlike the masked mark used elsewhere on the landing.
	const svg = readFileSync(resolve(process.cwd(), "public/brand/services/vercel.svg"), "utf8");
	expect(svg).toMatch(/<svg\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/);
	expect(svg).toContain('viewBox="0 0 74 64"');
});

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
