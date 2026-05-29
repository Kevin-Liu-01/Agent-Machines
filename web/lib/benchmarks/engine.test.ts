import { describe, expect, it } from "vitest";

import { DEMO_PROFILES, FakeProvider } from "./fake-provider";
import { metricValue, runBenchmarkSuite, runProviderBenchmark } from "./engine";

describe("runProviderBenchmark", () => {
	it("populates the full metric set for a healthy provider", async () => {
		const provider = new FakeProvider("e2b", DEMO_PROFILES.e2b);
		const bench = await runProviderBenchmark(provider, {
			execIterations: 4,
			source: "demo",
		});

		expect(bench.ok).toBe(true);
		expect(bench.provider).toBe("e2b");
		expect(bench.source).toBe("demo");
		expect(bench.machineId).toBeTruthy();

		for (const id of [
			"provisionMs",
			"timeToReadyMs",
			"coldBootMs",
			"execP50Ms",
			"execP95Ms",
			"cpuMops",
			"diskWriteMbps",
			"diskReadMbps",
			"wakeMs",
			"teardownMs",
			"reliabilityPct",
		] as const) {
			expect(bench.metrics[id], `missing ${id}`).toBeDefined();
		}

		// Throughput metrics should land near the configured demo profile.
		expect(metricValue(bench, "cpuMops")).toBeGreaterThan(0);
		expect(metricValue(bench, "diskWriteMbps")).toBeGreaterThan(0);
		expect(metricValue(bench, "reliabilityPct")).toBe(100);
	});

	it("skips wake when the provider cannot sleep", async () => {
		const provider = new FakeProvider("e2b", DEMO_PROFILES.e2b, {
			capabilities: { canSleep: false },
		});
		const bench = await runProviderBenchmark(provider, { execIterations: 2 });
		expect(bench.metrics.wakeMs).toBeUndefined();
	});

	it("degrades to recorded errors instead of throwing on exec failure", async () => {
		const provider = new FakeProvider("sprites", {
			...DEMO_PROFILES.sprites,
			failRate: 1,
		});
		const bench = await runProviderBenchmark(provider, { execIterations: 2 });
		// Provision/ready still succeed, but exec-based probes fail cleanly.
		expect(bench.metrics.execP50Ms?.ok).toBe(false);
		expect(bench.metrics.reliabilityPct?.stats?.value ?? 100).toBeLessThan(100);
	});
});

describe("runBenchmarkSuite", () => {
	// FakeProvider wall-clock timings are JS/poll noise, so we assert
	// structure + that scoring runs — deterministic ordering is covered by
	// computeResponsivenessScores (stats.test) and synthesizeDemoRun.
	it("runs providers in parallel and assembles a scored run", async () => {
		const a = new FakeProvider("dedalus", DEMO_PROFILES.dedalus);
		const b = new FakeProvider("vercel", DEMO_PROFILES.vercel);

		const run = await runBenchmarkSuite([a, b], {
			execIterations: 3,
			source: "demo",
			region: "test",
		});

		expect(run.providers).toHaveLength(2);
		expect(run.providers.map((p) => p.provider).sort()).toEqual([
			"dedalus",
			"vercel",
		]);
		for (const p of run.providers) {
			expect(p.score === null || (p.score >= 0 && p.score <= 100)).toBe(true);
			expect(p.metrics.coldBootMs).toBeDefined();
		}
		// At least one provider anchors the score at 100.
		expect(run.providers.some((p) => p.score === 100)).toBe(true);
		expect(run.runId).toBeTruthy();
		expect(run.region).toBe("test");
	});
});
