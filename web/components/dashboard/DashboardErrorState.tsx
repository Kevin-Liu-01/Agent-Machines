"use client";

import { useEffect } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { RefreshCcw, TriangleAlert } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

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
		<ReticleFrame className={cn("mx-auto w-full max-w-2xl px-5 py-8 sm:p-10")}>
			<div className={cn("flex min-w-0 flex-col items-center gap-4 text-center")}>
				<span className="grid size-12 place-items-center rounded-lg bg-[var(--ret-bg-soft)] text-[var(--ret-amber)]"><TriangleAlert className="size-6" aria-hidden="true" /></span>
				<h2 className={cn("ret-display text-2xl text-[var(--ret-text)]")}>Couldn’t load {scope}</h2>
				<p className={cn("max-w-[52ch] text-base leading-7 text-[var(--ret-text-dim)]")}>
					Try loading this view again, or return to the fleet overview.
				</p>
				{error.digest ? (
					<p className={cn("max-w-full break-all font-mono text-xs text-[var(--ret-text-muted)]")}>
						Reference: {error.digest}
					</p>
				) : null}
				{process.env.NODE_ENV !== "production" && error.message ? (
					<pre className={cn("max-w-full overflow-x-auto whitespace-pre-wrap break-words border border-[var(--ret-border)] bg-[var(--ret-surface)] px-3 py-2 text-left font-mono text-xs leading-5 text-[var(--ret-red)]")}>
						{error.message}
					</pre>
				) : null}
				<div className="flex flex-wrap items-center justify-center gap-2">
					<ReticleButton onClick={reset} variant="primary" size="sm">
						<RefreshCcw className="size-4" aria-hidden="true" />
						Try again
					</ReticleButton>
					<ReticleButton as="a" href="/dashboard" variant="secondary" size="sm">
						Back to overview
					</ReticleButton>
				</div>
			</div>
		</ReticleFrame>
	);
}
