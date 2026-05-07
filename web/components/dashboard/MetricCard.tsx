import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "default" | "ok" | "warn" | "error" | "purple";

const TONE: Record<Tone, string> = {
	default: "text-[var(--ret-text)]",
	ok: "text-[var(--ret-green)]",
	warn: "text-[var(--ret-amber)]",
	error: "text-[var(--ret-red)]",
	purple: "text-[var(--ret-purple)]",
};

type Props = {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	tone?: Tone;
	className?: string;
};

/**
 * Dense single-metric card for the overview grid. The numeric value uses
 * `tabular-nums` so a stack of cards aligns vertically even when widths
 * differ (e.g. "running" vs "1024 ms").
 */
export function MetricCard({ label, value, hint, tone = "default", className }: Props) {
	return (
		<div
			className={cn(
				"rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)]",
				"p-5 transition-colors duration-200 hover:border-[var(--ret-border-hover)]",
				className,
			)}
		>
			<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p
				className={cn(
					"mt-3 font-mono text-2xl tabular-nums leading-none",
					TONE[tone],
				)}
			>
				{value}
			</p>
			{hint ? (
				<p className="mt-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
					{hint}
				</p>
			) : null}
		</div>
	);
}
