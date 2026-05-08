import type { CSSProperties, ReactNode } from "react";

import { WingBackground } from "@/components/WingBackground";
import { cn } from "@/lib/cn";

import { ReticleCross } from "./ReticleCross";

type Props = {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	borderTop?: boolean;
	borderBottom?: boolean;
	/** Render `+` cross marks where the top border meets the page rails. */
	corners?: boolean;
	/**
	 * Background hatching behind the inner content column.
	 *
	 * - "none" (default): solid `--ret-bg`.
	 * - "hatch": diagonal margin-rail pattern, used for "feature highlight"
	 *   sections (Tailwind's marketing site uses this look).
	 * - "wing-cloud" / "wing-nyx-lines" / "wing-nyx-waves": subtle
	 *   wing-cloud / nyx-line / nyx-wave imagery as a cover-bg layer
	 *   beneath the content; reads as ambient brand wallpaper without
	 *   ever overpowering the copy.
	 */
	background?:
		| "none"
		| "hatch"
		| "wing-cloud"
		| "wing-nyx-lines"
		| "wing-nyx-waves";
	as?: "section" | "div" | "header" | "footer" | "main";
	id?: string;
};

const SECTION_HATCH =
	"repeating-linear-gradient(135deg, var(--ret-rail) 0 1px, transparent 1px 5px)";

const WING_VARIANT: Record<
	"wing-cloud" | "wing-nyx-lines" | "wing-nyx-waves",
	"cloud" | "nyx-lines" | "nyx-waves"
> = {
	"wing-cloud": "cloud",
	"wing-nyx-lines": "nyx-lines",
	"wing-nyx-waves": "nyx-waves",
};

/**
 * A page section. Renders full-width so its `border-t` / `border-b`
 * extend edge-to-edge through the page-grid margin hatching, breaking
 * the rails into discrete segments (Tailwind / chanhdai pattern). The
 * inner content is constrained to `--ret-content-max`, centered, and
 * paints `--ret-bg` so the diagonal margin hatching stops cleanly at
 * the rails -- it never bleeds into copy.
 *
 * Pass `background="hatch"` to flip that: the inner content area gets
 * the hatch and the section reads as one continuous patterned strip.
 */
export function ReticleSection({
	children,
	className,
	contentClassName = "px-6 py-14 md:py-16",
	borderTop = true,
	borderBottom = false,
	corners,
	background = "none",
	as: Tag = "section",
	id,
}: Props) {
	const showCorners = corners ?? borderTop;
	const isHatch = background === "hatch";
	const isWing =
		background === "wing-cloud" ||
		background === "wing-nyx-lines" ||
		background === "wing-nyx-waves";
	const innerStyle: CSSProperties = isHatch
		? { backgroundImage: SECTION_HATCH }
		: {};
	return (
		<Tag
			id={id}
			className={cn(
				"relative",
				borderTop && "border-t border-[var(--ret-border)]",
				borderBottom && "border-b border-[var(--ret-border)]",
				className,
			)}
		>
			{isWing ? (
				<WingBackground
					variant={WING_VARIANT[background]}
					opacity={{ light: 0.45, dark: 0.30 }}
				/>
			) : null}
			{showCorners ? (
				<>
					{/*
					  ReticleCross renders a 20x20 SVG with the `+` centered at
					  (10,10). To pin the center on the rail intersection we
					  offset by the full crossArm (10px), not half. With the
					  half-offset the marks looked floated off the rails by 5px
					  in each direction; with the full offset they land exactly
					  on the rail/border crossing.
					*/}
					<ReticleCross
						className="absolute z-20"
						style={{
							top: "-10px",
							left: "calc(var(--ret-rail-offset) - 10px)",
						}}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{
							top: "-10px",
							right: "calc(var(--ret-rail-offset) - 10px)",
						}}
					/>
				</>
			) : null}
			<div
				className={cn(
					"relative z-10 mx-auto max-w-[var(--ret-content-max)]",
					isHatch || isWing ? null : "bg-[var(--ret-bg)]",
					contentClassName,
				)}
				style={innerStyle}
			>
				{children}
			</div>
		</Tag>
	);
}
