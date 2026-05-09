"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import type {
	GatewaySummary,
	LiveDataEnvelope,
	LogLine,
	LogsPayload,
} from "@/lib/dashboard/types";

/**
 * Recharts-backed metrics strip for the dashboard overview.
 *
 * Three charts, all driven by the same APIs the ObservabilityPanel
 * polls (so we only hit the network at the cadence one component
 * needs). Sits beneath the IDENTITY / LATENCY / ACTIVITY / BREAKDOWN
 * row to surface trend lines instead of point-in-time numbers:
 *
 *   1. Gateway latency (ms) -- area chart of the last 30 samples
 *      with min/avg/max footnote. Tells you whether the machine is
 *      thrashing or coasting.
 *
 *   2. Log throughput by level -- stacked bar chart bucketed into
 *      ten 30-second windows. Surfaces error spikes that the
 *      activity feed obscures because it shows individual lines.
 *
 *   3. Log volume by agent -- pie chart of Hermes vs OpenClaw lines
 *      in the same window. Shows which runtime the machine is
 *      actually exercising right now.
 *
 * Everything renders in dev with the file-backed config + the
 * machine's existing /api/dashboard/* endpoints, so no extra wiring
 * is needed to see the charts come alive once a machine is awake.
 */

const POLL_MS = 7000;
const HISTORY_MAX = 30;
const BUCKET_MS = 30_000;
const BUCKET_COUNT = 10;

type LatencySample = {
	at: number;
	ms: number;
};

const LEVEL_COLORS = {
	info: "var(--ret-purple)",
	warn: "var(--ret-amber)",
	error: "var(--ret-red)",
	debug: "var(--ret-text-muted)",
	other: "var(--ret-border-strong)",
} as const;

const AGENT_COLORS: Record<string, string> = {
	hermes: "var(--ret-purple)",
	openclaw: "var(--ret-amber)",
};

type Props = {
	/** Optional: when caller already polls these endpoints, pass the
	 *  callback to wire shared cadence. Today nobody does, so the
	 *  component polls itself on a 7s tick gated to tab visibility. */
	pollMs?: number;
};

export function MetricsChartPanel({ pollMs = POLL_MS }: Props) {
	const [gateway, setGateway] = useState<GatewaySummary | null>(null);
	const [logs, setLogs] = useState<LogsPayload | null>(null);
	const latencyRef = useRef<LatencySample[]>([]);
	const [latencyHistory, setLatencyHistory] = useState<LatencySample[]>([]);

	useEffect(() => {
		let stopped = false;

		async function tick(): Promise<void> {
			try {
				const [gw, logsRes] = await Promise.all([
					fetch("/api/dashboard/gateway", { cache: "no-store" })
						.then((r) =>
							r.ok ? (r.json() as Promise<GatewaySummary>) : null,
						)
						.catch(() => null),
					fetch("/api/dashboard/logs?n=200", { cache: "no-store" })
						.then((r) =>
							r.ok
								? (r.json() as Promise<LiveDataEnvelope<LogsPayload>>)
								: null,
						)
						.catch(() => null),
				]);
				if (stopped) return;

				setGateway(gw);
				setLogs(logsRes?.ok ? logsRes.data : null);

				if (gw && Number.isFinite(gw.latencyMs)) {
					const next = [
						...latencyRef.current,
						{ at: Date.now(), ms: gw.latencyMs },
					].slice(-HISTORY_MAX);
					latencyRef.current = next;
					setLatencyHistory(next);
				}
			} catch {
				// Swallow -- the panel renders whatever data it last had,
				// so a transient network blip doesn't blank the charts.
			}
		}

		void tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, pollMs);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, [pollMs]);

	const latencyStats = useMemo(() => stats(latencyHistory), [latencyHistory]);
	const buckets = useMemo(
		() => bucketLogs(logs?.lines ?? [], BUCKET_COUNT, BUCKET_MS),
		[logs],
	);
	const agentSlices = useMemo(
		() => agentBreakdown(logs?.lines ?? []),
		[logs],
	);

	const ready = gateway?.ok === true || (logs?.lines.length ?? 0) > 0;

	return (
		<section
			aria-label="metrics"
			className="overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)]"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-4 py-2">
				<div className="flex items-center gap-2">
					<ReticleLabel>METRICS</ReticleLabel>
					<ReticleBadge variant={ready ? "accent" : "default"}>
						{ready ? "live" : "waiting for data"}
					</ReticleBadge>
				</div>
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					recharts . {pollMs / 1000}s tick . {HISTORY_MAX} samples
				</p>
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] lg:grid-cols-[1.4fr_1.2fr_0.8fr]">
				<LatencyChart history={latencyHistory} stats={latencyStats} />
				<LogRateChart buckets={buckets} bucketMs={BUCKET_MS} />
				<AgentBreakdownChart slices={agentSlices} />
			</div>
		</section>
	);
}

/* --------------------------------------------------------------------- */
/* Charts                                                                */
/* --------------------------------------------------------------------- */

function ChartCell({
	title,
	hint,
	footer,
	children,
}: {
	title: string;
	hint?: string;
	footer?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 bg-[var(--ret-bg)] px-4 py-4">
			<div className="flex items-baseline justify-between gap-2">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</p>
				{hint ? (
					<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{hint}
					</p>
				) : null}
			</div>
			<div className="h-[160px] w-full">{children}</div>
			{footer ? <div className="flex flex-wrap gap-3">{footer}</div> : null}
		</div>
	);
}

function LatencyChart({
	history,
	stats,
}: {
	history: LatencySample[];
	stats: { min: number; max: number; avg: number; last: number };
}) {
	const data = history.map((s, idx) => ({ idx, ms: s.ms }));
	return (
		<ChartCell
			title="gateway latency (ms)"
			hint={`${history.length}/${HISTORY_MAX} samples`}
			footer={
				<>
					<Stat label="last" value={`${stats.last} ms`} />
					<Stat label="avg" value={`${stats.avg} ms`} />
					<Stat label="min" value={`${stats.min} ms`} />
					<Stat label="max" value={`${stats.max} ms`} />
				</>
			}
		>
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
					<defs>
						<linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="var(--ret-purple)" stopOpacity={0.45} />
							<stop offset="100%" stopColor="var(--ret-purple)" stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid stroke="var(--ret-grid)" vertical={false} />
					<XAxis
						dataKey="idx"
						tick={false}
						stroke="var(--ret-border)"
						axisLine={{ stroke: "var(--ret-border)" }}
					/>
					<YAxis
						tick={{
							fill: "var(--ret-text-muted)",
							fontFamily: "var(--font-mono)",
							fontSize: 10,
						}}
						width={32}
						stroke="var(--ret-border)"
						axisLine={false}
						tickLine={false}
					/>
					<Tooltip
						contentStyle={{
							background: "var(--ret-bg)",
							border: "1px solid var(--ret-border)",
							borderRadius: 0,
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							color: "var(--ret-text)",
						}}
						formatter={(v) => [`${v} ms`, "latency"]}
						labelFormatter={(idx) => `sample ${String(idx)}`}
					/>
					<Area
						type="monotone"
						dataKey="ms"
						stroke="var(--ret-purple)"
						strokeWidth={1.5}
						fill="url(#latencyFill)"
						isAnimationActive={false}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</ChartCell>
	);
}

function LogRateChart({
	buckets,
	bucketMs,
}: {
	buckets: BucketRow[];
	bucketMs: number;
}) {
	return (
		<ChartCell
			title={`logs / ${Math.round(bucketMs / 1000)}s window`}
			hint={`${buckets.reduce((sum, b) => sum + b.info + b.warn + b.error + b.debug + b.other, 0)} lines`}
			footer={
				<>
					<LegendChip color={LEVEL_COLORS.info} label="info" />
					<LegendChip color={LEVEL_COLORS.warn} label="warn" />
					<LegendChip color={LEVEL_COLORS.error} label="error" />
				</>
			}
		>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart
					data={buckets}
					margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
					barCategoryGap={2}
				>
					<CartesianGrid stroke="var(--ret-grid)" vertical={false} />
					<XAxis
						dataKey="bucketLabel"
						tick={{
							fill: "var(--ret-text-muted)",
							fontFamily: "var(--font-mono)",
							fontSize: 9,
						}}
						stroke="var(--ret-border)"
						axisLine={{ stroke: "var(--ret-border)" }}
						interval="preserveStartEnd"
					/>
					<YAxis
						tick={{
							fill: "var(--ret-text-muted)",
							fontFamily: "var(--font-mono)",
							fontSize: 10,
						}}
						width={32}
						stroke="var(--ret-border)"
						axisLine={false}
						tickLine={false}
						allowDecimals={false}
					/>
					<Tooltip
						cursor={{ fill: "var(--ret-purple-glow)" }}
						contentStyle={{
							background: "var(--ret-bg)",
							border: "1px solid var(--ret-border)",
							borderRadius: 0,
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							color: "var(--ret-text)",
						}}
					/>
					<Bar
						dataKey="info"
						stackId="lvl"
						fill={LEVEL_COLORS.info}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="warn"
						stackId="lvl"
						fill={LEVEL_COLORS.warn}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="error"
						stackId="lvl"
						fill={LEVEL_COLORS.error}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="debug"
						stackId="lvl"
						fill={LEVEL_COLORS.debug}
						isAnimationActive={false}
					/>
				</BarChart>
			</ResponsiveContainer>
		</ChartCell>
	);
}

function AgentBreakdownChart({ slices }: { slices: PieSlice[] }) {
	const total = slices.reduce((sum, s) => sum + s.value, 0);
	if (total === 0) {
		return (
			<ChartCell title="logs by agent" hint="no data">
				<div className="flex h-full items-center justify-center font-mono text-[11px] text-[var(--ret-text-muted)]">
					waiting for log lines
				</div>
			</ChartCell>
		);
	}
	return (
		<ChartCell
			title="logs by agent"
			hint={`${total} lines`}
			footer={slices.map((s) => (
				<LegendChip key={s.name} color={s.color} label={`${s.name} . ${s.value}`} />
			))}
		>
			<ResponsiveContainer width="100%" height="100%">
				<PieChart>
					<Tooltip
						contentStyle={{
							background: "var(--ret-bg)",
							border: "1px solid var(--ret-border)",
							borderRadius: 0,
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							color: "var(--ret-text)",
						}}
					/>
					<Pie
						data={slices}
						dataKey="value"
						nameKey="name"
						cx="50%"
						cy="50%"
						innerRadius={32}
						outerRadius={62}
						paddingAngle={2}
						isAnimationActive={false}
					>
						{slices.map((slice) => (
							<Cell
								key={slice.name}
								fill={slice.color}
								stroke="var(--ret-bg)"
								strokeWidth={2}
							/>
						))}
					</Pie>
					<Legend
						wrapperStyle={{ display: "none" }}
					/>
				</PieChart>
			</ResponsiveContainer>
		</ChartCell>
	);
}

/* --------------------------------------------------------------------- */
/* Helpers                                                               */
/* --------------------------------------------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
			<span>{label}</span>
			<span className="text-[var(--ret-text)] tracking-tight">{value}</span>
		</div>
	);
}

function LegendChip({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
			<span
				aria-hidden="true"
				className="inline-block h-2 w-2"
				style={{ background: color }}
			/>
			{label}
		</span>
	);
}

function stats(history: LatencySample[]) {
	if (history.length === 0) {
		return { min: 0, max: 0, avg: 0, last: 0 };
	}
	const xs = history.map((s) => s.ms);
	const min = Math.round(Math.min(...xs));
	const max = Math.round(Math.max(...xs));
	const avg = Math.round(xs.reduce((sum, n) => sum + n, 0) / xs.length);
	const last = Math.round(xs.at(-1) ?? 0);
	return { min, max, avg, last };
}

type BucketRow = {
	bucketLabel: string;
	info: number;
	warn: number;
	error: number;
	debug: number;
	other: number;
};

function bucketLogs(
	lines: LogLine[],
	bucketCount: number,
	bucketMs: number,
): BucketRow[] {
	const now = Date.now();
	const buckets: BucketRow[] = [];
	for (let i = bucketCount - 1; i >= 0; i--) {
		const start = now - (i + 1) * bucketMs;
		buckets.push({
			bucketLabel: `-${(i + 1) * Math.round(bucketMs / 1000)}s`,
			info: 0,
			warn: 0,
			error: 0,
			debug: 0,
			other: 0,
		});
		void start;
	}
	for (const line of lines) {
		const ts = parseTimestamp(line.at);
		if (ts === null) continue;
		const ageMs = now - ts;
		if (ageMs < 0 || ageMs >= bucketCount * bucketMs) continue;
		const bucketIdx = bucketCount - 1 - Math.floor(ageMs / bucketMs);
		const bucket = buckets[bucketIdx];
		if (!bucket) continue;
		bucket[line.level] = (bucket[line.level] ?? 0) + 1;
	}
	return buckets;
}

function parseTimestamp(at: string | null): number | null {
	if (!at) return null;
	const ts = Date.parse(at);
	return Number.isFinite(ts) ? ts : null;
}

type PieSlice = { name: string; value: number; color: string };

function agentBreakdown(lines: LogLine[]): PieSlice[] {
	const counts = new Map<string, number>();
	for (const line of lines) {
		// Source from the API is either "hermes" or "openclaw" once
		// we tail both runtimes; older payloads might say
		// "gateway.log" so we fall back to "hermes" which was the
		// only source pre-multi-agent.
		const source =
			line.source === "openclaw"
				? "openclaw"
				: line.source === "hermes"
					? "hermes"
					: "hermes";
		counts.set(source, (counts.get(source) ?? 0) + 1);
	}
	return Array.from(counts.entries()).map(([name, value]) => ({
		name,
		value,
		color: AGENT_COLORS[name] ?? "var(--ret-text-muted)",
	}));
}
