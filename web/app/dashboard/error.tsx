"use client";

import { DashboardErrorState } from "@/components/dashboard/DashboardErrorState";

/**
 * Segment-level error boundary for the whole /dashboard subtree (overview,
 * machine chat/terminal, containers, etc). A crash in any dashboard page now
 * renders a recoverable card inside the dashboard shell instead of replacing
 * the entire app with the bare Next.js error page.
 *
 * Errors thrown by app/dashboard/layout.tsx itself bubble past this boundary
 * to app/global-error.tsx.
 */
export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className="p-4 md:p-6">
			<DashboardErrorState error={error} reset={reset} scope="the dashboard" />
		</div>
	);
}
