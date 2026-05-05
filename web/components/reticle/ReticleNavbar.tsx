import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
};

/** Inline navbar -- assumes it's inside a ReticlePageGrid content column. */
export function ReticleNavbar({ children, className }: Props) {
	return (
		<nav
			aria-label="Main"
			className={cn(
				"sticky top-0 z-50 border-b border-[var(--ret-border)]",
				"bg-[var(--ret-bg)]/85 backdrop-blur-md",
				className,
			)}
		>
			{children}
		</nav>
	);
}
