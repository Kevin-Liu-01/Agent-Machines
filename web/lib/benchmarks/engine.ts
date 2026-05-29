/**
 * Benchmark engine.
 *
 * `runProviderBenchmark` drives one provider through a full lifecycle
 * trial — provision, wait-for-ready, first exec (cold boot), in-machine
 * probes, a sleep/wake cycle, and teardown — recording a timing for each
 * phase. Every phase is wrapped so one failure degrades to a recorded
 * error instead of aborting the trial.
 *
 * `runBenchmarkSuite` fans out across providers in parallel (each provider
 * instance is reused for the whole trial) and assembles a `BenchmarkRun`.
 */

import type { MachineProvider } from "@/lib/providers/types";
import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

import {
	DEFAULT_BENCHMARK_SPEC,
	DEFAULT_EXEC_ITERATIONS,
	METRIC_BY_ID,
	NOOP_COMMAND,
	PROBE_TIMEOUTS,
	READY_POLL_INTERVAL_MS,
	READY_POLL_TIMEOUT_MS,
} from "./constants";
import { buildProbes, errMessage, nowMs } from "./probes";
import { computeResponsivenessScores, percentile, summarize } from "./stats";
import type {
	BenchmarkMetricId,
	BenchmarkRun,
	BenchmarkSource,
	ProbeResult,
	ProviderBenchmark,
} from "./types";

export type PhaseReporter = (
	provider: ProviderKind,
	phase: string,
	detail?: string,
) => void;

export type RunProviderOptions = {
	spec?: MachineSpec;
	execIterations?: number;
	source?: BenchmarkSource;
	includeWake?: boolean;
	includeCpu?: boolean;
	includeDisk?: boolean;
	/** When true, skip destroy (and its timing) and leave the machine up. */
	keepAlive?: boolean;
	onPhase?: PhaseReporter;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Time an async op; rethrow on failure so callers can record the error. */
async function timed<T>(op: () => Promise<T>): Promise<{ ms: number; value: T }> {
	const start = nowMs();
	const value = await op();
	return { ms: nowMs() - start, value };
}

function singleResult(id: BenchmarkMetricId, value: number): ProbeResult {
	const unit = METRIC_BY_ID[id].unit;
	return {
		id,
		stats: summarize([value], unit, 1),
		ok: true,
		error: null,
		rawSamples: [value],
	};
}

function errorResult(id: BenchmarkMetricId, error: string): ProbeResult {
	return { id, stats: null, ok: false, error, rawSamples: [] };
}

/** Poll provider.state until ready or timeout; returns elapsed ms from `since`. */
async function waitForReady(
	provider: MachineProvider,
	machineId: string,
	since: number,
): Promise<number> {
	const deadline = Date.now() + READY_POLL_TIMEOUT_MS;
	for (;;) {
		const summary = await provider.state(machineId);
		if (summary.state === "ready") return nowMs() - since;
		if (summary.state === "error" || summary.state === "destroyed") {
			throw new Error(`machine entered '${summary.rawPhase}' before ready`);
		}
		if (Date.now() > deadline) {
			throw new Error(`timed out waiting for ready (last: ${summary.rawPhase})`);
		}
		await sleep(READY_POLL_INTERVAL_MS);
	}
}

export async function runProviderBenchmark(
	provider: MachineProvider,
	options: RunProviderOptions = {},
): Promise<ProviderBenchmark> {
	const spec = options.spec ?? DEFAULT_BENCHMARK_SPEC;
	const execIterations = options.execIterations ?? DEFAULT_EXEC_ITERATIONS;
	const source = options.source ?? "measured";
	const includeWake = options.includeWake ?? true;
	const report: PhaseReporter = options.onPhase ?? (() => {});
	const kind = provider.kind;

	const startedAt = new Date();
	const startMs = nowMs();
	const metrics: Partial<Record<BenchmarkMetricId, ProbeResult>> = {};
	let machineId: string | null = null;
	let fatalError: string | null = null;

	try {
		// --- Provision -----------------------------------------------------
		report(kind, "provision");
		const provisionStart = nowMs();
		const provisioned = await timed(() =>
			provider.provision({ spec, name: `bench-${kind}` }),
		);
		machineId = provisioned.value.id;
		metrics.provisionMs = singleResult("provisionMs", provisioned.ms);

		// --- Wait for ready ------------------------------------------------
		report(kind, "ready", machineId);
		try {
			const readyMs = await waitForReady(provider, machineId, provisionStart);
			metrics.timeToReadyMs = singleResult("timeToReadyMs", readyMs);
		} catch (err) {
			metrics.timeToReadyMs = errorResult("timeToReadyMs", errMessage(err));
		}

		// --- Cold boot → first exec ----------------------------------------
		report(kind, "first-exec");
		try {
			const first = await timed(() =>
				provider.exec(machineId as string, NOOP_COMMAND, {
					timeoutMs: PROBE_TIMEOUTS.boot,
				}),
			);
			if (first.value.exitCode !== 0) {
				throw new Error(`first exec exit ${first.value.exitCode}`);
			}
			metrics.coldBootMs = singleResult("coldBootMs", nowMs() - provisionStart);
		} catch (err) {
			metrics.coldBootMs = errorResult("coldBootMs", errMessage(err));
		}

		// --- In-machine probes (exec / cpu / disk) -------------------------
		const probes = buildProbes(execIterations).filter((p) => {
			if (p.id === "cpuMops" && options.includeCpu === false) return false;
			if (
				(p.id === "diskWriteMbps" || p.id === "diskReadMbps") &&
				options.includeDisk === false
			)
				return false;
			return true;
		});
		for (const probe of probes) {
			report(kind, `probe:${probe.id}`);
			const result = await probe.run({
				provider,
				machineId: machineId as string,
				spec,
			});
			metrics[probe.id] = result;
			// Derive p95 round-trip from the exec-latency samples.
			if (probe.id === "execP50Ms") {
				const p95 = percentile(result.rawSamples, 95);
				metrics.execP95Ms =
					p95 !== null
						? singleResult("execP95Ms", p95)
						: errorResult("execP95Ms", "no exec samples");
			}
		}

		// --- Sleep / wake cycle --------------------------------------------
		if (includeWake && provider.capabilities.canSleep) {
			report(kind, "sleep");
			try {
				metrics.wakeMs = await measureWake(provider, machineId as string);
			} catch (err) {
				metrics.wakeMs = errorResult("wakeMs", errMessage(err));
			}
		}

		// --- Teardown ------------------------------------------------------
		if (!options.keepAlive && provider.capabilities.canDestroy) {
			report(kind, "teardown");
			try {
				const torn = await timed(() => provider.destroy(machineId as string));
				metrics.teardownMs = singleResult("teardownMs", torn.ms);
			} catch (err) {
				metrics.teardownMs = errorResult("teardownMs", errMessage(err));
			}
		}
	} catch (err) {
		fatalError = errMessage(err);
		// Best-effort cleanup so a fatal mid-trial error doesn't leak a machine.
		if (machineId && !options.keepAlive && provider.capabilities.canDestroy) {
			try {
				await provider.destroy(machineId);
			} catch {
				// nothing more we can do
			}
		}
	}

	metrics.reliabilityPct = computeReliability(metrics);

	const finishedAt = new Date();
	const attempted = Object.values(metrics);
	const okCount = attempted.filter((m) => m.ok).length;

	return {
		provider: kind,
		source,
		ok: fatalError === null && okCount > 0,
		error: fatalError,
		spec,
		machineId,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs: Math.round(nowMs() - startMs),
		iterations: execIterations,
		metrics,
		score: null, // filled by the suite once all providers are in
	};
}

/**
 * Sleep an idle machine, confirm it parks (best effort), then time wake +
 * first exec. Auto-sleep substrates (Sprites) never report `sleeping`, so
 * we simply pause and time the wake() + exec that triggers the resume.
 */
async function measureWake(
	provider: MachineProvider,
	machineId: string,
): Promise<ProbeResult> {
	await provider.sleep(machineId);

	// Give the substrate a moment to actually park (bounded).
	const parkDeadline = Date.now() + 8_000;
	while (Date.now() < parkDeadline) {
		const s = await provider.state(machineId);
		if (s.state === "sleeping") break;
		await sleep(READY_POLL_INTERVAL_MS);
	}

	const start = nowMs();
	if (provider.capabilities.canWake) {
		await provider.wake(machineId);
	}
	const res = await provider.exec(machineId, NOOP_COMMAND, {
		timeoutMs: PROBE_TIMEOUTS.wake,
	});
	if (res.exitCode !== 0) {
		throw new Error(`post-wake exec exit ${res.exitCode}`);
	}
	return singleResult("wakeMs", nowMs() - start);
}

function computeReliability(
	metrics: Partial<Record<BenchmarkMetricId, ProbeResult>>,
): ProbeResult {
	const entries = Object.entries(metrics).filter(
		([id]) => id !== "reliabilityPct",
	);
	if (entries.length === 0) {
		return errorResult("reliabilityPct", "no phases attempted");
	}
	const ok = entries.filter(([, r]) => r.ok).length;
	const pct = (ok / entries.length) * 100;
	return singleResult("reliabilityPct", Math.round(pct));
}

/** Pull the headline numeric value for a metric (p50), or null. */
export function metricValue(
	bench: ProviderBenchmark,
	id: BenchmarkMetricId,
): number | null {
	const r = bench.metrics[id];
	return r?.stats ? r.stats.value : null;
}

export type SuiteOptions = RunProviderOptions & {
	runId?: string;
	region?: string | null;
};

/**
 * Run a full suite across providers in parallel. Each entry pairs a
 * provider instance with its kind; the instance is reused for the trial.
 */
export async function runBenchmarkSuite(
	providers: MachineProvider[],
	options: SuiteOptions = {},
): Promise<BenchmarkRun> {
	const startedAt = new Date();
	const results = await Promise.all(
		providers.map((p) => runProviderBenchmark(p, options)),
	);

	// Composite score across whichever providers produced the scored metrics.
	const scoreInput: Record<
		string,
		Partial<Record<BenchmarkMetricId, number>>
	> = {};
	for (const r of results) {
		const m: Partial<Record<BenchmarkMetricId, number>> = {};
		for (const id of Object.keys(r.metrics) as BenchmarkMetricId[]) {
			const v = metricValue(r, id);
			if (v !== null) m[id] = v;
		}
		scoreInput[r.provider] = m;
	}
	const scores = computeResponsivenessScores(scoreInput);
	for (const r of results) r.score = scores[r.provider] ?? null;

	return {
		runId: options.runId ?? cryptoRandomId(),
		source: options.source ?? "measured",
		startedAt: startedAt.toISOString(),
		finishedAt: new Date().toISOString(),
		region: options.region ?? null,
		host: typeof process !== "undefined" ? (process.env.VERCEL_REGION ?? null) : null,
		providers: results,
	};
}

function cryptoRandomId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
