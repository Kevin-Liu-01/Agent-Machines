"use client";

import { cn } from "@/lib/cn";
import { PROVIDER_LABEL, type MigrationState } from "@/lib/user-config/schema";

/**
 * Sibling of BootstrapPhaseBadge, same visual grammar, for the migrate
 * operation. Renders nothing for idle/absent state -- a machine that never
 * migrated should not wear a badge about it.
 */

const PHASE_TONE: Record<MigrationState["phase"], string> = {
	idle: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
	running:
		"border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]",
	succeeded:
		"border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]",
	failed: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]",
};

export function MigrationPhaseBadge({
	state,
	className,
}: {
	state: MigrationState | null | undefined;
	className?: string;
}) {
	if (!state || state.phase === "idle") return null;

	const target = state.targetSubstrate ? PROVIDER_LABEL[state.targetSubstrate] : "?";
	const label =
		state.phase === "running"
			? `move · ${state.step ?? "…"}`
			: state.phase === "succeeded"
				? `moved to ${target}`
				: "move failed";

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em]",
				PHASE_TONE[state.phase],
				className,
			)}
			title={
				state.lastError ??
				(state.step ? `step: ${state.step} -> ${target}` : `-> ${target}`)
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
