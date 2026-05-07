import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

type Props = {
	kicker: string;
	title: string;
	description?: ReactNode;
	right?: ReactNode;
};

/**
 * Page header used on every dashboard route. Mirrors the marketing landing's
 * heading rhythm but at smaller scale -- 2xl title, dim description, optional
 * right-side action area for inline tools (filters, refresh, etc.).
 *
 * A muted BrandMark sits on the right when no other action is supplied so
 * the partner attribution is felt across the auth-gated surface, not just
 * on the public landing.
 */
export function PageHeader({ kicker, title, description, right }: Props) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ret-border)] px-6 pt-7 pb-6">
			<div className="min-w-0 flex-1">
				<ReticleLabel>{kicker}</ReticleLabel>
				<h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-[28px]">
					{title}
				</h1>
				{description ? (
					<p className="mt-2 max-w-[68ch] text-sm text-[var(--ret-text-dim)]">
						{description}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-3">
				{right ?? (
					<BrandMark
						size={18}
						gap="tight"
						withLabel={false}
						className="opacity-60 hover:opacity-100 transition-opacity"
					/>
				)}
			</div>
		</div>
	);
}
