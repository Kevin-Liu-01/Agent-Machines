import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
};

/** Uppercase mono section label. Used like a kicker above headings. */
export function ReticleLabel({ children, className }: Props) {
	return (
		<p
			className={cn(
				"text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]",
				className,
			)}
		>
			{children}
		</p>
	);
}
