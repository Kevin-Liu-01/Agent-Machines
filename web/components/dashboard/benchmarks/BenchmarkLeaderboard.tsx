import { formatMetric, formatScore } from "@/lib/benchmarks/format";
import type {
	LeaderboardEntry,
	MetricValueSource,
	ScoreEntry,
} from "@/lib/dashboard/benchmarks-view";
import type { ProviderKind } from "@/lib/user-config/schema";

import { ProviderBadge } from "./ProviderBadge";
import { SourceTag } from "./BenchmarkUi";

/**
 * Winner cards for the headline metrics (fastest boot / resume / exec)
 * plus the top composite score. Each reads like an instrument readout.
 */
export function BenchmarkLeaderboard({
	leaderboard,
	scores,
	scoreSource = null,
}: {
	leaderboard: LeaderboardEntry[];
	scores: ScoreEntry[];
	scoreSource?: MetricValueSource;
}) {
	const top = scores.find((s) => s.score !== null) ?? null;

	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{leaderboard.map((entry) => (
				<WinnerCard
					key={entry.id}
					kicker={entry.label}
					provider={entry.winner}
					providerLabel={entry.winnerLabel}
					value={
						entry.value !== null ? formatMetric(entry.value, entry.unit) : "—"
					}
					source={entry.source}
				/>
			))}
			<WinnerCard
				kicker="Top responsiveness"
				provider={top?.provider ?? null}
				providerLabel={top?.label ?? null}
				value={top?.score != null ? formatScore(top.score) : "—"}
				valueSuffix={top?.score != null ? "/100" : undefined}
				source={top?.score != null ? scoreSource : null}
			/>
		</div>
	);
}

function WinnerCard({
	kicker,
	provider,
	providerLabel,
	value,
	valueSuffix,
	source,
}: {
	kicker: string;
	provider: ProviderKind | null;
	providerLabel: string | null;
	value: string;
	valueSuffix?: string;
	source: MetricValueSource;
}) {
	return (
		<div className="relative flex flex-col gap-4 rounded-lg border border-[var(--ret-border)]/50 bg-[var(--ret-bg)] px-5 py-5">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-[var(--ret-text-muted)]">
					{kicker}
				</span>
			</div>
			<div className="flex items-end justify-between gap-2">
				<span className="text-2xl font-semibold tabular-nums leading-none text-[var(--ret-text)]">
					{value}
					{valueSuffix ? (
						<span className="ml-0.5 text-sm font-normal text-[var(--ret-text-dim)]">
							{valueSuffix}
						</span>
					) : null}
				</span>
			</div>
			{provider ? (
				<ProviderBadge
					provider={provider}
					label={providerLabel ?? provider}
					size={14}
					className="mt-0.5"
				/>
			) : (
				<span className="mt-0.5 text-[13px] text-[var(--ret-text-muted)]">
					No result available
				</span>
			)}
			<div><SourceTag source={source} /></div>
		</div>
	);
}
