import { Gauge } from "@/components/ui/icons";
import { RESPONSIVENESS_SCORE } from "@/lib/benchmarks/constants";
import { formatScore } from "@/lib/benchmarks/format";
import type { MetricValueSource, ScoreEntry } from "@/lib/dashboard/benchmarks-view";
import { cn } from "@/lib/cn";
import { ProviderBadge } from "./ProviderBadge";
import { SourceTag } from "./BenchmarkUi";

export function ScoreRanking({ scores, source = null }: { scores: ScoreEntry[]; source?: MetricValueSource }) {
	const anyScored = scores.some((entry) => entry.score !== null);
	return <div className={cn("px-5 py-5 sm:px-6")}>
		{anyScored ? <><div className={cn("mb-6 flex flex-wrap items-center gap-3 text-sm text-[var(--ret-text-dim)]")}><SourceTag source={source} /><span>100 is the fastest scored provider in this dataset.</span></div><div className={cn("space-y-5")}>{scores.map((entry) => <div key={entry.provider} className={cn("grid grid-cols-[130px_minmax(0,1fr)_42px] items-center gap-3 sm:gap-5")}><ProviderBadge provider={entry.provider} label={entry.label} size={20} /><div aria-hidden="true" className={cn("relative h-3 overflow-hidden rounded-sm bg-[var(--ret-bg-soft)]")}><div className={cn("absolute inset-0 origin-left rounded-sm opacity-70")} style={{ transform: `scaleX(${Math.max(0, Math.min(100, entry.score ?? 0)) / 100})`, background: entry.hue }} /></div><span className={cn("text-right text-sm font-semibold tabular-nums text-[var(--ret-text)]")}>{formatScore(entry.score)}</span></div>)}</div></> : <div className={cn("flex items-start gap-3 py-3")}><Gauge size={22} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-text-muted)]")} /><div><h3 className={cn("text-sm font-medium text-[var(--ret-text)]")}>Not enough run data to calculate a score</h3><p className={cn("mt-1 text-sm leading-6 text-[var(--ret-text-dim)]")}>Published reference figures are not scored. Recorded latency samples are required; demo scores, when present, are explicitly labeled.</p></div></div>}
		<details className={cn("mt-6 border-t border-[var(--ret-border)]/30 pt-4")}><summary className={cn("cursor-pointer text-sm font-medium text-[var(--ret-text-dim)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>How the score is calculated</summary><p className={cn("mt-3 max-w-3xl text-sm leading-6 text-[var(--ret-text-muted)]")}>{RESPONSIVENESS_SCORE.method}</p></details>
	</div>;
}
