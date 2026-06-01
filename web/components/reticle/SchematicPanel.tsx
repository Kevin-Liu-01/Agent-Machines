import { getCategoryArt } from "@/lib/dashboard/category-art";
import { cn } from "@/lib/cn";

/**
 * Recipe B — a focal/centerpiece graphic framed in a dark "schematic panel".
 *
 * For hero/empty/error graphics, skip the blend and frame the white-on-black
 * art in a dark panel: bulletproof and intentional in both themes (the panel
 * is always dark, so the art always reads). Sharp corners to match the
 * Reticle system. Resolves from a slug or explicit src; renders nothing when
 * there's no asset.
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
				"overflow-hidden border border-[var(--ret-border)] bg-[#0a0a0a] p-2",
				className,
			)}
		>
			{/* eslint-disable-next-line @next/next/no-img-element -- local decorative graphic framed as a dark schematic panel */}
			<img
				alt=""
				aria-hidden="true"
				src={resolved}
				className="pointer-events-none w-full select-none"
			/>
		</div>
	);
}
