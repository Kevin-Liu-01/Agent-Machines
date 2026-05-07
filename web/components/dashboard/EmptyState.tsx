import type { ReactNode } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";

type Props = {
	title: string;
	description: ReactNode;
	hint?: ReactNode;
	action?: { label: string; href: string };
};

/**
 * Shared empty / offline / config-missing state for PR2 dashboard pages.
 * One pattern across all three so an offline machine reads the same way
 * whether you're looking at sessions, logs, or cursor runs.
 */
export function EmptyState({ title, description, hint, action }: Props) {
	return (
		<div className="mx-auto max-w-2xl px-6 py-16">
			<div className="rounded-[var(--ret-card-radius)] border border-dashed border-[var(--ret-border)] bg-[var(--ret-bg)] p-10 text-center">
				<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					Nothing here yet
				</p>
				<h2 className="mt-3 text-xl font-semibold tracking-tight">
					{title}
				</h2>
				<p className="mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-[var(--ret-text-dim)]">
					{description}
				</p>
				{hint ? (
					<pre className="mx-auto mt-5 inline-block rounded-md border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2 text-left font-mono text-[12px] text-[var(--ret-text-dim)]">
						{hint}
					</pre>
				) : null}
				{action ? (
					<div className="mt-6 flex justify-center">
						<ReticleButton as="a" href={action.href} variant="secondary" size="sm">
							{action.label}
						</ReticleButton>
					</div>
				) : null}
			</div>
		</div>
	);
}
