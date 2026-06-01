import type { ReactNode } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";

type Props = {
	title: string;
	description: ReactNode;
	hint?: ReactNode;
	action?: { label: string; href: string };
	/** Circuit-art slug for a framed schematic graphic (recipe B). */
	artSlug?: string;
	/** Explicit art src (e.g. an error graphic) if not a category slug. */
	artSrc?: string;
};

/**
 * Shared empty / offline / config-missing state. When given art, a framed
 * schematic graphic (recipe B) anchors the surface so "nothing here" still
 * feels intentional; otherwise it stays a clean bordered card. Dashboard
 * frames omit Reticle corner crosses via shell context.
 */
export function EmptyState({
	title,
	description,
	hint,
	action,
	artSlug,
	artSrc,
}: Props) {
	return (
		<div className="mx-auto max-w-2xl px-6 py-16">
			<ReticleFrame>
				<div className="p-10 text-center">
					{artSlug || artSrc ? (
						<SchematicPanel
							slug={artSlug}
							src={artSrc}
							className="mx-auto mb-7 w-full max-w-[260px]"
						/>
					) : null}
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
