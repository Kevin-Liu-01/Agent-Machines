/**
 * Reticle Design System sizing constants.
 *
 * Color tokens (--ret-*) live in app/globals.css.
 * Components consume these constants for layout grid math (margins, gutters,
 * cross arms) -- they should never hardcode pixel values.
 */
export const RETICLE_SIZES = {
	gridCell: 48,
	crossArm: 5,
	crossStroke: 1,
	railGap: 24,
	contentMax: 1400,
	/**
	 * Reticle is sharp corners. Kept on the const to preserve the
	 * symbolic name, but it's zero -- nothing in the system rounds.
	 */
	cardRadius: 0,
	hairline: 1,
} as const;
