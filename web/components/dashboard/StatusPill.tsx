import type { MachinePhase } from "@/lib/dashboard/types";
import { cn } from "@/lib/cn";

type Props = {
	phase: MachinePhase | "loading";
	className?: string;
};

const STYLE: Record<string, string> = {
	running: "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]",
	starting: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
	wake_pending: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
	placement_pending: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
	accepted: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
	sleep_pending: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
	sleeping: "border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text-dim)]",
	failed: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]",
	destroyed: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]",
	destroying: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]",
	loading: "border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text-muted)]",
	unknown: "border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text-muted)]",
};

const LABEL: Record<string, string> = {
	running: "running",
	starting: "starting",
	wake_pending: "waking",
	placement_pending: "placing",
	accepted: "accepted",
	sleep_pending: "sleeping",
	sleeping: "sleeping",
	failed: "failed",
	destroyed: "destroyed",
	destroying: "destroying",
	loading: "...",
	unknown: "unknown",
};

const ACTIVE = new Set(["running", "starting", "wake_pending", "placement_pending", "accepted"]);

export function StatusPill({ phase, className }: Props) {
	const style = STYLE[phase] ?? STYLE.unknown;
	const label = LABEL[phase] ?? phase;
	const pulse = ACTIVE.has(phase);
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] leading-tight",
				style,
				className,
			)}
		>
			<span
				className={cn(
					"h-1.5 w-1.5 rounded-full bg-current",
					pulse && "animate-pulse",
				)}
				aria-hidden="true"
			/>
			{label}
		</span>
	);
}
