import type { ReactNode } from "react";

/**
 * Compatibility wrapper for older callers. Route and section motion is now
 * deliberately native: no page wipes, staggered columns, smooth-scroll loop,
 * or client-side hydration boundary.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
	return children;
}
