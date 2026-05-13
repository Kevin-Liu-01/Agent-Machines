import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
};

/**
 * Sticky top navbar. Renders full-width so its bottom border extends
 * edge-to-edge across the rails (matches the section divider pattern).
 * Inner content centers within `--ret-content-max`.
 */
export function ReticleNavbar({ children, className }: Props) {
	return (
		<nav
			aria-label="Main"
			className={cn(
				"sticky top-0 z-30 border-b border-[var(--ret-border)]",
				"bg-[var(--ret-bg)]/85 backdrop-blur-md",
				className,
			)}
		>
			<div className="mx-auto w-full max-w-[var(--ret-content-max)]">{children}</div>
		</nav>
	);
}
