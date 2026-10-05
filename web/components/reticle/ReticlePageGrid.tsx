"use client";

import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { RETICLE_SIZES } from "./constants";

type Props = {
	children: ReactNode;
	className?: string;
	contentMax?: number;
};

// Keep diagonal strokes on a small, pixel-aligned tile so long pages do not
// produce uneven line weights from a full-height repeating gradient.
const LEFT_MARGIN_HATCH: CSSProperties = {
	backgroundImage:
		"linear-gradient(45deg, transparent calc(50% - 0.75px), var(--ret-rail) calc(50% - 0.25px), var(--ret-rail) calc(50% + 0.25px), transparent calc(50% + 0.75px))",
	backgroundSize: "12px 12px",
	backgroundClip: "padding-box",
};

const RIGHT_MARGIN_HATCH: CSSProperties = {
	backgroundImage:
		"linear-gradient(135deg, transparent calc(50% - 0.75px), var(--ret-rail) calc(50% - 0.25px), var(--ret-rail) calc(50% + 0.25px), transparent calc(50% + 0.75px))",
	backgroundSize: "12px 12px",
	backgroundClip: "padding-box",
};

export function ReticlePageGrid({
	children,
	className,
	contentMax = RETICLE_SIZES.contentMax,
}: Props) {
	const style = {
		"--ret-content-max": `${contentMax}px`,
	} as CSSProperties;
	return (
		<div
				className={cn("relative min-h-[100dvh] bg-[var(--ret-bg)]", className)}
				style={{ ...style, overflowX: "clip" }}
			>
				{/* Left margin hatch: hugs the content edge */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 bottom-0 z-[2] w-[var(--ret-rail-offset)] border-x border-[var(--ret-border)]"
					style={{
						left: "calc(50% - var(--ret-content-max) / 2 - var(--ret-rail-offset))",
						...LEFT_MARGIN_HATCH,
					}}
				/>
				{/* Left gutter: empty strip outside the margin */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 bottom-0 z-[2] w-[var(--ret-rail-offset)] border-l border-[var(--ret-border)]"
					style={{
						left: "calc(50% - var(--ret-content-max) / 2 - var(--ret-rail-offset) * 2)",
					}}
				/>
				{/* Right margin hatch: hugs the content edge */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 bottom-0 z-[2] w-[var(--ret-rail-offset)] border-x border-[var(--ret-border)]"
					style={{
						left: "calc(50% + var(--ret-content-max) / 2)",
						...RIGHT_MARGIN_HATCH,
					}}
				/>
				{/* Right gutter: empty strip outside the margin */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 bottom-0 z-[2] w-[var(--ret-rail-offset)] border-r border-[var(--ret-border)]"
					style={{
						left: "calc(50% + var(--ret-content-max) / 2 + var(--ret-rail-offset))",
					}}
				/>

				{/* Content area: max-width capped, centered, full-width lines extend through */}
				<div className="relative z-[1] flex flex-col">{children}</div>
		</div>
	);
}
