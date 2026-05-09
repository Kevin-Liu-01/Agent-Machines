"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";
import type {
	GatewaySummary,
	LiveDataEnvelope,
	LogLine,
	LogsPayload,
} from "@/lib/dashboard/types";
import {
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

/**
 * Operations-style fleet metrics strip, modeled on the platform-admin
 * dashboards you see at Vercel / Datadog / Stripe.
 *
 * Five panels stacked vertically:
 *
 *   1. Top counters: running / sleeping / failed / total / p50 latency.
 *      The "the operator's dashboard at-a-glance" line.
 *   2. Phase distribution: stacked bar of every machine on the account
 *      by current phase. Shows distribution at-a-glance even with 50+
 *      machines.
 *   3. Workspace activity (7d): hour-of-day x day-of-week heatmap of
 *      log line timestamps. Shows when this user's machines are most
 *      active in their week.
 *   4. API latency histogram: bucketed gateway latency (rolling 200
 *      samples) + p50/p95/p99 footers. Direct port of the screenshot's
 *      latency panel.
 *   5. Recent transitions: chronological log of phase changes from the
 *      polled machine state. (Boot / wake / sleep / fail events.)
 *
 * All client-side aggregation. No new backend routes -- the panel
 * leans on /api/dashboard/{machines,gateway,logs} which the rest of
 * the dashboard already hits.
 */

const POLL_MS = 6000;
const LATENCY_HISTORY_MAX = 200;
const TRANSITION_HISTORY_MAX = 30;
const HOURS = 24;
const DAYS = 7;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type LiveMachine = {
	id: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	name: string;
	spec: MachineSpec;
	createdAt: string;
	archived?: boolean;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

type Payload = {
	ok: boolean;
	machines: LiveMachine[];
	activeMachineId: string | null;
};

type LatencySample = { at: number; ms: number };

type Transition = {
	id: string;
	at: number;
	machineId: string;
	machineName: string;
	from: string;
	to: string;
};

const PHASE_COLORS: Record<string, string> = {
	ready: "var(--ret-green)",
	running: "var(--ret-green)",
	starting: "var(--ret-purple)",
	sleeping: "var(--ret-amber)",
	destroyed: "var(--ret-text-muted)",
	destroying: "var(--ret-amber)",
	error: "var(--ret-red)",
	failed: "var(--ret-red)",
	unknown: "var(--ret-border-strong)",
};

const PHASE_LABEL: Record<string, string> = {
	ready: "Running",
	running: "Running",
	starting: "Starting",
	sleeping: "Sleeping",
	destroyed: "Destroyed",
	destroying: "Destroying",
	error: "Failed",
	failed: "Failed",
	unknown: "Unknown",
};

export function FleetMetrics() {
	const [machines, setMachines] = useState<LiveMachine[]>([]);
	const [logs, setLogs] = useState<LogLine[]>([]);
	const [latencyHistory, setLatencyHistory] = useState<LatencySample[]>([]);
	const [transitions, setTransitions] = useState<Transition[]>([]);
	const [stamp, setStamp] = useState<number | null>(null);
	const lastPhaseByIdRef = useRef<Map<string, string>>(new Map());
	const latencyRef = useRef<LatencySample[]>([]);

	const tick = useCallback(async (): Promise<void> => {
		try {
			const [machinesRes, gatewayRes, logsRes] = await Promise.all([
				fetch("/api/dashboard/machines", { cache: "no-store" })
					.then((r) => (r.ok ? (r.json() as Promise<Payload>) : null))
					.catch(() => null),
				fetch("/api/dashboard/gateway", { cache: "no-store" })
					.then((r) => (r.ok ? (r.json() as Promise<GatewaySummary>) : null))
					.catch(() => null),
				fetch("/api/dashboard/logs?n=500", { cache: "no-store" })
					.then((r) =>
						r.ok
							? (r.json() as Promise<LiveDataEnvelope<LogsPayload>>)
							: null,
					)
					.catch(() => null),
			]);

			if (machinesRes) {
				const live = machinesRes.machines.filter((m) => !m.archived);
				setMachines(live);
				// Detect phase transitions vs the last poll. Each new
				// "from -> to" tuple becomes a transition entry.
				const lastMap = lastPhaseByIdRef.current;
				const newTransitions: Transition[] = [];
				const now = Date.now();
				for (const m of live) {
					const phase = m.live.ok ? m.live.state : "unknown";
					const last = lastMap.get(m.id);
					if (last !== undefined && last !== phase) {
						newTransitions.push({
							id: `${m.id}-${phase}-${now}`,
							at: now,
							machineId: m.id,
							machineName: m.name,
							from: last,
							to: phase,
						});
					}
					lastMap.set(m.id, phase);
				}
				if (newTransitions.length > 0) {
					setTransitions((prev) =>
						[...newTransitions, ...prev].slice(0, TRANSITION_HISTORY_MAX),
					);
				}
			}

			if (gatewayRes && Number.isFinite(gatewayRes.latencyMs)) {
				const next = [
					...latencyRef.current,
					{ at: Date.now(), ms: gatewayRes.latencyMs },
				].slice(-LATENCY_HISTORY_MAX);
				latencyRef.current = next;
				setLatencyHistory(next);
			}

			if (logsRes?.ok) {
				setLogs(logsRes.data.lines);
			}

			setStamp(Date.now());
		} catch {
			// transient -- next tick will retry
		}
	}, []);

	useEffect(() => {
		void tick();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [tick]);

	const counters = useMemo(() => countersFor(machines), [machines]);
	const phaseDistribution = useMemo(
		() => distributionFor(machines),
		[machines],
	);
	const heatmap = useMemo(() => heatmapFor(logs), [logs]);
	const histogram = useMemo(() => histogramFor(latencyHistory), [
		latencyHistory,
	]);
	const percentiles = useMemo(
		() => percentilesFor(latencyHistory),
		[latencyHistory],
	);

	const latencyP50 = percentiles.p50;

	return (
		<section
			aria-label="fleet metrics"
			className="overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)]"
		>
			<header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-4 py-2.5">
				<div className="flex items-center gap-2">
					<ReticleLabel>FLEET METRICS</ReticleLabel>
					<ReticleBadge>{machines.length} machines</ReticleBadge>
				</div>
				<RefreshIndicator stamp={stamp} onClick={() => void tick()} />
			</header>

			<CountersStrip
				running={counters.running}
				sleeping={counters.sleeping}
				failed={counters.failed}
				total={counters.total}
				latencyMs={latencyP50}
			/>

			<PhaseDistribution
				machines={machines.length}
				distribution={phaseDistribution}
			/>

			<div className="grid gap-px bg-[var(--ret-border)] lg:grid-cols-[1.6fr_1fr]">
				<WorkspaceHeatmap heatmap={heatmap} totalLines={logs.length} />
				<LatencyHistogram histogram={histogram} percentiles={percentiles} />
			</div>

			<TransitionsLog transitions={transitions} />
		</section>
	);
}

/* --------------------------------------------------------------------- */
/* Counters strip                                                        */
/* --------------------------------------------------------------------- */

function CountersStrip({
	running,
	sleeping,
	failed,
	total,
	latencyMs,
}: {
	running: number;
	sleeping: number;
	failed: number;
	total: number;
	latencyMs: number;
}) {
	return (
		<div className="grid grid-cols-2 gap-px bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-5">
			<Counter label="RUNNING" value={running} tone="ok" />
			<Counter label="SLEEPING" value={sleeping} tone="warn" />
			<Counter label="FAILED" value={failed} tone={failed > 0 ? "err" : "muted"} />
			<Counter label="TOTAL CREATED" value={total} hint="all time" />
			<Counter
				label="LATENCY P50"
				value={latencyMs > 0 ? `${latencyMs} ms` : "--"}
				hint="rolling 200 probes"
				tone={latencyMs === 0 ? "muted" : latencyMs < 1500 ? "ok" : "warn"}
			/>
		</div>
	);
}

function Counter({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: number | string;
	hint?: string;
	tone?: "ok" | "warn" | "err" | "muted";
}) {
	const colorCls =
		tone === "ok"
			? "text-[var(--ret-green)]"
			: tone === "warn"
				? "text-[var(--ret-amber)]"
				: tone === "err"
					? "text-[var(--ret-red)]"
					: "text-[var(--ret-text)]";
	return (
		<div className="flex flex-col gap-1 bg-[var(--ret-bg)] px-4 py-3">
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="flex items-baseline gap-1.5">
				<span
					className={cn(
						"font-mono text-2xl tabular-nums",
						colorCls,
					)}
				>
					{value}
				</span>
				{hint ? (
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{hint}
					</span>
				) : null}
			</p>
		</div>
	);
}

/* --------------------------------------------------------------------- */
/* Phase distribution                                                    */
/* --------------------------------------------------------------------- */

type DistEntry = { phase: string; count: number; color: string; label: string };

function distributionFor(machines: LiveMachine[]): DistEntry[] {
	const counts = new Map<string, number>();
	for (const m of machines) {
		const raw = m.live.ok ? m.live.state : "unknown";
		counts.set(raw, (counts.get(raw) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([phase, count]) => ({
			phase,
			count,
			color: PHASE_COLORS[phase] ?? "var(--ret-border-strong)",
			label: PHASE_LABEL[phase] ?? phase,
		}))
		.sort((a, b) => b.count - a.count);
}

function PhaseDistribution({
	machines,
	distribution,
}: {
	machines: number;
	distribution: DistEntry[];
}) {
	if (machines === 0) {
		return (
			<div className="border-t border-[var(--ret-border)] px-4 py-4">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					phase distribution
				</p>
				<p className="mt-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
					no machines yet
				</p>
			</div>
		);
	}
	return (
		<div className="border-t border-[var(--ret-border)] px-4 py-4">
			<div className="flex items-baseline justify-between">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					phase distribution
				</p>
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{machines} machines
				</p>
			</div>
			<div className="mt-2 flex h-2 w-full overflow-hidden border border-[var(--ret-border)]">
				{distribution.map((d) => (
					<div
						key={d.phase}
						className="h-full"
						style={{
							width: `${(d.count / machines) * 100}%`,
							background: d.color,
						}}
						title={`${d.label}: ${d.count}`}
					/>
				))}
			</div>
			<div className="mt-3 flex flex-wrap gap-3">
				{distribution.map((d) => (
					<span
						key={d.phase}
						className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-dim)]"
					>
						<span
							aria-hidden="true"
							className="h-2 w-2 shrink-0"
							style={{ background: d.color }}
						/>
						{d.label}
						<span className="text-[var(--ret-text)] tabular-nums">
							{d.count}
						</span>
					</span>
				))}
			</div>
		</div>
	);
}

/* --------------------------------------------------------------------- */
/* Workspace heatmap                                                     */
/* --------------------------------------------------------------------- */

type Heatmap = number[][];

function heatmapFor(lines: LogLine[]): Heatmap {
	// 7 rows (Sun..Sat) x 24 cols (00..23). Counts log lines by hour
	// of day in the user's local timezone. Lines without a parseable
	// timestamp don't contribute.
	const grid: Heatmap = Array.from({ length: DAYS }, () =>
		Array.from({ length: HOURS }, () => 0),
	);
	for (const line of lines) {
		if (!line.at) continue;
		const ts = Date.parse(line.at);
		if (!Number.isFinite(ts)) continue;
		const date = new Date(ts);
		const dayOfWeek = date.getDay();
		const hour = date.getHours();
		const row = grid[dayOfWeek];
		if (row && hour >= 0 && hour < HOURS) {
			row[hour] = (row[hour] ?? 0) + 1;
		}
	}
	return grid;
}

function WorkspaceHeatmap({
	heatmap,
	totalLines,
}: {
	heatmap: Heatmap;
	totalLines: number;
}) {
	const flat = heatmap.flat();
	const max = Math.max(...flat, 1);
	const tz =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone
			: "Local";
	return (
		<div className="bg-[var(--ret-bg)] px-4 py-4">
			<div className="flex items-baseline justify-between">
				<p className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					workspace activity (7d)
					<span className="normal-case text-[var(--ret-text-dim)]">{tz}</span>
				</p>
				<div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					<span>low</span>
					{[0, 1, 2, 3, 4].map((step) => (
						<span
							key={step}
							className="h-2 w-2 border border-[var(--ret-border)]"
							style={{
								background: "var(--ret-green)",
								opacity: 0.18 + step * 0.18,
							}}
							aria-hidden="true"
						/>
					))}
					<span>high</span>
				</div>
			</div>
			<div className="mt-3 grid grid-cols-[28px_1fr] gap-1">
				<div className="flex flex-col gap-px">
					<div className="h-3" />
					{DAY_LABEL.map((label) => (
						<div
							key={label}
							className="h-3 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]"
						>
							{label}
						</div>
					))}
				</div>
				<div className="flex flex-col gap-px">
					{/* Hour ruler. Shows 00 / 03 / 06 / ... 21.
					    grid-cols-24 isn't a Tailwind default; we use the
					    arbitrary `grid-cols-[repeat(24,minmax(0,1fr))]`
					    to lay out 24 equal columns. */}
					<div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px">
						{Array.from({ length: HOURS }).map((_, h) => (
							<div
								key={`hour-${h}`}
								className="h-3 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]"
							>
								{h % 3 === 0 ? String(h).padStart(2, "0") : ""}
							</div>
						))}
					</div>
					{heatmap.map((row, dayIdx) => (
						<div
							key={`row-${dayIdx}`}
							className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px"
						>
							{row.map((value, hourIdx) => {
								const intensity = value === 0 ? 0 : value / max;
								return (
									<div
										key={`cell-${dayIdx}-${hourIdx}`}
										className="h-3 border border-[var(--ret-border)]"
										title={`${DAY_LABEL[dayIdx]} ${String(hourIdx).padStart(2, "0")}:00 -- ${value} log line${value === 1 ? "" : "s"}`}
										style={{
											background: value === 0 ? "transparent" : "var(--ret-green)",
											opacity:
												value === 0
													? 1
													: 0.2 + 0.8 * Math.min(1, intensity),
										}}
									/>
								);
							})}
						</div>
					))}
				</div>
			</div>
			<p className="mt-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
				{totalLines} log lines bucketed . live tail polled every {POLL_MS / 1000}s
			</p>
		</div>
	);
}

/* --------------------------------------------------------------------- */
/* Latency histogram                                                     */
/* --------------------------------------------------------------------- */

type Bucket = { label: string; lo: number; hi: number; count: number };

function histogramFor(history: LatencySample[]): Bucket[] {
	const buckets: Bucket[] = [
		{ label: "< 500ms", lo: 0, hi: 500, count: 0 },
		{ label: "500ms - 1s", lo: 500, hi: 1_000, count: 0 },
		{ label: "1 - 2s", lo: 1_000, hi: 2_000, count: 0 },
		{ label: "2 - 5s", lo: 2_000, hi: 5_000, count: 0 },
		{ label: "> 5s", lo: 5_000, hi: Infinity, count: 0 },
	];
	for (const sample of history) {
		for (const bucket of buckets) {
			if (sample.ms >= bucket.lo && sample.ms < bucket.hi) {
				bucket.count += 1;
				break;
			}
		}
	}
	return buckets;
}

function percentilesFor(history: LatencySample[]) {
	if (history.length === 0) return { p50: 0, p95: 0, p99: 0 };
	const sorted = history.map((s) => s.ms).sort((a, b) => a - b);
	function pct(p: number): number {
		const idx = Math.min(
			sorted.length - 1,
			Math.max(0, Math.floor((p / 100) * sorted.length)),
		);
		return Math.round(sorted[idx] ?? 0);
	}
	return { p50: pct(50), p95: pct(95), p99: pct(99) };
}

function LatencyHistogram({
	histogram,
	percentiles,
}: {
	histogram: Bucket[];
	percentiles: { p50: number; p95: number; p99: number };
}) {
	const total = histogram.reduce((sum, b) => sum + b.count, 0);
	const max = Math.max(...histogram.map((b) => b.count), 1);
	return (
		<div className="bg-[var(--ret-bg)] px-4 py-4">
			<div className="flex items-baseline justify-between">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					api latency
				</p>
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{total} reqs
				</p>
			</div>
			<ul className="mt-3 space-y-1.5">
				{histogram.map((bucket) => {
					const pct = total === 0 ? 0 : (bucket.count / total) * 100;
					const widthPct =
						total === 0 ? 0 : (bucket.count / max) * 100;
					return (
						<li
							key={bucket.label}
							className="grid grid-cols-[80px_1fr_44px] items-center gap-2"
						>
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{bucket.label}
							</span>
							<div className="relative h-4 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
								<div
									className="h-full bg-[var(--ret-green)]/55"
									style={{ width: `${widthPct}%` }}
								/>
								{bucket.count > 0 ? (
									<span
										className="absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] tabular-nums text-[var(--ret-text)]"
										style={{
											textShadow: "0 0 2px var(--ret-bg)",
										}}
									>
										{bucket.count}
									</span>
								) : null}
							</div>
							<span className="text-right font-mono text-[10px] tabular-nums text-[var(--ret-text-muted)]">
								{pct.toFixed(0)}%
							</span>
						</li>
					);
				})}
			</ul>
			<div className="mt-3 grid grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<Percentile label="P50" value={percentiles.p50} />
				<Percentile label="P95" value={percentiles.p95} />
				<Percentile label="P99" value={percentiles.p99} />
			</div>
		</div>
	);
}

function Percentile({ label, value }: { label: string; value: number }) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-2 text-center">
			<p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">
				{value > 0 ? value.toLocaleString() : "--"}
				<span className="ml-0.5 text-[10px] uppercase text-[var(--ret-text-muted)]">
					{value > 0 ? "ms" : ""}
				</span>
			</p>
		</div>
	);
}

/* --------------------------------------------------------------------- */
/* Transitions log                                                       */
/* --------------------------------------------------------------------- */

function TransitionsLog({ transitions }: { transitions: Transition[] }) {
	return (
		<div className="border-t border-[var(--ret-border)] px-4 py-4">
			<div className="flex items-baseline justify-between">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					transitions
				</p>
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{transitions.length}
				</p>
			</div>
			{transitions.length === 0 ? (
				<p className="mt-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
					no transitions yet -- waiting for a phase change
				</p>
			) : (
				<ul className="mt-3 max-h-[180px] space-y-1 overflow-y-auto font-mono text-[11px]">
					{transitions.map((t) => (
						<li
							key={t.id}
							className="grid grid-cols-[60px_1fr_auto] items-baseline gap-2"
						>
							<time
								dateTime={new Date(t.at).toISOString()}
								className="text-[var(--ret-text-muted)] tabular-nums"
							>
								{formatTime(t.at)}
							</time>
							<span
								className="truncate text-[var(--ret-text)]"
								title={t.machineId}
							>
								{t.machineName}
							</span>
							<span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]">
								<PhaseChip phase={t.from} />
								<span className="text-[var(--ret-text-muted)]">{"->"}</span>
								<PhaseChip phase={t.to} />
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function PhaseChip({ phase }: { phase: string }) {
	const color = PHASE_COLORS[phase] ?? "var(--ret-border-strong)";
	const label = PHASE_LABEL[phase] ?? phase;
	return (
		<span
			className="inline-flex items-center gap-1 border px-1.5 py-px"
			style={{ borderColor: color, color }}
		>
			<span aria-hidden="true" className="h-1 w-1" style={{ background: color }} />
			{label}
		</span>
	);
}

/* --------------------------------------------------------------------- */
/* Helpers                                                               */
/* --------------------------------------------------------------------- */

function countersFor(machines: LiveMachine[]): {
	running: number;
	sleeping: number;
	failed: number;
	total: number;
} {
	let running = 0;
	let sleeping = 0;
	let failed = 0;
	for (const m of machines) {
		if (!m.live.ok) {
			failed += 1;
			continue;
		}
		if (m.live.state === "ready" || m.live.state === "starting") {
			running += 1;
		} else if (m.live.state === "sleeping") {
			sleeping += 1;
		} else if (m.live.state === "error" || m.live.state === "destroying") {
			failed += 1;
		}
	}
	return { running, sleeping, failed, total: machines.length };
}

function RefreshIndicator({
	stamp,
	onClick,
}: {
	stamp: number | null;
	onClick: () => void;
}) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);
	if (!stamp) {
		return (
			<button
				type="button"
				onClick={onClick}
				className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
			>
				probing...
			</button>
		);
	}
	const seconds = Math.max(0, Math.round((now - stamp) / 1000));
	return (
		<button
			type="button"
			onClick={onClick}
			title="Refresh now"
			className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
		>
			<span>{seconds}s ago</span>
			<svg
				viewBox="0 0 12 12"
				className="h-3 w-3"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M2 6 a4 4 0 0 1 8 0 M10 6 l-1.5 -1.5 M10 6 l1.5 -1.5" />
				<path d="M10 6 a4 4 0 0 1 -8 0 M2 6 l1.5 1.5 M2 6 l-1.5 1.5" />
			</svg>
		</button>
	);
}

function formatTime(ms: number): string {
	const d = new Date(ms);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}
