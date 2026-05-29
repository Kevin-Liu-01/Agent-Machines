import { RESPONSIVENESS_SCORE } from "@/lib/benchmarks/constants";
import { formatScore } from "@/lib/benchmarks/format";
import type { ScoreEntry } from "@/lib/dashboard/benchmarks-view";

import { ProviderMark } from "./ProviderBadge";

/**
 * Composite responsiveness ranking. Geomean of the scored latency metrics,
 * normalized so the fastest provider in the run anchors at 100.
 */
export function ScoreRanking({ scores }: { scores: ScoreEntry[] }) {
	const anyScored = scores.some((s) => s.score !== null);

	return (
		<div className="px-4 py-4">
			<div className="mb-1.5 flex items-baseline justify-between gap-2">
				<h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Responsiveness score
				</h3>
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					100 = fastest in run
				</span>
			</div>
			<p className="mb-3 max-w-[80ch] text-[10.5px] leading-relaxed text-[var(--ret-text-muted)]">
				{RESPONSIVENESS_SCORE.method}
			</p>
			{anyScored ? (
				<div className="space-y-2">
					{scores.map((entry) => (
						<div key={entry.provider} className="flex items-center gap-2.5">
							<div className="flex w-[118px] shrink-0 items-center gap-1.5">
								<ProviderMark provider={entry.provider} size={14} />
								<span className="truncate text-[11px] text-[var(--ret-text)]">
									{entry.label}
								</span>
							</div>
							<div className="relative h-2.5 flex-1 overflow-hidden rounded-sm border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
								<div
									className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500"
									style={{
										width: `${entry.score ?? 0}%`,
										background: entry.hue,
									}}
								/>
							</div>
							<span className="w-[40px] shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-[var(--ret-text)]">
								{formatScore(entry.score)}
							</span>
						</div>
					))}
				</div>
			) : (
				<p className="py-2 text-[11.5px] text-[var(--ret-text-muted)]">
					No measured run yet. The composite score needs measured latency
					data, so run a benchmark to populate it.
				</p>
			)}
		</div>
	);
}
