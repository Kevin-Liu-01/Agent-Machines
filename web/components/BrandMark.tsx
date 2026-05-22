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
	 * cycles partner marks at cruise speed unless `intro` is enabled.
	 */
	agent?: Variant;
	/** Fast initial carousel on mount (navbar hero moment). */
	intro?: boolean;
};

/**
 * Lockup of the Agent Machines mark × rotating partner marks separated by "×".
 * Pass `intro` for the fast spin on first paint (navbar).
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
			{withLabel ? (
				<span className="whitespace-nowrap text-sm">agent-machines</span>
			) : null}
		</span>
	);
}
