"use client";

import { AnimatedBrandMark } from "@/components/AnimatedBrandMark";
import { cn } from "@/lib/cn";
import type { AgentKind } from "@/lib/user-config/schema";

type Variant = AgentKind | "both";

type Props = {
	size?: number;
	className?: string;
	withLabel?: boolean;
	gap?: "tight" | "default";
	/**
	 * Reserved for surfaces that pin a single agent in copy; the lockup
	 * always cycles partner marks at cruise speed (no intro spin).
	 */
	agent?: Variant;
	/** @deprecated Use AnimatedBrandMark `intro` directly. Lockups never spin fast on mount. */
	intro?: boolean;
};

/**
 * Lockup of the Agent Machines mark × rotating partner marks separated by "×".
 * Delegates to AnimatedBrandMark at normal cruise speed (no initial fast spin).
 */
export function BrandMark({
	size = 22,
	className,
	withLabel = true,
	gap = "default",
	intro = false,
}: Props) {
	return (
		<span
			className={cn(
				"inline-flex items-center font-mono text-[var(--ret-text)]",
				gap === "tight" ? "gap-1.5" : "gap-2.5",
				className,
			)}
		>
			<AnimatedBrandMark size={size} gap={gap} intro={intro} />
			{withLabel ? <span className="text-sm">agent-machines</span> : null}
		</span>
	);
}
