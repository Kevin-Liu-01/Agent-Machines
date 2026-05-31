"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

export const HEATMAP_CELL_PX = 13;

type Props = {
	/** Dashed border, no fill — same dimensions as active cells. */
	empty?: boolean;
	/** Outside the visible range — not clickable. */
	inert?: boolean;
	selected?: boolean;
	dimmed?: boolean;
	hue?: string;
	opacity?: number;
	title?: string;
	onClick?: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	className?: string;
	/** Stretch to fill the grid area (full-width heatmaps). */
	fill?: boolean;
	style?: CSSProperties;
};

/**
 * Fixed-size or fluid heatmap cell. Same box model for filled and empty slots
 * so the grid never drifts — only border style and fill change.
 */
export function HeatmapGridCell({
	empty = false,
	inert = false,
	selected = false,
	dimmed = false,
	hue,
	opacity = 1,
	title,
	onClick,
	onMouseEnter,
	onMouseLeave,
	className,
	fill = false,
	style,
}: Props) {
	const shared = cn(
		"box-border block p-0 leading-none",
		"m-0 min-h-0 min-w-0 appearance-none font-[inherit]",
		fill ? "h-full w-full" : "shrink-0",
		"transition-[transform,border-color,opacity] duration-100",
		empty || inert
			? "border border-dashed border-[var(--ret-border)]/35 bg-transparent"
			: cn(
					"cursor-pointer border border-[var(--ret-border)]/50",
					!selected && "hover:z-10 hover:scale-[1.1] hover:border-[var(--ret-text)]",
				),
		selected &&
			"z-20 scale-[1.1] border-[var(--ret-text)] outline outline-2 outline-offset-1 outline-[var(--ret-purple)]/70 shadow-[0_0_0_1px_var(--ret-bg)]",
		dimmed && "opacity-20",
		className,
	);

	const sizeStyle: CSSProperties = fill
		? { width: "100%", height: "100%" }
		: { width: HEATMAP_CELL_PX, height: HEATMAP_CELL_PX };

	const mergedStyle: CSSProperties = {
		...sizeStyle,
		background: !empty && !inert && hue ? hue : undefined,
		opacity: dimmed ? 0.2 : opacity,
		...style,
	};

	if (inert) {
		return (
			<button
				type="button"
				disabled
				tabIndex={-1}
				className={shared}
				style={mergedStyle}
				aria-hidden="true"
			/>
		);
	}

	return (
		<button
			type="button"
			title={title}
			className={shared}
			style={mergedStyle}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		/>
	);
}

/** Grid slot wrapper — one square per (week, day) with explicit placement. */
export function HeatmapGridSlot({
	weekIdx,
	dayIdx,
	children,
	className,
	/** +1 when a day-label column occupies grid column 1. */
	columnOffset = 0,
}: {
	weekIdx: number;
	dayIdx: number;
	children: ReactNode;
	className?: string;
	columnOffset?: number;
}) {
	return (
		<div
			className={cn(
				"box-border flex min-h-0 min-w-0 self-stretch justify-self-stretch [&>*]:h-full [&>*]:min-h-0 [&>*]:w-full [&>*]:min-w-0",
				className,
			)}
			style={{ gridColumn: weekIdx + 1 + columnOffset, gridRow: dayIdx + 1 }}
		>
			{children}
		</div>
	);
}

export function heatmapGridStyle(
	weekCount: number,
	opts?: { labelColumnPx?: number; cellPx?: number },
): CSSProperties {
	const labelPx = opts?.labelColumnPx ?? 0;

	// Fixed-cell mode: square px tracks, no aspect-ratio stretch. Used where the
	// column count varies a lot (e.g. a "week" range = 1 column) so the grid can
	// never blow a single column up to full width.
	if (opts?.cellPx) {
		const cell = opts.cellPx;
		const weekCols = `repeat(${weekCount}, ${cell}px)`;
		return {
			gridTemplateColumns: labelPx > 0 ? `${labelPx}px ${weekCols}` : weekCols,
			gridTemplateRows: `repeat(7, ${cell}px)`,
		};
	}

	// Fluid mode (default): week columns flex to fill width, kept square by the
	// aspect ratio. Only safe when the column count is large and stable.
	const columns =
		labelPx > 0
			? `${labelPx}px repeat(${weekCount}, minmax(0, 1fr))`
			: `repeat(${weekCount}, minmax(0, 1fr))`;

	return {
		gridTemplateColumns: columns,
		gridTemplateRows: "repeat(7, minmax(0, 1fr))",
		aspectRatio: labelPx > 0 ? `${weekCount + labelPx / HEATMAP_CELL_PX} / 7` : `${weekCount} / 7`,
	};
}

/**
 * Square cell size for a fixed-cell heatmap. The max cap matches the
 * ~6-month layout (its dense ~28-column grid lands here): capping every
 * range at the same ceiling keeps the section height consistent so short
 * ranges (week / month / quarter) don't balloon to taller cells. The floor
 * keeps a year of columns legible.
 */
export function heatmapCellPx(weekCount: number, targetWidth = 720, labelPx = 24): number {
	const ideal = Math.floor((targetWidth - labelPx) / Math.max(weekCount, 1));
	return Math.max(12, Math.min(24, ideal));
}
