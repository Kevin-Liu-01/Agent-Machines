"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import {
	TimeRangeSelector,
	RANGE_OPTIONS_MACHINES,
} from "@/components/dashboard/TimeRangeSelector";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { bucketByDay } from "@/lib/dashboard/chart-buckets";

const POLL_MS = 5000;

type Machine = {
	id: string;
	providerKind: string;
	providerLabel: string;
	agentKind: string;
	name: string;
	spec: { vcpu: number; memoryMib: number; storageGib: number };
	model: string;
	createdAt: string;
	archived?: boolean;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

type Payload = {
	ok: boolean;
	machines: Machine[];
	activeMachineId: string | null;
};

const PHASE_META: Record<
	string,
	{ label: string; dotClass: string; textClass: string }
> = {
	ready: {
		label: "Running",
		dotClass: "bg-[var(--ret-green)]",
		textClass: "text-[var(--ret-green)]",
	},
	starting: {
		label: "Starting",
		dotClass: "bg-[var(--ret-purple)]",
		textClass: "text-[var(--ret-purple)]",
	},
	sleeping: {
		label: "Sleeping",
		dotClass: "bg-[var(--ret-amber)]",
		textClass: "text-[var(--ret-amber)]",
	},
	destroying: {
		label: "Destroying",
		dotClass: "bg-[var(--ret-text-muted)]",
		textClass: "text-[var(--ret-text-muted)]",
	},
	destroyed: {
		label: "Destroyed",
		dotClass: "bg-[var(--ret-text-muted)]",
		textClass: "text-[var(--ret-text-muted)]",
	},
	error: {
		label: "Failed",
		dotClass: "bg-[var(--ret-red)]",
		textClass: "text-[var(--ret-red)]",
	},
	unknown: {
		label: "Unknown",
		dotClass: "bg-[var(--ret-text-muted)]",
		textClass: "text-[var(--ret-text-muted)]",
	},
};

type StatusFilter = "all" | "running" | "sleeping" | "failed" | "destroyed";

const FILTER_PILLS: { label: string; value: StatusFilter }[] = [
	{ label: "All", value: "all" },
	{ label: "Running", value: "running" },
	{ label: "Sleeping", value: "sleeping" },
	{ label: "Failed", value: "failed" },
	{ label: "Destroyed", value: "destroyed" },
];

function resolveState(m: Machine): string {
	return m.live.ok ? m.live.state : "unknown";
}

function matchesFilter(state: string, filter: StatusFilter): boolean {
	if (filter === "all") return true;
	if (filter === "running") return state === "ready" || state === "starting";
	if (filter === "sleeping") return state === "sleeping";
	if (filter === "failed") return state === "error" || state === "destroying";
	if (filter === "destroyed") return state === "destroyed";
	return true;
}

export default function ContainersPage() {
	const [data, setData] = useState<Payload | null>(null);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<StatusFilter>("all");
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
				/* ignore */
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

	const machines = data?.machines ?? [];
	const activeCount = machines.filter(
		(m) => resolveState(m) === "ready" || resolveState(m) === "starting",
	).length;
	const sleepingCount = machines.filter(
		(m) => resolveState(m) === "sleeping",
	).length;

	const chartData = useMemo(
		() => bucketByDay(machines, chartDays),
		[machines, chartDays],
	);

	const filtered = useMemo(() => {
		let list = machines;
		if (filter !== "all") {
			list = list.filter((m) => matchesFilter(resolveState(m), filter));
		}
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter((m) => m.id.toLowerCase().includes(q));
		}
		return list;
	}, [machines, filter, search]);

	const dateRangeLabel = useMemo(() => {
		if (!chartData.length) return "";
		const first = chartData[0].date;
		const last = chartData[chartData.length - 1].date;
		return `${formatDayShort(first)} – ${formatDayShort(last)}`;
	}, [chartData]);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="CONTAINERS"
				title="Containers"
				description="Fleet-level view of every machine on the account. Monitor state, search by ID, and drill in."
			/>
			<DashboardPageBody>
				{/* ── A) Active / Idle stat cards ── */}
				<div className="grid gap-3 sm:grid-cols-2">
					{loading ? (
						<>
							<Skeleton className="h-[100px]" />
							<Skeleton className="h-[100px]" />
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

				{/* ── B) Machine Created chart ── */}
				<ReticleFrame>
					<div className="px-4 pt-4 pb-2">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									Machine created
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

				{/* ── C) All Machines table ── */}
				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								All machines ({filtered.length})
							</h2>
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search by machine ID…"
								className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-1.5 font-mono text-[11px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
							/>
						</div>
						<div className="mt-2 flex flex-wrap gap-1.5">
							{FILTER_PILLS.map((pill) => (
								<button
									key={pill.value}
									type="button"
									onClick={() => setFilter(pill.value)}
									className={cn(
										"px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
										filter === pill.value
											? "bg-[var(--ret-bg-soft)] text-[var(--ret-text)] shadow-[0_0_0_1px_var(--ret-border)]"
											: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
									)}
								>
									{pill.label}
								</button>
							))}
						</div>
					</div>

					{loading ? (
						<div className="space-y-2 p-4">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-10 w-full" />
							))}
						</div>
					) : filtered.length === 0 ? (
						<p className="px-4 py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
							No machines match your filters.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-[12px]">
								<thead>
									<tr className="border-b border-[var(--ret-border)] text-[var(--ret-text-muted)]">
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											Machine
										</th>
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											Status
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal md:table-cell">
											Shape
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal lg:table-cell">
											Created
										</th>
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											<span className="sr-only">Open</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{filtered.map((m) => (
										<MachineRow key={m.id} machine={m} />
									))}
								</tbody>
							</table>
						</div>
					)}
				</ReticleFrame>
			</DashboardPageBody>
		</div>
	);
}

function MachineRow({ machine }: { machine: Machine }) {
	const state = resolveState(machine);
	const meta = PHASE_META[state] ?? PHASE_META.unknown;
	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
	const reason = machine.live.ok ? null : machine.live.reason;

	return (
		<tr className="border-b border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)]">
			<td className="px-4 py-2.5">
				<span className="block truncate font-mono text-[11px] text-[var(--ret-text)]">
					{machine.id.slice(0, 20)}
				</span>
				{reason ? (
					<span className="block truncate text-[10px] text-[var(--ret-text-muted)]">
						{reason.slice(0, 60)}
					</span>
				) : null}
			</td>
			<td className="px-4 py-2.5">
				<span className="inline-flex items-center gap-1.5">
					<span
						className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dotClass)}
					/>
					<span className={cn("text-[11px]", meta.textClass)}>
						{meta.label}
					</span>
				</span>
			</td>
			<td className="hidden px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text-dim)] md:table-cell">
				{machine.spec.vcpu} vCPU / {memGib} GiB / {machine.spec.storageGib} GiB
			</td>
			<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)] lg:table-cell">
				{new Date(machine.createdAt).toLocaleDateString()}
			</td>
			<td className="px-4 py-2.5 text-right">
				<Link
					href={`/dashboard/machines/${machine.id}`}
					className="text-[11px] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-text)]"
				>
					→
				</Link>
			</td>
		</tr>
	);
}
