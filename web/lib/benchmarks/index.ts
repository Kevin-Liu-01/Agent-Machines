/**
 * Public surface for the substrate benchmark harness. Import from
 * `@/lib/benchmarks` rather than reaching into individual modules.
 */

export * from "./types";
export * from "./constants";
export * from "./stats";
export * from "./format";
export {
	Probe,
	ExecLatencyProbe,
	CpuThroughputProbe,
	DiskWriteProbe,
	DiskReadProbe,
	buildProbes,
	parseCpuNanos,
	parseDdMbps,
	nowMs,
	errMessage,
	type ProbeContext,
} from "./probes";
export {
	runProviderBenchmark,
	runBenchmarkSuite,
	metricValue,
	type RunProviderOptions,
	type SuiteOptions,
	type PhaseReporter,
} from "./engine";
export { FakeProvider, DEMO_PROFILES, type FakeProfile } from "./fake-provider";
export { synthesizeDemoRun } from "./demo";
export {
	getSnapshot,
	loadSeedSnapshot,
	seedProfiles,
	assembleSnapshot,
	storeRun,
	readRecentRuns,
	runToRows,
	supabaseConfigured,
	writeLocalRun,
	readLocalRuns,
} from "./store";
export { credentialsFromEnv, providersFromEnv } from "./credentials";
