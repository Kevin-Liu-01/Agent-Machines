"use client";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";

export function BetaBanner() {
	return (
		<div className="px-[var(--dashboard-gutter,20px)] pt-4">
			<div className="flex items-center gap-3">
				<p className="text-xs leading-5 text-[var(--ret-text-muted)]">
					<ReticleBadge variant="accent" className="mr-2 inline-flex">
						Early access
					</ReticleBadge>
					Some integrations require additional setup, and provider limits
					still apply. Back up important work.
				</p>
			</div>
		</div>
	);
}
