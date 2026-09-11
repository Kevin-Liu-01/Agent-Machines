"use client";

import {
	Activity,
	Bot,
	Brain,
	Cloud,
	Cpu,
	FileOutput,
	Gauge,
	Hash,
	History,
	MessagesSquare,
	PackageOpen,
	ScrollText,
	SquareTerminal,
} from "@/components/ui/icons";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { MigrationPhaseBadge } from "@/components/dashboard/MigrationPhaseBadge";
import { SubstrateMoveMenu } from "@/components/dashboard/SubstrateMoveMenu";
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
	fmtUsageHours,
	fmtUsageAmount,
	memoryChartBuckets,
	normalizeMachineUsagePayload,
	storageChartBuckets,
	usageResourceNote,
	type NormalizedMachineUsage,
} from "@/lib/dashboard/usage-metrics";
import { cn } from "@/lib/cn";
import { compactSpec, reportedMachineSpec } from "@/lib/fleet/view-model";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
	PROVIDER_LABEL,
	type BootstrapState,
	type MigrationState,
	type MachineSpec,
} from "@/lib/user-config/schema";

type MachineStatus = {
	machineId: string;
	capabilities: ProviderCapabilities | null;
	spec: Partial<MachineSpec> | null;
	state: string;
	rawPhase: string;
	lastError: string | null;
};

type MachineRouteResponse =
	| {
			ok: true;
			machine?: {
				capabilities?: ProviderCapabilities | null;
				bootstrapState?: BootstrapState;
				migrationState?: MigrationState | null;
			} | null;
			live?: {
				spec?: Partial<MachineSpec>;
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
	const [migration, setMigration] = useState<MigrationState | null>(
		machine?.migrationState ?? null,
	);
	const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapState["phase"] | null>(
		machine?.bootstrapState.phase ?? null,
	);
	const [loading, setLoading] = useState(true);
	const [usageData, setUsageData] = useState<NormalizedMachineUsage | null>(null);
	const [usageLoading, setUsageLoading] = useState(true);
	const [usageError, setUsageError] = useState(false);
	const [statusError, setStatusError] = useState<string | null>(null);
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
		setStatus(null);
		setLoading(true);
		setStatusError(null);
		async function poll() {
			try {
				const res = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
					cache: "no-store",
				});
				if (stopped) return;
				if (res.status === 404) {
					setStatus(null);
					setStatusError("This machine is no longer available. Return to your fleet to choose another.");
					setLoading(false);
					stopped = true;
					window.clearInterval(id);
					return;
				}
				if (!res.ok) { setStatus(null); setStatusError("Live status is unavailable. Retrying automatically; saved configuration is shown below."); return; }
				const data = (await res.json()) as MachineRouteResponse;
				const live =
					data.ok && data.live && typeof data.live === "object" ? data.live : null;
				if (!stopped) {
					setStatusError(!data.ok || live?.error ? "Live status is unavailable. Retrying automatically; saved configuration is shown below." : null);
					setStatus({
						machineId,
						capabilities: data.ok ? data.machine?.capabilities ?? null : null,
						spec: reportedMachineSpec(live) ?? null,
						state: live?.state ?? live?.rawPhase ?? "unknown",
						rawPhase: live?.rawPhase ?? live?.state ?? "unknown",
						lastError: live?.lastError ?? live?.error ?? null,
					});
					if (data.ok && data.machine) {
						setMigration(data.machine.migrationState ?? null);
						setBootstrapPhase(data.machine.bootstrapState?.phase ?? null);
					}
				}
			} catch {
				if (!stopped) { setStatus(null); setStatusError("Live status is unavailable. Retrying automatically; saved configuration is shown below."); }
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
		setUsageData(null);
		setUsageError(false);
		async function load() {
			try {
				const res = await fetch(
					`/api/dashboard/metrics/machines/${encodeURIComponent(machineId)}/usage?days=${chartDays}`,
					{ cache: "no-store" },
				);
				if (stopped) return;
				if (!res.ok) { setUsageError(true); return; }
				const json: unknown = await res.json();
				if (!stopped) {
					const normalized = normalizeMachineUsagePayload(json, chartDays, machineId);
					setUsageData(normalized);
					setUsageError(!normalized);
				}
			} catch {
				if (!stopped) setUsageError(true);
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

	if (!machine) return <EmptyState title="Machine not available" description="Choose an existing machine from your fleet to continue." action={{ label: "Open your fleet", href: "/dashboard/machines" }} />;

	const allocation = status?.machineId === machineId ? status.spec : null;
	const stateName = status?.machineId === machineId ? status.state : loading ? "loading" : "unknown";

	return (
		<div className="flex flex-col">
			<PageHeader
				artSlug="machines"
				kicker="Workspace"
				title={machine.name}
				description={`${PROVIDER_LABEL[machine.providerKind]} / ${AGENT_LABEL[machine.agentKind]} / ${machine.model}`}
				right={
					<div className="flex flex-wrap items-center justify-end gap-1">
						{/* The two router verbs live beside MachineActions, not inside
						    it, so its routing-table doc comment stays true. */}
						<SubstrateMoveMenu
							machineId={machineId}
							migrationState={migration}
							bootstrapRunning={bootstrapPhase === "running"}
							onScheduled={() => {
								/* the 5s poll picks up migrationState on the next tick */
							}}
						/>
						<MachineActions
							machineId={machineId}
							providerKind={machine.providerKind}
							state={stateName as MachineActionState}
							capabilities={status?.machineId === machineId ? status.capabilities : null}
							active={isActive}
							archived={machine.archived ?? false}
							allowDestroy
							onChange={async () => { window.location.reload(); }}
						/>
					</div>
				}
			/>
			<DashboardPageBody>
				{statusError ? <p role="status" className="text-sm leading-6 text-[var(--ret-amber)]">{statusError} <Link className="underline underline-offset-4" href="/dashboard/machines">Open fleet</Link></p> : null}
				{migration && migration.phase !== "idle" ? (
					<div className="flex flex-wrap items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-2.5">
						<MigrationPhaseBadge state={migration} />
						{migration.phase === "succeeded" && migration.report ? (
							<>
								<span className="font-mono text-sm text-[var(--ret-text-dim)]">
									moved to {PROVIDER_LABEL[migration.report.to.providerKind]} --{" "}
									{migration.report.state.moved.length} paths,{" "}
									{(migration.report.state.bytes / 1024).toFixed(0)} KB; old sandbox{" "}
									{migration.report.source.action}
									{migration.report.source.error ? ` (${migration.report.source.error})` : ""}
								</span>
								{/* A button, not a redirect -- the user may be mid-read. */}
								<a
									href={`/dashboard/machines/${encodeURIComponent(migration.report.newMachineId)}`}
									className="border border-[var(--ret-purple)]/40 px-1.5 py-0.5 text-sm font-medium text-[var(--ret-purple)] hover:bg-[var(--ret-purple)]/10"
								>
									open new machine
								</a>
							</>
						) : null}
						{migration.phase === "failed" && migration.lastError ? (
							<span
								className="min-w-0 truncate font-mono text-sm text-[var(--ret-red)]"
								title={migration.lastError}
							>
								{migration.lastError}
							</span>
						) : null}
					</div>
				) : null}
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<StatCard label="Status" icon={<Activity size={16} />}>
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
					<StatCard label="Provider" icon={<Cloud size={16} />}>
						{PROVIDER_LABEL[machine.providerKind]}
					</StatCard>
					<StatCard label="Agent" icon={<Bot size={16} />}>
						{AGENT_LABEL[machine.agentKind]}
					</StatCard>
					<StatCard label="Actual allocation" icon={<Cpu size={16} />}>
						{compactSpec(allocation)}
					</StatCard>
					<StatCard label="Model" icon={<Brain size={16} />}>
						{machine.model}
					</StatCard>
				<StatCard label="Machine ID" icon={<Hash size={16} />} mono>
					{machineId}
				</StatCard>
				</div>

				<MachineSurfaceDeck machineId={machineId} />

				<ReticleFrame corners={false}>
					<div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="flex items-center gap-1.5 text-sm font-medium text-[var(--ret-text-muted)]">
								<SquareTerminal size={16} />
								Ready for a task?
							</p>
							<p className="mt-1 text-sm text-[var(--ret-text-dim)]">
								Open the terminal to work with {AGENT_LABEL[machine.agentKind]} on {PROVIDER_LABEL[machine.providerKind]}.
							</p>
						</div>
						<Link href={`/dashboard/machines/${encodeURIComponent(machineId)}/terminal`} className="inline-flex shrink-0 items-center gap-1 border border-[var(--ret-purple)]/40 px-2.5 py-1.5 text-xs uppercase tracking-[0.16em] text-[var(--ret-purple)] hover:bg-[var(--ret-purple)]/10">
							Open terminal <SquareTerminal size={16} />
						</Link>
					</div>
				</ReticleFrame>

				{/* ── B) Resource utilization charts ── */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="flex items-center gap-2 text-lg font-semibold"><Gauge size={20} aria-hidden="true" />Sampled allocation</h2>
					<TimeRangeSelector options={RANGE_OPTIONS_DETAIL} selected={chartDays} onSelect={setChartDays} />
				</div>
				{usageLoading ? <p role="status" className="text-sm text-[var(--ret-text-muted)]">Loading allocation and activity…</p> : null}
				{usageError ? <ReticleFrame className="p-6"><h2 className="text-lg font-semibold">Usage data is unavailable</h2><p role="alert" className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">We couldn’t load allocation or activity. This does not mean usage is zero.</p><ReticleButton className="mt-4" variant="secondary" size="sm" onClick={() => setRefreshKey(value => value + 1)}>Retry usage</ReticleButton></ReticleFrame> : <>
				<ReticleFrame>
					<div className="divide-y divide-[var(--ret-border)]">
					<UsageChartRow
						title="CPU"
						total={
							usageResources
								? fmtUsageHours(usageResources.cpu.total)
								: "–"
						}
						unit="vCPU-hrs"
						note={usageResourceNote(usageResources?.cpu)}
						data={cpuBuckets}
						color="var(--ret-purple)"
						loading={usageLoading}
					/>
					<UsageChartRow
						title="Memory"
						total={
							usageResources
								? fmtUsageHours(usageResources.memory.total)
								: "–"
						}
						unit="GiB-hrs"
						note={usageResourceNote(usageResources?.memory)}
						data={memBuckets}
						color="var(--ret-amber)"
						loading={usageLoading}
					/>
					<UsageChartRow
						title="Storage"
						total={
							usageResources
								? fmtUsageAmount(usageResources.storage.total)
								: "–"
						}
						unit="GiB-hrs"
						note={usageResourceNote(usageResources?.storage)}
						data={storageBuckets}
						color="var(--ret-red)"
						loading={usageLoading}
					/>
					</div>
				</ReticleFrame>

				{/* ── C) Activity timeline ── */}
				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="flex items-center gap-1.5 text-sm font-medium text-[var(--ret-text-muted)]">
							<Activity size={16} />
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
							<p className="py-4 text-center text-sm text-[var(--ret-text-muted)]">
								No status changes recorded for this period. Choose a wider date range or inspect the machine’s <Link className="underline underline-offset-4" href={`/dashboard/machines/${encodeURIComponent(machineId)}/logs`}>logs</Link>.
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
										<p className="text-sm text-[var(--ret-text)]">{t.label}</p>
										<p className="mt-0.5 text-xs text-[var(--ret-text-muted)]">
											{new Date(t.timestamp).toLocaleString()}
										</p>
									</li>
								))}
							</ol>
						)}
					</div>
				</ReticleFrame>
				</>}
			</DashboardPageBody>
		</div>
	);
}

const MACHINE_SURFACES = [
	{ slug: "console", label: "Console", detail: "Talk to the runtime", icon: MessagesSquare },
	{ slug: "terminal", label: "Terminal", detail: "Live PTY and commands", icon: SquareTerminal },
	{ slug: "logs", label: "Logs", detail: "Runtime and control events", icon: ScrollText },
	{ slug: "sessions", label: "Sessions", detail: "Persistent conversations", icon: History },
	{ slug: "artifacts", label: "Artifacts", detail: "Files and outputs", icon: FileOutput },
	{ slug: "loadout", label: "Loadout", detail: "Skills, MCPs, and tools", icon: PackageOpen },
] as const;

function MachineSurfaceDeck({ machineId }: { machineId: string }) {
	return (
		<section aria-labelledby="machine-surfaces-title">
			<div className="mb-2 flex items-baseline justify-between gap-3">
				<h2 id="machine-surfaces-title" className="text-sm font-medium text-[var(--ret-text-muted)]">Operate this machine</h2>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{MACHINE_SURFACES.map((surface) => {
					const Icon = surface.icon;
					return (
						<Link key={surface.slug} href={`/dashboard/machines/${encodeURIComponent(machineId)}/${surface.slug}`} className="group flex min-w-0 items-center gap-4 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 transition-colors hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)]">
							<span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-purple)]"><Icon size={20} aria-hidden="true" /></span>
							<span className="min-w-0">
								<span className="block text-sm text-[var(--ret-text)]">{surface.label}</span>
								<span className="block text-sm text-[var(--ret-text-muted)]">{surface.detail}</span>
							</span>
						</Link>
					);
				})}
			</div>
		</section>
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
				<dt className="flex items-center gap-1.5 text-sm font-medium text-[var(--ret-text-muted)]">
					{icon ? <span className="inline-flex text-[var(--ret-text-muted)]">{icon}</span> : null}
					{label}
				</dt>
				<dd className={cn("mt-1 text-base text-[var(--ret-text)]", mono && "font-mono text-sm")}>
					{children}
				</dd>
			</div>
		</ReticleFrame>
	);
}

function UsageChartRow({
	title,
	total,
	unit,
	note,
	data,
	color,
	loading,
}: {
	title: string;
	total: string;
	unit: string;
	note: string;
	data: Array<{ date: string; value: number }>;
	color: string;
	loading: boolean;
}) {
	return (
		<div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="shrink-0 sm:w-[120px]">
				<h3 className="text-sm font-medium text-[var(--ret-text-muted)]">
					{title}
				</h3>
				<p className="mt-1 text-lg font-semibold tabular-nums text-[var(--ret-text)]">
					{total}
					<span className="ml-1 text-sm font-normal text-[var(--ret-text-dim)]">
						{unit}
					</span>
				</p>
				{!loading && <p className="mt-1 text-xs text-[var(--ret-text-muted)]">{note}</p>}
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
