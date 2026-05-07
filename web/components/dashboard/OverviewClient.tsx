"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { useMachineControl } from "@/lib/dashboard/use-machine-control";
import type { GatewaySummary } from "@/lib/dashboard/types";

import { MetricCard } from "./MetricCard";
import { ObservabilityPanel } from "./ObservabilityPanel";
import { ReloadKnowledge } from "./ReloadKnowledge";
import { StatusPill } from "./StatusPill";

const GATEWAY_POLL_MS = 5000;

type CountInfo = { skills: number; mcps: number; tools: number; crons: number };

type Props = {
	counts: CountInfo;
};

/**
 * Client-side overview body. Owns machine state via `useMachineControl`
 * (auto-wakes a sleeping machine on first load, exposes wake / sleep
 * actions) and polls the gateway probe alongside it.
 */
export function OverviewClient({ counts }: Props) {
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

	return (
		<div className="space-y-6 px-5 py-5">
			<MachineControlBar
				phase={phase}
				pending={machine.pending}
				autoWokeOnce={machine.autoWokeOnce}
				error={machine.error}
				onWake={() => void machine.wake()}
				onSleep={() => void machine.sleep()}
			/>

			<section className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-3 xl:grid-cols-6">
				<MetricCard
					label="machine"
					value={<StatusPill phase={phase} className="text-[11px] px-2 py-0.5" />}
					hint={
						machine.machine
							? `desired: ${desired} . id: ${machine.machine.machineId.slice(0, 14)}...`
							: "fetching dedalus state..."
					}
				/>
				<MetricCard
					label="gateway"
					value={gateway ? (gateway.ok ? "online" : "down") : "..."}
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
					value={gateway ? `${gateway.latencyMs} ms` : "--"}
					hint={gateway ? `model: ${gateway.model}` : "probing"}
					tone={latencyTone}
				/>
				<MetricCard
					label="spec"
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
					value={String(counts.skills)}
					hint={`bundled in ~/.hermes/skills`}
					tone="purple"
				/>
				<MetricCard
					label="mcps + tools"
					value={`${counts.mcps} . ${counts.tools}`}
					hint={`crons: ${counts.crons} scheduled`}
					tone="purple"
				/>
			</section>

			<ObservabilityPanel />

			<ReloadKnowledge machinePhase={phase} />

			<section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
				<ReticleFrame className="p-4">
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						Quick actions
					</p>
					<h2 className="ret-display mt-1.5 text-base">
						Talk to it. Read it. Inspect it.
					</h2>
					<p className="mt-1.5 max-w-[60ch] text-[12px] text-[var(--ret-text-dim)]">
						Chat is gated. Skills and MCPs are read-only views of the same
						files the agent reads on the VM.
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
					<h2 className="ret-display mt-1.5 text-base">
						Polling every 5s
					</h2>
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
					<p className="mt-3 font-mono text-[10px] text-[var(--ret-text-muted)]">
						Live:{" "}
						<Link href="/dashboard/logs" className="underline">logs</Link>{" "}
						<span>.</span>{" "}
						<Link href="/dashboard/sessions" className="underline">sessions</Link>{" "}
						<span>.</span>{" "}
						<Link href="/dashboard/cursor" className="underline">cursor</Link>
					</p>
					</div>
				</ReticleFrame>
			</section>
		</div>
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
