"use client";

import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { AGENTS } from "@/lib/agents";
import type { AgentMeta } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { ToolCategory } from "@/lib/dashboard/loadout";

const AGENT_HUE: Record<string, string> = {
	hermes: "#7c8cf8",
	openclaw: "#e5443b",
	"claude-code": "#d4a574",
	codex: "#4ae0a0",
};

type ToolBadge =
	| { kind: "service"; slug: ServiceSlug }
	| { kind: "tool"; name: ToolCategory | "task" | "skill" | "subagent" | "rig" };

type MachineMeta = {
	id: string;
	region: string;
	uptime: string;
	cpu: string;
	mem: string;
	disk: string;
	tools: ToolBadge[];
	lines: string[];
};

const MACHINE_META: Record<string, MachineMeta> = {
	hermes: {
		id: "dm-7f2a",
		region: "us-east-1",
		uptime: "4d 12h",
		cpu: "0.3 vCPU",
		mem: "128 MB",
		disk: "2.1 GB",
		tools: [
			{ kind: "tool", name: "memory" },
			{ kind: "tool", name: "schedule" },
			{ kind: "tool", name: "search" },
			{ kind: "tool", name: "delegate" },
			{ kind: "service", slug: "slack" },
			{ kind: "service", slug: "github" },
			{ kind: "service", slug: "supabase" },
		],
		lines: [
			"$ hermes wake",
			"loading memory index...",
			"4,281 memories indexed",
			"cron: sync-feeds in 12m",
			"MCP: 3 servers connected",
			"idle. waiting for prompt.",
		],
	},
	openclaw: {
		id: "dm-a91d",
		region: "us-west-2",
		uptime: "1d 6h",
		cpu: "0.5 vCPU",
		mem: "256 MB",
		disk: "1.4 GB",
		tools: [
			{ kind: "tool", name: "browser" },
			{ kind: "tool", name: "vision" },
			{ kind: "tool", name: "shell" },
			{ kind: "tool", name: "image" },
			{ kind: "tool", name: "skill" },
			{ kind: "service", slug: "googlechrome" },
			{ kind: "service", slug: "playwright" },
		],
		lines: [
			"$ openclaw run",
			"launching browser...",
			"navigating to target",
			"screenshot captured",
			"vision: analyzing page",
			"task complete. sleeping.",
		],
	},
	"claude-code": {
		id: "dm-e4c8",
		region: "us-east-1",
		uptime: "2d 19h",
		cpu: "1.0 vCPU",
		mem: "512 MB",
		disk: "4.7 GB",
		tools: [
			{ kind: "tool", name: "code" },
			{ kind: "tool", name: "filesystem" },
			{ kind: "tool", name: "shell" },
			{ kind: "tool", name: "search" },
			{ kind: "tool", name: "delegate" },
			{ kind: "service", slug: "github" },
			{ kind: "service", slug: "anthropic" },
		],
		lines: [
			"$ claude -p 'fix tests'",
			"reading src/api/auth.ts",
			"found 2 failing tests",
			"editing test fixtures...",
			"src/api/auth.test.ts ✓",
			"ready for commit.",
		],
	},
	codex: {
		id: "dm-3b17",
		region: "us-east-2",
		uptime: "6h 42m",
		cpu: "0.5 vCPU",
		mem: "256 MB",
		disk: "1.8 GB",
		tools: [
			{ kind: "tool", name: "code" },
			{ kind: "tool", name: "shell" },
			{ kind: "tool", name: "filesystem" },
			{ kind: "tool", name: "search" },
			{ kind: "tool", name: "task" },
			{ kind: "service", slug: "openai" },
			{ kind: "service", slug: "github" },
		],
		lines: [
			"$ codex exec 'add cache'",
			"analyzing codebase...",
			"sandbox: initialized",
			"writing redis layer",
			"sandbox: tests pass",
			"output: cache.patch",
		],
	},
};

function TerminalLines({
	lines,
	delay,
	color,
}: {
	lines: string[];
	delay: number;
	color: string;
}) {
	const [visible, setVisible] = useState(-1);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		let cancelled = false;

		function runCycle() {
			let step = -1;
			function tick() {
				if (cancelled) return;
				step += 1;
				if (step >= lines.length) {
					timerRef.current = setTimeout(() => {
						if (cancelled) return;
						setVisible(-1);
						timerRef.current = setTimeout(runCycle, 800);
					}, 3200);
					return;
				}
				setVisible(step);
				timerRef.current = setTimeout(tick, 550 + Math.random() * 200);
			}
			tick();
		}

		timerRef.current = setTimeout(runCycle, delay * 1000);
		return () => {
			cancelled = true;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [delay, lines.length]);

	return (
		<div className="flex flex-col gap-px overflow-hidden font-mono">
			{lines.map((line, i) => {
				const isCommand = line.startsWith("$");
				return (
					<div
						key={i}
						className={cn(
							"whitespace-nowrap text-[10px] leading-[1.6] transition-all duration-300",
							i <= visible
								? "translate-y-0 opacity-100"
								: "translate-y-1 opacity-0",
						)}
					>
						{isCommand ? (
							<span style={{ color }}>{line}</span>
						) : (
							<span className="text-[var(--ret-text-dim)]">
								<span
									style={{ color }}
									className="mr-1 opacity-50"
								>
									›
								</span>
								{line}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

function ToolRail({ tools, color }: { tools: ToolBadge[]; color: string }) {
	return (
		<div className="flex flex-col items-center gap-2 py-2">
			{tools.map((t, i) => (
				<span
					key={i}
					className="flex h-5 w-5 items-center justify-center opacity-50 transition-opacity group-hover:opacity-100"
					style={{ color }}
				>
					{t.kind === "service" ? (
						<ServiceIcon slug={t.slug} size={13} tone="mono" />
					) : (
						<ToolIcon name={t.name} size={13} />
					)}
				</span>
			))}
		</div>
	);
}

function FleetCard({
	agent,
	color,
	meta,
	delay,
}: {
	agent: AgentMeta;
	color: string;
	meta: MachineMeta;
	delay: number;
}) {
	return (
		<a
			href={agent.docsUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex flex-col border border-[var(--ret-border)] bg-[var(--ret-bg)] transition-colors hover:border-[var(--ret-border-hover)]"
		>
			{/* ── Machine header ── */}
			<div className="flex items-center gap-1.5 px-3 py-2">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-3 w-3 text-[var(--ret-text-muted)]"
				>
					<rect x="2" y="2" width="20" height="8" rx="2" />
					<rect x="2" y="14" width="20" height="8" rx="2" />
					<line x1="6" y1="6" x2="6.01" y2="6" />
					<line x1="6" y1="18" x2="6.01" y2="18" />
				</svg>
				<span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					machine
				</span>
				<span className="ml-auto font-mono text-[9px]" style={{ color }}>
					{meta.id}
				</span>
			</div>

			{/* ── Hatch accent strip ── */}
			<div className="relative h-1 w-full overflow-hidden border-y border-[var(--ret-border)]">
				<div
					className="absolute inset-0 opacity-40"
					style={{
						backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 2px, transparent 2px 5px)`,
					}}
				/>
				<div
					className="fleet-pulse-sweep absolute inset-0"
					style={{
						backgroundImage: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
						backgroundSize: "30% 100%",
						backgroundRepeat: "no-repeat",
					}}
				/>
			</div>

			{/* ── Body: two-column (agent + terminal | tool rail) ── */}
			<div className="grid grid-cols-[1fr_auto]">
				{/* Left: agent + resources + terminal */}
				<div className="flex flex-col">
					{/* Agent identity */}
					<div className="flex items-center gap-2 border-b border-dashed border-[var(--ret-border)] px-3 py-2.5">
						<span
							className="flex h-7 w-7 shrink-0 items-center justify-center border"
							style={{
								borderColor: `${color}44`,
								background: `${color}0a`,
							}}
						>
							<Logo mark={agent.logoMark} size={15} />
						</span>
						<div className="min-w-0">
							<p className="truncate text-[11px] font-semibold text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
								{agent.name}
							</p>
							<p className="truncate text-[9px] text-[var(--ret-text-muted)]">
								{agent.by}
							</p>
						</div>
						<span
							className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
							style={{ background: color, boxShadow: `0 0 6px ${color}` }}
						/>
					</div>

					{/* Resource stats */}
					<div className="grid grid-cols-3 border-b border-dashed border-[var(--ret-border)] text-center">
						{[
							{ label: "CPU", value: meta.cpu },
							{ label: "MEM", value: meta.mem },
							{ label: "DISK", value: meta.disk },
						].map((s) => (
							<div
								key={s.label}
								className="border-r border-dashed border-[var(--ret-border)] px-1 py-1.5 last:border-r-0"
							>
								<p className="text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									{s.label}
								</p>
								<p className="text-[10px] tabular-nums text-[var(--ret-text-dim)]">
									{s.value}
								</p>
							</div>
						))}
					</div>

					{/* Terminal */}
					<div className="flex-1 bg-[var(--ret-bg-soft)] px-3 py-2">
						<div className="mb-1 flex items-center gap-1.5">
							<span className="h-1 w-1 rounded-full" style={{ background: color }} />
							<span className="h-1 w-1 rounded-full opacity-40" style={{ background: color }} />
							<span className="h-1 w-1 rounded-full opacity-20" style={{ background: color }} />
							<span className="ml-auto text-[8px] tabular-nums text-[var(--ret-text-muted)]">
								{meta.region}
							</span>
						</div>
						<TerminalLines lines={meta.lines} delay={delay} color={color} />
					</div>
				</div>

				{/* Right: tool rail */}
				<div className="flex flex-col items-center border-l border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
					<span className="p-1.5 text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						tools
					</span>
					<div className="h-px w-full bg-[var(--ret-border)]" />
					<ToolRail tools={meta.tools} color={color} />
				</div>
			</div>

			{/* ── Footer ── */}
			<div className="flex items-center justify-between border-t border-[var(--ret-border)] px-3 py-1.5">
				<span className="text-[8px] tabular-nums text-[var(--ret-text-muted)]">
					↑ {meta.uptime}
				</span>
				<span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
					<span style={{ color }}>→</span>
					docs
				</span>
			</div>
		</a>
	);
}

export function FleetDemo() {
	return (
		<div className="px-1 py-1.5">
			<div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
				{AGENTS.map((agent, idx) => (
					<FleetCard
						key={agent.id}
						agent={agent}
						color={AGENT_HUE[agent.id] ?? "var(--ret-purple)"}
						meta={
							MACHINE_META[agent.id] ?? {
								id: "dm-0000",
								region: "us-east-1",
								uptime: "0h",
								cpu: "0.1 vCPU",
								mem: "64 MB",
								disk: "0.5 GB",
								tools: [],
								lines: ["$ agent wake", "ready."],
							}
						}
						delay={idx * 0.8}
					/>
				))}
			</div>
		</div>
	);
}
