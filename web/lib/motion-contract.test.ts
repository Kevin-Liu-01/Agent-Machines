import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("navigation motion contract", () => {
	it("keeps route navigation native and free of panel wipes", () => {
		const provider = readFileSync(
			resolve(process.cwd(), "components/motion/MotionProvider.tsx"),
			"utf8",
		);
		const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
		const dashboard = readFileSync(
			resolve(process.cwd(), "components/dashboard/DashboardShell.tsx"),
			"utf8",
		);
		const rootLayout = readFileSync(
			resolve(process.cwd(), "app/layout.tsx"),
			"utf8",
		);
		const packageJson = readFileSync(
			resolve(process.cwd(), "package.json"),
			"utf8",
		);

		expect(provider).not.toMatch(/router\.push|addEventListener\(["']click|route-curtain|transition-panel/);
		expect(provider).not.toMatch(/gsap|lenis|usePathname|use client/);
		expect(provider).not.toContain("am-route-shell");
		expect(css).not.toContain("am-route-shell");
		expect(css).toMatch(/\.ret-page-enter\s*\{\s*animation:\s*none;/);
		expect(dashboard).not.toContain("data-motion-route-root");
		expect(rootLayout).not.toMatch(/MotionProvider|lenis/);
		expect(packageJson).not.toMatch(/@gsap\/react|"gsap"|"lenis"/);
	});
});
