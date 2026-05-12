"use client";

import { useEffect, useMemo, useState } from "react";

import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ToolIcon } from "@/components/ToolIcon";
import { WingBackground } from "@/components/WingBackground";
import { cn } from "@/lib/cn";

/**
 * Visualization-first card grid. Loosely modeled on chanhdai's
 * showcase + Tailwind's marketing cards: each cell is dominated by
 * a tiny live visualization (sparkline / bar / dial / chip stack),
 * with a one-word label and a single line of supporting text. Text
 * never crowds the visualization.
 *
 * All cells share a `RuntimeCard` shell (hairline border + ~12px
 * padding + tight gap rhythm), so the grid reads as one tight band
 * of dense, varied data.
 */

type Lcp = "good" | "ok" | "bad";

function pickLcp(latency: number): Lcp {
	if (latency < 600) return "good";
	if (latency < 1200) return "ok";
	return "bad";
}

const LCP_COLOR: Record<Lcp, string> = {
	good: "var(--ret-green)",
	ok: "var(--ret-amber)",
	bad: "var(--ret-red)",
};

export function RuntimeVizGrid() {
	return (
		<>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<ReticleLabel>RUNTIME -- LIVE</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						What you watch on the dashboard.
					</h2>
				</div>
				<p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] md:block">
					6 panels . live every 5s
				</p>
			</div>

			<div className="mt-5 grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-2 lg:grid-cols-3">
				<RuntimeCard
					icon="filesystem"
					label="disk"
					hint="/home/machine . persists"
					footer="2.1 GiB used . 7.9 GiB free"
					variant="nyx-lines"
				>
					<DiskBar usedPct={21} segments={SEGMENTS} />
				</RuntimeCard>

				<RuntimeCard
					icon="schedule"
					label="latency"
					hint="last 32 chat completions"
					footer="p50 412ms . p95 1.3s"
					variant="nyx-waves"
				>
					<Sparkline points={LATENCY_POINTS} />
				</RuntimeCard>

				<RuntimeCard
					icon="memory"
					label="awake"
					hint="last 24h . second-billed"
					footer="3 wakes . 19m awake"
					variant="cloud"
				>
					<AwakeStrip cells={AWAKE_24H} />
				</RuntimeCard>

				<RuntimeCard
					icon="code"
					label="tokens"
					hint="this conversation"
					footer="prompt 1.2k . completion 3.1k"
				>
					<StackedBar segments={TOKEN_SEGMENTS} />
				</RuntimeCard>

				<RuntimeCard
					icon="memory"
					label="loaded"
					hint="skills active in context"
					footer="6 of 96 . by intent match"
				>
					<ChipStack chips={SKILL_CHIPS} />
				</RuntimeCard>

				<RuntimeCard
					icon="schedule"
					label="next cron"
					hint="weekly-skill-audit"
					footer="fires in 3d 04:00 utc"
				>
					<Dial fraction={0.31} />
				</RuntimeCard>
			</div>

			<p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				every panel above is rendered from the same /api endpoints the
				dashboard polls
			</p>
		</>
	);
}

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

type RuntimeCardProps = {
	icon: React.ComponentProps<typeof ToolIcon>["name"];
	label: string;
	hint: string;
	footer: string;
	variant?: "cloud" | "nyx-lines" | "nyx-waves";
	children: React.ReactNode;
};

function RuntimeCard({ icon, label, hint, footer, variant, children }: RuntimeCardProps) {
	return (
		<div className="relative flex flex-col overflow-hidden bg-[var(--ret-bg)]">
			{variant ? (
				<>
					<WingBackground
						variant={variant}
						opacity={{ light: 0.14, dark: 0.28 }}
						fadeEdges
					/>
					<div className="ret-material-field absolute inset-0 opacity-35" aria-hidden="true" />
				</>
			) : null}
			<div className="relative z-10 flex items-center gap-2 border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/82 px-3 py-2 backdrop-blur-sm">
				<ToolIcon
					name={icon}
					size={12}
					className="text-[var(--ret-text-muted)]"
				/>
				<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text)]">
					{label}
				</span>
				<span className="ml-auto truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
					{hint}
				</span>
			</div>
			<div className="relative z-10 flex min-h-[110px] items-center justify-center px-3 py-3">
				{children}
			</div>
			<div className="relative z-10 border-t border-[var(--ret-border)] bg-[var(--ret-bg)]/82 px-3 py-1.5 font-mono text-[10px] tabular-nums text-[var(--ret-text-dim)] backdrop-blur-sm">
				{footer}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Visualizations                                                      */
/* ------------------------------------------------------------------ */

const SEGMENTS: ReadonlyArray<{ pct: number; label: string }> = [
	{ pct: 8, label: "skills" },
	{ pct: 5, label: "venv" },
	{ pct: 4, label: "chats" },
	{ pct: 2, label: "artifacts" },
	{ pct: 1, label: "memory" },
	{ pct: 1, label: "cron" },
];

function DiskBar({
	segments,
}: {
	usedPct: number;
	segments: ReadonlyArray<{ pct: number; label: string }>;
}) {
	const colors = [
		"var(--ret-purple)",
		"#9aa6c4",
		"#c9b48a",
		"var(--ret-amber)",
		"var(--ret-green)",
		"#e8e6dc",
	];
	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex h-3 w-full overflow-hidden border border-[var(--ret-border)]">
				{segments.map((s, i) => (
					<div
						key={s.label}
						className="h-full"
						style={{
							width: `${s.pct}%`,
							background: colors[i % colors.length],
						}}
						title={`${s.label} ${s.pct}%`}
					/>
				))}
				<div
					className="h-full flex-1"
					style={{ background: "var(--ret-bg-soft)" }}
				/>
			</div>
			<div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
				{segments.map((s, i) => (
					<span key={s.label} className="inline-flex items-center gap-1">
						<span
							className="h-1.5 w-1.5"
							style={{ background: colors[i % colors.length] }}
						/>
						{s.label}
					</span>
				))}
			</div>
		</div>
	);
}

const LATENCY_POINTS: ReadonlyArray<number> = [
	520, 480, 612, 540, 380, 460, 720, 650, 540, 410, 380, 470, 690, 740, 510,
	430, 380, 410, 520, 580, 700, 850, 720, 540, 460, 420, 390, 480, 540, 620,
	560, 470,
];

function Sparkline({ points }: { points: ReadonlyArray<number> }) {
	const max = Math.max(...points);
	const min = Math.min(...points);
	const range = Math.max(1, max - min);
	const w = 100;
	const h = 60;
	const last = points[points.length - 1] ?? 0;
	const lcp = pickLcp(last);
	const stroke = LCP_COLOR[lcp];
	const path = points
		.map((p, i) => {
			const x = (i / (points.length - 1)) * w;
			const y = h - ((p - min) / range) * h;
			return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	const lastX = w;
	const lastY = h - ((last - min) / range) * h;
	return (
		<svg
			viewBox={`0 -2 ${w} ${h + 4}`}
			className="h-[80px] w-full"
			preserveAspectRatio="none"
		>
			<defs>
				<linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
					<stop offset="100%" stopColor={stroke} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#spark-fill)" />
			<path
				d={path}
				fill="none"
				stroke={stroke}
				strokeWidth="1.4"
				vectorEffect="non-scaling-stroke"
			/>
			<circle cx={lastX} cy={lastY} r="1.6" fill={stroke} />
		</svg>
	);
}

const AWAKE_24H: ReadonlyArray<0 | 1> = (() => {
	const arr: Array<0 | 1> = [];
	for (let i = 0; i < 96; i++) {
		// 96 quarter-hours in 24h. Three awake bursts.
		const inA = i >= 12 && i < 18;
		const inB = i >= 38 && i < 47;
		const inC = i >= 70 && i < 80;
		arr.push(inA || inB || inC ? 1 : 0);
	}
	return arr;
})();

function AwakeStrip({ cells }: { cells: ReadonlyArray<0 | 1> }) {
	return (
		<div className="flex w-full flex-col gap-2">
			<div
				className="grid h-4 w-full overflow-hidden border border-[var(--ret-border)]"
				style={{
					gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
				}}
			>
				{cells.map((on, i) => (
					<div
						key={i}
						className="h-full"
						style={{
							background: on ? "var(--ret-purple)" : "transparent",
							opacity: on ? 0.7 : 1,
						}}
					/>
				))}
			</div>
			<div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
				<span>00:00</span>
				<span>06:00</span>
				<span>12:00</span>
				<span>18:00</span>
				<span>now</span>
			</div>
		</div>
	);
}

const TOKEN_SEGMENTS: ReadonlyArray<{ pct: number; label: string; color: string }> =
	[
		{ pct: 28, label: "system", color: "#9aa6c4" },
		{ pct: 12, label: "user", color: "var(--ret-purple)" },
		{ pct: 60, label: "assistant", color: "var(--ret-amber)" },
	];

function StackedBar({
	segments,
}: {
	segments: ReadonlyArray<{ pct: number; label: string; color: string }>;
}) {
	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex h-3 w-full overflow-hidden border border-[var(--ret-border)]">
				{segments.map((s) => (
					<div
						key={s.label}
						style={{ width: `${s.pct}%`, background: s.color }}
						className="h-full"
						title={`${s.label} ${s.pct}%`}
					/>
				))}
			</div>
			<div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
				{segments.map((s) => (
					<span key={s.label} className="inline-flex items-center gap-1">
						<span className="h-1.5 w-1.5" style={{ background: s.color }} />
						{s.label}
					</span>
				))}
			</div>
		</div>
	);
}

const SKILL_CHIPS: ReadonlyArray<string> = [
	"agent-ethos",
	"empirical-verification",
	"taste-output",
	"reticle-design-system",
	"vercel-react-best-practices",
	"counterfactual",
];

function ChipStack({ chips }: { chips: ReadonlyArray<string> }) {
	return (
		<div className="flex w-full flex-wrap gap-1.5">
			{chips.map((c) => (
				<span
					key={c}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ret-text-dim)]"
				>
					{c}
				</span>
			))}
		</div>
	);
}

function Dial({ fraction }: { fraction: number }) {
	// Animate the dial sweep on mount so the card has a tiny moment of
	// motion -- enough to read as "live" without being a constantly
	// running element that competes for attention.
	const [t, setT] = useState(0);
	useEffect(() => {
		let raf = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(1, (now - start) / 800);
			setT(dt);
			if (dt < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);
	const angle = useMemo(() => -Math.PI / 2 + t * fraction * 2 * Math.PI, [
		t,
		fraction,
	]);
	const r = 28;
	const cx = 36;
	const cy = 36;
	const x = cx + r * Math.cos(angle);
	const y = cy + r * Math.sin(angle);
	const large = fraction > 0.5 ? 1 : 0;
	const start = `M ${cx} ${cy - r}`;
	const arc = `A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
	return (
		<div className="flex items-center gap-3">
			<svg
				width="72"
				height="72"
				viewBox="0 0 72 72"
				className="shrink-0"
			>
				<circle
					cx={cx}
					cy={cy}
					r={r}
					fill="none"
					stroke="var(--ret-border)"
					strokeWidth="1"
				/>
				<path
					d={`${start} ${arc}`}
					fill="none"
					stroke="var(--ret-purple)"
					strokeWidth="2"
					strokeLinecap="square"
				/>
				<circle cx={cx} cy={cy} r="1.5" fill="var(--ret-text-muted)" />
			</svg>
			<div className="flex flex-col font-mono text-[10px] tabular-nums">
				<span className="text-base text-[var(--ret-text)]">3d 04h</span>
				<span className="text-[var(--ret-text-muted)]">until next fire</span>
			</div>
		</div>
	);
}

void cn;
