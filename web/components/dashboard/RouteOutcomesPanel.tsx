"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { cn } from "@/lib/cn";
import { METRICS_AVAILABILITY_COPY, metricsFailureReason, type MetricsUnavailableReason } from "@/lib/dashboard/metrics-availability";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { agentLogoMark, providerLogoMark } from "@/lib/fleet/logos";
import {
	routeKey,
	type Metric,
	type RouteOutcome,
	type RouteOutcomesReport,
	type UnavailableReason,
} from "@/lib/learning/route-outcomes";
import {
	AGENT_LABEL,
	PROVIDER_LABEL,
	type AgentKind,
	type ProviderKind,
} from "@/lib/user-config/schema";

/** Why a number is missing, in the user's words. None of these mean zero. */
const REASON_COPY: Record<UnavailableReason, string> = {
	no_runs: "no run on this route in the window",
	no_samples: "no run recorded a usable value",
	no_successful_run: "no successful run yet, so there is nothing to price",
	not_captured_by_source: "the on-box run log does not record it yet",
	no_resume_path: "nothing resumes or replays a hosted run yet",
};

const GAP_LABEL: Record<string, string> = {
	taskSuccess: "task success",
	timeToFirstOutput: "time to first output",
	costSandbox: "sandbox cost per success",
	costModel: "model cost per success",
	costTotal: "total cost per success",
	truncated: "truncation rate",
	resumed: "resume outcome",
};

function Unknown({ reason }: { reason: UnavailableReason }) {
	return (
		<span
			className="font-mono text-[13px] text-[var(--ret-text-muted)]"
			title={REASON_COPY[reason]}
		>
			unknown
		</span>
	);
}

function Hint({ children }: { children: ReactNode }) {
	return (
		<span className="mt-0.5 block font-mono text-[9px] text-[var(--ret-text-muted)]">
			{children}
		</span>
	);
}

function formatDuration(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * Millicents are 1/1000 of a cent, and a sandbox estimate for a short run is
 * well under a cent -- `toFixed(2)` would print every route as $0.00, which
 * reads as free. Keep two significant figures below a cent.
 */
function formatCost(millicents: number): string {
	const dollars = millicents / 100_000;
	if (millicents === 0) return "$0.00";
	return dollars >= 0.01 ? `$${dollars.toFixed(2)}` : `$${dollars.toPrecision(2)}`;
}

function Cell({ children }: { children: ReactNode }) {
	return <td className="px-3 py-2.5 align-top">{children}</td>;
}

function RouteAxis({ route }: { route: RouteOutcome }) {
	// The mark helpers fall back to a default for an unknown kind, so only ask
	// them once the axis is known to be a real AgentKind/ProviderKind.
	const agentMark = route.recognized ? agentLogoMark(route.runtime as AgentKind) : null;
	const substrateMark = route.recognized
		? providerLogoMark(route.substrate as ProviderKind)
		: null;
	const agentLabel = route.recognized
		? AGENT_LABEL[route.runtime as AgentKind]
		: route.runtime;
	const substrateLabel = route.recognized
		? PROVIDER_LABEL[route.substrate as ProviderKind]
		: route.substrate;
	return (
		<div className="flex items-center gap-2 whitespace-nowrap">
			{agentMark ? <Logo mark={agentMark} size={13} /> : null}
			<span className="text-sm font-medium text-[var(--ret-text)]">{agentLabel}</span>
			<span className="font-mono text-xs text-[var(--ret-text-muted)]">on</span>
			{substrateMark ? <Logo mark={substrateMark} size={13} /> : null}
			<span className="text-sm font-medium text-[var(--ret-text)]">
				{substrateLabel}
			</span>
			{route.recognized ? null : (
				<span
					className="border border-[var(--ret-amber)]/30 px-1.5 py-0.5 text-xs font-medium text-[var(--ret-amber)]"
					title="the run log's arm snapshot is unvalidated free text; this axis is not a known agent or substrate"
				>
					unrecognized
				</span>
			)}
		</div>
	);
}

function SuccessCell({ metric }: { metric: RouteOutcome["taskSuccess"] }) {
	if (metric.status === "unavailable") return <Unknown reason={metric.reason} />;
	const { rate, count, observed } = metric.value;
	const tone =
		rate >= 0.9
			? "text-[var(--ret-green)]"
			: rate >= 0.5
				? "text-[var(--ret-amber)]"
				: "text-[var(--ret-red)]";
	return (
		<>
			<span className={cn("font-mono text-sm tabular-nums", tone)}>
				{(rate * 100).toFixed(0)}%
			</span>
			<Hint>
				{count}/{observed} runs
			</Hint>
		</>
	);
}

function FirstOutputCell({ route }: { route: RouteOutcome }) {
	const wall = route.wallClock;
	return (
		<>
			{route.timeToFirstOutput.status === "available" ? (
				<span className="font-mono text-sm tabular-nums text-[var(--ret-text)]">
					{formatDuration(route.timeToFirstOutput.value.p50Ms)}
				</span>
			) : (
				<Unknown reason={route.timeToFirstOutput.reason} />
			)}
			<Hint>
				{wall.status === "available"
					? `wall p50 ${formatDuration(wall.value.p50Ms)}`
					: "wall clock unknown"}
			</Hint>
		</>
	);
}

function CostCell({ cost }: { cost: RouteOutcome["cost"] }) {
	return (
		<>
			{cost.total.status === "available" ? (
				<span className="font-mono text-sm tabular-nums text-[var(--ret-text)]">
					{formatCost(cost.total.value.meanMillicents)}
				</span>
			) : (
				<Unknown reason={cost.total.reason} />
			)}
			<Hint>
				{cost.sandbox.status === "available"
					? `sandbox ${cost.sandbox.value.basis} ${formatCost(cost.sandbox.value.meanMillicents)}`
					: "sandbox unknown"}
				{" . "}
				{cost.model.status === "available"
					? `model ${formatCost(cost.model.value.meanMillicents)}`
					: "model unknown"}
			</Hint>
		</>
	);
}

function RateCell({
	metric,
	/** Truncation is a defect signal, so a nonzero rate should read as one. */
	warnWhenPositive = false,
}: {
	metric: Metric<{ rate: number; count: number; observed: number }>;
	warnWhenPositive?: boolean;
}) {
	if (metric.status === "unavailable") return <Unknown reason={metric.reason} />;
	const { rate, count, observed } = metric.value;
	const tone =
		warnWhenPositive && rate > 0
			? rate >= 0.5
				? "text-[var(--ret-red)]"
				: "text-[var(--ret-amber)]"
			: "text-[var(--ret-text)]";
	return (
		<>
			<span className={cn("font-mono text-sm tabular-nums", tone)}>
				{(rate * 100).toFixed(0)}%
			</span>
			<Hint>
				{count}/{observed} runs
			</Hint>
		</>
	);
}

const HEAD_CLASS =
	"px-3 py-2 text-left font-mono text-[9px] font-normal uppercase tracking-[0.18em] text-[var(--ret-text-muted)]";

type Props = {
	/** Scope to one machine. Omitted reports every machine on the account. */
	machineId?: string;
	days?: number;
	className?: string;
};

/**
 * Roadmap 1.3 (hosted half): the four owed numbers per route (agent x
 * substrate). Two of the four cannot be measured from the hosted trace table
 * yet, and this panel says "unknown" with a reason on hover rather than
 * plotting a zero -- a chart of silent zeros is worse than an empty one.
 */
export function RouteOutcomesPanel({ machineId, days = 30, className }: Props) {
	const [report, setReport] = useState<RouteOutcomesReport | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<MetricsUnavailableReason | null>(null);
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		let stopped = false;
		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setReport(null);
		const params = new URLSearchParams({ days: String(days) });
		if (machineId) params.set("machineId", machineId);
		fetch(`/api/dashboard/route-outcomes?${params.toString()}`, { cache: "no-store", signal: controller.signal })
			.then(async (res) => {
				const json = (await res.json()) as { ok?: boolean; report?: RouteOutcomesReport; reason?: unknown } | null;
				if (!res.ok || !json?.ok || !json.report || !Array.isArray(json.report.routes) || !Array.isArray(json.report.gaps)) {
					if (!stopped) setError(metricsFailureReason(json));
					return;
				}
				if (!stopped) {
					setReport(json.report);
					setError(null);
				}
			})
			.catch(() => {
				if (!stopped) {
					setReport(null);
					setError("unavailable");
				}
			})
			.finally(() => {
				if (!stopped) setLoading(false);
			});
		return () => {
			stopped = true;
			controller.abort();
		};
	}, [machineId, days, retry]);

	return (
		<div className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)]", className)}>
			<div className="flex items-baseline justify-between gap-3 border-b border-[var(--ret-border)] px-4 py-3">
				<ReticleLabel>Route outcomes</ReticleLabel>
				<span className="font-mono text-xs text-[var(--ret-text-muted)]">
					{report ? `${report.totalRuns} traced runs . last ${days}d` : `last ${days}d`}
				</span>
			</div>

			{error ? (
				<div className={cn("p-5")}>
					<div role="alert"><h3 className={cn("text-base font-semibold")}>{METRICS_AVAILABILITY_COPY[error].title}</h3><p className={cn("mt-2 text-sm leading-6 text-[var(--ret-text-dim)]")}>{METRICS_AVAILABILITY_COPY[error].description}</p></div>
					<ReticleButton variant="secondary" size="sm" className={cn("mt-4")} onClick={() => setRetry(value => value + 1)}>Retry route outcomes</ReticleButton>
				</div>
			) : loading ? (
				<DashboardLoadingState label="Loading route outcomes…" variant="table" className="p-4" />
			) : !report || report.routes.length === 0 ? (
				<div className="px-4 py-6 text-center text-sm text-[var(--ret-text-muted)]"><p>No traced runs in this window. Only scheduled (cron) runs are included; console, API, and SDK runs are not tracked here.</p><ReticleButton as="a" href="/dashboard/cron" variant="secondary" className="mt-4">Open schedules</ReticleButton></div>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left">
						<thead>
							<tr className="border-b border-[var(--ret-border)]">
								<th className={HEAD_CLASS}>Route</th>
								<th className={HEAD_CLASS}>Runs</th>
								<th className={HEAD_CLASS}>Task success</th>
								<th className={HEAD_CLASS}>First output</th>
								<th className={HEAD_CLASS}>Cost / success</th>
								<th className={cn(HEAD_CLASS, "hidden sm:table-cell")}>Truncated</th>
								<th className={cn(HEAD_CLASS, "hidden md:table-cell")}>Resumed</th>
							</tr>
						</thead>
						<tbody>
							{report.routes.map((route) => (
								<tr
									key={routeKey(route)}
									className="border-b border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)]"
								>
									<Cell>
										<RouteAxis route={route} />
									</Cell>
									<Cell>
										<span className="font-mono text-sm tabular-nums text-[var(--ret-text-dim)]">
											{route.runs}
										</span>
									</Cell>
									<Cell>
										<SuccessCell metric={route.taskSuccess} />
									</Cell>
									<Cell>
										<FirstOutputCell route={route} />
									</Cell>
									<Cell>
										<CostCell cost={route.cost} />
									</Cell>
									<td className="hidden px-3 py-2.5 align-top sm:table-cell">
										<RateCell metric={route.resume.truncated} warnWhenPositive />
									</td>
									<td className="hidden px-3 py-2.5 align-top md:table-cell">
										<RateCell metric={route.resume.resumed} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{report && report.gaps.length > 0 ? (
				<div className="border-t border-[var(--ret-border)] px-4 py-3">
					<div className="text-xs font-medium text-[var(--ret-text-muted)]">
						not reported on any route
					</div>
					<ul className="mt-2 grid gap-1.5">
						{report.gaps.map((gap) => (
							<li
								key={gap.metric}
								className="flex flex-wrap items-baseline gap-2 text-[13px] text-[var(--ret-text-dim)]"
							>
								<span className="font-medium text-[var(--ret-text-secondary)]">
									{GAP_LABEL[gap.metric] ?? gap.metric}
								</span>
								<span className="font-mono text-xs text-[var(--ret-text-muted)]">
									{gap.reasons.map((reason) => REASON_COPY[reason]).join("; ")}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
