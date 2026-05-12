"use client";

import { useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";

const PHASES = [
	{ label: "running", color: "text-[var(--ret-green)] border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10" },
	{ label: "waking", color: "text-[var(--ret-amber)] border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10" },
	{ label: "sleeping", color: "text-[var(--ret-text-dim)] border-[var(--ret-border)] bg-[var(--ret-surface)]" },
	{ label: "failed", color: "text-[var(--ret-red)] border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10" },
] as const;

const SAMPLE_PROMPTS = [
	"What skills do you have loaded?",
	"Schedule a daily 8am brief.",
	"In /home/machine/work, write fibonacci(20).",
	"List the MCP tools and which servers ship them.",
];

const CODE_LINES = [
	{ ts: "12:04:18", level: "info", message: "POST /v1/chat/completions" },
	{ ts: "12:04:18", level: "info", message: "loaded 96 skills + 10 mcp tools" },
	{ ts: "12:04:21", level: "info", message: "stream open . tokens=312" },
	{ ts: "12:04:21", level: "warn", message: "cron next: weekly-skill-audit in 3d" },
	{ ts: "12:04:23", level: "info", message: "stream done . duration=1832ms" },
];

const LEVEL_COLOR = {
	info: "text-[var(--ret-text)]",
	warn: "text-[var(--ret-amber)]",
	error: "text-[var(--ret-red)]",
} as const;

/**
 * Strip of live mini-examples -- the same components that power the
 * dashboard, shown standalone so visitors can poke them. Tailwind's
 * homepage does this with theme picker / code playground demos;
 * chanhdai showcases components directly. Same idea: the marketing
 * page IS the component library, no separate /docs needed.
 */
export function ComponentShowcase() {
	return (
		<>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<ReticleLabel>COMPONENTS -- LIVE</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						The same chrome the dashboard uses.
					</h2>
				</div>
				<p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] md:block">
					reticle / sigil
				</p>
			</div>

			<div className="mt-5 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2 lg:grid-cols-4">
				<StatusPillDemo />
				<ButtonsDemo />
				<SkillCardDemo />
				<LogTailDemo />
			</div>
		</>
	);
}

function ShowcaseCell({
	kicker,
	title,
	children,
	footnote,
}: {
	kicker: string;
	title: string;
	children: React.ReactNode;
	footnote?: string;
}) {
	return (
		<div className="flex h-full flex-col bg-[var(--ret-bg)]">
			<div className="flex items-baseline justify-between border-b border-[var(--ret-border)] px-4 py-2.5">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{kicker}
				</p>
				{footnote ? (
					<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{footnote}
					</p>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-3 px-4 py-4">
				<p className="text-[13px] font-semibold tracking-tight">{title}</p>
				<div className="flex flex-1 flex-col">{children}</div>
			</div>
		</div>
	);
}

function StatusPillDemo() {
	const [active, setActive] = useState(0);
	const phase = PHASES[active];
	return (
		<ShowcaseCell
			kicker="status pill"
			title="Click to cycle"
			footnote="StatusPill"
		>
			<button
				type="button"
				onClick={() => setActive((i) => (i + 1) % PHASES.length)}
				className={cn(
					"mt-1 inline-flex w-fit items-center gap-2 border px-3 py-1.5 font-mono text-[12px] transition-colors",
					phase.color,
				)}
			>
				<span className="h-1.5 w-1.5 bg-current" aria-hidden="true" />
				{phase.label}
			</button>
			<p className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
				4 visible phases. Active phases pulse the dot. Sharp corners,
				inherits color from the variant.
			</p>
		</ShowcaseCell>
	);
}

function ButtonsDemo() {
	return (
		<ShowcaseCell
			kicker="button"
			title="Three variants, two sizes"
			footnote="ReticleButton"
		>
			<div className="flex flex-wrap gap-2">
				<ReticleButton variant="primary" size="sm">
					Run
				</ReticleButton>
				<ReticleButton variant="secondary" size="sm">
					Inspect
				</ReticleButton>
				<ReticleButton variant="ghost" size="sm">
					Cancel
				</ReticleButton>
			</div>
			<p className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
				Primary uses the single purple. Secondary borrows the border
				token. Ghost is invisible at rest, surface on hover.
			</p>
		</ShowcaseCell>
	);
}

function SkillCardDemo() {
	const [active, setActive] = useState(0);
	const prompt = SAMPLE_PROMPTS[active];
	return (
		<ShowcaseCell
			kicker="prompt"
			title="One-tap starters"
			footnote="StarterGrid"
		>
			<button
				type="button"
				onClick={() => setActive((i) => (i + 1) % SAMPLE_PROMPTS.length)}
				className="group flex flex-1 flex-col gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3 text-left transition-colors hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]"
			>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] group-hover:text-[var(--ret-purple)]">
					tap to cycle
				</span>
				<span className="text-[12px] leading-snug text-[var(--ret-text-dim)]">
					{prompt}
				</span>
			</button>
		</ShowcaseCell>
	);
}

function LogTailDemo() {
	return (
		<ShowcaseCell
			kicker="log tail"
			title="Polling every 7s"
			footnote="LogsTail"
		>
			<div className="flex-1 overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] font-mono text-[10px] leading-relaxed">
				<table className="w-full border-collapse">
					<tbody>
						{CODE_LINES.map((line) => (
							<tr
								key={`${line.ts}:${line.message.slice(0, 12)}`}
								className="border-b border-[var(--ret-border)] last:border-0"
							>
								<td className="px-2 py-1 align-top text-[var(--ret-text-muted)]">
									{line.ts}
								</td>
								<td
									className={cn(
										"px-2 py-1 align-top uppercase",
										LEVEL_COLOR[line.level as keyof typeof LEVEL_COLOR],
									)}
								>
									{line.level}
								</td>
								<td className="px-2 py-1 align-top text-[var(--ret-text-dim)]">
									{line.message}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</ShowcaseCell>
	);
}

// Brand badge so the showcase ties back to the partners visually.
export function ShowcaseAttribution() {
	return (
		<div className="mt-5 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
			<span>built with</span>
			<span className="flex items-center gap-1.5">
				<Logo mark="dedalus" size={14} />
				dedalus
			</span>
			<span>+</span>
			<span className="flex items-center gap-1.5">
				<Logo mark="nous" size={14} />
				nous
			</span>
			<span>/</span>
			<span className="flex items-center gap-1.5">
				<Logo mark="openclaw" size={14} />
				openclaw
			</span>
			<span>+</span>
			<span className="flex items-center gap-1.5">
				<Logo mark="cursor" size={14} />
				cursor
			</span>
			<span className="ml-auto hidden md:inline">
				<ReticleBadge variant="accent">v0.1</ReticleBadge>
			</span>
		</div>
	);
}
