/**
 * Deterministic demo-run synthesis.
 *
 * The FakeProvider is great for exercising the engine's control flow, but
 * its wall-clock timings are dominated by JS/poll overhead, so it can't
 * produce realistic *ordered* numbers. For UI development and the CLI
 * `--demo` flag we instead build a `BenchmarkRun` straight from the demo
 * profiles, then run the real scoring. Output is always tagged
 * `source: "demo"` so it can never pass as a measurement.
 */

import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

import { DEFAULT_BENCHMARK_SPEC, METRIC_BY_ID } from "./constants";
import { DEMO_PROFILES, type FakeProfile } from "./fake-provider";
import { computeResponsivenessScores, summarize } from "./stats";
import type {
	BenchmarkMetricId,
	BenchmarkRun,
	ProbeResult,
	ProviderBenchmark,
} from "./types";

function result(id: BenchmarkMetricId, value: number): ProbeResult {
	return {
		id,
		stats: summarize([value], METRIC_BY_ID[id].unit, 1),
		ok: true,
		error: null,
		rawSamples: [value],
	};
}

function profileToMetrics(
	profile: FakeProfile,
): Partial<Record<BenchmarkMetricId, ProbeResult>> {
	const timeToReady = profile.provisionMs + profile.readyDelayMs;
	const coldBoot = timeToReady + profile.execMs;
	return {
		provisionMs: result("provisionMs", profile.provisionMs),
		timeToReadyMs: result("timeToReadyMs", timeToReady),
		coldBootMs: result("coldBootMs", coldBoot),
		execP50Ms: result("execP50Ms", profile.execMs),
		execP95Ms: result("execP95Ms", Math.round(profile.execMs * 1.4)),
		cpuMops: result("cpuMops", profile.cpuMops),
		diskWriteMbps: result("diskWriteMbps", profile.diskWriteMbps),
		diskReadMbps: result("diskReadMbps", profile.diskReadMbps),
		wakeMs: result("wakeMs", profile.wakeMs),
		teardownMs: result("teardownMs", profile.teardownMs),
		reliabilityPct: result("reliabilityPct", 100),
	};
}

export function synthesizeDemoRun(
	providers: readonly ProviderKind[] = Object.keys(
		DEMO_PROFILES,
	) as ProviderKind[],
	spec: MachineSpec = DEFAULT_BENCHMARK_SPEC,
): BenchmarkRun {
	const now = new Date().toISOString();
	const benches: ProviderBenchmark[] = providers.map((provider) => ({
		provider,
		source: "demo",
		ok: true,
		error: null,
		spec,
		machineId: `demo-${provider}`,
		startedAt: now,
		finishedAt: now,
		durationMs: 0,
		iterations: 1,
		metrics: profileToMetrics(DEMO_PROFILES[provider]),
		score: null,
	}));

	const scoreInput: Record<
		string,
		Partial<Record<BenchmarkMetricId, number>>
	> = {};
	for (const b of benches) {
		const m: Partial<Record<BenchmarkMetricId, number>> = {};
		for (const id of Object.keys(b.metrics) as BenchmarkMetricId[]) {
			const v = b.metrics[id]?.stats?.value;
			if (typeof v === "number") m[id] = v;
		}
		scoreInput[b.provider] = m;
	}
	const scores = computeResponsivenessScores(scoreInput);
	for (const b of benches) b.score = scores[b.provider] ?? null;

	return {
		runId: `demo-${Date.now()}`,
		source: "demo",
		startedAt: now,
		finishedAt: now,
		region: "demo",
		host: null,
		providers: benches,
	};
}
