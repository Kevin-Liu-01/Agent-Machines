"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useRef, useState, type SVGProps } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { type HeroAgent } from "@/components/HeroAgentPortrait";
import { Logo, type CompositeMark } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

/* ── 3D scenes (lazy) ── */

const HeroOrbitScene = dynamic(
	() => import("@/components/three").then((m) => m.HeroOrbit),
	{ ssr: false, loading: () => null },
);
const WireframeLoadoutScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeLoadout),
	{ ssr: false, loading: () => null },
);
const WireframeHostsScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeHosts),
	{ ssr: false, loading: () => null },
);
const WireframeEnvironmentScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeEnvironment),
	{ ssr: false, loading: () => null },
);
const WireframeDashboardScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeDashboard),
	{ ssr: false, loading: () => null },
);

/* ── Agent metadata ── */

const AGENT_WORD: Record<HeroAgent, string> = {
	hermes: "Persistent",
	openclaw: "Autonomous",
	"claude-code": "Stateful",
	codex: "Sandboxed",
};

const AGENT_CAPABILITIES: Record<HeroAgent, string[]> = {
	hermes: ["memory", "cron", "sessions", "MCP-native"],
	openclaw: ["computer use", "browser", "shell", "vision"],
	"claude-code": ["agentic coding", "file edit", "shell", "SDK"],
	codex: ["agentic coding", "sandbox", "exec mode"],
};

const AGENT_HUE: Record<HeroAgent, string> = {
	hermes: "#7c8cf8",
	openclaw: "#e5443b",
	"claude-code": "#d4a574",
	codex: "#4ae0a0",
};

const AGENT_MARK: Record<HeroAgent, CompositeMark> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "anthropic",
	codex: "openai",
};

const AGENT_LABEL: Record<HeroAgent, string> = {
	hermes: "Hermes",
	openclaw: "OpenClaw",
	"claude-code": "Claude Code",
	codex: "Codex CLI",
};

/* ── Animated heading word (typewriter delete + retype with per-char animation) ── */

type TypePhase = "idle" | "deleting" | "pause" | "typing";

function AnimatedWord({ word, hue }: { word: string; hue: string }) {
	const [displayed, setDisplayed] = useState(word);
	const [charCount, setCharCount] = useState(word.length);
	const [phase, setPhase] = useState<TypePhase>("idle");
	const [charTimestamps, setCharTimestamps] = useState<number[]>(
		() => Array.from({ length: word.length }, () => 0),
	);
	const gen = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout>>(null);
	const phaseRef = useRef<TypePhase>("idle");
	const charCountRef = useRef(word.length);

	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		gen.current += 1;
		const myGen = gen.current;

		if (word === displayed && phaseRef.current === "idle") return;

		phaseRef.current = "deleting";
		setPhase("deleting");

		function stale() {
			return myGen !== gen.current;
		}

		function scheduleNext(ms: number) {
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(tick, ms);
		}

		scheduleNext(60);

		function tick() {
			if (stale()) return;

			if (phaseRef.current === "deleting") {
				const c = charCountRef.current;
				if (c <= 0) {
					phaseRef.current = "pause";
					setPhase("pause");
					setDisplayed(word);
					scheduleNext(280);
					return;
				}
				const next = c - 1;
				charCountRef.current = next;
				setCharCount(next);
				scheduleNext(30 + Math.max(0, next - 2) * 6);
			} else if (phaseRef.current === "pause") {
				if (stale()) return;
				phaseRef.current = "typing";
				setPhase("typing");
				setCharTimestamps([]);
				scheduleNext(60);
			} else if (phaseRef.current === "typing") {
				const c = charCountRef.current;
				if (c >= word.length) {
					phaseRef.current = "idle";
					setPhase("idle");
					return;
				}
				const next = c + 1;
				charCountRef.current = next;
				setCharCount(next);
				setCharTimestamps((ts) => [...ts, performance.now()]);
				const progress = c / Math.max(word.length - 1, 1);
				const base = 70;
				const ease = progress < 0.2
					? base + (1 - progress / 0.2) * 60
					: progress > 0.85
						? base + ((progress - 0.85) / 0.15) * 40
						: base;
				scheduleNext(ease + Math.random() * 35);
			}
		}

		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [word, displayed]);

	useEffect(() => {
		function onVisibilityChange() {
			if (document.visibilityState !== "visible") return;
			if (phaseRef.current === "idle" || phaseRef.current === "pause") return;
			if (timer.current) clearTimeout(timer.current);
			const myGen = gen.current;
			timer.current = setTimeout(() => {
				if (myGen !== gen.current) return;
				if (phaseRef.current === "deleting") {
					const next = Math.max(charCountRef.current - 1, 0);
					charCountRef.current = next;
					setCharCount(next);
				} else if (phaseRef.current === "typing") {
					const next = Math.min(charCountRef.current + 1, displayed.length);
					charCountRef.current = next;
					setCharCount(next);
				}
			}, 50);
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => document.removeEventListener("visibilitychange", onVisibilityChange);
	}, [displayed]);

	const now = typeof performance !== "undefined" ? performance.now() : 0;

	return (
		<span className="inline" style={{ color: hue }}>
			{displayed.slice(0, charCount).split("").map((ch, i) => {
				const ts = charTimestamps[i];
				const age = ts ? now - ts : 1000;
				const entering = phase === "typing" && age < 200;
				return (
					<span
						key={`${displayed}-${i}`}
						style={{
							display: "inline-block",
							transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease-out",
							transform: entering ? "translateY(0.06em)" : "translateY(0)",
							opacity: entering ? 0.6 : 1,
							whiteSpace: ch === " " ? "pre" : undefined,
						}}
					>
						{ch}
					</span>
				);
			})}
			<span
				className="inline-block w-[0.05em] align-baseline"
				style={{
					height: "0.85em",
					background: hue,
					marginLeft: "1px",
					opacity: phase === "idle" ? 0 : 1,
					animation: phase === "pause" ? "ret-caret 1s steps(1) infinite" : "none",
				}}
			/>
		</span>
	);
}

/* ── Grid cell with hover visuals ── */

type CellAgent = {
	mark: CompositeMark;
	label: string;
	hue: string;
};

const CELL_AGENTS: CellAgent[] = [
	{ mark: "nous", label: "Hermes", hue: "#7c8cf8" },
	{ mark: "openclaw", label: "OpenClaw", hue: "#e5443b" },
	{ mark: "anthropic", label: "Claude", hue: "#d4a574" },
	{ mark: "openai", label: "Codex", hue: "#4ae0a0" },
	{ mark: "cursor", label: "Cursor", hue: "#f5c542" },
];

function Cell({
	action,
	agent,
	hue,
	children,
	className,
	hoverVisual,
	noLabel,
	cellAgent,
	tool,
	toolIcon,
	serviceIcon,
}: {
	action: string;
	agent: HeroAgent;
	hue: string;
	children?: ReactNode;
	className?: string;
	hoverVisual?: ReactNode;
	noLabel?: boolean;
	cellAgent?: CellAgent;
	tool?: string;
	toolIcon?: React.ComponentProps<typeof ToolIcon>["name"];
	serviceIcon?: React.ComponentProps<typeof ServiceIcon>["slug"];
}) {
	const ca = cellAgent ?? CELL_AGENTS[0];
	return (
		<div
			className={`group/cell relative border-b border-r border-[var(--ret-border)] transition-colors duration-200 ${className ?? ""}`}
		>
			{children}
			<div className="pointer-events-none absolute inset-[6px] z-20 rounded-lg opacity-0 transition-opacity duration-200 group-hover/cell:opacity-100" style={{ background: `${ca.hue}0a` }}>
				{hoverVisual && (
					<div className="absolute inset-0 overflow-hidden rounded-lg">
						{hoverVisual}
					</div>
				)}
				{!noLabel && (
					<>
						<span
							className="absolute right-1.5 top-1.5 h-1 w-1 animate-pulse rounded-full"
							style={{ background: ca.hue, boxShadow: `0 0 4px ${ca.hue}` }}
						/>
						<div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
							<Logo mark={ca.mark} size={14} />
							{serviceIcon && <ServiceIcon slug={serviceIcon} size={13} tone="mono" />}
							{toolIcon && <ToolIcon name={toolIcon} size={13} />}
						</div>
						<span
							className="absolute bottom-1.5 right-1.5 max-w-[60%] truncate text-right font-mono text-[8px] leading-tight"
							style={{ color: ca.hue }}
						>
							{action}
						</span>
					</>
				)}
			</div>
		</div>
	);
}

/* ── Hover visual primitives ── */

function HoverHatch({ color, angle = 135 }: { color: string; angle?: number }) {
	return (
		<div
			className="absolute inset-0"
			style={{
				backgroundImage: `repeating-linear-gradient(${angle}deg, ${color}18 0 1px, transparent 1px 6px)`,
			}}
		/>
	);
}

function HoverGlow({ color }: { color: string }) {
	return (
		<div
			className="absolute inset-0"
			style={{
				background: `radial-gradient(circle at center, ${color}15 0%, transparent 70%)`,
			}}
		/>
	);
}

function HoverPulseGrid({ color }: { color: string }) {
	return (
		<div className="absolute inset-0 flex items-center justify-center">
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: `
						linear-gradient(${color}10 1px, transparent 1px),
						linear-gradient(90deg, ${color}10 1px, transparent 1px)
					`,
					backgroundSize: "12px 12px",
				}}
			/>
			<div
				className="h-3 w-3 animate-pulse rounded-full"
				style={{ background: color, boxShadow: `0 0 20px ${color}` }}
			/>
		</div>
	);
}

function HoverScene({ Scene }: { Scene: React.ComponentType<{ className?: string }> }) {
	return (
		<div className="absolute inset-0">
			<Scene className="h-full w-full" />
		</div>
	);
}

function HoverGradient({ color }: { color: string }) {
	return (
		<div
			className="absolute inset-0"
			style={{ background: `linear-gradient(135deg, ${color}0c 0%, transparent 60%)` }}
		/>
	);
}

/* ── Agent rail cell for column 1 ── */

const RAIL_AGENTS: ReadonlyArray<{
	mark: CompositeMark;
	label: string;
	id: HeroAgent | null;
	word: string;
}> = [
	{ mark: "nous", label: "Hermes", id: "hermes", word: "Persistent" },
	{ mark: "openclaw", label: "OpenClaw", id: "openclaw", word: "Autonomous" },
	{ mark: "anthropic", label: "Claude", id: "claude-code", word: "Stateful" },
	{ mark: "openai", label: "Codex", id: "codex", word: "Sandboxed" },
	{ mark: "cursor", label: "Cursor", id: null, word: "Integrated" },
];

function agentRailCell(
	agentId: HeroAgent | null,
	row: number,
	activeAgent: HeroAgent,
	setAgent: (a: HeroAgent) => void,
) {
	const railAgent = agentId !== null
		? RAIL_AGENTS.find((a) => a.id === agentId)!
		: RAIL_AGENTS[4];
	const isSelectable = railAgent.id !== null;
	const active = isSelectable && activeAgent === railAgent.id;
	const agentHue = railAgent.id ? AGENT_HUE[railAgent.id] : "var(--ret-purple)";

	return (
		<button
			key={`rail-${row}`}
			type="button"
			onClick={() => isSelectable && railAgent.id && setAgent(railAgent.id)}
			className="hidden cursor-pointer border-b border-r border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)] md:flex md:flex-col md:items-center md:justify-center md:gap-1 md:px-3 md:py-3"
			style={{
				borderLeft: active ? `2px solid ${agentHue}` : "2px solid transparent",
				gridColumn: "1",
				gridRow: `${row}`,
			}}
		>
			<Logo mark={railAgent.mark} size={16} />
			<span
				className="text-[8px] font-medium"
				style={{ color: active ? "var(--ret-text)" : "var(--ret-text-muted)" }}
			>
				{railAgent.label}
			</span>
			{isSelectable && (
				<span
					className="h-1 w-1 rounded-full transition-opacity"
					style={{ background: agentHue, opacity: active ? 1 : 0.15 }}
				/>
			)}
		</button>
	);
}

/* ── Main component ── */

const ALL_WORDS = RAIL_AGENTS.map((a) => a.word);

export function HeroBlock() {
	const [agent, setAgent] = useState<HeroAgent>("hermes");
	const [wordIndex, setWordIndex] = useState(0);
	const activeWord = ALL_WORDS[wordIndex];
	const activeRail = RAIL_AGENTS[wordIndex];
	const isCursor = activeRail.id === null;
	const capabilities = isCursor ? ["IDE", "rules", "MCP", "agents"] : AGENT_CAPABILITIES[agent];
	const hue = isCursor ? "var(--ret-purple)" : AGENT_HUE[agent];
	const orbitAgent = isCursor ? null : agent;

	const cycleTimer = useRef<ReturnType<typeof setTimeout>>(null);

	function scheduleCycle() {
		if (cycleTimer.current) clearTimeout(cycleTimer.current);
		cycleTimer.current = setTimeout(() => {
			setWordIndex((cur) => {
				const next = (cur + 1) % RAIL_AGENTS.length;
				const rail = RAIL_AGENTS[next];
				if (rail.id) setAgent(rail.id);
				return next;
			});
			scheduleCycle();
		}, 6000);
	}

	function selectRailIndex(idx: number) {
		setWordIndex(idx);
		const rail = RAIL_AGENTS[idx];
		if (rail.id) setAgent(rail.id);
		scheduleCycle();
	}

	useEffect(() => {
		scheduleCycle();
		return () => {
			if (cycleTimer.current) clearTimeout(cycleTimer.current);
		};
	}, []);

	return (
		<div className="relative">
			{/* ── Announcement banner ── */}
			<a
				href="/dashboard/setup"
				className="bg-[var(--ret-bg-soft)] group/banner relative flex items-center gap-3 border-b border-[var(--ret-border)] px-5 py-2.5 transition-colors hover:bg-[var(--ret-surface)]"
			>
				{/* Corner crosshair marks */}
				<span className="pointer-events-none absolute left-1.5 top-1.5 h-1.5 w-1.5 border-l border-t border-[var(--ret-cross)] opacity-40" />
				<span className="pointer-events-none absolute bottom-1.5 left-1.5 h-1.5 w-1.5 border-b border-l border-[var(--ret-cross)] opacity-40" />
				<span className="pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 border-r border-t border-[var(--ret-cross)] opacity-40" />
				<span className="pointer-events-none absolute bottom-1.5 right-1.5 h-1.5 w-1.5 border-b border-r border-[var(--ret-cross)] opacity-40" />

				<svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-[var(--ret-purple)]" aria-hidden>
					<path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.5 3.5l2.5 2.5M10 10l2.5 2.5M12.5 3.5L10 6M6 10l-2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
					<circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.5" />
				</svg>
				<span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Route <span className="text-[var(--ret-purple)]">E2B · Sprites · Dedalus</span>
				</span>

				<span className="hidden text-[10px] text-[var(--ret-text-dim)] sm:inline">
					OpenRouter for agents and containers
				</span>

				<span className="ml-auto flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)] opacity-60 transition-opacity group-hover/banner:opacity-100">
					/dashboard/setup
					<IconArrowRight className="h-2.5 w-2.5 transition-transform group-hover/banner:translate-x-0.5" />
				</span>
			</a>

			{/* ── Single unified grid: col 1 = rail, cols 2-8 = content ── */}
			<div className="grid grid-cols-4 auto-rows-auto md:grid-cols-[4.5rem_repeat(7,1fr)_4.5rem]">

				{/* ═══ Row 1: Automation tools | Kicker + empty ═══ */}
				<Cell action="" agent={agent} hue={hue} className="hidden !border-b-0 md:flex md:items-center md:justify-center" hoverVisual={<HoverGlow color={hue} />} noLabel>
					<div className="flex flex-col items-center gap-1.5 px-3 py-3">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">Automate</span>
						<div className="grid grid-cols-2 gap-1">
							<ServiceIcon slug="vercel" size={12} tone="mono" />
							<ServiceIcon slug="github" size={12} tone="mono" />
							<ServiceIcon slug="slack" size={12} tone="mono" />
							<ServiceIcon slug="linear" size={12} tone="mono" />
						</div>
					</div>
				</Cell>
				<Cell action="reading project metadata..." agent={agent} hue={hue} className="col-span-3 !border-b-0 flex items-center" hoverVisual={<HoverGradient color={hue} />}>
					<div className="flex flex-wrap items-center gap-2 px-5 py-4">
						<ReticleLabel>DEVELOPED BY</ReticleLabel>
						<a
							href="https://kevin-liu.tech"
							target="_blank"
							rel="noreferrer"
							className="inline-flex transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]"
						>
							<ReticleBadge variant="accent">KEVIN LIU</ReticleBadge>
						</a>
					</div>
				</Cell>
				<Cell action="git push origin main" agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverHatch color={hue} />} cellAgent={CELL_AGENTS[2]} toolIcon="shell">
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="reviewing PR #412" agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverPulseGrid color={hue} />} cellAgent={CELL_AGENTS[3]} serviceIcon="github">
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
			<Cell action="checking version..." agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverGlow color={hue} />}>
				<div className="flex h-full items-center justify-center gap-1.5 px-2 py-3">
						<span className="text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">VER</span>
						<span className="font-mono text-[9px] text-[var(--ret-text-dim)]">0.1.0</span>
					</div>
				</Cell>
				<Cell action="polling status..." agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverHatch color={hue} angle={45} />}>
				<div className="flex h-full items-center justify-center gap-1.5 px-2 py-3">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ret-green)]" />
						<ReticleBadge variant="success" className="!py-0 !text-[7px]">LIVE</ReticleBadge>
					</div>
				</Cell>
				<Cell action="" agent={agent} hue={hue} className="hidden !border-b-0 !border-r-0 md:block" hoverVisual={<HoverScene Scene={WireframeLoadoutScene} />} noLabel>
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>

				{/* ═══ Rows 2-3: agents | heading | 3D | empty ═══ */}
				<div className="hidden border-r border-[var(--ret-border)] md:block md:row-span-2">
					<div className="flex h-full flex-col gap-1.5 p-1.5">
						{RAIL_AGENTS.map((a, idx) => {
							const active = wordIndex === idx;
							const agentHue = a.id ? AGENT_HUE[a.id] : "var(--ret-purple)";
							return (
								<button
									key={a.label}
									type="button"
									onClick={() => selectRailIndex(idx)}
									className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--ret-border)] px-3 py-1 transition-all hover:bg-[var(--ret-surface)]"
									style={{
										borderColor: active ? agentHue : undefined,
										background: active ? `${agentHue}08` : undefined,
										boxShadow: active ? `0 0 12px ${agentHue}15` : undefined,
									}}
								>
									<Logo mark={a.mark} size={15} />
									<span
										className="text-[7px] font-medium"
										style={{ color: active ? "var(--ret-text)" : "var(--ret-text-muted)" }}
									>
										{a.label}
									</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* Heading card */}
				<Cell
					action="generating copy variant..."
					agent={agent} hue={hue}
					className="relative col-span-4 md:col-span-5 md:row-span-2 !border-t-0 !border-b-0"
					hoverVisual={<HoverGlow color={hue} />}
				>
					{/* Full-bleed top hairline */}
					<div
						className="pointer-events-none absolute top-0 z-30 h-px"
						style={{ left: "-50vw", width: "200vw", background: "var(--ret-border)" }}
					/>
					<div className="h-full p-1.5">
						<div className="h-full rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="py-8 md:py-14">
								<h1 className="ret-display text-[clamp(2rem,5.5vw,4.5rem)] leading-[0.95] tracking-tight">
									<span className="flex items-center whitespace-nowrap">
										<span className="h-px w-4 shrink-0 border-t border-dashed border-[var(--ret-border)] md:w-8" />
										<span className="px-3">OpenRouter</span>
										<span className="h-px flex-1 border-t border-dashed border-[var(--ret-border)]" />
									</span>
									<span className="flex items-center">
										<span className="h-px w-4 shrink-0 border-t border-dashed border-[var(--ret-border)] md:w-8" />
										<span className="px-3 text-[var(--ret-text-muted)]">
											for agents and containers.
										</span>
										<span className="h-px flex-1 border-t border-dashed border-[var(--ret-border)]" />
									</span>
								</h1>
							</div>
						</div>
					</div>
					{/* Full-bleed bottom hairline */}
					<div
						className="pointer-events-none absolute bottom-0 z-30 h-px"
						style={{ left: "-50vw", width: "200vw", background: "var(--ret-border)" }}
					/>
				</Cell>

				{/* 3D model card */}
				<Cell
					action="rendering wireframe..."
					agent={agent} hue={hue}
					className="hidden md:col-span-2 md:row-span-2 md:block !border-t-0 !border-b-0"
					hoverVisual={<HoverGlow color={hue} />}
					noLabel
				>
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
							<HeroOrbitScene className="h-full w-full" activeAgent={orbitAgent} />
							<span className="pointer-events-none absolute left-2 top-2 h-2 w-2 border-l border-t border-[var(--ret-cross)]" />
							<span className="pointer-events-none absolute right-2 top-2 h-2 w-2 border-r border-t border-[var(--ret-cross)]" />
							<span className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l border-[var(--ret-cross)]" />
							<span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 border-b border-r border-[var(--ret-cross)]" />
							<span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
								{AGENT_LABEL[agent]}
							</span>
						</div>
					</div>
				</Cell>
				{/* 2 cells to right of 3D model (one per grid row) */}
				<Cell action="" agent={agent} hue={hue} className="hidden md:block !border-t-0 !border-r-0" hoverVisual={<HoverScene Scene={WireframeHostsScene} />} noLabel>
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="" agent={agent} hue={hue} className="hidden md:block !border-b-0 !border-r-0" hoverVisual={<HoverScene Scene={WireframeEnvironmentScene} />} noLabel>
					<div className="h-full p-1.5">
						<div className="h-full rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-mid)]" />
					</div>
				</Cell>

				{/* ═══ Row 4: Code tools | Description + spec cells ═══ */}
				<Cell action="" agent={agent} hue={hue} className="hidden md:flex md:items-center md:justify-center" hoverVisual={<HoverHatch color={hue} angle={135} />} noLabel>
					<div className="flex flex-col items-center gap-1.5 px-3 py-3">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">Code</span>
						<div className="grid grid-cols-2 gap-1">
							<ServiceIcon slug="typescript" size={12} tone="mono" />
							<ServiceIcon slug="nextdotjs" size={12} tone="mono" />
							<ServiceIcon slug="tailwindcss" size={12} tone="mono" />
							<ServiceIcon slug="react" size={12} tone="mono" />
						</div>
					</div>
				</Cell>
				<Cell action="analyzing value proposition..." agent={agent} hue={hue} className="col-span-4" hoverVisual={<HoverGradient color={hue} />}>
					<div className="px-5 py-5">
						<p className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--ret-text-dim)]">
							Route runtime and substrate in one account.{" "}
							<strong className="text-[var(--ret-text)]">
								Deploy persistent agent workers — skills, MCP, cron, observation — and supervise your fleet from one dashboard.
							</strong>
						</p>
					</div>
				</Cell>
				<Cell action="provisioning VM..." agent={agent} hue={hue} className="hidden md:block" hoverVisual={<HoverGlow color={hue} />}>
					<div className="flex h-full flex-col items-center justify-center px-2 py-4">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">RUNTIME</span>
						<span className="mt-1 text-[13px] font-medium tabular-nums text-[var(--ret-text-dim)]">Linux VM</span>
					</div>
				</Cell>
				<Cell action="cold start benchmark..." agent={agent} hue={hue} className="hidden md:block" hoverVisual={<HoverPulseGrid color={hue} />}>
					<div className="flex h-full flex-col items-center justify-center px-2 py-4">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">BOOT</span>
						<span className="mt-1 text-[13px] font-medium tabular-nums text-[var(--ret-text-dim)]">~30s</span>
					</div>
				</Cell>
				<Cell action="mounting volumes..." agent={agent} hue={hue} className="hidden md:block" hoverVisual={<HoverHatch color={hue} angle={45} />}>
					<div className="flex h-full flex-col items-center justify-center px-2 py-4">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">PERSIST</span>
						<span className="mt-1 text-[13px] font-medium tabular-nums text-[var(--ret-text-dim)]">disk + mem</span>
					</div>
				</Cell>
				<Cell action="" agent={agent} hue={hue} className="hidden !border-r-0 md:block" hoverVisual={<HoverScene Scene={WireframeDashboardScene} />} noLabel>
					<div className="h-full p-1.5">
						<div className="h-full rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]" />
					</div>
				</Cell>

				{/* ═══ Row 5: Data tools | Capabilities + empty ═══ */}
				<Cell action="" agent={agent} hue={hue} className="hidden md:flex md:items-center md:justify-center" hoverVisual={<HoverGlow color={hue} />} noLabel>
					<div className="flex flex-col items-center gap-1.5 px-3 py-3">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">Data</span>
						<div className="grid grid-cols-2 gap-1">
							<ServiceIcon slug="supabase" size={12} tone="mono" />
							<ServiceIcon slug="neon" size={12} tone="mono" />
							<ServiceIcon slug="upstash" size={12} tone="mono" />
							<ServiceIcon slug="firebase" size={12} tone="mono" />
						</div>
					</div>
				</Cell>
				<Cell action="indexing tool capabilities..." agent={agent} hue={hue} className="col-span-3 flex items-center" hoverVisual={<HoverHatch color={hue} angle={90} />}>
					<div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
						{capabilities.map((cap) => (
							<span
								key={cap}
								className="inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)] transition-colors"
								style={{ borderColor: `${hue}33`, background: `${hue}08` }}
							>
								<span className="h-1 w-1 rounded-full" style={{ background: hue }} />
								{cap}
							</span>
						))}
					</div>
				</Cell>
				<Cell action="screenshot captured" agent={agent} hue={hue} hoverVisual={<HoverGlow color={hue} />} cellAgent={CELL_AGENTS[1]} toolIcon="vision">
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="navigating to form" agent={agent} hue={hue} className="hidden md:block" hoverVisual={<HoverScene Scene={WireframeHostsScene} />} cellAgent={CELL_AGENTS[1]} toolIcon="browser">
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="4,281 memories" agent={agent} hue={hue} className="hidden md:block" hoverVisual={<HoverHatch color={hue} angle={135} />} cellAgent={CELL_AGENTS[0]} toolIcon="memory">
					<div className="h-full p-1.5">
						<div className="h-full rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-mid)]" />
					</div>
				</Cell>
			<Cell action="cron: in 12m" agent={agent} hue={hue} className="hidden md:block" hoverVisual={<HoverScene Scene={WireframeEnvironmentScene} />} cellAgent={CELL_AGENTS[0]} toolIcon="schedule">
				<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="" agent={agent} hue={hue} className="hidden !border-r-0 md:block" hoverVisual={<HoverScene Scene={WireframeLoadoutScene} />} noLabel>
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>

				{/* ═══ Row 6: Observe tools | CTAs + empty ═══ */}
				<Cell action="" agent={agent} hue={hue} className="hidden !border-b-0 md:flex md:items-center md:justify-center" hoverVisual={<HoverGlow color={hue} />} noLabel>
					<div className="flex flex-col items-center gap-1.5 px-3 py-3">
						<span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">Observe</span>
						<div className="grid grid-cols-2 gap-1">
							<ServiceIcon slug="sentry" size={12} tone="mono" />
							<ServiceIcon slug="datadog" size={12} tone="mono" />
							<ServiceIcon slug="posthog" size={12} tone="mono" />
							<ServiceIcon slug="grafana" size={12} tone="mono" />
						</div>
					</div>
				</Cell>
				<Cell action="routing to dashboard..." agent={agent} hue={hue} className="col-span-3 !border-b-0" hoverVisual={<HoverGlow color={hue} />}>
					<div className="flex items-center gap-2.5 px-5 py-5">
						<SignedIn>
							<ReticleButton as="a" href="/dashboard" variant="primary" size="md">
								<IconArrowRight className="h-3.5 w-3.5" />
								Open dashboard
							</ReticleButton>
						</SignedIn>
						<SignedOut>
							<ReticleButton as="a" href="/sign-in" variant="primary" size="md">
								<IconArrowRight className="h-3.5 w-3.5" />
								Get started
							</ReticleButton>
						</SignedOut>
						<ReticleButton
							as="a"
							href="https://github.com/Kevin-Liu-01/agent-machines"
							target="_blank"
							variant="secondary"
							size="md"
						>
							<ServiceIcon slug="github" size={14} tone="mono" />
							GitHub
						</ReticleButton>
					</div>
				</Cell>
				<Cell action="sandbox: pass" agent={agent} hue={hue} className="!border-b-0" hoverVisual={<HoverGradient color={hue} />} cellAgent={CELL_AGENTS[3]} toolIcon="shell">
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="editing fixtures" agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverPulseGrid color={hue} />} cellAgent={CELL_AGENTS[2]} toolIcon="filesystem">
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="filling form fields" agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverHatch color={hue} />} cellAgent={CELL_AGENTS[1]} toolIcon="browser">
					<div className="h-full p-1.5">
						<div className="h-full rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-mid)]" />
					</div>
				</Cell>
			<Cell action="applying rules" agent={agent} hue={hue} className="hidden !border-b-0 md:block" hoverVisual={<HoverGradient color={hue} />} cellAgent={CELL_AGENTS[4]} toolIcon="skill">
				<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>
				<Cell action="" agent={agent} hue={hue} className="hidden !border-b-0 !border-r-0 md:block" hoverVisual={<HoverScene Scene={WireframeHostsScene} />} noLabel>
					<div className="h-full p-1.5">
						<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
							<div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-20" style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }} />
						</div>
					</div>
				</Cell>

			</div>
		</div>
	);
}

function IconArrowRight(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M3 8h10M9 4l4 4-4 4" />
		</svg>
	);
}
