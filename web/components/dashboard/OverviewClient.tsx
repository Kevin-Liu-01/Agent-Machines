"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import type {
	GatewaySummary,
	MachineSummary,
} from "@/lib/dashboard/types";

import { MetricCard } from "./MetricCard";
import { StatusPill } from "./StatusPill";

const POLL_MS = 5000;

type CountInfo = { skills: number; mcps: number; tools: number; crons: number };

type Props = {
	counts: CountInfo;
};

type LiveState = {
	machine: MachineSummary | null;
	gateway: GatewaySummary | null;
};

/**
 * Client-side overview body. Server passes in the static counts (skills,
 * mcps, crons) since those are baked from the repo at build. The two live
 * pieces (machine, gateway) come from the same /api/dashboard/* routes the
 * top-bar polls -- using two callers wastes one request per cycle, which
 * is fine for v1 and keeps the component independent.
 */
export function OverviewClient({ counts }: Props) {
	const [live, setLive] = useState<LiveState>({ machine: null, gateway: null });
	const [stamp, setStamp] = useState<number | null>(null);

	useEffect(() => {
		let stopped = false;

		async function tick() {
			const [m, g] = await Promise.all([
				fetch("/api/dashboard/machine", { cache: "no-store" })
					.then((r) => (r.ok ? (r.json() as Promise<MachineSummary>) : null))
					.catch(() => null),
				fetch("/api/dashboard/gateway", { cache: "no-store" })
					.then((r) => (r.ok ? (r.json() as Promise<GatewaySummary>) : null))
					.catch(() => null),
			]);
			if (stopped) return;
			setLive({ machine: m, gateway: g });
			setStamp(Date.now());
		}

		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, []);

	const phase = live.machine?.phase ?? "loading";
	const desired = live.machine?.desired ?? "unknown";
	const gateway = live.gateway;
	const ageLabel = useMemo(() => {
		if (!stamp) return null;
		const seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
		return `${seconds}s ago`;
	}, [stamp]);

	const memoryGib = live.machine
		? (live.machine.memoryMib / 1024).toFixed(1)
		: "--";
	const latencyTone =
		gateway?.ok && gateway.latencyMs < 1500
			? "ok"
			: gateway?.ok
				? "warn"
				: "error";

	return (
		<div className="space-y-8 px-6 py-6">
			<section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
				<MetricCard
					label="machine"
					value={<StatusPill phase={phase} className="text-base px-3 py-1" />}
					hint={
						live.machine
							? `desired: ${desired} . id: ${live.machine.machineId.slice(0, 14)}...`
							: "fetching dedalus state..."
					}
				/>
				<MetricCard
					label="gateway"
					value={
						gateway
							? gateway.ok
								? "online"
								: "down"
							: "..."
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
					value={gateway ? `${gateway.latencyMs} ms` : "--"}
					hint={gateway ? `model: ${gateway.model}` : "probing"}
					tone={latencyTone}
				/>
				<MetricCard
					label="spec"
					value={
						live.machine
							? `${live.machine.vcpu}v . ${memoryGib}G`
							: "--"
					}
					hint={live.machine ? `${live.machine.storageGib} GiB storage` : "..."}
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

			<section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
				<div className="rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-6">
					<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						Quick actions
					</p>
					<h2 className="mt-2 text-lg font-semibold tracking-tight">
						Talk to it. Read it. Inspect it.
					</h2>
					<p className="mt-2 max-w-[58ch] text-sm text-[var(--ret-text-dim)]">
						Chat is gated to allowlisted accounts. Skills and MCPs are
						read-only views of the same files the agent reads on the VM.
					</p>
					<div className="mt-5 flex flex-wrap gap-3">
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
				</div>

				<div className="rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-6">
					<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						Health probe
					</p>
					<h2 className="mt-2 text-lg font-semibold tracking-tight">
						Polling every 5s
					</h2>
					<dl className="mt-4 space-y-2 font-mono text-[12px] text-[var(--ret-text-dim)]">
						<Row label="phase" value={phase} />
						<Row label="desired" value={desired} />
						<Row label="reason" value={live.machine?.reason ?? "--"} />
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
					<p className="mt-4 text-[11px] text-[var(--ret-text-muted)]">
						Live data flows: <Link href="/dashboard/logs" className="underline">logs</Link> <span>.</span>{" "}
						<Link href="/dashboard/sessions" className="underline">sessions</Link> <span>.</span>{" "}
						<Link href="/dashboard/cursor" className="underline">cursor runs</Link>
					</p>
				</div>
			</section>
		</div>
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
