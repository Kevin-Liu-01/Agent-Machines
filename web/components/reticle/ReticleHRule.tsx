import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children?: ReactNode;
	className?: string;
	/**
	 * "hatch" -- diagonal hairline pattern between the two segment lines
	 * "cross" -- a single cross mark in the middle (default)
	 * "label" -- pass `children` as inline content with rules on either side
	 * "plain" -- single hairline edge to edge
	 */
	variant?: "hatch" | "cross" | "label" | "plain";
};

/**
 * Horizontal rule with optional accent shape in the middle. Cheap way
 * to break sections without adding margin -- the rule itself IS the
 * separator. Pair with ReticleSection's borderTop=false to use this
 * instead of the section border.
 */
export function ReticleHRule({ children, className, variant = "cross" }: Props) {
	if (variant === "plain") {
		return (
			<hr
				className={cn("border-t border-[var(--ret-border)] my-0", className)}
				aria-hidden="true"
			/>
		);
	}
	if (variant === "hatch") {
		return (
			<div
				role="separator"
				aria-hidden="true"
				className={cn(
					"relative h-6 w-full border-y border-[var(--ret-border)]",
					className,
				)}
				style={{
					backgroundImage:
						"repeating-linear-gradient(45deg, var(--ret-rail) 0 1px, transparent 1px 8px)",
				}}
			/>
		);
	}
	if (variant === "label") {
		return (
			<div
				role="separator"
				aria-label={typeof children === "string" ? children : undefined}
				className={cn(
					"flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]",
					className,
				)}
			>
				<span className="h-px flex-1 bg-[var(--ret-border)]" />
				<span>{children}</span>
				<span className="h-px flex-1 bg-[var(--ret-border)]" />
			</div>
		);
	}
	return (
		<div
			role="separator"
			aria-hidden="true"
			className={cn("relative flex items-center gap-3", className)}
		>
			<span className="h-px flex-1 bg-[var(--ret-border)]" />
			<svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
				<line
					x1={6}
					y1={0}
					x2={6}
					y2={12}
					stroke="var(--ret-cross)"
					strokeWidth={1.5}
				/>
				<line
					x1={0}
					y1={6}
					x2={12}
					y2={6}
					stroke="var(--ret-cross)"
					strokeWidth={1.5}
				/>
			</svg>
			<span className="h-px flex-1 bg-[var(--ret-border)]" />
		</div>
	);
}
