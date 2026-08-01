import { describe, expect, it } from "vitest";

import { DEFAULT_WEIGHTS, explainReward, normalize, scalarReward } from "./reward";

describe("normalize", () => {
	it("clamps into [0,1]", () => {
		expect(normalize(5, { min: 0, max: 10 })).toBe(0.5);
		expect(normalize(-5, { min: 0, max: 10 })).toBe(0);
		expect(normalize(50, { min: 0, max: 10 })).toBe(1);
	});

	it("returns 0 for a degenerate range", () => {
		expect(normalize(5, { min: 3, max: 3 })).toBe(0);
	});
});

describe("scalarReward", () => {
	const w = {
		lambdaCost: 0.2,
		muLatency: 0.1,
		costRange: { min: 0, max: 100 },
		latRange: { min: 0, max: 1000 },
	};

	it("rewards success and penalizes cost/latency", () => {
		const cheap = scalarReward({ successRate: 1, costMillicents: 0, latencyMs: 0 }, w);
		const pricey = scalarReward({ successRate: 1, costMillicents: 100, latencyMs: 1000 }, w);
		expect(cheap).toBeCloseTo(1, 6);
		expect(pricey).toBeCloseTo(1 - 0.2 - 0.1, 6);
		expect(cheap).toBeGreaterThan(pricey);
	});

	it("ranks higher success above lower at equal cost", () => {
		const hi = scalarReward({ successRate: 0.9, costMillicents: 10, latencyMs: 10 }, w);
		const lo = scalarReward({ successRate: 0.2, costMillicents: 10, latencyMs: 10 }, w);
		expect(hi).toBeGreaterThan(lo);
	});

	it("defaults make success dominate cost dominate latency", () => {
		expect(DEFAULT_WEIGHTS.lambdaCost).toBeGreaterThan(DEFAULT_WEIGHTS.muLatency);
		expect(DEFAULT_WEIGHTS.lambdaCost).toBeLessThan(1);
	});

	it("does not cost-rank a lane with no price, and says so", () => {
		const unpriced = explainReward({ successRate: 1, costMillicents: null, latencyMs: 0 }, w);
		expect(unpriced.costRanked).toBe(false);
		expect(unpriced.costPenalty).toBe(0);
		expect(unpriced.reward).toBe(1);
	});

	it("does not let an unpriced lane undercut a priced one on price", () => {
		// The old `?? 0` made this the whole bug: zero is the cheapest possible
		// cost, so the lane nobody can price outscored every lane that can be.
		const unpriced = scalarReward({ successRate: 1, costMillicents: null, latencyMs: 0 }, w);
		const cheapest = scalarReward({ successRate: 1, costMillicents: 0, latencyMs: 0 }, w);
		const dearest = scalarReward({ successRate: 1, costMillicents: 100, latencyMs: 0 }, w);
		// It ties the cheapest on the scalar -- the difference the caller must
		// report is structural, not numeric: costRanked is false.
		expect(unpriced).toBe(cheapest);
		expect(unpriced).toBeGreaterThan(dearest);
		expect(explainReward({ successRate: 1, costMillicents: null, latencyMs: 0 }, w).costRanked)
			.toBe(false);
		expect(explainReward({ successRate: 1, costMillicents: 0, latencyMs: 0 }, w).costRanked)
			.toBe(true);
	});

	it("skips the latency term when no run reported one", () => {
		const b = explainReward({ successRate: 0.5, costMillicents: 50, latencyMs: null }, w);
		expect(b.latencyRanked).toBe(false);
		expect(b.latencyPenalty).toBe(0);
		expect(b.costPenalty).toBeCloseTo(0.1, 9);
		expect(b.reward).toBeCloseTo(0.4, 9);
	});

	it("breaks the score into terms that sum back to it", () => {
		const b = explainReward({ successRate: 0.8, costMillicents: 50, latencyMs: 500 }, w);
		expect(b.reward).toBeCloseTo(b.successRate - b.costPenalty - b.latencyPenalty, 12);
		expect(b.costPenalty).toBeCloseTo(0.1, 9);
		expect(b.latencyPenalty).toBeCloseTo(0.05, 9);
	});
});
