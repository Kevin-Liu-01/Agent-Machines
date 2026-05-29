/**
 * Benchmark types — the shared vocabulary for the substrate-comparison
 * harness, the API, and the dashboard UI.
 *
 * A benchmark answers one question for each substrate provider: how fast
 * does it boot, resume, exec, compute, and tear down, and how reliably?
 * Everything is expressed through the provider-agnostic `MachineProvider`
 * contract so providers stay apples-to-apples.
 *
 * Two data sources flow through these types:
 *   - "reference" / capability / pricing: cited published facts that seed
 *     the UI before anyone runs the harness. Never our own measurements.
 *   - "measured" / "demo": produced by `runProviderBenchmark`. "measured"
 *     hits real provider APIs; "demo" runs the FakeProvider for UI dev.
 */

import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

/** Stable metric identifiers. Never reorder semantics; only append. */
export type BenchmarkMetricId =
	| "coldBootMs"
	| "provisionMs"
	| "timeToReadyMs"
	| "wakeMs"
	| "execP50Ms"
	| "execP95Ms"
	| "cpuMops"
	| "diskWriteMbps"
	| "diskReadMbps"
	| "teardownMs"
	| "reliabilityPct";

export type MetricUnit = "ms" | "Mops/s" | "MB/s" | "%";

export type MetricCategory = "lifecycle" | "exec" | "compute" | "reliability";

/**
 * Catalog entry describing what a metric means and how to read it. The
 * methodology panel renders straight from this, so the prose lives with
 * the definition rather than in the UI.
 */
export type MetricDefinition = {
	id: BenchmarkMetricId;
	label: string;
	unit: MetricUnit;
	category: MetricCategory;
	/** True when a smaller number is better (latencies). */
	lowerIsBetter: boolean;
	/** One-line "what it is". */
	blurb: string;
	/** How the harness measures it (shown in methodology). */
	method: string;
	/** Whether this metric feeds the composite responsiveness score. */
	scored: boolean;
};

/**
 * Statistical summary of repeated samples for one metric. Single-shot
 * metrics (boot, teardown) still use this with n=1 — p50 == mean == the
 * lone value.
 */
export type MetricStats = {
	value: number;
	unit: MetricUnit;
	samples: number;
	p50: number;
	p95: number | null;
	p99: number | null;
	min: number;
	max: number;
	mean: number;
	stddev: number;
	/** Fraction of attempted samples that succeeded, 0..1. */
	successRate: number;
};

export type ProbeResult = {
	id: BenchmarkMetricId;
	stats: MetricStats | null;
	ok: boolean;
	error: string | null;
	/** Per-sample raw values (successful samples only), for sparklines. */
	rawSamples: number[];
};

export type BenchmarkSource = "reference" | "measured" | "demo";

/**
 * One provider's measured result within a suite run. Metrics that a
 * provider does not support (e.g. wake on an auto-sleep substrate) come
 * back with `ok: false` rather than a fabricated number.
 */
export type ProviderBenchmark = {
	provider: ProviderKind;
	source: BenchmarkSource;
	ok: boolean;
	error: string | null;
	spec: MachineSpec;
	machineId: string | null;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	iterations: number;
	/** Map of metric id -> result. Missing keys == metric not attempted. */
	metrics: Partial<Record<BenchmarkMetricId, ProbeResult>>;
	/** Composite 0..100 responsiveness score; null when not computable. */
	score: number | null;
};

/** A full suite run across one or more providers. */
export type BenchmarkRun = {
	runId: string;
	source: BenchmarkSource;
	startedAt: string;
	finishedAt: string;
	region: string | null;
	host: string | null;
	providers: ProviderBenchmark[];
};

/* --------------------------------------------------------------------- */
/* Static profile data (reference seed)                                  */
/* --------------------------------------------------------------------- */

export type CapabilityValue = boolean | string | number | null;

/** Pricing rate with provenance so the UI can cite or flag estimates. */
export type PriceRate = {
	value: number | null;
	unit: string;
	/** "published" (cited), "estimate" (derived), or "unknown". */
	basis: "published" | "estimate" | "unknown";
};

export type ProviderPricing = {
	cpuPerVcpuHour: PriceRate;
	memoryPerGibHour: PriceRate;
	storagePerGibHour: PriceRate;
	scaleToZero: boolean;
	note: string | null;
};

export type ReferenceCitation = {
	label: string;
	url: string;
};

/**
 * Static, mostly-cited facts about a provider that don't require a live
 * run: isolation model, capability matrix, pricing, default spec, and any
 * published latency figures to show before a measured run exists.
 */
export type ProviderProfile = {
	provider: ProviderKind;
	label: string;
	/** Brand accent used in charts/badges (hex). */
	hue: string;
	tagline: string;
	isolation: string;
	runtimeKind: "persistent-machine" | "ephemeral-session";
	capabilities: Record<string, CapabilityValue>;
	pricing: ProviderPricing;
	defaultSpec: MachineSpec;
	/**
	 * Published reference latencies (ms), cited — shown until a measured
	 * run replaces them. Keyed by metric id; only latency metrics apply.
	 */
	referenceMetrics: Partial<Record<BenchmarkMetricId, number>>;
	citations: ReferenceCitation[];
};

/**
 * The snapshot the UI consumes: static profiles plus the most recent run
 * per provider (reference until measured) and a short history.
 */
export type BenchmarkSnapshot = {
	version: number;
	generatedAt: string;
	/** Whether any measured/demo run is present (vs pure reference). */
	hasMeasuredData: boolean;
	methodology: string;
	profiles: ProviderProfile[];
	/** Latest run per provider (may be reference-only). */
	latest: BenchmarkRun | null;
	/** Older runs, newest first, for trend context. */
	history: BenchmarkRun[];
};
