import { describe, expect, it } from "vitest";

import { isCadenceDue } from "./cadence";

describe("isCadenceDue", () => {
	it("runs once when a tick crosses the cadence boundary", () => {
		const minute = 60_000;
		expect(isCadenceDue(29 * minute, 30 * minute, 5 * minute)).toBe(false);
		expect(isCadenceDue(30 * minute, 30 * minute, 5 * minute)).toBe(true);
		expect(isCadenceDue(35 * minute, 30 * minute, 5 * minute)).toBe(false);
	});

	it("always runs when cadence is no longer than the tick", () => {
		expect(isCadenceDue(123, 300_000, 300_000)).toBe(true);
	});
});
