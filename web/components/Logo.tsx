import Image from "next/image";

import { cn } from "@/lib/cn";

export type Mark = "dedalus" | "nous" | "cursor";

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
};

const MASK_SRC: Record<Mark, string> = {
	dedalus: "/brand/dedalus-mark-black.svg",
	nous: "/brand/nous-mark.svg",
	cursor: "/brand/cursor-mark.svg",
};

const DEFAULT_TONE: Record<Mark, NonNullable<Props["tone"]>> = {
	dedalus: "auto",
	nous: "currentColor",
	cursor: "auto",
};

const ARIA_LABEL: Record<Mark, string> = {
	dedalus: "Dedalus Labs",
	nous: "Nous Research",
	cursor: "Cursor",
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
		return (
			<span
				role="img"
				aria-label={aria}
				className={cn(
					"inline-block shrink-0 bg-[currentColor]",
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
					WebkitMaskSize: "contain",
					maskSize: "contain",
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
