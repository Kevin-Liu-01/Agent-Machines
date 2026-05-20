/**
 * Dashboard demo mode — stable scripted responses for YC demo / recordings
 * without live Dedalus machines. Enable with DASHBOARD_DEMO_MODE=1.
 */

export function isDemoMode(): boolean {
	return process.env.DASHBOARD_DEMO_MODE === "1";
}

/** Client-safe mirror (banner, skip auto-wake). */
export function isDemoModePublic(): boolean {
	return process.env.NEXT_PUBLIC_DASHBOARD_DEMO_MODE === "1";
}
