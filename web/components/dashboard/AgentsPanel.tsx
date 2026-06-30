"use client";

import Link from "next/link";
import {
	Activity,
	Bot,
	Check,
	FolderTree,
	HardDrive,
	KeyRound,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { AgentSwitcher } from "@/components/dashboard/AgentSwitcher";
import { CursorRunsList } from "@/components/dashboard/CursorRunsList";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { AiKeyField } from "@/lib/agents/credentials";
import { withMachineId } from "@/lib/dashboard/api-url";
import type { AgentKind, PublicMachineRef } from "@/lib/user-config/schema";

export type AgentReadiness = "ready" | "fallback" | "blocked";

export type AgentRequirement = {
	field: AiKeyField;
	label: string;
	required: boolean;
	signupUrl?: string;
	configured: boolean;
};

export type AgentCardData = {
	kind: AgentKind;
	label: string;
	isActive: boolean;
	usesRouter: boolean;
	nativeUpstream: "openai" | "anthropic" | null;
	readiness: { status: AgentReadiness; detail: string };
	requirements: AgentRequirement[];
};

type Props = {
	machineId: string;
	machineName: string;
	activeAgentKind: AgentKind;
	model: string | null;
	agents: AgentCardData[];
	cursorHasKey: boolean;
	machines?: PublicMachineRef[];
};

const READINESS_TONE: Record<AgentReadiness, string> = {
	ready: "bg-[var(--ret-green)]",
	fallback: "bg-[var(--ret-amber)]",
	blocked: "bg-[var(--ret-red)]",
};

const READINESS_BADGE: Record<AgentReadiness, "success" | "default"> = {
	ready: "success",
	fallback: "default",
	blocked: "default",
};

export function AgentsPanel({
	machineId,
	machineName,
	activeAgentKind,
	model,
	agents,
	cursorHasKey,
	machines = [],
}: Props) {
	const active = agents.find((a) => a.kind === activeAgentKind);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="AGENTS"
				title="Agents & runtime"
				description="Every agent runtime this machine can run, its key readiness, and live system insights. Switch the active agent and configure provider keys here."
			/>
			<DashboardPageBody className="space-y-5">
				{/* Active agent banner */}
				<ReticleFrame className="flex flex-wrap items-center justify-between gap-3 p-4">
					<div className="flex items-center gap-3">
						<span className="flex h-9 w-9 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-surface)]">
							<Bot className="h-4 w-4 text-[var(--ret-text)]" strokeWidth={1.75} />
						</span>
						<div>
							<p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
								active agent · {machineName}
							</p>
							<p className="text-[15px] text-[var(--ret-text)]">
								{active?.label ?? activeAgentKind}
								{model ? (
									<span className="ml-2 font-mono text-[11px] text-[var(--ret-text-muted)]">{model}</span>
								) : null}
							</p>
						</div>
						{active ? (
							<ReticleBadge variant={READINESS_BADGE[active.readiness.status]}>
								{active.readiness.status}
							</ReticleBadge>
						) : null}
					</div>
					<AgentSwitcher
						value={activeAgentKind}
						activeMachineId={machineId}
						machines={machines}
					/>
				</ReticleFrame>

				{/* All agents grid */}
				<section>
					<SectionLabel icon={<Bot className="h-3.5 w-3.5" strokeWidth={1.75} />} label="Runtimes" hint="all agents · key readiness" />
					<div className="mt-2 grid gap-3 md:grid-cols-2">
						{agents.map((agent) => (
							<AgentCard key={agent.kind} agent={agent} />
						))}
						<CursorCard hasKey={cursorHasKey} />
					</div>
				</section>

				{/* Live system insights */}
				<section>
					<SectionLabel icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.75} />} label="System" hint="filesystem · tracking · live" />
					<SystemInsights machineId={machineId} />
				</section>

				{/* Cursor runs (one surface among equals, not its own nav section) */}
				<section>
					<SectionLabel icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.75} />} label="Cursor delegations" hint="~/.agent-machines/cursor-runs.jsonl" />
					<div className="mt-2">
						<CursorRunsList />
					</div>
				</section>
			</DashboardPageBody>
		</div>
	);
}

function SectionLabel({ icon, label, hint }: { icon: ReactNode; label: string; hint: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2 border-b border-[var(--ret-border)] pb-1.5">
			<span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
				<span className="text-[var(--ret-text-dim)]">{icon}</span>
				{label}
			</span>
			<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{hint}</span>
		</div>
	);
}

function AgentCard({ agent }: { agent: AgentCardData }) {
	return (
		<ReticleFrame
			className={cn(
				"p-4 transition-colors",
				agent.isActive ? "border-[var(--ret-accent)]/60 bg-[var(--ret-surface)]/40" : "",
			)}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className={cn("h-1.5 w-1.5 rounded-full", READINESS_TONE[agent.readiness.status])} aria-hidden />
					<span className="text-[13px] text-[var(--ret-text)]">{agent.label}</span>
					{agent.isActive ? (
						<span className="border border-[var(--ret-accent)]/50 px-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ret-accent)]">
							active
						</span>
					) : null}
				</div>
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					{agent.nativeUpstream ? `native ${agent.nativeUpstream}` : "router"}
				</span>
			</div>
			<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">{agent.readiness.detail}</p>
			<div className="mt-2 flex flex-col gap-1">
				{agent.requirements.map((req) => (
					<div key={req.field} className="flex items-center gap-1.5">
						{req.configured ? (
							<Check className="h-3 w-3 shrink-0 text-[var(--ret-green)]" strokeWidth={2} />
						) : (
							<X className={cn("h-3 w-3 shrink-0", req.required ? "text-[var(--ret-red)]" : "text-[var(--ret-text-muted)]")} strokeWidth={2} />
						)}
						<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{req.label}</span>
					</div>
				))}
			</div>
			<Link
				href="/dashboard/settings"
				className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-accent)] hover:underline"
			>
				<KeyRound className="h-3 w-3" strokeWidth={1.75} /> configure keys
			</Link>
		</ReticleFrame>
	);
}

function CursorCard({ hasKey }: { hasKey: boolean }) {
	return (
		<ReticleFrame className="p-4">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className={cn("h-1.5 w-1.5 rounded-full", hasKey ? "bg-[var(--ret-green)]" : "bg-[var(--ret-text-muted)]")} aria-hidden />
					<span className="text-[13px] text-[var(--ret-text)]">Cursor bridge</span>
				</div>
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">MCP delegation</span>
			</div>
			<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
				Delegate code tasks to a Cursor agent via the cursor-bridge MCP. Runs show below.
			</p>
			<div className="mt-2 flex items-center gap-1.5">
				{hasKey ? (
					<Check className="h-3 w-3 shrink-0 text-[var(--ret-green)]" strokeWidth={2} />
				) : (
					<X className="h-3 w-3 shrink-0 text-[var(--ret-text-muted)]" strokeWidth={2} />
				)}
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">Cursor API key</span>
			</div>
			<Link
				href="/dashboard/settings"
				className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-accent)] hover:underline"
			>
				<KeyRound className="h-3 w-3" strokeWidth={1.75} /> configure key
			</Link>
		</ReticleFrame>
	);
}

type SystemState = {
	loading: boolean;
	offline: boolean;
	diskUsed: string | null;
	diskSize: string | null;
	diskPct: string | null;
	agentDirSize: string | null;
	sessions: number | null;
	cursorRuns: number | null;
};

const INITIAL_SYSTEM: SystemState = {
	loading: true,
	offline: false,
	diskUsed: null,
	diskSize: null,
	diskPct: null,
	agentDirSize: null,
	sessions: null,
	cursorRuns: null,
};

function SystemInsights({ machineId }: { machineId: string }) {
	const [state, setState] = useState<SystemState>(INITIAL_SYSTEM);

	useEffect(() => {
		let alive = true;
		async function load() {
			const fsReq = fetch("/api/dashboard/exec", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					machineId,
					timeoutMs: 15000,
					command: `df -h "$HOME" | tail -1; echo "==="; du -sh "$HOME/.agent-machines" 2>/dev/null | cut -f1`,
				}),
			})
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
			const sessReq = fetch(withMachineId("/api/dashboard/sessions", machineId), { cache: "no-store" })
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
			const cursorReq = fetch(withMachineId("/api/dashboard/cursor", machineId), { cache: "no-store" })
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);

			const [fs, sess, cursor] = await Promise.all([fsReq, sessReq, cursorReq]);
			if (!alive) return;

			const parsed = parseDf((fs?.stdout as string) ?? "");
			setState({
				loading: false,
				offline: fs == null || fs?.ok === false,
				diskUsed: parsed.used,
				diskSize: parsed.size,
				diskPct: parsed.pct,
				agentDirSize: parsed.agentDir,
				sessions:
					sess?.ok && sess.data ? (sess.data.totalSessions as number) ?? null : null,
				cursorRuns:
					cursor?.ok && cursor.data ? (cursor.data.totalRuns as number) ?? null : null,
			});
		}
		void load();
		return () => {
			alive = false;
		};
	}, [machineId]);

	if (state.loading) {
		return (
			<div className="mt-2 p-3">
				<BrailleSpinner name="orbit" label="reading system state" className="text-[10px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	if (state.offline) {
		return (
			<ReticleFrame className="mt-2 p-4">
				<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">
					Machine offline — wake it to read filesystem and tracking insights.
				</p>
			</ReticleFrame>
		);
	}

	return (
		<div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<InsightCell
				icon={<HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />}
				label="disk"
				value={state.diskUsed && state.diskSize ? `${state.diskUsed} / ${state.diskSize}` : "--"}
				sub={state.diskPct ? `${state.diskPct} used` : undefined}
			/>
			<InsightCell
				icon={<FolderTree className="h-3.5 w-3.5" strokeWidth={1.75} />}
				label="~/.agent-machines"
				value={state.agentDirSize ?? "--"}
				sub="agent state on disk"
			/>
			<InsightCell
				icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.75} />}
				label="sessions"
				value={state.sessions != null ? String(state.sessions) : "--"}
				sub="recorded transcripts"
			/>
			<InsightCell
				icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.75} />}
				label="cursor runs"
				value={state.cursorRuns != null ? String(state.cursorRuns) : "--"}
				sub="recent delegations"
			/>
		</div>
	);
}

function InsightCell({
	icon,
	label,
	value,
	sub,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<ReticleFrame className="p-3">
			<div className="flex items-center gap-1.5 text-[var(--ret-text-muted)]">
				{icon}
				<span className="font-mono text-[9px] uppercase tracking-[0.18em]">{label}</span>
			</div>
			<p className="mt-1 font-mono text-[16px] text-[var(--ret-text)]">{value}</p>
			{sub ? <p className="font-mono text-[9px] text-[var(--ret-text-muted)]">{sub}</p> : null}
		</ReticleFrame>
	);
}

/** Parse `df -h` last line + `du -sh` block split on "===". */
function parseDf(stdout: string): {
	used: string | null;
	size: string | null;
	pct: string | null;
	agentDir: string | null;
} {
	const [dfPart, duPart] = stdout.split("===");
	const cols = (dfPart ?? "").trim().split(/\s+/);
	// Filesystem Size Used Avail Use% Mounted
	const size = cols[1] ?? null;
	const used = cols[2] ?? null;
	const pct = cols[4] ?? null;
	const agentDir = (duPart ?? "").trim().split(/\s+/)[0] || null;
	return { used, size, pct, agentDir };
}
