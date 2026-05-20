"use client";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";

export function BetaBanner() {
	if (process.env.NODE_ENV !== "development") return null;

	return (
		<div className="border-b border-[var(--ret-purple)]/25 bg-[var(--ret-purple-glow)] px-4 py-2">
			<div className="mx-auto flex max-w-[1600px] items-center gap-3">
				<p className="text-[11px] text-[var(--ret-text-muted)]">
					<ReticleBadge variant="accent" className="mr-2 inline-flex">
						BETA
					</ReticleBadge>
					Everything is still in testing on local.
				</p>
			</div>
		</div>
	);
}
