"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RouteOutcomesPanel } from "@/components/dashboard/RouteOutcomesPanel";
import { StatCard } from "@/components/dashboard/StatCard";
import {
	TimeRangeSelector,
	RANGE_OPTIONS_USAGE,
} from "@/components/dashboard/TimeRangeSelector";
import {
	avgPerDay,
	cpuChartBuckets,
	fmtActiveTime,
	fmtUsageHours,
	memoryChartBuckets,
	normalizeUsagePayload,
	storageChartBuckets,
	type NormalizedUsage,
} from "@/lib/dashboard/usage-metrics";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";

export default function UsagePage() {
	const [days, setDays] = useState(7);
	const [data, setData] = useState<NormalizedUsage | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let stopped = false;
		setLoading(true);
		setData(null);
		setError(null);
		async function load() {
			try {
				const res = await fetch(
					`/api/dashboard/metrics/usage?days=${days}`,
					{ cache: "no-store" },
				);
				if (!res.ok) {
					if (!stopped) setError(`HTTP ${res.status}`);
					return;
				}
				const json: unknown = await res.json();
				const normalized = normalizeUsagePayload(json, days);
				if (!stopped) {
					setData(normalized);
					setError(normalized ? null : "Invalid usage payload");
				}
			} catch {
				if (!stopped) setError("Failed to fetch usage data");
			} finally {
				if (!stopped) setLoading(false);
			}
		}
		load();
		return () => {
			stopped = true;
		};
	}, [days]);

	const resources = data?.resources;
	const cpuHours = resources
		? fmtUsageHours(resources.cpu.total)
		: "–";
	const memHours = resources
		? fmtUsageHours(resources.memory.total)
		: "–";
	const storageHours = resources
		? resources.storage.total.toFixed(1)
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
				kicker="USAGE"
				title="Usage"
				description="Sampled machine allocation and compute estimates. Not a provider bill."
				right={
					<TimeRangeSelector
						options={RANGE_OPTIONS_USAGE}
						selected={days}
						onSelect={setDays}
					/>
				}
			/>
			<DashboardPageBody>
				{error ? (
					<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
						<p className="text-[11px] text-[var(--ret-red)]">
							error: {error}
						</p>
					</ReticleFrame>
				) : null}

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
								value={cpuHours}
								unit="vCPU-hrs"
							/>
							<StatCard
								label="Memory allocation"
								value={memHours}
								unit="GiB-hrs"
							/>
							<StatCard
								label="Storage allocation"
								value={storageHours}
								unit="GiB-hrs"
							/>
						</>
					)}
				</div>
				<ReticleFrame className="space-y-2 p-4 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
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
				</ReticleFrame>

				<ReticleFrame>
					<div className="divide-y divide-[var(--ret-border)]">
						<ResourceChartRow
							title="CPU allocation"
							total={cpuHours}
							unit="vCPU-hrs"
							avgLabel={`${resources ? avgPerDay(resources.cpu.total / 3600, days) : "–"} avg/day`}
							data={cpuBuckets}
							color="var(--ret-purple)"
							loading={loading}
						/>
						<ResourceChartRow
							title="Memory allocation"
							total={memHours}
							unit="GiB-hrs"
							avgLabel={`${resources ? avgPerDay(resources.memory.total / 3600, days) : "–"} avg/day`}
							data={memBuckets}
							color="var(--ret-amber)"
							loading={loading}
						/>
						<ResourceChartRow
							title="Storage allocation"
							total={storageHours}
							unit="GiB-hrs"
							avgLabel={`${resources ? avgPerDay(resources.storage.total, days) : "–"} avg/day`}
							data={storageBuckets}
							color="var(--ret-red)"
							loading={loading}
						/>
					</div>
				</ReticleFrame>

				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
						<p className="px-4 py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
							No machine usage data for this period.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-[12px]">
								<thead>
									<tr className="border-b border-[var(--ret-border)] text-[var(--ret-text-muted)]">
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											Machine ID
										</th>
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											CPU
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal sm:table-cell">
											Memory
										</th>
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											Sampled Time
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal lg:table-cell">
											Sampled Compute
										</th>
									</tr>
								</thead>
								<tbody>
									{data.machineBreakdown.map((row) => (
										<tr
											key={row.machineId}
											className="border-b border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)]"
										>
											<td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text)]">
												{row.machineId.slice(0, 20)}
											</td>
											<td className="px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)]">
												{row.vcpu != null
													? `${row.vcpu} vCPU`
													: `${fmtUsageHours(row.cpuVcpuSeconds)} vCPU-hrs`}
											</td>
											<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)] sm:table-cell">
												{row.memoryMib != null
													? `${(row.memoryMib / 1024).toFixed(1)} GiB`
													: row.memoryGibSeconds
														? `${(row.memoryGibSeconds / 3600).toFixed(1)} GiB-hrs`
														: "–"}
											</td>
											<td className="px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text)]">
												{fmtActiveTime(row.awakeSeconds)}
											</td>
											<td title={row.costNote} className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-muted)] lg:table-cell">
												{row.costFormatted ?? "Unknown"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</ReticleFrame>

				<RouteOutcomesPanel days={days} />
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
				<h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</h3>
				<p className="mt-1 text-lg font-semibold tabular-nums text-[var(--ret-text)]">
					{total}
					<span className="ml-1 text-[11px] font-normal text-[var(--ret-text-dim)]">
						{unit}
					</span>
				</p>
				<p className="mt-0.5 text-[10px] text-[var(--ret-text-muted)]">
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
