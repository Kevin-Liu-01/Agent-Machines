import { getCategoryArt } from "@/lib/dashboard/category-art";
import { cn } from "@/lib/cn";
import { GeometricCircuit } from "@/components/reticle/GeometricCircuit";

/**
 * Recipe B - a focal/centerpiece graphic that adapts to the active theme.
 *
 * Category art ships as white-on-black line art. The image uses the same
 * invert/multiply and screen blend pair as the rest of Reticle so light pages
 * get black linework without a black slab, while dark pages keep white lines.
 * Sharp corners match the Reticle system. Resolves from a slug or explicit
 * src; renders nothing when there's no asset.
 */
export function SchematicPanel({
	slug,
	src,
	className,
}: {
	slug?: string | null;
	src?: string;
	className?: string;
}) {
	const resolved = src ?? getCategoryArt(slug);
	if (!resolved) return null;
	return (
		<div
			className={cn(
				"overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2",
				className,
			)}
		>
			{src ? (
				// eslint-disable-next-line @next/next/no-img-element -- explicit error art remains a raster asset
				<img
					alt=""
					aria-hidden="true"
					src={resolved}
					className="pointer-events-none w-full select-none mix-blend-multiply invert dark:mix-blend-screen dark:invert-0"
				/>
			) : (
				<GeometricCircuit slug={slug} className="aspect-[16/9] w-full" />
			)}
		</div>
	);
}
