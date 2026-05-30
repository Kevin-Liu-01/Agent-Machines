"use client";

import { useEffect } from "react";

import { Logo } from "@/components/Logo";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";

export type DashboardErrorStateProps = {
	error: Error & { digest?: string };
	reset: () => void;
	/** Short label for what failed, e.g. "the overview". */
	scope?: string;
};

/**
 * Recoverable error UI for App Router error boundaries. Keeps the user on a
 * branded surface with a retry instead of dropping to the bare Next.js error
 * page. The underlying error is logged to the console (and carries a `digest`
 * that correlates with the server-side log) so the real stack is recoverable
 * even though production bundles are minified.
 */
export function DashboardErrorState({
	error,
	reset,
	scope = "this view",
}: DashboardErrorStateProps) {
	useEffect(() => {
		console.error(`[dashboard] render error in ${scope}:`, error);
	}, [error, scope]);

	return (
		<ReticleFrame className="p-6">
			<div className="flex flex-col items-center gap-4 py-8 text-center">
				<Logo mark="am" size={28} />
				<h2 className="ret-display text-lg">Something broke rendering {scope}</h2>
				<p className="max-w-[52ch] text-[13px] text-[var(--ret-text-dim)]">
					The rest of the dashboard is still live. Retry to re-render this
					panel, or head back to the fleet overview.
				</p>
				{error.digest ? (
					<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						ref {error.digest}
					</p>
				) : null}
				{process.env.NODE_ENV !== "production" && error.message ? (
					<pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words border border-[var(--ret-border)] bg-[var(--ret-surface)] px-3 py-2 text-left font-mono text-[11px] text-[var(--ret-red)]">
						{error.message}
					</pre>
				) : null}
				<div className="flex flex-wrap items-center justify-center gap-2">
					<ReticleButton onClick={reset} variant="primary" size="sm">
						Retry
					</ReticleButton>
					<ReticleButton as="a" href="/dashboard" variant="secondary" size="sm">
						Back to overview
					</ReticleButton>
				</div>
			</div>
		</ReticleFrame>
	);
}
