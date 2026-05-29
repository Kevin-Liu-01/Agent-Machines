/**
 * Probes — the repeatable, in-machine measurements that run against an
 * already-ready machine (exec latency, CPU, disk). Lifecycle timings
 * (boot/wake/teardown) live in the engine since they're once-per-trial.
 *
 * Every probe extends the abstract `Probe` base, which owns the common
 * loop: optional warmup, N timed iterations, per-sample error capture,
 * and reduction to a `ProbeResult`. Subclasses implement only `measure`,
 * which returns a single numeric sample in the metric's unit.
 */

import type { MachineProvider } from "@/lib/providers/types";
import type { MachineSpec } from "@/lib/user-config/schema";

import {
	CPU_BENCH_COMMAND,
	CPU_BENCH_ITERATIONS,
	DISK_READ_COMMAND,
	DISK_WRITE_COMMAND,
	METRIC_BY_ID,
	NOOP_COMMAND,
	PROBE_TIMEOUTS,
} from "./constants";
import { summarize } from "./stats";
import type { BenchmarkMetricId, ProbeResult } from "./types";

export type ProbeContext = {
	provider: MachineProvider;
	machineId: string;
	spec: MachineSpec;
};

export function errMessage(err: unknown): string {
	if (err instanceof Error) return err.message.slice(0, 300);
	return String(err).slice(0, 300);
}

/** High-resolution elapsed-ms helper usable in both Node and the browser. */
export function nowMs(): number {
	return typeof performance !== "undefined" && performance.now
		? performance.now()
		: Date.now();
}

export abstract class Probe {
	abstract readonly id: BenchmarkMetricId;
	readonly iterations: number;

	constructor(iterations = 1) {
		this.iterations = Math.max(1, iterations);
	}

	/** Optional warmup (e.g. one throwaway exec). Failures are swallowed. */
	protected async warmup(_ctx: ProbeContext): Promise<void> {}

	/** Produce one sample in the metric's unit. Throw to record a failure. */
	protected abstract measure(ctx: ProbeContext): Promise<number>;

	async run(ctx: ProbeContext): Promise<ProbeResult> {
		try {
			await this.warmup(ctx);
		} catch {
			// Warmup is best-effort; a failed warmup shouldn't fail the probe.
		}

		const ok: number[] = [];
		let lastError: string | null = null;
		for (let i = 0; i < this.iterations; i++) {
			try {
				const v = await this.measure(ctx);
				if (Number.isFinite(v)) ok.push(v);
				else lastError = "non-finite sample";
			} catch (err) {
				lastError = errMessage(err);
			}
		}

		const unit = METRIC_BY_ID[this.id].unit;
		const stats = summarize(ok, unit, this.iterations);
		return {
			id: this.id,
			stats,
			ok: stats !== null,
			error: stats === null ? (lastError ?? "no successful samples") : null,
			rawSamples: ok,
		};
	}
}

/** Median/p95 latency of a no-op command on a warm machine. */
export class ExecLatencyProbe extends Probe {
	readonly id: BenchmarkMetricId = "execP50Ms";

	protected async warmup(ctx: ProbeContext): Promise<void> {
		await ctx.provider.exec(ctx.machineId, NOOP_COMMAND, {
			timeoutMs: PROBE_TIMEOUTS.exec,
		});
	}

	protected async measure(ctx: ProbeContext): Promise<number> {
		const start = nowMs();
		const res = await ctx.provider.exec(ctx.machineId, NOOP_COMMAND, {
			timeoutMs: PROBE_TIMEOUTS.exec,
		});
		const elapsed = nowMs() - start;
		if (res.exitCode !== 0) {
			throw new Error(`exec exit ${res.exitCode}: ${res.stderr.slice(0, 120)}`);
		}
		return elapsed;
	}
}

/** CPU throughput in Mops/s via an in-VM-timed fixed awk workload. */
export class CpuThroughputProbe extends Probe {
	readonly id: BenchmarkMetricId = "cpuMops";

	protected async measure(ctx: ProbeContext): Promise<number> {
		const res = await ctx.provider.exec(ctx.machineId, CPU_BENCH_COMMAND, {
			timeoutMs: PROBE_TIMEOUTS.cpu,
		});
		if (res.exitCode !== 0) {
			throw new Error(`cpu bench exit ${res.exitCode}: ${res.stderr.slice(0, 120)}`);
		}
		const ns = parseCpuNanos(res.stdout);
		if (ns === null || ns <= 0) {
			throw new Error(`could not parse cpu bench output: ${res.stdout.slice(0, 120)}`);
		}
		const seconds = ns / 1e9;
		// Mops/s = iterations / seconds / 1e6.
		return CPU_BENCH_ITERATIONS / seconds / 1e6;
	}
}

/** Durable write throughput (MB/s) via dd + fdatasync. */
export class DiskWriteProbe extends Probe {
	readonly id: BenchmarkMetricId = "diskWriteMbps";

	protected async measure(ctx: ProbeContext): Promise<number> {
		const res = await ctx.provider.exec(ctx.machineId, DISK_WRITE_COMMAND, {
			timeoutMs: PROBE_TIMEOUTS.disk,
		});
		const mbps = parseDdMbps(`${res.stdout}\n${res.stderr}`);
		if (mbps === null) {
			throw new Error(`could not parse dd write output: ${res.stdout.slice(0, 120)}`);
		}
		return mbps;
	}
}

/** Warm read throughput (MB/s) via dd read-back. */
export class DiskReadProbe extends Probe {
	readonly id: BenchmarkMetricId = "diskReadMbps";

	protected async measure(ctx: ProbeContext): Promise<number> {
		const res = await ctx.provider.exec(ctx.machineId, DISK_READ_COMMAND, {
			timeoutMs: PROBE_TIMEOUTS.disk,
		});
		const mbps = parseDdMbps(`${res.stdout}\n${res.stderr}`);
		if (mbps === null) {
			throw new Error(`could not parse dd read output: ${res.stdout.slice(0, 120)}`);
		}
		return mbps;
	}
}

/* --------------------------------------------------------------------- */
/* Parsers (exported for unit tests)                                     */
/* --------------------------------------------------------------------- */

/** Pull `NS=<digits>` out of the CPU bench output. */
export function parseCpuNanos(stdout: string): number | null {
	const match = /NS=(\d+)/.exec(stdout);
	if (!match) return null;
	const n = Number(match[1]);
	return Number.isFinite(n) ? n : null;
}

/**
 * Parse the throughput trailer dd prints, e.g.
 *   "268435456 bytes (268 MB, 256 MiB) copied, 0.43 s, 624 MB/s"
 * Handles MB/s and GB/s; normalizes to MB/s.
 */
export function parseDdMbps(output: string): number | null {
	const match = /,\s*([\d.]+)\s*(GB|MB|kB)\/s/i.exec(output);
	if (!match) return null;
	const value = Number(match[1]);
	if (!Number.isFinite(value)) return null;
	const unit = match[2].toUpperCase();
	if (unit === "GB") return value * 1000;
	if (unit === "KB") return value / 1000;
	return value;
}

/** Construct the standard in-machine probe set with a shared iteration count. */
export function buildProbes(execIterations: number): Probe[] {
	return [
		new ExecLatencyProbe(execIterations),
		new CpuThroughputProbe(1),
		new DiskWriteProbe(1),
		new DiskReadProbe(1),
	];
}
