"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { useReticleFrameCornersDefault } from "./ReticleFrameContext";
import { ReticleCross } from "./ReticleCross";

type Props = {
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	/**
	 * Pull the corner cross marks outside the border so the SVG's center
	 * pins exactly on the corner intersection. ReticleCross renders a
	 * 20x20 SVG with the `+` at (10,10), so the offset must equal the
	 * full crossArm (10px). Override only if you're rendering the cross
	 * at a non-default size.
	 */
	crossOffset?: number;
	/**
	 * Whether to render any of the four corner crosses. Pass `false` to
	 * temporarily hide them without removing the wrapping component.
	 */
	corners?: boolean;
	as?: "div" | "section" | "article";
};

/**
 * Bordered frame with `+` cross marks at all four corners. The default
 * Reticle pattern: hairline border, sharp edges, structural marks at
 * the corner intersections. Use as a drop-in for cards, panels, and
 * any container that wants to read as part of the engineering grid.
 *
 *   <ReticleFrame className="p-6">
 *     <h2>...</h2>
 *   </ReticleFrame>
 */
export function ReticleFrame({
	children,
	className,
	style,
	crossOffset = 10,
	corners,
	as: Tag = "div",
}: Props) {
	const cornersDefault = useReticleFrameCornersDefault();
	const showCorners = corners ?? cornersDefault ?? true;
	const off = `-${crossOffset}px`;
	return (
		<Tag
			className={cn(
				"relative border border-[var(--ret-border)] bg-[var(--ret-bg)]",
				className,
			)}
			style={style}
		>
			{showCorners ? (
				<>
					<ReticleCross className="absolute" style={{ top: off, left: off }} />
					<ReticleCross className="absolute" style={{ top: off, right: off }} />
					<ReticleCross className="absolute" style={{ bottom: off, left: off }} />
					<ReticleCross className="absolute" style={{ bottom: off, right: off }} />
				</>
			) : null}
			{children}
		</Tag>
	);
}
