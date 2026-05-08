import { cn } from "@/lib/cn";

/**
 * Brand-canonical background texture layer. Three variants, each
 * theme-aware:
 *
 *   - "cloud"     -- horizontal cloud-line streaks. Auto-swaps to
 *                    `bg-cloud-lines.png` in light mode (the original
 *                    white-on-white plate) and `bg-nyx-lines.png` in
 *                    dark mode (its dark-on-dark counterpart).
 *
 *   - "nyx-lines" -- structural horizontal grain. Always uses
 *                    `bg-nyx-lines.png`; doesn't render in light mode
 *                    (the dark plate would crush a light background).
 *
 *   - "nyx-waves" -- diagonal wave swells. Uses `bg-nyx-waves.png` in
 *                    dark mode, falls back to the light cloud-lines
 *                    plate in light mode so the surface still has a
 *                    branded grain instead of a bare white field.
 *
 * Renders as an absolutely-positioned, pointer-events-none, z-0 layer
 * inside whatever positioned ancestor the caller provides. The caller
 * is responsible for `relative` and `overflow-hidden`. Higher opacity
 * than our previous mix-blend-soft-light approach so the textures
 * actually read at every viewport size.
 */

type Variant = "cloud" | "nyx-lines" | "nyx-waves";

const LIGHT_SRC: Record<Variant, string | null> = {
	cloud: "/brand/bg-cloud-lines.png",
	"nyx-lines": null, // dark plate would crush a light bg
	"nyx-waves": "/brand/bg-cloud-lines.png",
};

const DARK_SRC: Record<Variant, string> = {
	cloud: "/brand/bg-nyx-lines.png",
	"nyx-lines": "/brand/bg-nyx-lines.png",
	"nyx-waves": "/brand/bg-nyx-waves.png",
};

const DEFAULT_OPACITY = {
	light: 0.55,
	dark: 0.45,
} as const;

type Props = {
	variant: Variant;
	className?: string;
	/** Override the default light/dark opacity. Useful when stacking
	 *  the background behind dense copy where 0.55 reads as too loud. */
	opacity?: { light?: number; dark?: number };
	/** Position. Default is absolute inset-0; pass "fixed" to anchor
	 *  to the viewport instead (good for the sign-in page). */
	position?: "absolute" | "fixed";
	/** Fade the bottom edge so the texture meets a hard hairline rule
	 *  cleanly instead of butting against it. Off by default. */
	fadeEdges?: boolean;
};

export function WingBackground({
	variant,
	className,
	opacity,
	position = "absolute",
	fadeEdges = false,
}: Props) {
	const lightSrc = LIGHT_SRC[variant];
	const darkSrc = DARK_SRC[variant];
	const lightOpacity = opacity?.light ?? DEFAULT_OPACITY.light;
	const darkOpacity = opacity?.dark ?? DEFAULT_OPACITY.dark;
	const fadeMask = fadeEdges
		? "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)"
		: undefined;
	return (
		<div
			aria-hidden="true"
			className={cn(
				position === "fixed" ? "pointer-events-none fixed" : "pointer-events-none absolute",
				"inset-0 z-0",
				className,
			)}
			style={{
				WebkitMaskImage: fadeMask,
				maskImage: fadeMask,
			}}
		>
			{lightSrc ? (
				<div
					className="absolute inset-0 bg-cover bg-center bg-no-repeat dark:hidden"
					style={{
						backgroundImage: `url(${lightSrc})`,
						opacity: lightOpacity,
					}}
				/>
			) : null}
			<div
				className={cn(
					"absolute inset-0 bg-cover bg-center bg-no-repeat",
					lightSrc ? "hidden dark:block" : "block",
				)}
				style={{
					backgroundImage: `url(${darkSrc})`,
					opacity: darkOpacity,
				}}
			/>
		</div>
	);
}
