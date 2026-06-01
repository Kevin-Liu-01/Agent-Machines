import { getCategoryArt } from "@/lib/dashboard/category-art";
import { cn } from "@/lib/cn";

/**
 * Recipe A — subtle background circuit art that fades in from an edge.
 *
 * White-on-black line-art adapts to both themes via blend modes:
 *   - light: `invert` (white art -> black) + `mix-blend-multiply` (white bg drops out)
 *   - dark:  `mix-blend-screen` (black bg drops out, white art shows)
 * A gradient mask fades the inner edge to transparent so text stays readable;
 * low opacity keeps it a texture, not a focal point. Brightens on group hover.
 *
 * Place inside a `relative overflow-hidden` container with content in
 * `relative z-10` above it. Resolves from a slug (or an explicit src);
 * renders nothing when there's no asset, so callers can drop it in freely.
 */
/**
 * Position + size + opacity + mask are kept together per variant because
 * `cn()` here does not tailwind-merge conflicting utilities:
 *
 * - `card`    — recipe-A intensity, right-anchored, fades left; brightens on group-hover.
 * - `ambient` — faint version of `card` for page-header backdrops behind text.
 * - `fill`    — fills its container, fades toward the bottom (decorative side panels).
 */
// Card/section backdrops spread further left (more of the art reads); header
// ambient stays right-weighted so it never fights the title text.
const RIGHT_MASK_WIDE =
	"[-webkit-mask-image:linear-gradient(to_right,transparent,black_50%)] [mask-image:linear-gradient(to_right,transparent,black_50%)]";
const RIGHT_MASK_HEADER =
	"[-webkit-mask-image:linear-gradient(to_right,transparent,black_68%)] [mask-image:linear-gradient(to_right,transparent,black_68%)]";
const BOTTOM_MASK =
	"[-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent)] [mask-image:linear-gradient(to_bottom,black_60%,transparent)]";

const VARIANTS = {
	card: cn(
		"inset-y-0 right-0 w-3/4",
		"opacity-[0.55] group-hover:opacity-[0.75] dark:opacity-[0.65] dark:group-hover:opacity-[0.85]",
		RIGHT_MASK_WIDE,
	),
	ambient: cn(
		"inset-y-0 right-0 w-2/3 opacity-[0.32] dark:opacity-[0.42]",
		RIGHT_MASK_HEADER,
	),
	fill: cn("inset-0 h-full w-full opacity-[0.6] dark:opacity-[0.72]", BOTTOM_MASK),
} as const;

export function CircuitArt({
	slug,
	src,
	className,
	variant = "card",
}: {
	slug?: string | null;
	src?: string;
	className?: string;
	variant?: keyof typeof VARIANTS;
}) {
	const resolved = src ?? getCategoryArt(slug);
	if (!resolved) return null;
	return (
		// eslint-disable-next-line @next/next/no-img-element -- local decorative line-art, blended; next/image can't carry mix-blend/mask cleanly
		<img
			alt=""
			aria-hidden="true"
			src={resolved}
			className={cn(
				"pointer-events-none absolute select-none object-cover",
				"mix-blend-multiply invert transition-opacity duration-300",
				"dark:mix-blend-screen dark:invert-0",
				VARIANTS[variant],
				className,
			)}
		/>
	);
}
