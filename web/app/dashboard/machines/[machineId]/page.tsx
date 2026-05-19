"use client";

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

type MachineUsageResponse = {
	ok: true;
	resources: {
		cpu: { totalVcpuSeconds: number; buckets: Array<{ date: string; vcpuSeconds: number }> };
		memory: { totalGibSeconds: number; buckets: Array<{ date: string; gibSeconds: number }> };
		storage: { totalGibHours: number; buckets: Array<{ date: string; gibHours: number }> };
	};
	transitions: Array<{ label: string; timestamp: string }>;
};

export default function MachineOverviewPage() {
	const { machineId, machine, isActive } = useMachineContext();
	const [status, setStatus] = useState<MachineStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [usageData, setUsageData] = useState<MachineUsageResponse | null>(null);
	const [usageLoading, setUsageLoading] = useState(true);
	const [chartDays, setChartDays] = useState(7);

	useEffect(() => {
		let stopped = false;
		async function poll() {
			try {
				const res = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
					cache: "no-store",
				});
				if (!res.ok || stopped) return;
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
				const json = (await res.json()) as MachineUsageResponse;
				if (!stopped) setUsageData(json);
			} catch {
				/* ignore */
			} finally {
				if (!stopped) setUsageLoading(false);
			}
		}
		load();
		return () => { stopped = true; };
	}, [machineId, chartDays]);

	const cpuBuckets = useMemo(
		() => usageData?.resources?.cpu?.buckets?.map((b) => ({ date: b.date, value: b.vcpuSeconds / 3600 })) ?? [],
		[usageData],
	);
	const memBuckets = useMemo(
		() => usageData?.resources?.memory?.buckets?.map((b) => ({ date: b.date, value: b.gibSeconds / 3600 })) ?? [],
		[usageData],
	);
	const storageBuckets = useMemo(
		() => usageData?.resources?.storage?.buckets?.map((b) => ({ date: b.date, value: b.gibHours })) ?? [],
		[usageData],
	);

	if (!machine) return null;

	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
	const stateName = status?.state ?? "loading";

	return (
		<div className="flex flex-col">
			<PageHeader
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
					<StatCard label="Status">
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
					<StatCard label="Provider">
						{PROVIDER_LABEL[machine.providerKind]}
					</StatCard>
					<StatCard label="Agent">
						{AGENT_LABEL[machine.agentKind]}
					</StatCard>
					<StatCard label="Spec">
						{machine.spec.vcpu}v / {memGib}G RAM / {machine.spec.storageGib}G disk
					</StatCard>
					<StatCard label="Model">
						{machine.model}
					</StatCard>
				<StatCard label="Machine ID" mono>
					{machineId}
				</StatCard>
				</div>

				{/* ── A) SSH Access strip ── */}
				<ReticleFrame>
					<div className="px-4 py-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							&gt;_ SSH Access
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
						<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
							total={usageData ? (usageData.resources.cpu.totalVcpuSeconds / 3600).toFixed(1) : "–"}
							unit="vCPU-hrs"
							data={cpuBuckets}
							color="var(--ret-purple)"
							loading={usageLoading}
						/>
						<UsageChartRow
							title="Memory"
							total={usageData ? (usageData.resources.memory.totalGibSeconds / 3600).toFixed(1) : "–"}
							unit="GB-hrs"
							data={memBuckets}
							color="var(--ret-amber)"
							loading={usageLoading}
						/>
						<UsageChartRow
							title="Storage"
							total={usageData ? usageData.resources.storage.totalGibHours.toFixed(1) : "–"}
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
						<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
						) : !usageData?.transitions.length ? (
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
}: {
	label: string;
	children: React.ReactNode;
	mono?: boolean;
}) {
	return (
		<ReticleFrame>
			<div className="px-4 py-3">
				<dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
