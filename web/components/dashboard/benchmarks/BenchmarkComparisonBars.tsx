import { formatMetric } from "@/lib/benchmarks/format";
import type { MetricComparison } from "@/lib/dashboard/benchmarks-view";
import { cn } from "@/lib/cn";
import { ProviderBadge } from "./ProviderBadge";
import { SourceTag } from "./BenchmarkUi";

/** One readable comparison; chart position and values share the same scale. */
export function BenchmarkComparisonBars({ comparison }: { comparison: MetricComparison }) {
	const { def, cells } = comparison;
	const max = Math.max(0, ...cells.flatMap((cell) => [cell.value, cell.p95]).filter((value): value is number => value !== null && Number.isFinite(value)));
	return <figure aria-labelledby={`metric-${def.id}`} className={cn("px-5 py-6 sm:px-6")}>
		<figcaption className={cn("mb-6")}><div className={cn("flex flex-wrap items-baseline justify-between gap-2")}><h3 id={`metric-${def.id}`} className={cn("text-base font-semibold text-[var(--ret-text)]")}>{def.label}</h3><span className={cn("text-xs text-[var(--ret-text-muted)]")}>{def.lowerIsBetter ? "Lower is better" : "Higher is better"} · {def.unit}</span></div><p className={cn("mt-2 max-w-3xl text-sm leading-6 text-[var(--ret-text-dim)]")}>{def.blurb}</p></figcaption>
		<div className={cn("space-y-5")}>
			{cells.map((cell) => {
				const fraction = cell.value !== null && max > 0 ? Math.max(0, Math.min(1, cell.value / max)) : 0;
				return <div key={cell.provider} data-comparison-provider={cell.provider} className={cn("grid items-center gap-x-5 gap-y-2 sm:grid-cols-[150px_minmax(0,1fr)_130px]")}>
					<ProviderBadge provider={cell.provider} label={cell.label} size={20} />
					<div aria-hidden="true" className={cn("relative col-span-2 row-start-2 h-3 overflow-hidden rounded-sm bg-[var(--ret-bg-soft)] sm:col-span-1 sm:row-start-auto")}>
						<div data-bar-fraction={fraction} className={cn("absolute inset-0 origin-left rounded-sm")} style={{ transform: `scaleX(${fraction})`, background: cell.hue, opacity: cell.source === "reference" ? 0.35 : 0.75 }} />
						{cell.p95 !== null && max > 0 ? <span className={cn("absolute inset-y-0 w-px bg-[var(--ret-text-dim)]")} style={{ left: `${Math.min(99.8, (cell.p95 / max) * 100)}%` }} /> : null}
					</div>
					<div className={cn("col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto")}><span className={cn("text-base font-semibold tabular-nums text-[var(--ret-text)]")}>{formatMetric(cell.value, def.unit)}</span></div>
					<div className={cn("col-span-2 flex flex-wrap items-center gap-2 text-xs leading-5 text-[var(--ret-text-muted)] sm:col-span-3 sm:pl-[170px]")}><SourceTag source={cell.source} />{cell.value === null ? <span>No result for this metric.</span> : null}{cell.p95 !== null ? <span>p95: {formatMetric(cell.p95, def.unit)}</span> : null}{cell.successRate !== null ? <span>{Math.round(cell.successRate * 100)}% successful samples</span> : null}</div>
				</div>;
			})}
		</div>
		<p className={cn("mt-6 border-t border-[var(--ret-border)]/30 pt-4 text-xs leading-5 text-[var(--ret-text-muted)]")}>Reference figures are published claims, not results from this run. Missing values do not mean zero.</p>
	</figure>;
}
