import { describe, expect, it } from "vitest";

import { DEFAULT_WEIGHTS, normalize, scalarReward } from "./reward";

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
});
