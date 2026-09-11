import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	kicker: string;
	title: string;
	description?: ReactNode;
	right?: ReactNode;
	/** Kept for callers that also use this category for empty-state artwork. */
	artSlug?: string;
};

/**
 * Shared dashboard heading. Its gutter matches the content and top bar;
 * supporting copy and actions wrap independently on narrow screens.
 *
 * Typography:
 *   - kicker: compact body text -- structural marker
 *   - title:  ret-display (Nacelle SemiBold, tight) -- the primary heading
 *   - description: Nacelle (sans) at body weight -- prose, not metadata
 */
export function PageHeader({ kicker, title, description, right }: Props) {
	return (
		<header data-page-header>
			<div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-[var(--dashboard-gutter,20px)] pb-1 pt-5 sm:pt-6")}>
				<div className="min-w-0 flex-1">
					{kicker !== title ? <p className={cn("mb-1 text-xs font-medium text-[var(--ret-text-muted)]")}>{kicker}</p> : null}
					<h1 className={cn("ret-display break-words text-[28px] leading-tight tracking-tight sm:text-[32px]")}>{title}</h1>
					{description ? (
						<p className={cn("mt-1.5 max-w-[68ch] text-[15px] leading-6 text-[var(--ret-text-dim)]")}>
							{description}
						</p>
					) : null}
				</div>
				{right ? (
					<div className={cn("flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:max-w-full")}>{right}</div>
				) : null}
			</div>
		</header>
	);
}
