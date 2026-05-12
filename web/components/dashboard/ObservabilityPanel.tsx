"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";
import { formatAge, formatBytes } from "@/lib/dashboard/format";
import type {
	CursorRunsPayload,
	GatewaySummary,
	LiveDataEnvelope,
	LogsPayload,
	MachineSummary,
	SessionsPayload,
} from "@/lib/dashboard/types";
import { AGENT_LABEL, type AgentKind } from "@/lib/user-config/schema";

import { Sparkline } from "./Sparkline";

const AGENT_SOURCE: Record<AgentKind, string> = {
	hermes: "by Nous Research",
	openclaw: "by openclaw/openclaw",
	"claude-code": "by Anthropic",
	codex: "by OpenAI",
};

const AGENT_MARK: Record<AgentKind, "nous" | "openclaw" | "anthropic" | "openai"> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "anthropic",
	codex: "openai",
};

const HermesBustScene = dynamic(
	() => import("@/components/three").then((m) => m.HermesBustScene),
	{ ssr: false, loading: () => null },
);

const POLL_MS = 7000;
const HISTORY_MAX = 30;

type ObservabilityState = {
	gateway: GatewaySummary | null;
	logs: LogsPayload | null;
	cursor: CursorRunsPayload | null;
	sessions: SessionsPayload | null;
	error: string | null;
};

/**
 * Dashboard observability strip.
 *
 *   identity card | latency sparkline | activity feed | tool/skill breakdown
 *
 * Polls the same /api/dashboard/* endpoints the rest of the dashboard
 * uses, plus accumulates a rolling window of latency samples so we can
 * draw a real chart without adding a chart library. Activity feed
 * merges the most recent log lines with the most recent cursor runs.
 *
 * Renders empty / loading states gracefully when the machine is asleep
 * or AGENT_MACHINE_ID isn't configured -- the underlying envelopes
 * carry typed reasons we propagate through to the UI copy.
 */
type Props = {
	agentKind: AgentKind;
	modelOverride: string | null;
	machineSummary: MachineSummary | null;
};

export function ObservabilityPanel({
	agentKind,
	modelOverride,
	machineSummary,
}: Props) {
	const [state, setState] = useState<ObservabilityState>({
		gateway: null,
		logs: null,
		cursor: null,
		sessions: null,
		error: null,
	});
	const latencyHistoryRef = useRef<number[]>([]);
	const [latencyHistory, setLatencyHistory] = useState<number[]>([]);

	useEffect(() => {
		let stopped = false;

		async function tick() {
			try {
				const [gw, logs, cursor, sessions] = await Promise.all([
					fetch("/api/dashboard/gateway", { cache: "no-store" })
						.then((r) => (r.ok ? (r.json() as Promise<GatewaySummary>) : null))
						.catch(() => null),
					fetch("/api/dashboard/logs?n=40", { cache: "no-store" })
						.then((r) =>
							r.ok ? (r.json() as Promise<LiveDataEnvelope<LogsPayload>>) : null,
						)
						.catch(() => null),
					fetch("/api/dashboard/cursor", { cache: "no-store" })
						.then((r) =>
							r.ok ? (r.json() as Promise<LiveDataEnvelope<CursorRunsPayload>>) : null,
						)
						.catch(() => null),
					fetch("/api/dashboard/sessions", { cache: "no-store" })
						.then((r) =>
							r.ok ? (r.json() as Promise<LiveDataEnvelope<SessionsPayload>>) : null,
						)
						.catch(() => null),
				]);
				if (stopped) return;

				const next: ObservabilityState = {
					gateway: gw,
					logs: logs?.ok ? logs.data : null,
					cursor: cursor?.ok ? cursor.data : null,
					sessions: sessions?.ok ? sessions.data : null,
					error: null,
				};
				setState(next);

				if (gw && Number.isFinite(gw.latencyMs)) {
					const history = latencyHistoryRef.current;
					history.push(gw.latencyMs);
					if (history.length > HISTORY_MAX) history.shift();
					setLatencyHistory([...history]);
				}
			} catch (err) {
				if (!stopped) {
					setState((prev) => ({
						...prev,
						error: err instanceof Error ? err.message : "fetch failed",
					}));
				}
			}
		}

		void tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, []);

	return (
		<div className="space-y-px">
			{state.error ? (
				<p
					role="alert"
					className="border border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 px-3 py-2 font-mono text-[10px] text-[var(--ret-red)]"
				>
					observability poll failed: {state.error}
				</p>
			) : null}
			<section
				className="grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2 xl:grid-cols-4"
				aria-label="observability"
			>
				<IdentityCell
					agentKind={agentKind}
					model={modelOverride ?? state.gateway?.model ?? null}
					machineSummary={machineSummary}
				/>
				<LatencyCell history={latencyHistory} gateway={state.gateway} />
				<ActivityCell logs={state.logs} cursor={state.cursor} />
				<BreakdownCell
					cursor={state.cursor}
					sessions={state.sessions}
					logs={state.logs}
				/>
			</section>
		</div>
	);
}

function CellShell({
	kicker,
	footnote,
	children,
}: {
	kicker: string;
	footnote?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-full flex-col bg-[var(--ret-bg)]">
			<div className="flex items-baseline justify-between border-b border-[var(--ret-border)] px-4 py-2">
				<ReticleLabel>{kicker}</ReticleLabel>
				{footnote ? (
					<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{footnote}
					</p>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-3 px-4 py-4">{children}</div>
		</div>
	);
}

function IdentityCell({
	agentKind,
	model,
	machineSummary,
}: {
	agentKind: AgentKind;
	model: string | null;
	machineSummary: MachineSummary | null;
}) {
	const label = AGENT_LABEL[agentKind];
	const source = AGENT_SOURCE[agentKind];
	const mark = AGENT_MARK[agentKind];
	const vcpu = machineSummary?.vcpu;
	const memoryGib = machineSummary
		? Math.round(machineSummary.memoryMib / 1024)
		: null;
	const spec = vcpu && memoryGib ? `microVM . ${vcpu}v . ${memoryGib} GiB` : "microVM";
	const modelLabel = model ?? "—";
	return (
		<CellShell kicker="IDENTITY" footnote={`${label} Agent`}>
			<div className="grid h-full grid-cols-[88px_1fr] gap-3">
				<div className="aspect-square w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
					{/* Bust always renders the Hermes wireframe today; the
					    OpenClaw scene reuses the same procedural geometry
					    until a dedicated computer-use diorama lands. */}
					<HermesBustScene className="h-full w-full" />
				</div>
				<div className="flex min-w-0 flex-col gap-1">
					<p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
						<Logo mark={mark} size={14} />
						{label}
					</p>
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{source}
					</p>
					<p className="mt-1 font-mono text-[11px] text-[var(--ret-text-dim)]">
						{spec}
					</p>
					<p className="truncate font-mono text-[11px] text-[var(--ret-text-dim)]">
						{modelLabel}
					</p>
				</div>
			</div>
		</CellShell>
	);
}

function LatencyCell({
	history,
	gateway,
}: {
	history: number[];
	gateway: GatewaySummary | null;
}) {
	const last = history.at(-1);
	const min = history.length > 0 ? Math.min(...history) : 0;
	const max = history.length > 0 ? Math.max(...history) : 0;
	const avg =
		history.length > 0
			? Math.round(history.reduce((sum, n) => sum + n, 0) / history.length)
			: 0;
	const tone =
		!gateway || !gateway.ok
			? "text-[var(--ret-red)]"
			: (last ?? 0) < 1500
				? "text-[var(--ret-green)]"
				: "text-[var(--ret-amber)]";
	return (
		<CellShell
			kicker="LATENCY"
			footnote={`${history.length} samples`}
		>
			<div className="flex items-end justify-between gap-3">
				<p className={cn("font-mono text-2xl tabular-nums leading-none", tone)}>
					{last ?? "--"}
					<span className="ml-1 text-[11px] text-[var(--ret-text-muted)]">ms</span>
				</p>
				<Sparkline
					values={history}
					width={140}
					height={32}
					stroke="var(--ret-purple)"
					fill
					ariaLabel="latency over time"
				/>
			</div>
			<div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
				<MiniStat label="min" value={`${min} ms`} />
				<MiniStat label="avg" value={`${avg} ms`} />
				<MiniStat label="max" value={`${max} ms`} />
			</div>
			{gateway?.modelCount != null ? (
				<p className="mt-auto font-mono text-[10px] text-[var(--ret-text-muted)]">
					gateway . {gateway.modelCount} models . {gateway.apiHost.slice(0, 28)}
				</p>
			) : null}
		</CellShell>
	);
}

type FeedItem = {
	when: string | null;
	kind: "log" | "cursor";
	tone: "info" | "warn" | "error" | "ok";
	message: string;
};

function ActivityCell({
	logs,
	cursor,
}: {
	logs: LogsPayload | null;
	cursor: CursorRunsPayload | null;
}) {
	const items: FeedItem[] = [];
	if (logs) {
		for (const line of logs.lines.slice(-6).reverse()) {
			items.push({
				when: line.at,
				kind: "log",
				tone: line.level === "error" ? "error" : line.level === "warn" ? "warn" : "info",
				message: line.message.slice(0, 90),
			});
		}
	}
	if (cursor) {
		for (const run of cursor.runs.slice(0, 4)) {
			items.push({
				when: run.loggedAt,
				kind: "cursor",
				tone: run.status === "completed" || run.status === "succeeded" ? "ok" : "warn",
				message: `cursor_${run.kind} . ${run.prompt.slice(0, 60)}`,
			});
		}
	}
	const sorted = items
		.filter((i) => i.when)
		.sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))
		.slice(0, 8);

	return (
		<CellShell kicker="ACTIVITY" footnote={`${sorted.length} recent`}>
			{sorted.length === 0 ? (
				<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">
					no activity yet -- send a message in chat to populate.
				</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{sorted.map((item, idx) => (
						<li
							key={`${item.when}-${idx}`}
							className="flex items-baseline gap-2 font-mono text-[11px]"
						>
							<span className="w-3 shrink-0">
								<span
									className={cn(
										"inline-block h-1.5 w-1.5",
										item.tone === "error" && "bg-[var(--ret-red)]",
										item.tone === "warn" && "bg-[var(--ret-amber)]",
										item.tone === "ok" && "bg-[var(--ret-green)]",
										item.tone === "info" && "bg-[var(--ret-text-muted)]",
									)}
								/>
							</span>
							<span className="w-14 shrink-0 text-[10px] text-[var(--ret-text-muted)]">
								{item.when ? formatAge(item.when) : "--"}
							</span>
							<span className="min-w-0 flex-1 truncate text-[var(--ret-text-dim)]">
								{item.message}
							</span>
						</li>
					))}
				</ul>
			)}
		</CellShell>
	);
}

function BreakdownCell({
	cursor,
	sessions,
	logs,
}: {
	cursor: CursorRunsPayload | null;
	sessions: SessionsPayload | null;
	logs: LogsPayload | null;
}) {
	const cursorRuns = cursor?.totalRuns ?? 0;
	const sessionCount = sessions?.totalSessions ?? 0;
	const sessionBytes = sessions?.totalBytes ?? 0;
	const errors = logs
		? logs.lines.filter((l) => l.level === "error").length
		: 0;
	const warns = logs
		? logs.lines.filter((l) => l.level === "warn").length
		: 0;
	const infos = logs
		? logs.lines.filter((l) => l.level === "info").length
		: 0;

	return (
		<CellShell kicker="BREAKDOWN" footnote="all-time">
			<div className="grid grid-cols-2 gap-3">
				<MiniStat
					label="cursor runs"
					value={String(cursorRuns)}
					hint={cursorRuns === 0 ? "delegate to fill" : "code delegations"}
				/>
				<MiniStat
					label="sessions"
					value={String(sessionCount)}
					hint={
						sessionBytes > 0
							? formatBytes(sessionBytes)
							: "open chat to start"
					}
				/>
			</div>
			<div className="mt-2 border-t border-[var(--ret-border)] pt-3">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					last 40 log lines
				</p>
				<div className="mt-2 flex h-3 w-full overflow-hidden border border-[var(--ret-border)]">
					<LevelBar
						count={infos}
						total={errors + warns + infos}
						color="var(--ret-text-dim)"
					/>
					<LevelBar
						count={warns}
						total={errors + warns + infos}
						color="var(--ret-amber)"
					/>
					<LevelBar
						count={errors}
						total={errors + warns + infos}
						color="var(--ret-red)"
					/>
				</div>
				<div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
					<span>info {infos}</span>
					<span className="text-[var(--ret-amber)]">warn {warns}</span>
					<span className="text-[var(--ret-red)]">error {errors}</span>
				</div>
			</div>
		</CellShell>
	);
}

function MiniStat({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div>
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="mt-1 font-mono text-base tabular-nums leading-none text-[var(--ret-text)]">
				{value}
			</p>
			{hint ? (
				<p className="mt-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
					{hint}
				</p>
			) : null}
		</div>
	);
}

function LevelBar({ count, total, color }: { count: number; total: number; color: string }) {
	if (total === 0) {
		return <div className="flex-1" style={{ background: "var(--ret-surface)" }} />;
	}
	const pct = (count / total) * 100;
	if (pct === 0) return null;
	return (
		<div
			style={{
				background: color,
				width: `${pct}%`,
				opacity: 0.85,
			}}
			aria-label={`${count} of ${total}`}
		/>
	);
}

// Re-export ReticleBadge so the panel can reuse it without an extra import jump.
export { ReticleBadge };
