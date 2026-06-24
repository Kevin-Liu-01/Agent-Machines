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
		<div className={cn("space-y-4 px-4 py-4 sm:px-5", className)}>
			{children}
		</div>
	);
}
