/**
 * Pure statistics helpers for benchmark samples. No I/O, no provider
 * coupling — kept separate so they're trivially unit-testable.
 */

import type { BenchmarkMetricId, MetricStats, MetricUnit } from "./types";
import { METRIC_BY_ID, SCORED_METRIC_IDS } from "./constants";

/**
 * Linear-interpolation percentile over a copy of `values`. Matches the
 * common "type 7" definition used by numpy/excel so cross-checking is
 * easy. Returns null for an empty input.
 */
export function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	if (values.length === 1) return values[0];
	const sorted = [...values].sort((a, b) => a - b);
	const rank = (p / 100) * (sorted.length - 1);
	const lo = Math.floor(rank);
	const hi = Math.ceil(rank);
	if (lo === hi) return sorted[lo];
	const frac = rank - lo;
	return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[]): number {
	if (values.length < 2) return 0;
	const m = mean(values);
	const variance =
		values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

/**
 * Geometric mean — used by the responsiveness score so one bad metric
 * can't be averaged away by a great one. Ignores non-positive values.
 */
export function geomean(values: number[]): number {
	const positive = values.filter((v) => v > 0 && Number.isFinite(v));
	if (positive.length === 0) return 0;
	const sumLogs = positive.reduce((acc, v) => acc + Math.log(v), 0);
	return Math.exp(sumLogs / positive.length);
}

/**
 * Summarize successful samples into `MetricStats`. `attempted` is the
 * total number tried (including failures) so the success rate is honest.
 */
export function summarize(
	successfulValues: number[],
	unit: MetricUnit,
	attempted: number,
): MetricStats | null {
	if (successfulValues.length === 0) return null;
	const p50 = percentile(successfulValues, 50) ?? successfulValues[0];
	return {
		value: p50,
		unit,
		samples: successfulValues.length,
		p50,
		p95: percentile(successfulValues, 95),
		p99: percentile(successfulValues, 99),
		min: Math.min(...successfulValues),
		max: Math.max(...successfulValues),
		mean: mean(successfulValues),
		stddev: stddev(successfulValues),
		successRate: attempted > 0 ? successfulValues.length / attempted : 0,
	};
}

/**
 * Composite responsiveness score in 0..100, where the best provider on a
 * given scored-metric set anchors at 100. We take each provider's geomean
 * across the scored latency metrics (lower better), then score every
 * provider as best/own so the fastest = 100 and a 2x-slower box = 50.
 *
 * `metricsByProvider` maps provider key -> (metricId -> value). Only
 * metrics present for ALL providers in the input are used, so the score
 * compares like-for-like. Returns a map provider -> score|null.
 */
export function computeResponsivenessScores(
	metricsByProvider: Record<string, Partial<Record<BenchmarkMetricId, number>>>,
): Record<string, number | null> {
	const providers = Object.keys(metricsByProvider);
	const result: Record<string, number | null> = {};
	if (providers.length === 0) return result;

	// A scored metric is usable only if every provider reported it.
	const usable = SCORED_METRIC_IDS.filter((id) =>
		providers.every((p) => {
			const v = metricsByProvider[p][id];
			return typeof v === "number" && Number.isFinite(v) && v > 0;
		}),
	);

	if (usable.length === 0) {
		for (const p of providers) result[p] = null;
		return result;
	}

	const geomeanByProvider: Record<string, number> = {};
	for (const p of providers) {
		const values = usable.map((id) => {
			const v = metricsByProvider[p][id] as number;
			// Scored metrics are all lower-is-better latencies today; invert
			// any higher-is-better metric so the geomean stays "smaller = better".
			return METRIC_BY_ID[id].lowerIsBetter ? v : 1 / v;
		});
		geomeanByProvider[p] = geomean(values);
	}

	const best = Math.min(
		...Object.values(geomeanByProvider).filter((v) => v > 0),
	);
	for (const p of providers) {
		const g = geomeanByProvider[p];
		result[p] = g > 0 ? Math.round((best / g) * 100) : null;
	}
	return result;
}
