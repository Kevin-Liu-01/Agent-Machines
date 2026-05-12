"use client";

import dynamic from "next/dynamic";

import type { CompositeMark } from "@/components/Logo";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

const HermesBustScene = dynamic(
	() => import("@/components/three").then((m) => m.HermesBustScene),
	{ ssr: false, loading: () => null },
);

export type HeroAgent = "hermes" | "openclaw" | "claude-code" | "codex";

export const HERO_AGENTS: ReadonlyArray<HeroAgent> = [
	"hermes",
	"openclaw",
	"claude-code",
	"codex",
];

type Props = {
	agent: HeroAgent;
	onToggle: () => void;
};

type AgentPortraitMeta = {
	label: string;
	mark: CompositeMark;
	accent: "default" | "purple" | "amber" | "green";
};

const META: Record<HeroAgent, AgentPortraitMeta> = {
	hermes: { label: "Hermes", mark: "nous", accent: "default" },
	openclaw: { label: "OpenClaw", mark: "openclaw", accent: "purple" },
	"claude-code": { label: "Claude Code", mark: "anthropic", accent: "amber" },
	codex: { label: "Codex CLI", mark: "openai", accent: "green" },
};

const ACCENT_BORDER: Record<AgentPortraitMeta["accent"], string> = {
	default: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
	purple: "border-[var(--ret-purple)]/55 shadow-[0_0_24px_var(--ret-purple-glow)] hover:border-[var(--ret-purple)]",
	amber: "border-[var(--ret-amber)]/55 shadow-[0_0_24px_rgba(245,158,11,0.12)] hover:border-[var(--ret-amber)]",
	green: "border-[var(--ret-green)]/55 shadow-[0_0_24px_rgba(34,197,94,0.12)] hover:border-[var(--ret-green)]",
};

const ACCENT_DOT: Record<AgentPortraitMeta["accent"], string> = {
	default: "bg-[var(--ret-green)]",
	purple: "bg-[var(--ret-purple)]",
	amber: "bg-[var(--ret-amber)]",
	green: "bg-[var(--ret-green)]",
};

export function HeroAgentPortrait({ agent, onToggle }: Props) {
	const meta = META[agent];
	const nextIdx = (HERO_AGENTS.indexOf(agent) + 1) % HERO_AGENTS.length;
	const nextLabel = META[HERO_AGENTS[nextIdx]].label;

	return (
		<button
			type="button"
			onClick={onToggle}
			aria-label={`Preview ${nextLabel} agent`}
			title={`Click to preview ${nextLabel}`}
			className={cn(
				"group relative hidden h-[76px] w-[76px] shrink-0 overflow-hidden border bg-[var(--ret-bg-soft)] transition-colors duration-200 lg:block",
				"focus:outline-none focus:ring-1 focus:ring-[var(--ret-purple)]/60",
				ACCENT_BORDER[meta.accent],
			)}
		>
			<HermesBustScene className="h-full w-full" />

			<span className="pointer-events-none absolute left-1 top-1 h-1.5 w-1.5 border-l border-t border-[var(--ret-cross)]" />
			<span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 border-r border-t border-[var(--ret-cross)]" />
			<span className="pointer-events-none absolute bottom-1 right-1 h-1.5 w-1.5 border-b border-r border-[var(--ret-cross)]" />

			<span
				className={cn(
					"pointer-events-none absolute right-1.5 top-1.5 z-10 h-1.5 w-1.5",
					ACCENT_DOT[meta.accent],
				)}
				aria-hidden="true"
			/>

			<span className="pointer-events-none absolute bottom-1 left-1 z-10 flex items-center gap-px border border-[var(--ret-border)] bg-[var(--ret-bg)]/90 px-0.5 py-px backdrop-blur-sm">
				{HERO_AGENTS.map((a) => (
					<span
						key={a}
						className={cn(
							"flex h-2.5 w-2.5 items-center justify-center transition-opacity",
							agent === a
								? "text-[var(--ret-text)] opacity-100"
								: "text-[var(--ret-text-muted)] opacity-40",
						)}
						aria-hidden="true"
					>
						<Logo mark={META[a].mark} size={9} />
					</span>
				))}
			</span>
		</button>
	);
}
