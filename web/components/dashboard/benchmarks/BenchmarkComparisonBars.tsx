import { formatMetric, formatMs } from "@/lib/benchmarks/format";
import type { MetricComparison, ProviderMetricCell } from "@/lib/dashboard/benchmarks-view";
import { cn } from "@/lib/cn";

import { ProviderMark } from "./ProviderBadge";

/**
 * Horizontal bar comparison of one metric across providers. Bar length is
 * proportional to the value; the per-row winner (shortest for latency,
 * longest for throughput) is rendered at full hue, everyone else dimmed.
 */
export function BenchmarkComparisonBars({
	comparison,
}: {
	comparison: MetricComparison;
}) {
	const { def, cells } = comparison;
	const values = cells
		.map((c) => c.value)
		.filter((v): v is number => v !== null);
	const max = values.length ? Math.max(...values) : 0;

	return (
		<div className="px-4 py-3.5">
			<div className="mb-2.5 flex items-baseline justify-between gap-2">
				<h4 className="text-[13px] font-medium text-[var(--ret-text)]">
					{def.label}
				</h4>
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					{def.lowerIsBetter ? "lower better" : "higher better"} · {def.unit}
				</span>
			</div>
			<div className="space-y-1.5">
				{cells.map((cell) => (
					<MetricBarRow
						key={cell.provider}
						cell={cell}
						unit={def.unit}
						max={max}
					/>
				))}
			</div>
			<p className="mt-2.5 text-[10.5px] leading-relaxed text-[var(--ret-text-muted)]">
				{def.blurb}
			</p>
		</div>
	);
}

function MetricBarRow({
	cell,
	unit,
	max,
}: {
	cell: ProviderMetricCell;
	unit: MetricComparison["def"]["unit"];
	max: number;
}) {
	const hasValue = cell.value !== null;
	const pct = hasValue && max > 0 ? Math.max(3, (cell.value! / max) * 100) : 0;
	const p95Pct =
		cell.p95 !== null && max > 0
			? Math.min(100, Math.max(0, (cell.p95 / max) * 100))
			: null;

	return (
		<div className="flex items-center gap-2.5">
			<div className="flex w-[118px] shrink-0 items-center gap-1.5">
				<ProviderMark provider={cell.provider} size={13} />
				<span
					className={cn(
						"truncate text-[11px]",
						cell.isWinner
							? "text-[var(--ret-text)]"
							: "text-[var(--ret-text-dim)]",
					)}
				>
					{cell.label}
				</span>
			</div>

			<div className="relative h-[18px] flex-1 overflow-hidden rounded-sm border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
				{hasValue ? (
					<div
						className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500"
						style={{
							width: `${pct}%`,
							background: cell.isWinner ? cell.hue : `${cell.hue}3a`,
						}}
					/>
				) : (
					<span className="absolute inset-0 flex items-center pl-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
						no data, run benchmark
					</span>
				)}
				{/* p95 tail marker for exec metrics */}
				{p95Pct !== null ? (
					<span
						className="absolute inset-y-0 w-px opacity-70"
						style={{ left: `${p95Pct}%`, background: cell.hue }}
						title={`p95 ${formatMs(cell.p95)}`}
					/>
				) : null}
			</div>

			<div className="flex w-[104px] shrink-0 items-center justify-end gap-1.5">
				{cell.source === "reference" ? (
					<span
						className="border border-[var(--ret-border)] px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]"
						title="Cited reference figure, not a measurement"
					>
						ref
					</span>
				) : cell.source === "demo" ? (
					<span
						className="border border-[var(--ret-border)] px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]"
						title="Synthetic demo data"
					>
						demo
					</span>
				) : null}
				<span
					className={cn(
						"font-mono text-[11px] tabular-nums",
						cell.isWinner
							? "font-semibold text-[var(--ret-text)]"
							: "text-[var(--ret-text-dim)]",
					)}
				>
					{formatMetric(cell.value, unit)}
				</span>
			</div>
		</div>
	);
}
