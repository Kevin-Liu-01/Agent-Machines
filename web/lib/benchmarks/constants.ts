/**
 * Benchmark catalog + tunables.
 *
 * `METRIC_DEFINITIONS` is the single source of truth for what we measure,
 * why it matters, and how the harness measures it. The methodology panel,
 * the charts, and the scoring all read from here. Keep the prose honest:
 * if the method changes, change it here.
 */

import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

import type {
	BenchmarkMetricId,
	MetricCategory,
	MetricDefinition,
} from "./types";

export const BENCHMARK_SCHEMA_VERSION = 1;

/** Providers we benchmark, in canonical display order. */
export const BENCHMARK_PROVIDERS: readonly ProviderKind[] = [
	"dedalus",
	"e2b",
	"sprites",
	"vercel",
];

/** Default spec held constant across providers for a fair comparison. */
export const DEFAULT_BENCHMARK_SPEC: MachineSpec = {
	vcpu: 2,
	memoryMib: 4096,
	storageGib: 10,
};

/** Default repeat counts. Lifecycle probes are expensive so default to 1. */
export const DEFAULT_EXEC_ITERATIONS = 12;
export const DEFAULT_SUITE_ITERATIONS = 1;

/** Exec/throughput probe timeouts (ms). */
export const PROBE_TIMEOUTS = {
	exec: 15_000,
	cpu: 60_000,
	disk: 60_000,
	boot: 180_000,
	wake: 120_000,
	teardown: 60_000,
} as const;

/** How long to poll for a machine to reach `ready` before giving up. */
export const READY_POLL_INTERVAL_MS = 750;
export const READY_POLL_TIMEOUT_MS = 180_000;

/* --------------------------------------------------------------------- */
/* Probe commands (portable across Debian-ish substrate images)          */
/* --------------------------------------------------------------------- */

/** Trivial round-trip used for exec-latency and time-to-first-exec. */
export const NOOP_COMMAND = "printf ok";

/**
 * CPU microbench: a fixed-size integer sum in awk (present on every
 * image), printed with wall-clock nanoseconds so we can derive Mops/s
 * independent of control-plane latency.
 */
export const CPU_BENCH_ITERATIONS = 20_000_000;
export const CPU_BENCH_COMMAND = [
	"start=$(date +%s%N)",
	`awk 'BEGIN{s=0;for(i=0;i<${CPU_BENCH_ITERATIONS};i++)s+=i;print s>"/dev/null"}'`,
	"end=$(date +%s%N)",
	'echo "NS=$((end-start))"',
].join("; ");

/**
 * Disk write: 256MiB via dd with fdatasync so the number reflects durable
 * throughput, not page cache. Parsed from dd's "X MB/s" trailer.
 */
export const DISK_WRITE_COMMAND =
	"dd if=/dev/zero of=$HOME/.am-bench.bin bs=1M count=256 conv=fdatasync 2>&1 | tail -1";

/**
 * Disk read: re-read the file written above. We can't drop caches without
 * root on most substrates, so this is best-effort warm-read throughput.
 */
export const DISK_READ_COMMAND =
	"dd if=$HOME/.am-bench.bin of=/dev/null bs=1M 2>&1 | tail -1; rm -f $HOME/.am-bench.bin";

/* --------------------------------------------------------------------- */
/* Metric catalog                                                        */
/* --------------------------------------------------------------------- */

export const CATEGORY_LABELS: Record<MetricCategory, string> = {
	lifecycle: "Lifecycle latency",
	exec: "Exec round-trip",
	compute: "Compute & I/O",
	reliability: "Reliability",
};

export const CATEGORY_ORDER: readonly MetricCategory[] = [
	"lifecycle",
	"exec",
	"compute",
	"reliability",
];

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
	{
		id: "coldBootMs",
		label: "Cold boot → first exec",
		unit: "ms",
		category: "lifecycle",
		lowerIsBetter: true,
		blurb:
			"Total time from asking for a brand-new machine to the first shell command returning output. This is the latency a user or agent actually feels on a cold start, before anything is warm or cached.",
		method:
			"Measured as wall-clock time from the provision() call until a trivial printf round-trips on the freshly created machine. It deliberately folds in the create request, readiness polling, and the first exec, so it reflects the real end-to-end cold path rather than any single API call.",
		scored: true,
	},
	{
		id: "provisionMs",
		label: "Provision API call",
		unit: "ms",
		category: "lifecycle",
		lowerIsBetter: true,
		blurb:
			"How long the provider's create call takes to accept the request and hand back a machine id, before the machine is necessarily ready to run anything.",
		method:
			"Measured as the wall-clock duration of the provision() request in isolation, from just before the call to the moment it returns an id. Readiness polling and the first exec are excluded so this isolates control-plane acceptance latency.",
		scored: false,
	},
	{
		id: "timeToReadyMs",
		label: "Time to ready",
		unit: "ms",
		category: "lifecycle",
		lowerIsBetter: true,
		blurb:
			"Time from requesting a machine until the provider reports it running and schedulable, the point at which it will accept work.",
		method:
			"Measured from provision() while polling state() every 750ms, stopping when the provider's normalized state first reads ready. It captures placement and boot but stops short of the first exec round-trip, which cold boot covers.",
		scored: true,
	},
	{
		id: "wakeMs",
		label: "Resume from sleep",
		unit: "ms",
		category: "lifecycle",
		lowerIsBetter: true,
		blurb:
			"Time to bring an idle, parked machine back to a usable state and run the first command on it. This is the tax an agent pays each time it returns to a sleeping worker.",
		method:
			"We call sleep(), wait for the machine to actually park, then time wake() plus the first printf after it. Auto-sleep substrates that never expose a parked state instead get timed on the next exec, which transparently triggers the resume.",
		scored: true,
	},
	{
		id: "execP50Ms",
		label: "Exec round-trip p50",
		unit: "ms",
		category: "exec",
		lowerIsBetter: true,
		blurb:
			"Median round-trip latency of a no-op command on an already-running machine. This is the per-step tax an agent pays on every tool call once the box is warm.",
		method:
			"After one warm-up exec, we run printf back-to-back (12 times by default) on a ready machine and take the median of the wall-clock round trips. It measures the control-plane and transport overhead of an exec, not the command itself.",
		scored: true,
	},
	{
		id: "execP95Ms",
		label: "Exec round-trip p95",
		unit: "ms",
		category: "exec",
		lowerIsBetter: true,
		blurb:
			"Tail latency of the same warm exec loop. It shows how bad a slow turn gets, which matters more than the median across a long agent run that makes many calls.",
		method:
			"The 95th percentile of the warm printf round-trip samples gathered for the p50 measurement, using the standard interpolated percentile.",
		scored: false,
	},
	{
		id: "cpuMops",
		label: "CPU throughput",
		unit: "Mops/s",
		category: "compute",
		lowerIsBetter: false,
		blurb:
			"Raw integer compute throughput inside the machine, in millions of operations per second. Higher means faster builds, tests, and any CPU-bound tool work.",
		method:
			"We run a fixed 20 million iteration integer-sum loop in awk and time it with the in-VM nanosecond clock, so the result reflects guest CPU speed and stays independent of exec or network latency. Throughput is iterations divided by elapsed seconds.",
		scored: false,
	},
	{
		id: "diskWriteMbps",
		label: "Disk write",
		unit: "MB/s",
		category: "compute",
		lowerIsBetter: false,
		blurb:
			"Durable write throughput to the machine's persistent volume, in megabytes per second. Relevant for installing dependencies, writing artifacts, and checkpointing state.",
		method:
			"dd writes a 256 MiB file with conv=fdatasync so the bytes are flushed to durable storage rather than buffered in page cache, and we parse the throughput dd reports.",
		scored: false,
	},
	{
		id: "diskReadMbps",
		label: "Disk read",
		unit: "MB/s",
		category: "compute",
		lowerIsBetter: false,
		blurb:
			"Read throughput from the persistent volume, in megabytes per second. This is a best-effort warm read, since dropping caches needs root that substrates do not grant.",
		method:
			"dd reads the file written by the write probe back into /dev/null and we parse the reported throughput. Because caches cannot be dropped without root, this measures warm reads and tends to overstate cold-read speed.",
		scored: false,
	},
	{
		id: "teardownMs",
		label: "Teardown",
		unit: "ms",
		category: "lifecycle",
		lowerIsBetter: true,
		blurb:
			"Time to destroy the machine and release its resources. This matters for high-churn, fan-out workloads that create and dispose of many short-lived machines.",
		method:
			"Measured as the wall-clock duration of the destroy() call, from just before the request until it returns.",
		scored: false,
	},
	{
		id: "reliabilityPct",
		label: "Provision success",
		unit: "%",
		category: "reliability",
		lowerIsBetter: false,
		blurb:
			"Share of the run's lifecycle and probe phases that completed without error, as a percent. A quick health signal for whether a provider behaved cleanly during the run.",
		method:
			"The fraction of attempted phases in the run (provision, ready, boot, exec, compute, disk, wake, teardown) that returned successfully, expressed as a percent. A failed or unsupported phase, such as a gated sleep and wake, lowers it.",
		scored: false,
	},
];

export const METRIC_BY_ID: Record<BenchmarkMetricId, MetricDefinition> =
	Object.fromEntries(METRIC_DEFINITIONS.map((m) => [m.id, m])) as Record<
		BenchmarkMetricId,
		MetricDefinition
	>;

export const SCORED_METRIC_IDS: readonly BenchmarkMetricId[] =
	METRIC_DEFINITIONS.filter((m) => m.scored).map((m) => m.id);

export function metricsByCategory(category: MetricCategory): MetricDefinition[] {
	return METRIC_DEFINITIONS.filter((m) => m.category === category);
}

/**
 * The composite score is not a measured metric. It is derived from the
 * scored latency metrics, so it lives here rather than in the catalog,
 * with the same label/blurb/method shape so the UI documents it the same
 * way it documents every metric.
 */
export const RESPONSIVENESS_SCORE = {
	label: "Responsiveness score",
	blurb:
		"A single 0 to 100 composite of the scored latency metrics, so providers can be ranked at a glance instead of comparing rows one by one.",
	method:
		"Computed as the geometric mean of cold boot, time-to-ready, resume, and exec p50, then normalized so the fastest substrate in the run scores 100. The geometric mean keeps one bad metric from being averaged away by a good one. Higher is more responsive, and a score near 50 means roughly twice the leader's latency. Only metrics that every provider in the run reported are included, so the comparison stays like for like.",
} as const;

/** Fallback brand hues if a profile is missing (kept in sync with seed). */
export const PROVIDER_HUE: Record<ProviderKind, string> = {
	dedalus: "#d2beff",
	e2b: "#ff8351",
	sprites: "#a855f7",
	vercel: "#7c8cf8",
};
