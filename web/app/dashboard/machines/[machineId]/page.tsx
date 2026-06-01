"use client";

import {
	Activity,
	Bot,
	Brain,
	Cloud,
	Cpu,
	Gauge,
	Hash,
	SquareTerminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { useMachineContext } from "@/components/dashboard/MachineProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
	TimeRangeSelector,
	RANGE_OPTIONS_DETAIL,
} from "@/components/dashboard/TimeRangeSelector";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import {
	cpuChartBuckets,
	memoryChartBuckets,
	normalizeMachineUsagePayload,
	storageChartBuckets,
	type NormalizedMachineUsage,
} from "@/lib/dashboard/usage-metrics";
import { cn } from "@/lib/cn";
import { AGENT_LABEL, PROVIDER_LABEL } from "@/lib/user-config/schema";

type MachineStatus = {
	state: string;
	rawPhase: string;
	lastError: string | null;
};

type MachineRouteResponse =
	| {
			ok: true;
			live?: {
				state?: string;
				rawPhase?: string;
				lastError?: string | null;
				error?: string;
			} | null;
	  }
	| { ok?: false; error?: string };

export default function MachineOverviewPage() {
	const { machineId, machine, isActive } = useMachineContext();
	const [status, setStatus] = useState<MachineStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [usageData, setUsageData] = useState<NormalizedMachineUsage | null>(null);
	const [usageLoading, setUsageLoading] = useState(true);
	const [chartDays, setChartDays] = useState(7);
	const [refreshKey, setRefreshKey] = useState(0);

	// Kick a fresh collection pass when the page opens so resource and
	// activity panels reflect current state immediately. The background
	// scheduler (/api/internal/cron/tick) keeps them updated thereafter; this
	// is best-effort and rate-limited server-side. Bumping refreshKey re-reads
	// usage once the pass settles.
	useEffect(() => {
		let stopped = false;
		fetch("/api/dashboard/metrics/collect", { method: "POST" })
			.catch(() => {})
			.finally(() => {
				if (!stopped) setRefreshKey((k) => k + 1);
			});
		return () => {
			stopped = true;
		};
	}, [machineId]);

	useEffect(() => {
		let stopped = false;
		async function poll() {
			try {
				const res = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
					cache: "no-store",
				});
				if (stopped) return;
				if (res.status === 404) {
					stopped = true;
					window.clearInterval(id);
					return;
				}
				if (!res.ok) return;
				const data = (await res.json()) as MachineRouteResponse;
				const live =
					data.ok && data.live && typeof data.live === "object" ? data.live : null;
				if (!stopped) {
					setStatus({
						state: live?.state ?? live?.rawPhase ?? "unknown",
						rawPhase: live?.rawPhase ?? live?.state ?? "unknown",
						lastError: live?.lastError ?? live?.error ?? null,
					});
				}
			} catch {
				/* ignore */
			} finally {
				if (!stopped) setLoading(false);
			}
		}
		poll();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") poll();
		}, 5000);
		return () => { stopped = true; window.clearInterval(id); };
	}, [machineId]);

	useEffect(() => {
		let stopped = false;
		setUsageLoading(true);
		async function load() {
			try {
				const res = await fetch(
					`/api/dashboard/metrics/machines/${encodeURIComponent(machineId)}/usage?days=${chartDays}`,
					{ cache: "no-store" },
				);
				if (!res.ok || stopped) return;
				const json: unknown = await res.json();
				if (!stopped) {
					setUsageData(
						normalizeMachineUsagePayload(json, chartDays, machineId),
					);
				}
			} catch {
				/* ignore */
			} finally {
				if (!stopped) setUsageLoading(false);
			}
		}
		load();
		return () => { stopped = true; };
	}, [machineId, chartDays, refreshKey]);

	const usageResources = usageData?.resources;
	const cpuBuckets = useMemo(
		() => (usageResources ? cpuChartBuckets(usageResources) : []),
		[usageResources],
	);
	const memBuckets = useMemo(
		() => (usageResources ? memoryChartBuckets(usageResources) : []),
		[usageResources],
	);
	const storageBuckets = useMemo(
		() => (usageResources ? storageChartBuckets(usageResources) : []),
		[usageResources],
	);

	if (!machine) return null;

	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
	const stateName = status?.state ?? "loading";

	return (
		<div className="flex flex-col">
			<PageHeader
				artSlug="machines"
				kicker={`MACHINE -- ${machine.name}`}
				title={machine.name}
				description={`${PROVIDER_LABEL[machine.providerKind]} / ${AGENT_LABEL[machine.agentKind]} / ${machine.model}`}
				right={
					<MachineActions
						machineId={machineId}
						state={stateName as MachineActionState}
						capabilities={null}
						active={isActive}
						archived={machine.archived ?? false}
						allowDestroy
						onChange={async () => { window.location.reload(); }}
					/>
				}
			/>
			<DashboardPageBody>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<StatCard label="Status" icon={<Activity size={12} />}>
						{loading ? (
							<Skeleton className="h-4 w-20" />
						) : (
							<ReticleBadge
								variant={stateName === "running" || stateName === "ready" ? "accent" : "default"}
							>
								{stateName}
							</ReticleBadge>
						)}
					</StatCard>
					<StatCard label="Provider" icon={<Cloud size={12} />}>
						{PROVIDER_LABEL[machine.providerKind]}
					</StatCard>
					<StatCard label="Agent" icon={<Bot size={12} />}>
						{AGENT_LABEL[machine.agentKind]}
					</StatCard>
					<StatCard label="Spec" icon={<Cpu size={12} />}>
						{machine.spec.vcpu}v / {memGib}G RAM / {machine.spec.storageGib}G disk
					</StatCard>
					<StatCard label="Model" icon={<Brain size={12} />}>
						{machine.model}
					</StatCard>
				<StatCard label="Machine ID" icon={<Hash size={12} />} mono>
					{machineId}
				</StatCard>
				</div>

				{/* ── A) SSH Access strip ── */}
				<ReticleFrame>
					<div className="px-4 py-3">
						<p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<SquareTerminal size={12} />
							SSH Access
						</p>
						<div className="mt-2 flex items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-2.5">
							<span className="text-[var(--ret-text-muted)]">&gt;_</span>
							<code className="flex-1 font-mono text-[12px] text-[var(--ret-text)]">
								dedalus machine ssh {machineId}
							</code>
							<CopyButton text={`dedalus machine ssh ${machineId}`} />
						</div>
					</div>
				</ReticleFrame>

				{/* ── B) Resource utilization charts ── */}
				<ReticleFrame>
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<Gauge size={12} />
							Resource utilization
						</h2>
						<TimeRangeSelector
							options={RANGE_OPTIONS_DETAIL}
							selected={chartDays}
							onSelect={setChartDays}
						/>
					</div>
					<div className="divide-y divide-[var(--ret-border)]">
					<UsageChartRow
						title="CPU"
						total={
							usageResources
								? (usageResources.cpu.total / 3600).toFixed(1)
								: "–"
						}
						unit="vCPU-hrs"
						data={cpuBuckets}
						color="var(--ret-purple)"
						loading={usageLoading}
					/>
					<UsageChartRow
						title="Memory"
						total={
							usageResources
								? (usageResources.memory.total / 3600).toFixed(1)
								: "–"
						}
						unit="GB-hrs"
						data={memBuckets}
						color="var(--ret-amber)"
						loading={usageLoading}
					/>
					<UsageChartRow
						title="Storage"
						total={
							usageResources
								? usageResources.storage.total.toFixed(1)
								: "–"
						}
						unit="GB-hrs"
						data={storageBuckets}
						color="var(--ret-red)"
						loading={usageLoading}
					/>
					</div>
				</ReticleFrame>

				{/* ── C) Activity timeline ── */}
				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<Activity size={12} />
							Activity timeline
						</h2>
					</div>
					<div className="px-4 py-3">
						{usageLoading ? (
							<div className="space-y-3">
								{[0, 1, 2].map((i) => (
									<Skeleton key={i} className="h-8 w-full" />
								))}
							</div>
						) : !usageData?.transitions?.length ? (
							<p className="py-4 text-center text-[12px] text-[var(--ret-text-muted)]">
								No recorded transitions.
							</p>
						) : (
							<ol className="relative ml-2 border-l border-[var(--ret-border)]">
								{usageData.transitions.map((t, i) => (
									<li key={`${t.timestamp}-${i}`} className="relative pb-4 pl-6 last:pb-0">
										<span
											className={cn(
												"absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2",
												i === 0
													? "border-[var(--ret-green)] bg-[var(--ret-green)]"
													: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
											)}
										/>
										<p className="text-[12px] text-[var(--ret-text)]">{t.label}</p>
										<p className="mt-0.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
											{new Date(t.timestamp).toLocaleString()}
										</p>
									</li>
								))}
							</ol>
						)}
					</div>
				</ReticleFrame>
			</DashboardPageBody>
		</div>
	);
}

function StatCard({
	label,
	children,
	mono,
	icon,
}: {
	label: string;
	children: React.ReactNode;
	mono?: boolean;
	icon?: React.ReactNode;
}) {
	return (
		<ReticleFrame>
			<div className="px-4 py-3">
				<dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{icon ? <span className="inline-flex text-[var(--ret-text-muted)]">{icon}</span> : null}
					{label}
				</dt>
				<dd className={cn("mt-1 text-[13px] text-[var(--ret-text)]", mono && "font-mono text-[11px]")}>
					{children}
				</dd>
			</div>
		</ReticleFrame>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
			className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
		>
			{copied ? "copied" : "copy"}
		</button>
	);
}

function UsageChartRow({
	title,
	total,
	unit,
	data,
	color,
	loading,
}: {
	title: string;
	total: string;
	unit: string;
	data: Array<{ date: string; value: number }>;
	color: string;
	loading: boolean;
}) {
	return (
		<div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="shrink-0 sm:w-[120px]">
				<h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</h3>
				<p className="mt-1 text-lg font-semibold tabular-nums text-[var(--ret-text)]">
					{total}
					<span className="ml-1 text-[11px] font-normal text-[var(--ret-text-dim)]">
						{unit}
					</span>
				</p>
			</div>
			<div className="min-w-0 flex-1">
				{loading ? (
					<Skeleton className="h-[100px]" />
				) : (
					<DashboardBarChart
						data={data}
						dataKey="value"
						xFormatter={formatDayShort}
						color={color}
						height={100}
					/>
				)}
			</div>
		</div>
	);
}
