"use client";

import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { AGENTS } from "@/lib/agents";
import type { AgentKind, AgentMeta } from "@/lib/types";
import { cn } from "@/lib/cn";

type CommandRow = { label: string; value: string };

function commandsFor(a: AgentMeta): CommandRow[] {
	const rows: CommandRow[] = [
		{ label: "install", value: a.installCmd },
		{ label: "interactive", value: a.runCmd },
	];
	if (a.headlessCmd) {
		rows.push({ label: "headless / exec", value: a.headlessCmd });
	}
	rows.push(
		{ label: "docs", value: a.docsUrl },
		{ label: "github", value: a.githubUrl },
	);
	return rows;
}

const ASCII_ART: Record<AgentKind, string> = {
	hermes: `    ╭─────────────────╮
    │  ◈  H E R M E S  │
    │     ╱╲    ╱╲      │
    │    ╱  ╲──╱  ╲     │
    │   ╱    ╲╱    ╲    │
    │   ╲    ╱╲    ╱    │
    │    ╲──╱  ╲──╱     │
    │     nous research  │
    ╰─────────────────╯`,
	openclaw: `    ╭──────────────────╮
    │  ◆ O P E N C L A W│
    │      ╱──╲          │
    │     ╱ ◉◉ ╲         │
    │    │ ╱──╲ │        │
    │    ╱╱    ╲╲        │
    │   ╱╱  ──  ╲╲       │
    │   computer-use     │
    ╰──────────────────╯`,
	"claude-code": `    ╭──────────────────╮
    │ ⊛ C L A U D E     │
    │      ┌───┐         │
    │      │ ▓ │         │
    │   ┌──┤   ├──┐      │
    │   │  └───┘  │      │
    │   └─────────┘      │
    │    anthropic        │
    ╰──────────────────╯`,
	codex: `    ╭──────────────────╮
    │  ⬡ C O D E X      │
    │     ┌─────┐        │
    │     │ > _ │        │
    │     │     │        │
    │     └─────┘        │
    │    ╱─────────╲     │
    │     openai         │
    ╰──────────────────╯`,
};

const TERMINAL_OUTPUT: Record<AgentKind, string[]> = {
	hermes: [
		"$ hermes",
		"",
		"  ◈ hermes v2.4.1 (nous-research/hermes-agent)",
		"  ◈ loading memory from /home/machine/.hermes/memory.db",
		"  ◈ FTS5 index: 2,847 entries",
		"  ◈ cron scheduler: 4 jobs active",
		"  ◈ MCP host: 6 servers connected",
		"  ◈ provider: dedalus router (api.dedaluslabs.ai/v1)",
		"  ◈ model: claude-sonnet-4-5-20250514",
		"  ◈ session: ses_7f2a9c (resumed)",
		"",
		"  hermes is awake. 96 skills loaded.",
		"",
		"  you › check the deployment status and run the test suite",
		"",
		"  hermes › I'll check the deployment and run tests.",
		"",
		"  ┌ tool:shell ─────────────────────────────────",
		"  │ vercel inspect --scope dedalus-labs",
		"  │ → production: ready (2m ago)",
		"  └─────────────────────────────────────────────",
		"",
		"  ┌ tool:shell ─────────────────────────────────",
		"  │ pnpm test --reporter=dot",
		"  │ → 247 passed, 0 failed (12.4s)",
		"  └─────────────────────────────────────────────",
		"",
		"  hermes › All green. Production deploy is live,",
		"  247 tests passing. Want me to schedule a",
		"  follow-up check in 30 minutes?",
	],
	openclaw: [
		"$ openclaw",
		"",
		"  ◆ openclaw v1.8.0",
		"  ◆ computer-use: enabled (display :1, 1920×1080)",
		"  ◆ browser: chromium 128.0",
		"  ◆ shell: /bin/bash",
		"  ◆ vision: screenshot pipeline active",
		"  ◆ provider: anthropic (claude-sonnet-4-5-20250514)",
		"  ◆ gateway: telegram + slack connected",
		"",
		"  openclaw is awake. waiting for input.",
		"",
		"  you › open github.com/Kevin-Liu-01/agent-machines",
		"        and check if any issues need attention",
		"",
		"  openclaw › Opening the repository.",
		"",
		"  ┌ tool:browser ───────────────────────────────",
		"  │ navigate: github.com/Kevin-Liu-01/agent-machines",
		"  │ → page loaded (1.2s)",
		"  │ screenshot: captured viewport",
		"  └─────────────────────────────────────────────",
		"",
		"  ┌ tool:browser ───────────────────────────────",
		"  │ click: \"Issues\" tab",
		"  │ → 3 open issues",
		"  └─────────────────────────────────────────────",
		"",
		"  openclaw › 3 open issues. #14 is a bug report",
		"  about dark mode — want me to investigate?",
	],
	"claude-code": [
		"$ claude",
		"",
		"  claude code v1.0.32",
		"  cwd: ~/agent-machines/web",
		"  model: claude-sonnet-4-5-20250514",
		"  context: 94 files indexed",
		"",
		"  you › fix the border overlap issue in the",
		"        ReticlePageGrid component",
		"",
		"  claude › I'll look at the component and fix the",
		"  border overlap.",
		"",
		"  Read web/components/reticle/ReticlePageGrid.tsx",
		"  Read web/app/globals.css",
		"",
		"  I see the issue — the margin hatches use",
		"  `border-r` which doubles with the section's",
		"  own border. Let me fix this:",
		"",
		"  Edit web/components/reticle/ReticlePageGrid.tsx",
		"  ⎿ Changed 3 lines",
		"",
		"  Edit web/app/globals.css",
		"  ⎿ Changed 1 line",
		"",
		"  claude › Fixed. The margin hatches now use",
		"  `border-x` so each gutter is self-contained.",
		"  No more doubled borders at the rail edge.",
	],
	codex: [
		"$ codex",
		"",
		"  codex v0.1.2505132016",
		"  model: codex-1 (full-auto)",
		"  sandbox: enabled",
		"  cwd: ~/agent-machines/web",
		"",
		"  you › add a loading skeleton to the dashboard",
		"        stats panel",
		"",
		"  codex › I'll add a skeleton loader to the stats",
		"  panel that shows while data is fetching.",
		"",
		"  ┌ Created components/dashboard/StatsSkeleton.tsx",
		"  │ export function StatsSkeleton() {",
		"  │   return (",
		'  │     <div className="grid grid-cols-3 gap-4">',
		"  │       {Array.from({ length: 6 }).map((_, i) => (",
		'  │         <div key={i} className="ret-skeleton h-20" />',
		"  │       ))}",
		"  │     </div>",
		"  │   );",
		"  │ }",
		"  └──────────────────────────────────────────────",
		"",
		"  ┌ Modified components/dashboard/StatsPanel.tsx",
		"  │ + import { StatsSkeleton } from './StatsSkeleton'",
		"  │ + if (isLoading) return <StatsSkeleton />;",
		"  └──────────────────────────────────────────────",
		"",
		"  codex › Done. Added skeleton with shimmer",
		"  animation. Shows 6 placeholder cells matching",
		"  the final grid layout.",
	],
};

function TerminalPanel({ agentId, meta }: { agentId: AgentKind; meta: AgentMeta }) {
	const lines = TERMINAL_OUTPUT[agentId];
	const ascii = ASCII_ART[agentId];
	const scrollRef = useRef<HTMLDivElement>(null);
	const [visibleCount, setVisibleCount] = useState(0);

	useEffect(() => {
		setVisibleCount(0);
		const total = lines.length;
		let frame = 0;
		const interval = setInterval(() => {
			frame++;
			setVisibleCount(Math.min(frame, total));
			if (frame >= total) clearInterval(interval);
		}, 60);
		return () => clearInterval(interval);
	}, [agentId, lines.length]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [visibleCount]);

	return (
		<div className="flex h-[420px] flex-col bg-[#0a0a0c]">
			<div className="flex items-center gap-2 border-b border-[#222] px-4 py-2">
				<span className="h-2 w-2 rounded-full bg-[var(--ret-green)]" />
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#555]">
					{meta.name.toLowerCase()} — terminal
				</span>
				<span className="ml-auto font-mono text-[9px] text-[#333]">
					/home/machine
				</span>
			</div>
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto overflow-x-hidden p-4 font-mono text-[11px] leading-[1.7] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#333]"
			>
				{/* ASCII art header */}
				<pre className="mb-3 text-[9px] leading-[1.4] text-[#444]">{ascii}</pre>

				{/* Animated terminal lines */}
				<pre className="whitespace-pre text-[#b4b4b4]">
					{lines.slice(0, visibleCount).map((line, i) => (
						<span
							key={`${agentId}-${i}`}
							className={cn(
								"block",
								line.startsWith("$") && "text-[var(--ret-green)]",
								line.startsWith("  you ›") && "text-[#e0e0e0] font-medium",
								(line.includes("hermes ›") || line.includes("openclaw ›") || line.includes("claude ›") || line.includes("codex ›")) && "text-[var(--ret-purple)]",
								(line.startsWith("  ┌") || line.startsWith("  │") || line.startsWith("  └")) && "text-[#555]",
								(line.startsWith("  ◈") || line.startsWith("  ◆")) && "text-[#666]",
								(line.includes("Read ") || line.includes("Edit ")) && "text-[var(--ret-amber)]",
								line.includes("Created ") && "text-[var(--ret-green)]",
								line.includes("Modified ") && "text-[var(--ret-amber)]",
							)}
						>
							{line}
						</span>
					))}
					{visibleCount < lines.length && (
						<span className="inline-block h-[1em] w-[7px] animate-pulse bg-[var(--ret-purple)]" />
					)}
				</pre>
			</div>
		</div>
	);
}

export function AgentCommandToggle() {
	const [active, setActive] = useState<AgentKind>("hermes");
	const meta = AGENTS.find((a) => a.id === active)!;
	const rows = commandsFor(meta);

	return (
		<div className="grid gap-px overflow-hidden bg-[var(--ret-border)]">
			{/* Tab bar */}
			<div className="grid grid-cols-4 gap-px bg-[var(--ret-border)]">
				{AGENTS.map((a) => (
					<button
						key={a.id}
						type="button"
						onClick={() => setActive(a.id)}
						className={cn(
							"flex items-center justify-center gap-1.5 px-2 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
							active === a.id
								? "bg-[var(--ret-surface)] text-[var(--ret-text)]"
								: "bg-[var(--ret-bg)] text-[var(--ret-text-muted)] hover:bg-[var(--ret-bg-soft)] hover:text-[var(--ret-text)]",
						)}
					>
						<Logo mark={a.logoMark} size={13} />
						<span className="hidden sm:inline">{a.name}</span>
					</button>
				))}
			</div>

			{/* Two-panel body: terminal left, info right */}
			<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-[1.4fr_0.6fr]">
				<TerminalPanel agentId={active} meta={meta} />

				{/* Info sidebar */}
				<div className="flex flex-col gap-px bg-[var(--ret-border)]">
					{/* Agent header */}
					<div className="flex items-center justify-between bg-[var(--ret-bg)] px-4 py-3">
						<div className="flex items-center gap-2">
							<Logo mark={meta.logoMark} size={16} />
							<span className="font-mono text-xs font-semibold text-[var(--ret-text)]">
								{meta.name}
							</span>
						</div>
						<ReticleBadge
							variant={meta.operationModel === "autonomous" ? "accent" : "warning"}
						>
							{meta.operationModel}
						</ReticleBadge>
					</div>

					{/* Description */}
					<div className="bg-[var(--ret-bg)] px-4 py-2">
						<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
							{meta.capabilities}
						</p>
					</div>

					{/* Command rows */}
					<div className="grid gap-px bg-[var(--ret-border)]">
						{rows.map((row) => (
							<div
								key={row.label}
								className="flex items-center justify-between gap-4 bg-[var(--ret-bg)] px-4 py-1.5"
							>
								<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{row.label}
								</span>
								<code className="min-w-0 truncate text-right font-mono text-[10px] text-[var(--ret-text)]">
									{row.value}
								</code>
							</div>
						))}
					</div>

					{/* Provider options */}
					<div className="bg-[var(--ret-bg)] px-4 py-1.5">
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							ai providers
						</span>
					</div>
					<div className="grid gap-px bg-[var(--ret-border)]">
						{meta.providerOptions.slice(0, 4).map((opt, i) => (
							<div
								key={opt.key}
								className="flex items-center gap-2 bg-[var(--ret-bg)] px-4 py-1.5"
							>
								{i === 0 ? (
									<span className="h-1.5 w-1.5 shrink-0 bg-[var(--ret-green)]" />
								) : (
									<span className="h-1.5 w-1.5 shrink-0 bg-[var(--ret-border)]" />
								)}
								<span className="font-mono text-[10px] text-[var(--ret-text)]">
									{opt.label}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
