import { describe, expect, it } from "vitest";
import archivedSeed from "@/data/benchmarks.json";
import { buildBenchmarksView } from "@/lib/dashboard/benchmarks-view";
import { BENCHMARK_PROVIDERS } from "./constants";
import { synthesizeDemoRun } from "./demo";
import { assembleSnapshot, loadSeedSnapshot, runToRows } from "./store";

describe("current benchmark provider inventory without fabricated Daytona evidence", () => {
	it("offers the active four providers while preserving archived reference provenance", () => {
		expect(BENCHMARK_PROVIDERS).toEqual(["daytona", "e2b", "sprites", "vercel"]);
		expect(loadSeedSnapshot().profiles.map((profile) => profile.provider)).toEqual(BENCHMARK_PROVIDERS);
		expect(archivedSeed.profiles.some((profile) => profile.provider === "dedalus")).toBe(true);
		expect(archivedSeed.profiles.some((profile) => profile.provider === "daytona")).toBe(false);
	});

	it("leaves Daytona allocation, prices, reference latency, and synthetic score unknown", () => {
		const snapshot = loadSeedSnapshot();
		const profile = snapshot.profiles.find((item) => item.provider === "daytona")!;
		expect(profile.defaultSpec).toBeNull();
		expect(profile.referenceMetrics).toEqual({});
		for (const axis of ["cpuPerVcpuHour", "memoryPerGibHour", "storagePerGibHour"] as const) {
			expect(profile.pricing[axis]).toMatchObject({ value: null, basis: "unknown" });
		}
		const demo = synthesizeDemoRun();
		expect(demo.providers.map((provider) => provider.provider)).toEqual(BENCHMARK_PROVIDERS);
		expect(demo.providers.find((provider) => provider.provider === "daytona")).toMatchObject({ source: "demo", ok: false, score: null, metrics: {} });
		const view = buildBenchmarksView(assembleSnapshot([demo]));
		for (const group of view.comparisonsByCategory) for (const comparison of group.comparisons) {
			expect(comparison.cells.find((cell) => cell.provider === "daytona")?.value).toBeNull();
		}
	});

	it("never relabels a saved legacy run as Daytona", () => {
		const old = synthesizeDemoRun(["dedalus"]);
		const snapshot = assembleSnapshot([old]);
		expect(snapshot.latest?.providers[0].provider).toBe("dedalus");
		expect(runToRows(old)[0].provider_kind).toBe("dedalus");
		const view = buildBenchmarksView(snapshot);
		expect(view.providers).not.toContain("dedalus");
		expect(view.scores.find((score) => score.provider === "daytona")?.score).toBeNull();
	});
});
