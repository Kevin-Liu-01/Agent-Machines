"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import { WorkspaceTabs, INSIGHT_TABS } from "@/components/dashboard/WorkspaceTabs";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RouteOutcomesPanel } from "@/components/dashboard/RouteOutcomesPanel";
import { StatCard } from "@/components/dashboard/StatCard";
import {
	TimeRangeSelector,
	RANGE_OPTIONS_USAGE,
} from "@/components/dashboard/TimeRangeSelector";
import {
	cpuChartBuckets,
	fmtActiveTime,
	fmtUsageHours,
	fmtUsageAmount,
	memoryChartBuckets,
	normalizeUsagePayload,
	storageChartBuckets,
	usageResourceNote,
	type NormalizedUsage,
} from "@/lib/dashboard/usage-metrics";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { RefreshCcw, Cpu, HardDrive, MemoryStick, ArrowRight } from "@/components/ui/icons";
import Link from "next/link";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import { METRICS_AVAILABILITY_COPY, metricsFailureReason, type MetricsUnavailableReason } from "@/lib/dashboard/metrics-availability";

export function UsagePanel() {
	const [days, setDays] = useState(7);
	const [data, setData] = useState<NormalizedUsage | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<MetricsUnavailableReason | null>(null);
	const [refresh, setRefresh] = useState(0);

	useEffect(() => {
		let stopped = false;
		const controller = new AbortController();
		setLoading(true);
		setData(null);
		setError(null);
		async function load() {
			try {
				const res = await fetch(
					`/api/dashboard/metrics/usage?days=${days}`,
					{ cache: "no-store", signal: controller.signal },
				);
				const json: unknown = await res.json();
				if (!res.ok) {
					if (!stopped) setError(metricsFailureReason(json));
					return;
				}
				const normalized = normalizeUsagePayload(json, days);
				if (!stopped) {
					setData(normalized);
					setError(normalized ? null : metricsFailureReason(json));
				}
			} catch {
				if (!stopped) setError("unavailable");
			} finally {
				if (!stopped) setLoading(false);
			}
		}
		load();
		return () => {
			stopped = true;
			controller.abort();
		};
	}, [days, refresh]);

	const resources = data?.resources;
	const cpuHours = resources
		? fmtUsageHours(resources.cpu.total)
		: "–";
	const memHours = resources
		? fmtUsageHours(resources.memory.total)
		: "–";
	const storageHours = resources
		? fmtUsageAmount(resources.storage.total)
		: "–";

	const cpuBuckets = useMemo(
		() => (resources ? cpuChartBuckets(resources) : []),
		[resources],
	);
	const memBuckets = useMemo(
		() => (resources ? memoryChartBuckets(resources) : []),
		[resources],
	);
	const storageBuckets = useMemo(
		() => (resources ? storageChartBuckets(resources) : []),
		[resources],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="Insights"
				title="Insights"
				description="Sampled machine allocation and compute estimates. Not a provider bill."
				right={
					<><TimeRangeSelector
						options={RANGE_OPTIONS_USAGE}
						selected={days}
						onSelect={setDays}
					/><ReticleButton size="sm" variant="secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCcw className="size-4" aria-hidden="true" />Refresh</ReticleButton></>
				}
			/>
			<WorkspaceTabs label="Insights sections" active="usage" items={INSIGHT_TABS} />
			<DashboardPageBody>
				{loading ? <p role="status" className="text-sm text-[var(--ret-text-muted)]">Loading usage measurements…</p> : null}
				{error ? (
					<ReticleFrame className={cn("rounded-lg p-6")}>
						<div role="alert"><h2 className={cn("text-lg font-semibold")}>{METRICS_AVAILABILITY_COPY[error].title}</h2><p className={cn("mt-2 max-w-2xl text-sm leading-6 text-[var(--ret-text-dim)]")}>{METRICS_AVAILABILITY_COPY[error].description}</p></div>
						<div className="mt-4 flex flex-wrap items-center gap-3"><ReticleButton variant="secondary" size="sm" onClick={() => setRefresh(value => value + 1)}>Retry usage</ReticleButton><Link href="/dashboard/usage?tab=benchmarks" className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--ret-text-dim)] hover:underline focus-visible:outline-2">Compare providers instead<ArrowRight size={16} aria-hidden="true" /></Link></div>
					</ReticleFrame>
				) : null}
				{error ? <section aria-label="What usage measures" className="grid gap-3 sm:grid-cols-3">{[{ icon: Cpu, title: "Compute", unit: "vCPU × time", detail: "Sampled processor allocation." }, { icon: MemoryStick, title: "Memory", unit: "GiB × time", detail: "Sampled memory allocation." }, { icon: HardDrive, title: "Storage", unit: "GiB × time", detail: "Reported disk allocation over time." }].map(({ icon: Icon, title, unit, detail }) => <div key={title} className="rounded-lg border border-[var(--ret-border)] p-4"><div className="flex items-center gap-2 text-sm font-medium"><Icon size={18} aria-hidden="true" />{title}</div><p className="my-4 text-xl tracking-tight text-[var(--ret-text-muted)]">{unit}</p><p className="text-xs leading-5 text-[var(--ret-text-muted)]">{detail} No measurement is assumed when data is unavailable.</p></div>)}</section> : null}

				{!error ? <>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{loading ? (
						<>
							{[0, 1, 2, 3].map((i) => (
								<Skeleton key={i} className="h-[100px]" />
							))}
						</>
					) : (
						<>
							<StatCard
								label={data?.costStatus === "partial" ? "Known compute · partial" : "Sampled compute estimate"}
								value={data?.costStatus === "partial" ? data.knownCostFormatted : data?.totalCostFormatted ?? "Unknown"}
								unit="USD est."
							/>
							<StatCard
								label="CPU allocation"
								subtext={usageResourceNote(resources?.cpu)}
								value={cpuHours}
								unit="vCPU-hrs"
							/>
							<StatCard
								label="Memory allocation"
								subtext={usageResourceNote(resources?.memory)}
								value={memHours}
								unit="GiB-hrs"
							/>
							<StatCard
								label="Storage allocation"
								subtext={usageResourceNote(resources?.storage)}
								value={storageHours}
								unit="GiB-hrs"
							/>
						</>
					)}
				</div>
				<details className="space-y-2 rounded-lg border border-[var(--ret-border)] p-5 text-sm leading-6 text-[var(--ret-text-dim)]">
					<summary className="cursor-pointer font-medium text-[var(--ret-text)]">How these estimates are calculated</summary>
					<p>
						{data?.costStatus === "unknown"
							? "Compute cost is unknown: these records do not yet contain enough compatible usage and pricing evidence. Unknown does not mean free."
							: "Compute estimates cover only intervals between nearby ready observations with unchanged recorded allocation—not the entire selected period."}
					</p>
					{data ? <p>
						{data.costCoverage.sampleCount.toLocaleString()} observations · {fmtActiveTime(data.costCoverage.observedSeconds)} of sampled machine time · {data.costCoverage.pricedMachines}/{data.costCoverage.observedMachines} observed machines priced.
						{data.costCoverage.truncated ? " Only the latest 1,000 observations are included; earlier data is not priced." : ""}
						{data.costStatus === "partial" ? " The amount shown is a known subtotal, not a fleet total." : ""}
					</p> : null}
					<p>
						Uses <a className="underline underline-offset-2" href="https://e2b.dev/pricing" target="_blank" rel="noreferrer">E2B list prices</a> where allocation is recorded.
						{" "}<a className="underline underline-offset-2" href="https://vercel.com/docs/sandbox/pricing" target="_blank" rel="noreferrer">Vercel</a> and <a className="underline underline-offset-2" href="https://fly.io/sprites/" target="_blank" rel="noreferrer">Sprites</a> require billing meters these observations do not provide; other unpriced providers remain unknown.
						{" "}Excludes models, tools, storage, network, creation fees, subscriptions, taxes, credits, and discounts. Check your provider invoices for actual charges.
					</p>
					<p className="text-[var(--ret-text-muted)]">Historical charts use approximate sampling-based allocation rollups, not active resource consumption. They are not used to calculate these cost estimates.</p>
				</details>

				<ReticleFrame>
					<div className="divide-y divide-[var(--ret-border)]">
						<ResourceChartRow
							title="CPU allocation"
							total={cpuHours}
							unit="vCPU-hrs"
							avgLabel={usageResourceNote(resources?.cpu)}
							data={cpuBuckets}
							color="var(--ret-purple)"
							loading={loading}
						/>
						<ResourceChartRow
							title="Memory allocation"
							total={memHours}
							unit="GiB-hrs"
							avgLabel={usageResourceNote(resources?.memory)}
							data={memBuckets}
							color="var(--ret-amber)"
							loading={loading}
						/>
						<ResourceChartRow
							title="Storage allocation"
							total={storageHours}
							unit="GiB-hrs"
							avgLabel={usageResourceNote(resources?.storage)}
							data={storageBuckets}
							color="var(--ret-red)"
							loading={loading}
						/>
					</div>
				</ReticleFrame>

				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="text-xs font-medium text-[var(--ret-text-muted)]">
							Per-machine breakdown
						</h2>
					</div>
					{loading ? (
						<div className="space-y-2 p-4">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-10 w-full" />
							))}
						</div>
					) : !data?.machineBreakdown.length ? (
						<div className="space-y-3 px-5 py-8 text-center">
							<p className="text-base font-medium">No machine usage data for this period.</p>
							<p className="text-sm text-[var(--ret-text-muted)]">Choose a wider date range, or open a machine to start working.</p>
							<ReticleButton as="a" href="/dashboard/machines" variant="secondary" size="sm">Open your fleet</ReticleButton>
						</div>
					) : (
						<div className="overflow-x-auto" role="region" aria-label="Per-machine usage" tabIndex={0}>
							<table className="w-full min-w-[620px] text-left text-sm">
								<thead>
									<tr className="border-b border-[var(--ret-border)] text-[var(--ret-text-muted)]">
										<th className="px-4 py-3 text-sm font-medium">
											Machine ID
										</th>
										<th className="px-4 py-3 text-sm font-medium">
											CPU
										</th>
										<th className="px-4 py-3 text-sm font-medium">
											Memory
										</th>
										<th className="px-4 py-3 text-sm font-medium">
											Sampled time
										</th>
										<th className="px-4 py-3 text-sm font-medium">
											Sampled compute
										</th>
									</tr>
								</thead>
								<tbody>
									{data.machineBreakdown.map((row) => (
										<tr
											key={row.machineId}
											className="border-b border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)]"
										>
											<td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-[13px] text-[var(--ret-text)]">
												{row.machineId.slice(0, 20)}
											</td>
											<td className="px-4 py-2.5 text-[13px] text-[var(--ret-text-dim)]">
												{row.vcpu != null
													? `${row.vcpu} vCPU`
													: `${fmtUsageHours(row.cpuVcpuSeconds)} vCPU-hrs`}
											</td>
											<td className="px-4 py-3 text-sm text-[var(--ret-text-dim)]">
												{row.memoryMib != null
													? `${(row.memoryMib / 1024).toFixed(1)} GiB`
													: row.memoryGibSeconds
														? `${(row.memoryGibSeconds / 3600).toFixed(1)} GiB-hrs`
														: "–"}
											</td>
											<td className="px-4 py-2.5 font-mono text-[13px] text-[var(--ret-text)]">
												{fmtActiveTime(row.awakeSeconds)}
											</td>
											<td title={row.costNote} className="px-4 py-3 text-sm text-[var(--ret-text-muted)]">
												{row.costFormatted ?? "Unknown"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</ReticleFrame>

				<RouteOutcomesPanel key={refresh} days={days} />
				</> : null}
			</DashboardPageBody>
		</div>
	);
}

function ResourceChartRow({
	title,
	total,
	unit,
	avgLabel,
	data,
	color,
	loading,
}: {
	title: string;
	total: string;
	unit: string;
	avgLabel: string;
	data: Array<{ date: string; value: number }>;
	color: string;
	loading: boolean;
}) {
	return (
		<div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="shrink-0 sm:w-[140px]">
				<h3 className="text-xs font-medium text-[var(--ret-text-muted)]">
					{title}
				</h3>
				<p className="mt-1 text-lg font-semibold tabular-nums text-[var(--ret-text)]">
					{total}
					<span className="ml-1 text-[13px] font-normal text-[var(--ret-text-dim)]">
						{unit}
					</span>
				</p>
				<p className="mt-0.5 text-xs text-[var(--ret-text-muted)]">
					{avgLabel}
				</p>
			</div>
			<div className="min-w-0 flex-1">
				{loading ? (
					<Skeleton className="h-[120px]" />
				) : (
					<DashboardBarChart
						data={data}
						dataKey="value"
						xFormatter={formatDayShort}
						color={color}
						height={120}
					/>
				)}
			</div>
		</div>
	);
}
