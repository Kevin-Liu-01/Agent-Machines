import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

import { RETICLE_SIZES } from "./constants";

type Props = {
	className?: string;
	style?: CSSProperties;
	size?: number;
};

/**
 * The `+` mark drawn at structural intersections. Position absolutely from
 * the parent -- the SVG is sized by `size * 2` and centered on the intersection.
 */
export function ReticleCross({ className, style, size = RETICLE_SIZES.crossArm }: Props) {
	const full = size * 2;
	return (
		<svg
			width={full}
			height={full}
			viewBox={`0 0 ${full} ${full}`}
			className={cn("pointer-events-none", className)}
			style={style}
			aria-hidden="true"
		>
			<line
				x1={size}
				y1={0}
				x2={size}
				y2={full}
				stroke="var(--ret-cross)"
				strokeWidth={RETICLE_SIZES.crossStroke}
			/>
			<line
				x1={0}
				y1={size}
				x2={full}
				y2={size}
				stroke="var(--ret-cross)"
				strokeWidth={RETICLE_SIZES.crossStroke}
			/>
		</svg>
	);
}
