/**
 * Circuit-graphic art mapping. White line-art on pure black, served from
 * /public/category-art/<slug>.png, adapted to light/dark via CSS blend
 * (see CircuitArt / SchematicPanel). One module gates which surfaces have
 * art and returns the path, with a graceful null when a slug has no asset.
 */

/** Slugs that have a committed asset under /public/category-art/. */
const CATEGORY_ART_SLUGS = new Set<string>([
	"overview",
	"machines",
	"workers",
	"memory",
	"skills",
	"mcps",
	"registry",
	"cron",
	"usage",
	"benchmarks",
	"settings",
	"agents",
	"loadout",
	"hero",
	// per-machine surfaces
	"terminal",
	"sessions",
	"logs",
	"artifacts",
	"setup",
	"console",
]);

export function getCategoryArt(slug: string | null | undefined): string | null {
	if (!slug) return null;
	return CATEGORY_ART_SLUGS.has(slug) ? `/category-art/${slug}.png` : null;
}

/** Focal error/empty graphics live at the public root, not category-art/. */
export const ERROR_ART = {
	notFound: "/error-404.png",
	server: "/error-500.png",
} as const;
