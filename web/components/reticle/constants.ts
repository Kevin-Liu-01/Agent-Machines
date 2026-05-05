/**
 * Reticle Design System sizing constants.
 *
 * Color tokens (--ret-*) live in app/globals.css.
 * Components consume these constants for layout grid math (margins, gutters,
 * cross arms) -- they should never hardcode pixel values.
 */
export const RETICLE_SIZES = {
	gridCell: 48,
	crossArm: 10,
	crossStroke: 1.5,
	railGap: 24,
	contentMax: 1200,
	cardRadius: 10,
} as const;
