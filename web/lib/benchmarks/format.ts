/**
 * Display formatters for benchmark values. Pure functions, shared by the
 * CLI table output and the dashboard UI so a "624 MB/s" reads the same in
 * both places.
 */

import type { MetricUnit } from "./types";

export function formatMs(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms)) return "—";
	if (ms < 1) return `${ms.toFixed(2)}ms`;
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export function formatThroughput(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "—";
	if (value >= 1000) return `${(value / 1000).toFixed(2)}k`;
	return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function formatMetric(
	value: number | null | undefined,
	unit: MetricUnit,
): string {
	if (value == null || !Number.isFinite(value)) return "—";
	switch (unit) {
		case "ms":
			return formatMs(value);
		case "Mops/s":
			return `${formatThroughput(value)} Mops/s`;
		case "MB/s":
			return `${formatThroughput(value)} MB/s`;
		case "%":
			return `${Math.round(value)}%`;
		default:
			return String(value);
	}
}

/** Short unit suffix for axis labels / compact stats. */
export function unitSuffix(unit: MetricUnit): string {
	return unit === "ms" ? "ms" : unit === "%" ? "%" : ` ${unit}`;
}

export function formatScore(score: number | null | undefined): string {
	if (score == null || !Number.isFinite(score)) return "—";
	return String(Math.round(score));
}
