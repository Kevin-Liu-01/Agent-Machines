import { describe, expect, it } from "vitest";

import { generateContributionGrid } from "./contribution-data";

describe("generateContributionGrid", () => {
	it("uses the UTC calendar day so server and browser hydration agree", () => {
		const weeks = generateContributionGrid(
			14,
			new Date("2026-08-15T02:00:00.000Z"),
		);
		const days = weeks.flat();

		expect(days.at(-1)?.date).toBe("2026-08-15");
		expect(days.at(-1)?.events[0]).toMatchObject({
			kind: "milestone",
			label: "today",
		});
	});

	it("is deterministic for repeated renders of the same UTC instant", () => {
		const instant = new Date("2026-08-15T23:59:59.000Z");
		expect(generateContributionGrid(21, instant)).toEqual(
			generateContributionGrid(21, instant),
		);
	});
});
