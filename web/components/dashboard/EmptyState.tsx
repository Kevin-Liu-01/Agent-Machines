import type { ReactNode } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ArrowRight, Boxes } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Props = {
	title: string;
	description: ReactNode;
	hint?: ReactNode;
	action?: { label: string; href: string };
	onRetry?: () => void;
	secondaryAction?: { label: string; href: string };
	/** Legacy artwork props retained for existing callers; states use quiet icons. */
	artSlug?: string;
	/** Explicit art src (e.g. an error graphic) if not a category slug. */
	artSrc?: string;
};

/**
 * Shared empty / offline / config-missing state. Every state explains the
 * prerequisite or recovery action instead of presenting an empty canvas.
 */
export function EmptyState({
	title,
	description,
	hint,
	action,
	secondaryAction,
	onRetry,
}: Props) {
	return (
		<div className={cn("mx-auto w-full max-w-3xl px-[var(--dashboard-gutter,20px)] py-4")}>
			<ReticleFrame>
				<div className={cn("p-5 text-center sm:p-6")}>
					<span className={cn("mx-auto mb-3 grid size-10 place-items-center rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-muted)]")}><Boxes className={cn("size-5")} aria-hidden="true" /></span>
					<h2 className={cn("text-xl font-semibold tracking-tight text-[var(--ret-text)]")}>
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
					{action || secondaryAction || onRetry ? (
						<div className="mt-4 flex flex-wrap justify-center gap-2">
							{onRetry ? <ReticleButton onClick={onRetry} variant="primary" size="sm">Try again</ReticleButton> : null}
							{action ? <ReticleButton as="a" href={action.href} variant={onRetry ? "secondary" : "primary"} size="sm">
								{action.label}
								<ArrowRight className={cn("size-4")} aria-hidden="true" />
							</ReticleButton> : null}
							{secondaryAction ? <ReticleButton as="a" href={secondaryAction.href} variant="secondary" size="sm">{secondaryAction.label}</ReticleButton> : null}
						</div>
					) : null}
				</div>
			</ReticleFrame>
		</div>
	);
}
