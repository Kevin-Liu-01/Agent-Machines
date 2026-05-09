import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { ReticleCross } from "./ReticleCross";

type Props = {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	/** Top hairline rule. Default true. */
	borderTop?: boolean;
	/** Bottom hairline rule. Default true. */
	borderBottom?: boolean;
	/**
	 * Fill the left + right margin strips (between viewport edge and
	 * the inner content column) with the same diagonal hatch the
	 * page-grid uses. Reads as engineering-blueprint texture flanking
	 * the content -- exactly the chanhdai / Tailwind moves where a
	 * row of cards sits inside a "corridor" of hatched margins.
	 *
	 * Off by default so a band reads as a clean full-width strip;
	 * turn on for sections that want to advertise structural
	 * importance (machine stack, capability grid, etc.).
	 */
	hatchMargins?: boolean;
	/**
	 * Where to render `+` cross marks at rail/border intersections.
	 *  - `"none"`: don't render any.
	 *  - `"top"`: only at the top border + rails.
	 *  - `"bottom"`: only at the bottom border + rails.
	 *  - `"all"` (default): every intersection where a border exists.
	 *
	 * Each mark is suppressed automatically if the corresponding
	 * border is off (no point pinning a `+` to an absent line).
	 */
	corners?: "all" | "top" | "bottom" | "none";
	as?: "section" | "div" | "header" | "footer";
	id?: string;
	style?: CSSProperties;
};

const MARGIN_HATCH =
	"repeating-linear-gradient(135deg, var(--ret-rail) 0 1px, transparent 1px 5px)";

/**
 * Full-viewport-width strip with the chanhdai / Tailwind hairline look.
 *
 * Use as a sibling between sections (NOT inside a `<ReticleSection>`,
 * which centers content). The band itself spans 100% of the viewport
 * so its `border-t` / `border-b` extend edge-to-edge through the
 * margin hatching, giving the section that "horizontal hairline
 * crosses the rails" effect. Inner content is constrained to
 * `--ret-content-max` and centered, same as `ReticleSection`.
 *
 * Differences from `<ReticleSection>`:
 *   - Paints its own hatched margin strips (`hatchMargins=true`) so a
 *     stack of bands reads as a structural ladder -- each band's
 *     margin strip is its own boxed cell.
 *   - Doesn't carry brand wing imagery; that's still
 *     `<ReticleSection background="wing-*">`.
 *   - Defaults to top + bottom borders (a section is open-bottomed by
 *     default; a band is closed top + bottom).
 */
export function ReticleBand({
	children,
	className,
	contentClassName = "px-6 py-6 md:py-8",
	borderTop = true,
	borderBottom = true,
	hatchMargins = false,
	corners = "all",
	as: Tag = "div",
	id,
	style,
}: Props) {
	const showTopCorners =
		borderTop && (corners === "all" || corners === "top");
	const showBottomCorners =
		borderBottom && (corners === "all" || corners === "bottom");
	return (
		<Tag
			id={id}
			className={cn(
				"relative w-full",
				borderTop && "border-t border-[var(--ret-border)]",
				borderBottom && "border-b border-[var(--ret-border)]",
				className,
			)}
			style={style}
		>
			{hatchMargins ? (
				<>
					{/*
					  Margin hatch strips, one per side. Width is exactly
					  --ret-rail-offset so they collapse to zero on narrow
					  viewports where the rails sit at the screen edge.
					  Sits at z-0 below both content and cross marks.
					*/}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute top-0 bottom-0 left-0 z-0"
						style={{
							width: "var(--ret-rail-offset)",
							backgroundImage: MARGIN_HATCH,
						}}
					/>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute top-0 bottom-0 right-0 z-0"
						style={{
							width: "var(--ret-rail-offset)",
							backgroundImage: MARGIN_HATCH,
						}}
					/>
				</>
			) : null}
			{showTopCorners ? (
				<>
					<ReticleCross
						className="absolute z-20"
						style={{
							top: "-5px",
							left: "calc(var(--ret-rail-offset) - 5px)",
						}}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{
							top: "-5px",
							right: "calc(var(--ret-rail-offset) - 5px)",
						}}
					/>
				</>
			) : null}
			{showBottomCorners ? (
				<>
					<ReticleCross
						className="absolute z-20"
						style={{
							bottom: "-5px",
							left: "calc(var(--ret-rail-offset) - 5px)",
						}}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{
							bottom: "-5px",
							right: "calc(var(--ret-rail-offset) - 5px)",
						}}
					/>
				</>
			) : null}
			<div
				className={cn(
					"relative z-10 mx-auto max-w-[var(--ret-content-max)] bg-[var(--ret-bg)]",
					contentClassName,
				)}
			>
				{children}
			</div>
		</Tag>
	);
}
