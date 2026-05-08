import Image from "next/image";

import { cn } from "@/lib/cn";

export type Mark = "dedalus" | "nous" | "cursor" | "openclaw";

type Props = {
	mark: Mark;
	size?: number;
	className?: string;
	/**
	 * "auto" -- pick a recoloring strategy per mark:
	 *   dedalus -> light/dark image swap (gradient lives in the SVG itself)
	 *   nous    -> CSS mask + currentColor (true monochrome adoption)
	 *   cursor  -> light/dark image swap (Cursor ships their own variants)
	 *
	 * "currentColor" -- force CSS mask on every mark, useful when you want
	 * the logo to inherit a parent text color rather than its native palette.
	 *
	 * "native" -- never recolor; use the SVG as-is (single fixed variant).
	 */
	tone?: "auto" | "currentColor" | "native";
};

const NATIVE_SRC: Record<Mark, { light: string; dark: string }> = {
	dedalus: {
		light: "/brand/dedalus-logo-dark.svg",
		dark: "/brand/dedalus-logo.svg",
	},
	nous: {
		light: "/brand/nous-mark.svg",
		dark: "/brand/nous-mark.svg",
	},
	cursor: {
		light: "/brand/cursor-mark.svg",
		dark: "/brand/cursor-mark-light.svg",
	},
	openclaw: {
		// Color variant ships only when explicitly requested via tone="native".
		// Default rendering uses the mask + currentColor branch below.
		light: "/brand/openclaw-mark-color.svg",
		dark: "/brand/openclaw-mark-color.svg",
	},
};

const MASK_SRC: Record<Mark, string> = {
	dedalus: "/brand/dedalus-mark-black.svg",
	nous: "/brand/nous-mark.svg",
	cursor: "/brand/cursor-mark.svg",
	openclaw: "/brand/openclaw-mark.svg",
};

const DEFAULT_TONE: Record<Mark, NonNullable<Props["tone"]>> = {
	dedalus: "auto",
	nous: "currentColor",
	cursor: "auto",
	// LobeHub ships a clean monochrome SVG with fill="currentColor"; render
	// it as a CSS mask so it adopts the parent text color (same pattern as
	// the Nous mark). The brand-gradient version still ships as openclaw-
	// mark-color.svg if anyone wants it via tone="native".
	openclaw: "currentColor",
};

const ARIA_LABEL: Record<Mark, string> = {
	dedalus: "Dedalus Labs",
	nous: "Nous Research",
	cursor: "Cursor",
	openclaw: "OpenClaw",
};

/**
 * Single-mark renderer. Use `<BrandMark>` for the canonical lockup and
 * `<Logo mark=...>` when you need an individual partner mark in a card,
 * footer, or attribution row. Sizing is square: `size` controls both
 * width and height; the SVG is centered and contained.
 */
export function Logo({ mark, size = 18, className, tone }: Props) {
	const resolved = tone ?? DEFAULT_TONE[mark];
	const dim = `${size}px`;
	const aria = ARIA_LABEL[mark];

	if (resolved === "currentColor") {
		// The Nous mark's source SVG paints a rectangular frame at its
		// outer bounds (the potrace tracing kept the original raster's
		// border). When we mask it with currentColor, those frame
		// columns render as 1px walls on the left and right edges. We
		// can't kill them at the SVG layer without breaking the head
		// silhouette (the frame is part of the same compound path), so
		// we crop them at the CSS layer: render the mask slightly
		// oversized and let the container's bounds clip the frame off.
		//
		// 110% size + centered position drops 5% of the SVG on each
		// edge -- enough to hide the 4-unit rect frame at every
		// rendered size from 14px (status header) up to 480px (debug
		// preview), without visibly clipping the head silhouette
		// (which sits well inside the SVG bounds).
		const oversized = mark === "nous";
		const maskSize = oversized ? "110%" : "contain";
		return (
			<span
				role="img"
				aria-label={aria}
				className={cn(
					"inline-block shrink-0 overflow-hidden bg-[currentColor]",
					className,
				)}
				style={{
					width: dim,
					height: dim,
					WebkitMaskImage: `url(${MASK_SRC[mark]})`,
					maskImage: `url(${MASK_SRC[mark]})`,
					WebkitMaskRepeat: "no-repeat",
					maskRepeat: "no-repeat",
					WebkitMaskPosition: "center",
					maskPosition: "center",
					WebkitMaskSize: maskSize,
					maskSize: maskSize,
				}}
			/>
		);
	}

	const { light, dark } = NATIVE_SRC[mark];
	if (resolved === "native" || light === dark) {
		return (
			<span
				role="img"
				aria-label={aria}
				className={cn("relative inline-block shrink-0", className)}
				style={{ width: dim, height: dim }}
			>
				<Image
					src={light}
					alt=""
					fill
					sizes={dim}
					className="object-contain"
				/>
			</span>
		);
	}
	return (
		<span
			role="img"
			aria-label={aria}
			className={cn("relative inline-block shrink-0", className)}
			style={{ width: dim, height: dim }}
		>
			<Image
				src={light}
				alt=""
				fill
				sizes={dim}
				className="object-contain dark:hidden"
			/>
			<Image
				src={dark}
				alt=""
				fill
				sizes={dim}
				className="hidden object-contain dark:block"
			/>
		</span>
	);
}
