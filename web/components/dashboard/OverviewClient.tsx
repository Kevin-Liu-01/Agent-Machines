"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ToolIcon } from "@/components/ToolIcon";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { WingBackground } from "@/components/WingBackground";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { useMachineControl } from "@/lib/dashboard/use-machine-control";
import type { GatewaySummary } from "@/lib/dashboard/types";

import { BootTranscript } from "./BootTranscript";
import { FleetMetrics } from "./FleetMetrics";
import { FleetMonitor } from "./FleetMonitor";
import { MetricCard } from "./MetricCard";
import { MetricsChartPanel } from "./MetricsChartPanel";
import { ObservabilityPanel } from "./ObservabilityPanel";
import { ReloadKnowledge } from "./ReloadKnowledge";
import { StatusPill } from "./StatusPill";

const GATEWAY_POLL_MS = 5000;

type CountInfo = { skills: number; mcps: number; tools: number; crons: number };

type Props = {
	counts: CountInfo;
	agentKind: import("@/lib/user-config/schema").AgentKind;
	/** Model slug from the active machine record. Falls back to the
	 *  gateway probe's reported model when null. */
	model: string | null;
};

/**
 * Client-side overview body. Owns machine state via `useMachineControl`
 * (auto-wakes a sleeping machine on first load, exposes wake / sleep
 * actions) and polls the gateway probe alongside it.
 */
export function OverviewClient({ counts, agentKind, model }: Props) {
	const machine = useMachineControl();
	const [gateway, setGateway] = useState<GatewaySummary | null>(null);
	const [stamp, setStamp] = useState<number | null>(null);

	useEffect(() => {
		let stopped = false;
		async function tick() {
			const g = await fetch("/api/dashboard/gateway", { cache: "no-store" })
				.then((r) => (r.ok ? (r.json() as Promise<GatewaySummary>) : null))
				.catch(() => null);
			if (stopped) return;
			setGateway(g);
			setStamp(Date.now());
		}
		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, GATEWAY_POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, []);

	const phase = machine.machine?.phase ?? "loading";
	const desired = machine.machine?.desired ?? "unknown";
	const ageLabel = useMemo(() => {
		if (!stamp) return null;
		const seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
		return `${seconds}s ago`;
	}, [stamp]);

	const memoryGib = machine.machine
		? (machine.machine.memoryMib / 1024).toFixed(1)
		: "--";
	const latencyTone =
		gateway?.ok && gateway.latencyMs < 1500
			? "ok"
			: gateway?.ok
				? "warn"
				: "error";

	const inTransition =
		machine.pending !== null ||
		phase === "wake_pending" ||
		phase === "starting" ||
		phase === "sleep_pending" ||
		phase === "placement_pending" ||
		phase === "accepted" ||
		phase === "failed";

	return (
		<DashboardPageBody>
			{/*
			  Fleet-level monitor at the top: shows EVERY machine on
			  the account with live state, lets the operator spin up
			  a new one without leaving the page, and switches the
			  active machine inline. Everything below this strip is
			  the deep dive on the currently-active machine.
			*/}
			<FleetMonitor />

			{/*
			  Operations-style fleet metrics: counters, phase
			  distribution, workspace heatmap, latency histogram +
			  percentiles, transitions log. Modeled on the platform-
			  admin dashboards at Vercel / Datadog -- gives the
			  operator a "everything at a glance" view of fleet
			  health before drilling into any single machine.
			*/}
			<FleetMetrics />

			<section className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[1fr_1fr_1fr]">
				<DashboardBento
					kicker="agent"
					title="Hermes / OpenClaw"
					body="Runtime profile, gateway command, log path, tools, and storage are selected from account settings."
					variant="nyx-lines"
				/>
				<DashboardBento
					kicker="gateway"
					title="Machine agent, not model proxy"
					body="Chat requires the bootstrapped machine gateway, so the UI cannot accidentally talk to upstream Claude directly."
					variant="nyx-waves"
				/>
				<DashboardBento
					kicker="storage"
					title="/home/machine is source of truth"
					body="Chats, settings, artifacts, Hermes state, OpenClaw state, and repo reload are all visible from the terminal."
					variant="cloud"
				/>
			</section>

			<MachineControlBar
				phase={phase}
				pending={machine.pending}
				autoWokeOnce={machine.autoWokeOnce}
				error={machine.error}
				onWake={() => void machine.wake()}
				onSleep={() => void machine.sleep()}
			/>

			{/*
			  When the machine is mid-transition (waking, sleeping,
			  failed, etc.), show the live boot transcript so the
			  operator sees the controlplane events + on-VM logs in
			  real time instead of staring at "in transition" for 30
			  seconds. Hides itself once the machine settles into
			  `running`.
			*/}
			{inTransition && machine.machine ? (
				<BootTranscript
					active={inTransition}
					machineId={machine.machine.machineId}
					maxHeight={240}
				/>
			) : null}

			<section className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-3 xl:grid-cols-6">
				<MetricCard
					label="machine"
					icon={<Logo mark="dedalus" size={11} />}
					value={<StatusPill phase={phase} className="text-[11px] px-2 py-0.5" />}
					hint={
						machine.machine
							? `desired: ${desired} . id: ${machine.machine.machineId.slice(0, 14)}...`
							: "fetching dedalus state..."
					}
				/>
				<MetricCard
					label="gateway"
					icon={
						<ToolIcon
							name="browser"
							size={11}
							className="text-[var(--ret-text-muted)]"
						/>
					}
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
					hint={
						gateway
							? gateway.ok
								? `${gateway.modelCount ?? "?"} models . ${gateway.apiHost.slice(0, 28)}`
								: gateway.error ?? `HTTP ${gateway.status}`
							: "probing"
					}
					tone={gateway ? (gateway.ok ? "ok" : "error") : "default"}
				/>
				<MetricCard
					label="latency"
					icon={
						<ToolIcon
							name="schedule"
							size={11}
							className="text-[var(--ret-text-muted)]"
						/>
					}
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
					icon={
						<ToolIcon
							name="memory"
							size={11}
							className="text-[var(--ret-text-muted)]"
						/>
					}
					value={
						machine.machine
							? `${machine.machine.vcpu}v . ${memoryGib}G`
							: "--"
					}
					hint={
						machine.machine ? `${machine.machine.storageGib} GiB storage` : "..."
					}
				/>
				<MetricCard
					label="skills"
					icon={
						<ToolIcon
							name="skill"
							size={11}
							className="text-[var(--ret-text-muted)]"
						/>
					}
					value={String(counts.skills)}
					hint={`bundled in ~/.hermes/skills`}
					tone="purple"
				/>
				<MetricCard
					label="mcps + tools"
					icon={
						<ToolIcon
							name="delegate"
							size={11}
							className="text-[var(--ret-text-muted)]"
						/>
					}
					value={`${counts.mcps} . ${counts.tools}`}
					hint={`crons: ${counts.crons} scheduled`}
					tone="purple"
				/>
			</section>

			<ObservabilityPanel
				agentKind={agentKind}
				modelOverride={model}
				machineSummary={machine.machine}
			/>

			<MetricsChartPanel />

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
						Chat is gated. Skills and MCPs are read-only views of the
						same files the agent reads on the VM.
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
						{/* Probe rows are key/value telemetry: mono is correct
						    for tabular alignment of the value column. */}
						<dl className="mt-3 space-y-1.5 font-mono text-[11px] text-[var(--ret-text-dim)]">
							<Row label="phase" value={phase} />
							<Row label="desired" value={desired} />
							<Row label="reason" value={machine.machine?.reason ?? "--"} />
							<Row label="last probe" value={ageLabel ?? "..."} />
							<Row
								label="status"
								value={
									gateway
										? `HTTP ${gateway.status} . ${gateway.latencyMs} ms`
										: "..."
								}
							/>
						</dl>
						<p className="mt-3 text-[11px] italic text-[var(--ret-text-muted)]">
							Live:{" "}
							<Link href="/dashboard/logs" className="underline">
								logs
							</Link>
							{" . "}
							<Link href="/dashboard/sessions" className="underline">
								sessions
							</Link>
							{" . "}
							<Link href="/dashboard/cursor" className="underline">
								cursor
							</Link>
						</p>
					</div>
				</ReticleFrame>
			</section>
		</DashboardPageBody>
	);
}

type ControlBarProps = {
	phase: string;
	pending: "wake" | "sleep" | null;
	autoWokeOnce: boolean;
	error: string | null;
	onWake: () => void;
	onSleep: () => void;
};

/**
 * Machine control strip directly under the page header. The dashboard
 * auto-wakes a sleeping machine on first load; this strip surfaces the
 * transition so the user sees it happening, plus a manual Sleep button
 * for cost control.
 */
function MachineControlBar({
	phase,
	pending,
	autoWokeOnce,
	error,
	onWake,
	onSleep,
}: ControlBarProps) {
	const isRunning = phase === "running";
	const isSleeping = phase === "sleeping";
	const isTransitioning =
		pending !== null ||
		phase === "wake_pending" ||
		phase === "starting" ||
		phase === "sleep_pending" ||
		phase === "placement_pending" ||
		phase === "accepted";

	let message: string;
	if (error) {
		message = `error: ${error}`;
	} else if (pending === "wake" || phase === "wake_pending" || phase === "starting") {
		message = autoWokeOnce
			? "auto-waking your container..."
			: "waking your container...";
	} else if (pending === "sleep" || phase === "sleep_pending") {
		message = "putting the container back to sleep...";
	} else if (isRunning) {
		message = "container is running. you can chat, schedule crons, delegate code work.";
	} else if (isSleeping) {
		message = "container is asleep. tap wake to bring it back.";
	} else if (phase === "loading") {
		message = "checking container status...";
	} else {
		message = `phase: ${phase}`;
	}

	return (
		<section className="flex flex-wrap items-center justify-between gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-4 py-3">
			<div className="flex items-center gap-2 min-w-0">
				<StatusPill phase={phase as never} className="text-[11px]" />
				{isTransitioning ? (
					<ReticleBadge variant="warning">in transition</ReticleBadge>
				) : null}
				<p className="font-mono text-[11px] text-[var(--ret-text-dim)] truncate">
					{message}
				</p>
			</div>
			<div className="flex items-center gap-2">
				{isSleeping ? (
					<ReticleButton
						variant="primary"
						size="sm"
						onClick={onWake}
						disabled={pending === "wake"}
					>
						{pending === "wake" ? "Waking..." : "Wake container"}
					</ReticleButton>
				) : null}
				{isRunning ? (
					<ReticleButton
						variant="ghost"
						size="sm"
						onClick={onSleep}
						disabled={pending === "sleep"}
					>
						{pending === "sleep" ? "Sleeping..." : "Sleep container"}
					</ReticleButton>
				) : null}
			</div>
		</section>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-[var(--ret-text-muted)]">{label}</dt>
			<dd className="truncate text-[var(--ret-text)]">{value}</dd>
		</div>
	);
}

function DashboardBento({
	kicker,
	title,
	body,
	variant,
}: {
	kicker: string;
	title: string;
	body: string;
	variant: "cloud" | "nyx-lines" | "nyx-waves";
}) {
	return (
		<div className="relative min-h-[190px] overflow-hidden bg-[var(--ret-bg)] p-4">
			<WingBackground
				variant={variant}
				opacity={{ light: 0.26, dark: 0.42 }}
				fadeEdges
			/>
			<div className="ret-material-field absolute inset-0 opacity-45" aria-hidden="true" />
			<div className="relative z-10 grid gap-4 sm:grid-cols-[0.9fr_1.1fr] lg:grid-cols-1 xl:grid-cols-[0.9fr_1.1fr]">
				<div>
					<ReticleLabel>{kicker}</ReticleLabel>
					<h3 className="ret-display mt-3 max-w-[14ch] text-xl">{title}</h3>
					<p className="mt-3 max-w-[42ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
						{body}
					</p>
				</div>
				<DashboardMiniDiagram kicker={kicker} />
			</div>
		</div>
	);
}

function DashboardMiniDiagram({ kicker }: { kicker: string }) {
	const labels =
		kicker === "gateway"
			? ["chat", "gateway", "agent"]
			: kicker === "storage"
				? ["chat", "files", "disk"]
				: ["profile", "runtime", "tools"];
	return (
		<div className="grid min-h-[116px] gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
			{labels.map((label, index) => (
				<div
					key={label}
					className="flex items-center justify-between bg-[var(--ret-bg)]/86 px-3 py-2 backdrop-blur-sm"
				>
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						0{index + 1}
					</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text)]">
						{label}
					</span>
					<span className="h-1.5 w-1.5 bg-[var(--ret-purple)]" />
				</div>
			))}
		</div>
	);
}
