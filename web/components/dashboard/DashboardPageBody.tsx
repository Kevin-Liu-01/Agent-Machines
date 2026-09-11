import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Standard dashboard body shell.
 *
 * PageHeader uses `px-5`; dashboard bodies must match so hairlines,
 * side rails, and dense cards line up from route to route.
 */
export function DashboardPageBody({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div data-dashboard-body className={cn("min-w-0 space-y-4 px-[var(--dashboard-gutter,20px)] py-4 sm:py-5", className)}>
			{children}
		</div>
	);
}
