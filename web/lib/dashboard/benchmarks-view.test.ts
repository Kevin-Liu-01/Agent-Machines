import { describe, expect, it } from "vitest";

import { synthesizeDemoRun } from "@/lib/benchmarks/demo";
import { assembleSnapshot, loadSeedSnapshot } from "@/lib/benchmarks/store";

import {
	applyRunToSnapshot,
	buildBenchmarksView,
	isBenchmarkSnapshot,
} from "./benchmarks-view";

describe("buildBenchmarksView", () => {
	it("uses reference data when no measured run exists", () => {
		const view = buildBenchmarksView(loadSeedSnapshot());
		expect(view.hasMeasuredData).toBe(false);
		expect(view.providers).toContain("e2b");

		const lifecycle = view.comparisonsByCategory.find(
			(g) => g.category === "lifecycle",
		);
		const coldBoot = lifecycle?.comparisons.find((c) => c.id === "coldBootMs");
		const e2b = coldBoot?.cells.find((c) => c.provider === "e2b");
		expect(e2b?.value).toBe(150); // from cited reference seed
		expect(e2b?.source).toBe("reference");
		// E2B (150) beats the only other provider with a reference (dedalus 250).
		expect(coldBoot?.winner).toBe("e2b");
	});

	it("overlays a measured/demo run and computes a winners leaderboard + scores", () => {
		// DEMO_PROFILES make dedalus strictly fastest on every scored metric.
		const view = buildBenchmarksView(assembleSnapshot([synthesizeDemoRun()]));
		expect(view.hasMeasuredData).toBe(true);
		expect(view.runMeta?.source).toBe("demo");

		// Demo values replace reference for the providers in the run.
		const lifecycle = view.comparisonsByCategory.find(
			(g) => g.category === "lifecycle",
		);
		const coldBoot = lifecycle?.comparisons.find((c) => c.id === "coldBootMs");
		const dedalus = coldBoot?.cells.find((c) => c.provider === "dedalus");
		expect(dedalus?.source).toBe("demo");
		expect(dedalus?.value).toBeGreaterThan(0);

		// dedalus is configured strictly faster -> wins boot + score.
		expect(coldBoot?.winner).toBe("dedalus");
		expect(view.scores[0].provider).toBe("dedalus");
		expect(view.scores[0].score).toBe(100);

		// Exec comparison should carry a measured p95 companion.
		const exec = view.comparisonsByCategory
			.find((g) => g.category === "exec")
			?.comparisons.find((c) => c.id === "execP50Ms");
		const execDedalus = exec?.cells.find((c) => c.provider === "dedalus");
		expect(execDedalus?.p95).toBeGreaterThan(0);

		const bootEntry = view.leaderboard.find((l) => l.id === "coldBootMs");
		expect(bootEntry?.winner).toBe("dedalus");
	});
});

describe("measured-beats-reference ranking", () => {
	it("does not let a faster cited reference outrank a slower measurement", () => {
		// Only dedalus is measured (demo coldBoot ~330ms). E2B has a cited
		// reference of 150ms in the seed. The winner must be the measured
		// provider, not the unverified faster reference claim.
		const view = buildBenchmarksView(
			assembleSnapshot([synthesizeDemoRun(["dedalus"])]),
		);
		const coldBoot = view.comparisonsByCategory
			.find((g) => g.category === "lifecycle")
			?.comparisons.find((c) => c.id === "coldBootMs");
		const e2b = coldBoot?.cells.find((c) => c.provider === "e2b");
		expect(e2b?.source).toBe("reference");
		expect(e2b?.value).toBe(150); // faster on paper…
		expect(coldBoot?.winner).toBe("dedalus"); // …but measured wins

		const bootEntry = view.leaderboard.find((l) => l.id === "coldBootMs");
		expect(bootEntry?.winner).toBe("dedalus");
		expect(bootEntry?.source).toBe("demo");
	});
});

describe("applyRunToSnapshot", () => {
	it("sets the run as latest and flags measured data without a store round-trip", () => {
		const seed = loadSeedSnapshot();
		expect(seed.hasMeasuredData).toBe(false);
		const merged = applyRunToSnapshot(seed, synthesizeDemoRun(["dedalus", "e2b"]));
		expect(merged.hasMeasuredData).toBe(true);
		expect(merged.latest?.providers).toHaveLength(2);
		expect(merged.profiles).toEqual(seed.profiles); // profiles untouched
		const view = buildBenchmarksView(merged);
		expect(view.runMeta?.source).toBe("demo");
	});
});

describe("isBenchmarkSnapshot", () => {
	it("accepts the seed and rejects junk", () => {
		expect(isBenchmarkSnapshot(loadSeedSnapshot())).toBe(true);
		expect(isBenchmarkSnapshot({})).toBe(false);
		expect(isBenchmarkSnapshot(null)).toBe(false);
	});
});
