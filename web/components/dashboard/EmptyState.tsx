import type { ReactNode } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";
import { cn } from "@/lib/cn";

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
		<div className={cn("mx-auto w-full max-w-2xl px-4 py-8 sm:px-5 sm:py-12")}>
			<ReticleFrame>
				<div className={cn("px-5 py-8 text-center sm:p-10")}>
					{artSlug || artSrc ? (
						<SchematicPanel
							slug={artSlug}
							src={artSrc}
							className="mx-auto mb-7 w-full max-w-[260px]"
						/>
					) : null}
					<h2 className={cn("text-2xl font-semibold tracking-tight text-[var(--ret-text)]")}>
						{title}
					</h2>
					<p className={cn("mx-auto mt-3 max-w-[52ch] text-base leading-7 text-[var(--ret-text-dim)]")}>
						{description}
					</p>
					{hint ? (
						<pre className={cn("mx-auto mt-5 max-w-full overflow-x-auto whitespace-pre-wrap break-words border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-3 text-left font-mono text-xs leading-5 text-[var(--ret-text-dim)]")}>
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
