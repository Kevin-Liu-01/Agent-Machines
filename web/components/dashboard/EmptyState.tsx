import type { ReactNode } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";

type Props = {
	title: string;
	description: ReactNode;
	hint?: ReactNode;
	action?: { label: string; href: string };
};

/**
 * Shared empty / offline / config-missing state. Hatched header strip
 * gives the box visible texture without resorting to an illustration --
 * the agent is doing nothing, so the surface looks like nothing is
 * there. Dashboard frames omit Reticle corner crosses via shell context.
 */
export function EmptyState({ title, description, hint, action }: Props) {
	return (
		<div className="mx-auto max-w-2xl px-6 py-16">
			<ReticleFrame>
				<ReticleHatch className="h-10 w-full border-b border-[var(--ret-border)]" />
				<div className="p-10 text-center">
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
						<pre className="mx-auto mt-5 inline-block border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2 text-left font-mono text-[12px] text-[var(--ret-text-dim)]">
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
			</ReticleFrame>
		</div>
	);
}
