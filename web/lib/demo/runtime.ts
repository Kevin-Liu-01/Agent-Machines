/**
 * Demo runtime gate — import this from live routes instead of handlers/state.
 * Keeps the demo module graph (config, fixtures, exec-replies) off the prod path.
 */

export { isDemoMode, isDemoModePublic } from "./mode";

export type DemoHandlersModule = typeof import("./handlers");

let handlersModule: DemoHandlersModule | null = null;

/** Load demo API handlers once; no-op cost when demo mode is off. */
export async function loadDemoHandlers(): Promise<DemoHandlersModule> {
	if (!handlersModule) {
		handlersModule = await import("./handlers");
	}
	return handlersModule;
}
