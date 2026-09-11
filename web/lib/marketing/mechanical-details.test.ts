import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { BearingIcon, GearDetail } from "@/components/marketing/MechanicalDetails";
import { gearPath } from "./worker-gears";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("supporting mechanical details", () => {
	it("keeps the bearings decorative, non-focusable, and static", () => {
		for (const gear of [false, true]) {
			const html = renderToStaticMarkup(React.createElement(BearingIcon, { gear, children: React.createElement("svg") }));
			expect(html).toMatch(/^<span aria-hidden="true"/);
			expect(html).toContain('focusable="false"');
			expect(html).not.toMatch(/<button|<a\b|tabindex|animate|animation/);
			if (gear) expect(html).toContain(gearPath(18));
		}
	});

	it("reuses the engine's trapezoidal teeth for the small cutaway", () => {
		const html = renderToStaticMarkup(React.createElement(GearDetail));
		expect(html).toMatch(/^<svg aria-hidden="true" focusable="false"/);
		expect(html).toContain(gearPath(18));
		expect(html).toContain(gearPath(12));
		expect(html).not.toMatch(/NaN|Infinity|<animate|animation/);
	});
});
