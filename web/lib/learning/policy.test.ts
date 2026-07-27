import { describe, expect, it } from "vitest";

import { shouldRecomputePolicy } from "./policy";

describe("shouldRecomputePolicy", () => {
	it("skips a rebuild when no trace is newer than the active snapshot", () => {
		expect(
			shouldRecomputePolicy(
				"2026-07-23T12:00:00.000Z",
				"2026-07-23T11:59:59.000Z",
			),
		).toBe(false);
		expect(shouldRecomputePolicy("2026-07-23T12:00:00.000Z", null)).toBe(false);
	});

	it("rebuilds for a new trace or when no policy exists", () => {
		expect(
			shouldRecomputePolicy(
				"2026-07-23T12:00:00.000Z",
				"2026-07-23T12:00:01.000Z",
			),
		).toBe(true);
		expect(shouldRecomputePolicy(null, null)).toBe(true);
	});
});
