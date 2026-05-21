"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ActivityOverviewPanel } from "@/components/dashboard/ActivityOverviewPanel";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { FleetMetrics } from "@/components/dashboard/FleetMetrics";
import { FleetMonitor } from "@/components/dashboard/FleetMonitor";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { MetricsChartPanel } from "@/components/dashboard/MetricsChartPanel";
import { ObservabilityPanel } from "@/components/dashboard/ObservabilityPanel";
import { ReloadKnowledge } from "@/components/dashboard/ReloadKnowledge";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ToolIcon } from "@/components/ToolIcon";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { useMachineControl } from "@/lib/dashboard/use-machine-control";
import type { GatewaySummary } from "@/lib/dashboard/types";
import type { AgentKind } from "@/lib/user-config/schema";

const GATEWAY_POLL_MS = 5000;

type CountInfo = { skills: number; mcps: number; tools: number; crons: number };

type Props = {
	counts: CountInfo;
	agentKind: AgentKind;
	model: string | null;
	activeMachineId: string | null;
};

export function OverviewClient({
	counts,
	agentKind,
	model,
	activeMachineId,
}: Props) {
	const machine = useMachineControl(activeMachineId);
	const [gateway, setGateway] = useState<GatewaySummary | null>(null);
	const [fleetRunning, setFleetRunning] = useState<number | null>(null);
	const [probeStamp, setProbeStamp] = useState<number | null>(null);

	useEffect(() => {
		if (machine.notProvisioned) return;

		let stopped = false;
		let interval: number;

		async function tick() {
			const [gwRes, summaryRes] = await Promise.all([
				fetch("/api/dashboard/gateway", { cache: "no-store" }).catch(() => null),
				fetch("/api/dashboard/metrics/summary", { cache: "no-store" }).catch(
					() => null,
				),
			]);
			if (stopped) return;

			if (gwRes?.status === 404) {
				window.clearInterval(interval);
				stopped = true;
				return;
			}

			setGateway(gwRes?.ok ? ((await gwRes.json()) as GatewaySummary) : null);
			setProbeStamp(Date.now());
			if (summaryRes?.ok) {
				const body = (await summaryRes.json()) as { running?: number };
				setFleetRunning(body.running ?? null);
			}
		}

		void tick();
		interval = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, GATEWAY_POLL_MS);

		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, [machine.notProvisioned]);

	const phase = machine.machine?.phase ?? "loading";
	const desired = machine.machine?.desired ?? "unknown";
	const memoryGib = machine.machine?.memoryMib
		? (machine.machine.memoryMib / 1024).toFixed(1)
		: "--";

	const ageLabel = useMemo(() => {
		if (!probeStamp) return null;
		const seconds = Math.max(0, Math.round((Date.now() - probeStamp) / 1000));
		return `${seconds}s ago`;
	}, [probeStamp]);

	const latencyTone =
		gateway?.ok && gateway.latencyMs < 1500
			? "ok"
			: gateway?.ok
				? "warn"
				: "error";

	if (machine.notProvisioned) {
		return (
			<DashboardPageBody>
				<FleetMonitor />
				<ReticleFrame className="p-6">
					<div className="flex flex-col items-center gap-4 py-8 text-center">
						<Logo mark="am" size={28} />
						<h2 className="ret-display text-lg">No active machine</h2>
						<p className="max-w-[48ch] text-[13px] text-[var(--ret-text-dim)]">
							Provision a machine to start building activity on the heatmap.
						</p>
						<ReticleButton as="a" href="/dashboard/setup" variant="primary" size="sm">
							Open setup wizard
						</ReticleButton>
					</div>
				</ReticleFrame>
			</DashboardPageBody>
		);
	}

	return (
		<DashboardPageBody>
			<FleetMonitor />

			<section className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-4 xl:grid-cols-6">
				<MetricCard
					label="fleet"
					icon={<Logo mark="am" size={11} />}
					value={fleetRunning != null ? String(fleetRunning) : "—"}
					hint="machines running"
					tone="ok"
				/>
				<MetricCard
					label="active"
					icon={<Logo mark="am" size={11} />}
					value={<StatusPill phase={phase} className="px-2 py-0.5 text-[11px]" />}
					hint={
						machine.machine
							? `${machine.machine.machineId.slice(0, 14)}…`
							: "loading"
					}
				/>
				<MetricCard
					label="gateway"
					icon={<ToolIcon name="browser" size={11} className="text-[var(--ret-text-muted)]" />}
					value={
						gateway ? (
							gateway.ok ? (
								"online"
							) : (
								"down"
							)
						) : (
							<BrailleSpinner name="orbit" className="text-[11px]" />
						)
					}
					hint={gateway?.ok ? `${gateway.latencyMs} ms` : "probing"}
					tone={gateway ? (gateway.ok ? "ok" : "error") : "default"}
				/>
				<MetricCard
					label="latency"
					icon={<ToolIcon name="schedule" size={11} className="text-[var(--ret-text-muted)]" />}
					value={
						gateway ? (
							`${gateway.latencyMs} ms`
						) : (
							<BrailleSpinner name="orbit" className="text-[11px]" />
						)
					}
					hint={gateway ? `model: ${gateway.model}` : "probing"}
					tone={latencyTone}
				/>
				<MetricCard
					label="spec"
					icon={<ToolIcon name="memory" size={11} className="text-[var(--ret-text-muted)]" />}
					value={
						machine.machine?.vcpu != null ? `${machine.machine.vcpu}v · ${memoryGib}G` : "—"
					}
					hint={
						machine.machine?.storageGib != null
							? `${machine.machine.storageGib} GiB disk`
							: "…"
					}
				/>
				<MetricCard
					label="skills"
					icon={<ToolIcon name="skill" size={11} className="text-[var(--ret-text-muted)]" />}
					value={String(counts.skills)}
					hint={`${counts.mcps} MCP · ${counts.tools} tools · ${counts.crons} crons`}
					tone="purple"
				/>
			</section>

			<ActivityOverviewPanel />

			<section className="grid gap-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ret-border)] pb-2">
					<div>
						<ReticleLabel>Telemetry</ReticleLabel>
						<p className="mt-1 text-[12px] text-[var(--ret-text-dim)]">
							Fleet ops, gateway latency, log rates, and live activity on the active machine.
						</p>
					</div>
				</div>

				<FleetMetrics activeMachineId={activeMachineId} />

				<ObservabilityPanel
					agentKind={agentKind}
					modelOverride={model}
					machineSummary={machine.machine}
					activeMachineId={activeMachineId}
				/>

				<MetricsChartPanel activeMachineId={activeMachineId} />

				<ReloadKnowledge machinePhase={phase} />

				<section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
					<ReticleFrame className="p-4">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Quick actions
						</p>
						<h2 className="ret-display mt-1.5 text-base">
							Talk to it. Read it. Inspect it.
						</h2>
						<p className="mt-1.5 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
							Chat is gated. Skills and MCPs are read-only views of the same files the
							agent reads on the VM.
						</p>
						<div className="mt-3 flex flex-wrap gap-2">
							<ReticleButton as="a" href="/dashboard/chat" variant="primary" size="sm">
								Open chat
							</ReticleButton>
							<ReticleButton as="a" href="/dashboard/skills" variant="secondary" size="sm">
								Browse skills
							</ReticleButton>
							<ReticleButton as="a" href="/dashboard/mcps" variant="secondary" size="sm">
								View MCPs
							</ReticleButton>
						</div>
					</ReticleFrame>

					<ReticleFrame>
						<ReticleHatch className="h-2 border-b border-[var(--ret-border)]" pitch={6} />
						<div className="p-4">
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								Health probe
							</p>
							<h2 className="ret-display mt-1.5 text-base">Polling every 5s</h2>
							<dl className="mt-3 space-y-1.5 font-mono text-[11px] text-[var(--ret-text-dim)]">
								<ProbeRow label="phase" value={phase} />
								<ProbeRow label="desired" value={desired} />
								<ProbeRow label="reason" value={machine.machine?.reason ?? "—"} />
								<ProbeRow label="last probe" value={ageLabel ?? "…"} />
								<ProbeRow
									label="status"
									value={
										gateway
											? `HTTP ${gateway.status} · ${gateway.latencyMs} ms`
											: "…"
									}
								/>
							</dl>
							<p className="mt-3 text-[11px] italic text-[var(--ret-text-muted)]">
								Live:{" "}
								<Link href="/dashboard/logs" className="underline">
									logs
								</Link>
								{" · "}
								<Link href="/dashboard/sessions" className="underline">
									sessions
								</Link>
								{" · "}
								<Link href="/dashboard/cursor" className="underline">
									cursor
								</Link>
							</p>
						</div>
					</ReticleFrame>
				</section>
			</section>

			<div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--ret-border)] px-4 py-2.5">
				<p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					Quick links
				</p>
				<div className="flex flex-wrap gap-2">
					<ReticleButton as="a" href="/dashboard/machines" variant="secondary" size="sm">
						Machines
					</ReticleButton>
					<ReticleButton as="a" href="/dashboard/chat" variant="secondary" size="sm">
						Chat
					</ReticleButton>
					<ReticleButton as="a" href="/dashboard/cron" variant="secondary" size="sm">
						Cron
					</ReticleButton>
					<ReticleButton as="a" href="/dashboard/usage" variant="ghost" size="sm">
						Usage
					</ReticleButton>
				</div>
			</div>
		</DashboardPageBody>
	);
}

function ProbeRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-[var(--ret-text-muted)]">{label}</dt>
			<dd className="truncate text-[var(--ret-text)]">{value}</dd>
		</div>
	);
}
