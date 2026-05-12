"use client";

import { useState } from "react";

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

export function AgentCommandToggle() {
	const [active, setActive] = useState<AgentKind>("hermes");
	const meta = AGENTS.find((a) => a.id === active)!;
	const rows = commandsFor(meta);

	return (
		<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
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

			{/* Agent header */}
			<div className="flex items-center justify-between bg-[var(--ret-bg)] px-4 py-3">
				<div className="flex items-center gap-2">
					<Logo mark={meta.logoMark} size={18} />
					<span className="font-mono text-sm font-semibold text-[var(--ret-text)]">
						{meta.name}
					</span>
					<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						by {meta.by}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<ReticleBadge
						variant={meta.operationModel === "autonomous" ? "accent" : "warning"}
					>
						{meta.operationModel}
					</ReticleBadge>
				</div>
			</div>

			{/* Description */}
			<div className="bg-[var(--ret-bg)] px-4 py-2">
				<p className="max-w-[72ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					{meta.capabilities}
				</p>
			</div>

			{/* Command rows */}
			<div className="grid gap-px bg-[var(--ret-border)]">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex items-center justify-between gap-4 bg-[var(--ret-bg)] px-4 py-2"
					>
						<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{row.label}
						</span>
						<code className="min-w-0 truncate text-right font-mono text-[11px] text-[var(--ret-text)]">
							{row.value}
						</code>
					</div>
				))}
			</div>

			{/* Provider options */}
			<div className="bg-[var(--ret-bg)] px-4 py-2">
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					ai provider options
				</span>
			</div>
			<div className="grid gap-px bg-[var(--ret-border)]">
				{meta.providerOptions.map((opt, i) => (
					<div
						key={opt.key}
						className="flex items-center justify-between gap-4 bg-[var(--ret-bg)] px-4 py-2"
					>
						<span className="flex items-center gap-2">
							{i === 0 ? (
								<span className="h-1.5 w-1.5 shrink-0 bg-[var(--ret-green)]" />
							) : (
								<span className="h-1.5 w-1.5 shrink-0 bg-[var(--ret-border)]" />
							)}
							<span className="font-mono text-[11px] text-[var(--ret-text)]">
								{opt.label}
							</span>
						</span>
						<span className="flex items-center gap-2">
							{opt.hint ? (
								<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
									{opt.hint}
								</span>
							) : null}
							<code className="font-mono text-[10px] text-[var(--ret-text-dim)]">
								{opt.key}
							</code>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
