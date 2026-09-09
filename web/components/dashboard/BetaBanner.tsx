"use client";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";

export function BetaBanner() {
	return (
		<div className="border-b border-[var(--ret-purple)]/25 bg-[var(--ret-purple-glow)] px-4 py-2">
			<div className="mx-auto flex max-w-[1600px] items-center gap-3">
				<p className="text-[11px] text-[var(--ret-text-muted)]">
					<ReticleBadge variant="accent" className="mr-2 inline-flex">
						EARLY ACCESS
					</ReticleBadge>
					Some integrations require additional setup, and provider limits
					still apply. Back up important work.
				</p>
			</div>
		</div>
	);
}
