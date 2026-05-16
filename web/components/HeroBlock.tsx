"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useState, type SVGProps } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import {
	HeroAgentPortrait,
	HERO_AGENTS,
	type HeroAgent,
} from "@/components/HeroAgentPortrait";
import { Logo, type CompositeMark } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

/* ── Per-agent 3D scenes (lazy) ── */

const HermesBustScene = dynamic(
	() => import("@/components/three").then((m) => m.HermesBustScene),
	{ ssr: false, loading: () => null },
);
const WireframeAgentScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeAgent),
	{ ssr: false, loading: () => null },
);
const HeadTriptychScene = dynamic(
	() => import("@/components/three").then((m) => m.HeadTriptych),
	{ ssr: false, loading: () => null },
);
const WireframeMachineScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeMachine),
	{ ssr: false, loading: () => null },
);
const WireframeDashboardScene = dynamic(
	() => import("@/components/three").then((m) => m.WireframeDashboard),
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

const AGENT_SCENE: Record<HeroAgent, React.ComponentType<{ className?: string }>> = {
	hermes: HermesBustScene,
	openclaw: WireframeAgentScene,
	"claude-code": HeadTriptychScene,
	codex: WireframeMachineScene,
};

/* ── Agent metadata ── */

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

/* ── Grid cell with hover visuals ── */

function Cell({
	action,
	agent,
	hue,
	children,
	className,
	hoverVisual,
}: {
	action: string;
	agent: HeroAgent;
	hue: string;
	children?: ReactNode;
	className?: string;
	hoverVisual?: ReactNode;
}) {
	return (
		<div
			className={`group/cell relative border-b border-r border-[var(--ret-border)] transition-colors duration-200 ${className ?? ""}`}
		>
			{children}
			{/* Hover layer */}
			<div className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-200 group-hover/cell:opacity-100">
				{hoverVisual ?? (
					<div
						className="absolute inset-0"
						style={{ background: `${hue}08` }}
					/>
				)}
				<div
					className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1.5 border px-1.5 py-0.5"
					style={{ borderColor: `${hue}44`, background: "var(--ret-bg)" }}
				>
					<Logo mark={AGENT_MARK[agent]} size={9} />
					<span className="truncate font-mono text-[8px]" style={{ color: hue }}>
						{action}
					</span>
					<span
						className="h-1 w-1 shrink-0 animate-pulse rounded-full"
						style={{ background: hue }}
					/>
				</div>
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
			style={{
				background: `linear-gradient(135deg, ${color}0c 0%, transparent 60%)`,
			}}
		/>
	);
}

/* ── Main component ── */

export function HeroBlock() {
	const [agent, setAgent] = useState<HeroAgent>("hermes");
	const capabilities = AGENT_CAPABILITIES[agent];
	const hue = AGENT_HUE[agent];
	const Scene = AGENT_SCENE[agent];

	return (
		<div className="relative overflow-hidden">
			{/* ── Announcement banner ── */}
			<a
				href="https://dedaluslabs.ai"
				target="_blank"
				rel="noopener noreferrer"
				className="group/banner flex items-center gap-3 border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-5 py-2 transition-colors hover:bg-[var(--ret-surface)]"
			>
				<Logo mark="dedalus" size={14} />
				<span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Dedalus Machines
				</span>
				<span className="hidden text-[9px] text-[var(--ret-text-muted)] sm:inline">·</span>
				<span className="hidden text-[10px] text-[var(--ret-text-dim)] sm:inline">
					Now in alpha — persistent VMs for AI agents
				</span>
				<span className="ml-auto flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)] opacity-70 transition-opacity group-hover/banner:opacity-100">
					dedaluslabs.ai
					<IconArrowRight className="h-2.5 w-2.5" />
				</span>
			</a>

			{/* ── Two-panel layout ── */}
			<div className="grid grid-cols-1 lg:grid-cols-[1fr_auto]">
				{/* ── Left: 7-column content grid ── */}
				<div className="grid grid-cols-4 md:grid-cols-7 auto-rows-auto">
					{/* Row 1: Kicker (4 cols) + empty cells */}
					<Cell
						action="reading project metadata..."
						agent={agent} hue={hue}
						className="col-span-4 flex items-center"
						hoverVisual={<HoverGradient color={hue} />}
					>
						<div className="flex flex-wrap items-center gap-2 px-5 py-4">
							<ReticleLabel>DEVELOPED BY</ReticleLabel>
							<ReticleBadge variant="accent">KEVIN LIU</ReticleBadge>
							<ReticleBadge>DEDALUS LABS</ReticleBadge>
						</div>
					</Cell>
					<Cell
						action="scanning org graph..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverScene Scene={WireframeDashboardScene} />}
					/>
					<Cell
						action="resolving license..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverHatch color={hue} />}
					/>
					<Cell
						action="checking registry..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverPulseGrid color={hue} />}
					/>

					{/* Row 2: Heading (full span) — rounded inner with border peekthrough */}
					<Cell
						action="generating copy variant..."
						agent={agent} hue={hue}
						className="col-span-4 md:col-span-7"
						hoverVisual={<HoverGlow color={hue} />}
					>
						<div className="bg-[var(--ret-border)] border-b border-[var(--ret-border)]">
							<div className="rounded-3xl bg-[var(--ret-bg)]">
								<div className="flex items-center gap-5 px-5 py-8 md:py-12">
									<HeroAgentPortrait
										agent={agent}
										onToggle={() =>
											setAgent((cur) => {
												const idx = HERO_AGENTS.indexOf(cur);
												return HERO_AGENTS[(idx + 1) % HERO_AGENTS.length];
											})
										}
									/>
									<h1 className="ret-display text-4xl leading-[0.95] tracking-tight md:text-5xl lg:text-[72px]">
										<span className="block">Persistent Machines</span>
										<span className="block text-[var(--ret-purple)]">
											for your Agent.
										</span>
									</h1>
								</div>
							</div>
						</div>
					</Cell>

					{/* Row 3: Description (5 cols) + empty cells */}
					<Cell
						action="analyzing value proposition..."
						agent={agent} hue={hue}
						className="col-span-4 md:col-span-5"
						hoverVisual={<HoverGradient color={hue} />}
					>
						<div className="px-5 py-5">
							<p className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--ret-text-dim)]">
								One stateful microVM per account.{" "}
								<strong className="text-[var(--ret-text)]">
									Boot in 30 seconds, sleep on idle, wake on the
									first prompt.
								</strong>
							</p>
						</div>
					</Cell>
					<Cell
						action="benchmarking latency..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverScene Scene={WireframeLoadoutScene} />}
					/>
					<Cell
						action="polling health check..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverHatch color={hue} angle={45} />}
					/>

					{/* Row 4: Capabilities (5 cols) + empty cells */}
					<Cell
						action="indexing tool capabilities..."
						agent={agent} hue={hue}
						className="col-span-4 md:col-span-5"
						hoverVisual={<HoverHatch color={hue} angle={90} />}
					>
						<div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
							{capabilities.map((cap) => (
								<span
									key={cap}
									className="inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)] transition-colors"
									style={{
										borderColor: `${hue}33`,
										background: `${hue}08`,
									}}
								>
									<span
										className="h-1 w-1 rounded-full"
										style={{ background: hue }}
									/>
									{cap}
								</span>
							))}
						</div>
					</Cell>
					<Cell
						action="loading MCP servers..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverGlow color={hue} />}
					/>
					<Cell
						action="resolving providers..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverScene Scene={WireframeHostsScene} />}
					/>

					{/* Row 5: CTAs (3 cols) + empty cells */}
					<Cell
						action="routing user to dashboard..."
						agent={agent} hue={hue}
						className="col-span-3"
						hoverVisual={<HoverGlow color={hue} />}
					>
						<div className="flex flex-wrap items-center gap-2.5 px-5 py-5">
							<SignedIn>
								<ReticleButton
									as="a"
									href="/dashboard"
									variant="primary"
									size="md"
								>
									<IconArrowRight className="h-3.5 w-3.5" />
									Open dashboard
								</ReticleButton>
							</SignedIn>
							<SignedOut>
								<ReticleButton
									as="a"
									href="/sign-in"
									variant="primary"
									size="md"
								>
									<IconArrowRight className="h-3.5 w-3.5" />
									Get started
								</ReticleButton>
							</SignedOut>
							<ReticleButton
								as="a"
								href="https://github.com/Kevin-Liu-01/agent-machines"
								target="_blank"
								variant="secondary"
								size="sm"
							>
								<ServiceIcon slug="github" size={13} tone="mono" />
								GitHub
							</ReticleButton>
						</div>
					</Cell>
					<Cell
						action="warming sandbox..."
						agent={agent} hue={hue}
						hoverVisual={<HoverScene Scene={WireframeEnvironmentScene} />}
					/>
					<Cell
						action="syncing dotfiles..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverHatch color={hue} angle={135} />}
					/>
					<Cell
						action="mounting volume..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverPulseGrid color={hue} />}
					/>
					<Cell
						action="allocating vCPU..."
						agent={agent} hue={hue}
						className="hidden md:block"
						hoverVisual={<HoverGradient color={hue} />}
					/>
				</div>

				{/* ── Right: structural data column ── */}
				<div className="hidden border-l border-[var(--ret-border)] lg:flex lg:w-80 lg:flex-col">
					{/* 3D viewport — swaps per agent */}
					<div className="relative border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
						<div className="aspect-square w-full">
							<Scene className="h-full w-full" />
						</div>
						<span className="pointer-events-none absolute left-2 top-2 h-2 w-2 border-l border-t border-[var(--ret-cross)]" />
						<span className="pointer-events-none absolute right-2 top-2 h-2 w-2 border-r border-t border-[var(--ret-cross)]" />
						<span className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l border-[var(--ret-cross)]" />
						<span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 border-b border-r border-[var(--ret-cross)]" />
						<span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							interactive 3D
						</span>
					</div>

					{/* Agent selector rail */}
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<ReticleLabel className="mb-2">ACTIVE AGENT</ReticleLabel>
						<div className="flex flex-col gap-1.5">
							{HERO_AGENTS.map((a) => {
								const active = agent === a;
								return (
									<button
										key={a}
										type="button"
										onClick={() => setAgent(a)}
										className="flex items-center gap-2 px-2 py-1.5 text-left transition-colors"
										style={{
											background: active ? `${AGENT_HUE[a]}0a` : undefined,
											borderLeft: active
												? `2px solid ${AGENT_HUE[a]}`
												: "2px solid transparent",
										}}
									>
										<Logo mark={AGENT_MARK[a]} size={14} />
										<span
											className="text-[11px] font-medium"
											style={{
												color: active
													? "var(--ret-text)"
													: "var(--ret-text-muted)",
											}}
										>
											{AGENT_LABEL[a]}
										</span>
										<span
											className="ml-auto h-1.5 w-1.5 rounded-full transition-opacity"
											style={{
												background: AGENT_HUE[a],
												opacity: active ? 1 : 0.25,
											}}
										/>
									</button>
								);
							})}
						</div>
					</div>

					{/* Specs readout */}
					<div className="flex flex-1 flex-col gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)]">
						{[
							{ label: "RUNTIME", value: "microVM" },
							{ label: "BOOT", value: "~30s" },
							{ label: "PERSIST", value: "disk + memory" },
							{ label: "PROTOCOL", value: "MCP" },
						].map((row) => (
							<div
								key={row.label}
								className="flex items-baseline justify-between bg-[var(--ret-bg)] px-4 py-2"
							>
								<span className="text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									{row.label}
								</span>
								<span className="text-[10px] tabular-nums text-[var(--ret-text-dim)]">
									{row.value}
								</span>
							</div>
						))}
					</div>

					{/* Version */}
					<div className="flex items-center gap-2 bg-[var(--ret-bg-soft)] px-4 py-2.5">
						<span className="text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							VER
						</span>
						<span className="font-mono text-[10px] text-[var(--ret-text-dim)]">
							0.1.0-alpha
						</span>
						<ReticleBadge variant="success" className="ml-auto !py-0 !text-[8px]">
							LIVE
						</ReticleBadge>
					</div>
				</div>
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
