"use client";

import { useEffect, useMemo, useState } from "react";

import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import { StatCard } from "@/components/dashboard/StatCard";
import {
	RANGE_OPTIONS_MACHINES,
	TimeRangeSelector,
} from "@/components/dashboard/TimeRangeSelector";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { bucketByDay } from "@/lib/dashboard/chart-buckets";

/**
 * Fleet-level analytics. The "machines created" timeline lives on the
 * Overview alongside the other telemetry (`showStats={false}` there, since
 * Overview's FleetMetrics already carries the running/idle counts). The
 * stat cards render when used standalone.
 */

const POLL_MS = 5000;

type LiveMachine = {
	createdAt: string;
	archived?: boolean;
	live: { ok: true; state: string } | { ok: false; reason: string };
};

type Payload = { ok: boolean; machines: LiveMachine[] };

function resolveState(m: LiveMachine): string {
	return m.live.ok ? m.live.state : "unknown";
}

export function FleetAnalytics({ showStats = true }: { showStats?: boolean }) {
	const [data, setData] = useState<Payload | null>(null);
	const [loading, setLoading] = useState(true);
	const [chartDays, setChartDays] = useState(14);

	useEffect(() => {
		let stopped = false;
		async function poll() {
			try {
				const res = await fetch("/api/dashboard/machines", {
					cache: "no-store",
				});
				if (!res.ok || stopped) return;
				setData((await res.json()) as Payload);
			} catch {
				/* transient */
			} finally {
				if (!stopped) setLoading(false);
			}
		}
		poll();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") poll();
		}, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(id);
		};
	}, []);

	const machines = useMemo(
		() => (data?.machines ?? []).filter((m) => !m.archived),
		[data],
	);
	const activeCount = machines.filter((m) => {
		const s = resolveState(m);
		return s === "ready" || s === "starting";
	}).length;
	const sleepingCount = machines.filter(
		(m) => resolveState(m) === "sleeping",
	).length;

	const chartData = useMemo(
		() => bucketByDay(machines, chartDays),
		[machines, chartDays],
	);
	const dateRangeLabel = useMemo(() => {
		if (!chartData.length) return "";
		const first = chartData[0].date;
		const last = chartData[chartData.length - 1].date;
		return `${formatDayShort(first)} – ${formatDayShort(last)}`;
	}, [chartData]);

	return (
		<div className="flex flex-col gap-4">
			{showStats ? (
				<div className="grid gap-3 sm:grid-cols-2">
					{loading ? (
						<>
							<Skeleton className="h-[88px]" />
							<Skeleton className="h-[88px]" />
						</>
					) : (
						<>
							<StatCard
								label="Active machines"
								value={activeCount}
								badge={
									<ReticleBadge variant="accent" className="text-[9px]">
										LIVE
									</ReticleBadge>
								}
							/>
							<StatCard
								label="Idle machines"
								value={sleepingCount}
								subtext="sleeping"
							/>
						</>
					)}
				</div>
			) : null}

			<ReticleFrame>
				<div className="px-4 pt-4 pb-2">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								Machines created
							</h2>
							<p className="mt-0.5 text-[11px] text-[var(--ret-text-dim)]">
								{dateRangeLabel}
							</p>
						</div>
						<TimeRangeSelector
							options={RANGE_OPTIONS_MACHINES}
							selected={chartDays}
							onSelect={setChartDays}
						/>
					</div>
				</div>
				<div className="px-2 pb-3">
					{loading ? (
						<Skeleton className="h-[200px]" />
					) : (
						<DashboardBarChart
							data={chartData}
							dataKey="count"
							xFormatter={formatDayShort}
							color="var(--ret-purple)"
						/>
					)}
				</div>
			</ReticleFrame>
		</div>
	);
}
