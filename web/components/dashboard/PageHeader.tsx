import type { ReactNode } from "react";

import { CircuitArt } from "@/components/reticle/CircuitArt";
import { getCategoryArt } from "@/lib/dashboard/category-art";
import { cn } from "@/lib/cn";

type Props = {
	kicker: string;
	title: string;
	description?: ReactNode;
	right?: ReactNode;
	/** Circuit-art slug; defaults to the first word of the kicker (lowercased). */
	artSlug?: string;
};

/**
 * Page header used on every dashboard route. A single clean hairline
 * (border-b) closes the header -- no hatched spacer strip, matching the
 * calmer wiki-style aesthetic.
 *
 * Typography:
 *   - kicker: compact body text -- structural marker
 *   - title:  ret-display (Nacelle SemiBold, tight) -- the primary heading
 *   - description: Nacelle (sans) at body weight -- prose, not metadata
 */
export function PageHeader({ kicker, title, description, right, artSlug }: Props) {
	const slug =
		artSlug ?? kicker.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
	const hasArt = Boolean(getCategoryArt(slug));
	return (
		<header className={cn("group relative border-b border-[var(--ret-border)]")}>
			{hasArt ? (
				<div className={cn("pointer-events-none absolute inset-0 overflow-hidden")} aria-hidden="true">
					<CircuitArt slug={slug} variant="ambient" />
				</div>
			) : null}
			<div className={cn("relative z-10 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-5 sm:py-6")}>
				<div className="min-w-0 flex-1">
					<p className={cn("text-[13px] font-medium text-[var(--ret-text-muted)]")}>{kicker}</p>
					<h1 className={cn("ret-display mt-2 break-words text-3xl leading-tight sm:text-[32px]")}>{title}</h1>
					{description ? (
						<p className={cn("mt-3 max-w-[72ch] text-base leading-7 text-[var(--ret-text-dim)]")}>
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
