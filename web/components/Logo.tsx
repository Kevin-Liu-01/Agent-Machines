import Image from "next/image";

import { cn } from "@/lib/cn";

export type Mark = "dedalus" | "nous" | "cursor" | "openclaw" | "anthropic" | "openai";

/**
 * Pseudo-mark for "either agent". Wherever a UI surface represents the
 * agent layer abstractly (not a specific Hermes vs OpenClaw choice),
 * use `<Logo mark="agent" />`. It renders the Nous + OpenClaw marks
 * side-by-side with a slight overlap so the rig's multi-agent story
 * reads at a glance.
 */
export type CompositeMark = Mark | "agent";

type Props = {
	mark: CompositeMark;
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
		light: "/brand/openclaw-mark-color.svg",
		dark: "/brand/openclaw-mark-color.svg",
	},
	anthropic: {
		light: "/brand/services/anthropic.svg",
		dark: "/brand/services/anthropic.svg",
	},
	openai: {
		light: "/brand/services/openai.svg",
		dark: "/brand/services/openai.svg",
	},
};

const MASK_SRC: Record<Mark, string> = {
	dedalus: "/brand/dedalus-mark-black.svg",
	nous: "/brand/nous-mark.svg",
	cursor: "/brand/cursor-mark.svg",
	openclaw: "/brand/openclaw-mark.svg",
	anthropic: "/brand/services/anthropic.svg",
	openai: "/brand/services/openai.svg",
};

const DEFAULT_TONE: Record<Mark, NonNullable<Props["tone"]>> = {
	dedalus: "auto",
	nous: "currentColor",
	cursor: "auto",
	openclaw: "currentColor",
	anthropic: "currentColor",
	openai: "currentColor",
};

const ARIA_LABEL: Record<Mark, string> = {
	dedalus: "Dedalus Labs",
	nous: "Nous Research",
	cursor: "Cursor",
	openclaw: "OpenClaw",
	anthropic: "Anthropic",
	openai: "OpenAI",
};

/**
 * Single-mark renderer. Use `<BrandMark>` for the canonical lockup and
 * `<Logo mark=...>` when you need an individual partner mark in a card,
 * footer, or attribution row. Sizing is square: `size` controls both
 * width and height; the SVG is centered and contained.
 */
export function Logo({ mark, size = 18, className, tone }: Props) {
	if (mark === "agent") {
		// Render Nous + OpenClaw side-by-side with a small horizontal
		// overlap. Used wherever the UI represents the agent layer
		// abstractly (capability cards, stack rows, architecture
		// nodes) so the multi-agent story is visible at a glance.
		const overlap = Math.max(2, Math.round(size * 0.18));
		const pairWidth = size * 2 - overlap;
		return (
			<span
				role="img"
				aria-label="Hermes or OpenClaw"
				className={cn("inline-flex items-center", className)}
				style={{ width: `${pairWidth}px`, height: `${size}px` }}
			>
				<Logo mark="nous" size={size} />
				<span
					className="inline-flex"
					style={{ marginLeft: `-${overlap}px` }}
				>
					<Logo mark="openclaw" size={size} />
				</span>
			</span>
		);
	}

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
