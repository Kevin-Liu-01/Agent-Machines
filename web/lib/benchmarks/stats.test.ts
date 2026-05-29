import { describe, expect, it } from "vitest";

import {
	computeResponsivenessScores,
	geomean,
	mean,
	percentile,
	stddev,
	summarize,
} from "./stats";

describe("percentile", () => {
	it("returns null for empty input", () => {
		expect(percentile([], 50)).toBeNull();
	});

	it("returns the lone value for n=1", () => {
		expect(percentile([42], 95)).toBe(42);
	});

	it("computes p50 as the median", () => {
		expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
		expect(percentile([1, 2, 3], 50)).toBe(2);
	});

	it("interpolates p95 (type-7)", () => {
		const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
		// rank = 0.95 * 99 = 94.05 -> 95 + 0.05*(96-95) = 95.05
		expect(percentile(values, 95)).toBeCloseTo(95.05, 2);
	});
});

describe("mean / stddev / geomean", () => {
	it("means correctly", () => {
		expect(mean([2, 4, 6])).toBe(4);
		expect(mean([])).toBe(0);
	});

	it("sample stddev (n-1)", () => {
		expect(stddev([2, 4, 6])).toBeCloseTo(2, 5);
		expect(stddev([5])).toBe(0);
	});

	it("geomean ignores non-positive values", () => {
		expect(geomean([1, 100])).toBeCloseTo(10, 5);
		expect(geomean([0, -3, 4])).toBeCloseTo(4, 5);
		expect(geomean([])).toBe(0);
	});
});

describe("summarize", () => {
	it("returns null with no successful samples", () => {
		expect(summarize([], "ms", 3)).toBeNull();
	});

	it("computes a full stat block with honest success rate", () => {
		const stats = summarize([10, 20, 30], "ms", 6);
		expect(stats).not.toBeNull();
		expect(stats!.value).toBe(20);
		expect(stats!.p50).toBe(20);
		expect(stats!.min).toBe(10);
		expect(stats!.max).toBe(30);
		expect(stats!.mean).toBe(20);
		expect(stats!.samples).toBe(3);
		expect(stats!.successRate).toBe(0.5);
		expect(stats!.unit).toBe("ms");
	});
});

describe("computeResponsivenessScores", () => {
	it("anchors the fastest provider at 100 and scales the rest", () => {
		// fast has half the latency of slow on every scored metric.
		const scores = computeResponsivenessScores({
			fast: { coldBootMs: 100, timeToReadyMs: 100, wakeMs: 100, execP50Ms: 100 },
			slow: { coldBootMs: 200, timeToReadyMs: 200, wakeMs: 200, execP50Ms: 200 },
		});
		expect(scores.fast).toBe(100);
		expect(scores.slow).toBe(50);
	});

	it("only scores metrics every provider reports", () => {
		const scores = computeResponsivenessScores({
			a: { coldBootMs: 100, wakeMs: 100, execP50Ms: 100, timeToReadyMs: 100 },
			b: { coldBootMs: 100, execP50Ms: 100, timeToReadyMs: 100 }, // missing wakeMs
		});
		// Both equal on the shared metrics -> both 100.
		expect(scores.a).toBe(100);
		expect(scores.b).toBe(100);
	});

	it("returns null when no shared scored metric exists", () => {
		const scores = computeResponsivenessScores({
			a: { cpuMops: 90 },
			b: { diskWriteMbps: 500 },
		});
		expect(scores.a).toBeNull();
		expect(scores.b).toBeNull();
	});
});
