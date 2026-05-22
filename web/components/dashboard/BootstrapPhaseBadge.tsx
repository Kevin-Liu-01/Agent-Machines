"use client";

import { cn } from "@/lib/cn";
import type { BootstrapState } from "@/lib/user-config/schema";

const PHASE_TONE: Record<BootstrapState["phase"], string> = {
	idle: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
	running:
		"border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]",
	succeeded:
		"border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]",
	failed: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]",
};

const PHASE_LABEL: Record<BootstrapState["phase"], string> = {
	idle: "bootstrap idle",
	running: "bootstrapping",
	succeeded: "bootstrapped",
	failed: "bootstrap failed",
};

export function BootstrapPhaseBadge({
	state,
	className,
}: {
	state: BootstrapState;
	className?: string;
}) {
	const tone = PHASE_TONE[state.phase];
	const label =
		state.phase === "running" && state.current
			? `boot · ${state.current}`
			: PHASE_LABEL[state.phase];

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em]",
				tone,
				className,
			)}
			title={
				state.lastError ??
				(state.current ? `phase: ${state.current}` : undefined)
			}
		>
			<span
				className={cn(
					"h-1 w-1 bg-current",
					state.phase === "running" && "animate-pulse",
				)}
			/>
			{label}
		</span>
	);
}
