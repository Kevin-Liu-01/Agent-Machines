import type { ReactNode } from "react";

import { CircuitArt } from "@/components/reticle/CircuitArt";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { getCategoryArt } from "@/lib/dashboard/category-art";

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
 *   - kicker: ReticleLabel (mono uppercase tracked) -- structural marker
 *   - title:  ret-display (Nacelle SemiBold, tight) -- the primary heading
 *   - description: Nacelle (sans) at body weight -- prose, not metadata
 */
export function PageHeader({ kicker, title, description, right, artSlug }: Props) {
	const slug =
		artSlug ?? kicker.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
	const hasArt = Boolean(getCategoryArt(slug));
	return (
		<header className="group relative overflow-hidden border-b border-[var(--ret-border)]">
			{hasArt ? <CircuitArt slug={slug} variant="ambient" /> : null}
			<div className="relative z-10 flex flex-wrap items-start justify-between gap-4 px-4 pt-5 pb-4 sm:px-5">
				<div className="min-w-0 flex-1">
					<ReticleLabel>{kicker}</ReticleLabel>
					<h1 className="ret-display mt-1.5 text-lg md:text-xl">{title}</h1>
					{description ? (
						<p className="mt-1.5 max-w-[72ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							{description}
						</p>
					) : null}
				</div>
				{right ? (
					<div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">{right}</div>
				) : null}
			</div>
		</header>
	);
}
