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

const EPHEMERAL_DEMO_ID = /^demo-[0-9a-f]{8}$/i;

/** Hide internal demo- prefix on ephemeral sandbox ids (creation UI, toasts). */
export function formatDemoSandboxId(id: string): string {
	if (EPHEMERAL_DEMO_ID.test(id)) return id.slice("demo-".length);
	return id;
}
