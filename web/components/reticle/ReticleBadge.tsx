import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "default" | "accent" | "success" | "warning";

const VARIANT: Record<Variant, string> = {
	default: "border-[var(--ret-border)] text-[var(--ret-text-dim)]",
	accent:
		"border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]",
	success: "border-[var(--ret-green)]/30 bg-[var(--ret-green)]/10 text-[var(--ret-green)]",
	warning: "border-[var(--ret-amber)]/30 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
};

type Props = {
	children: ReactNode;
	variant?: Variant;
	className?: string;
};

export function ReticleBadge({ children, variant = "default", className }: Props) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-[11px] leading-tight",
				VARIANT[variant],
				className,
			)}
		>
			{children}
		</span>
	);
}
