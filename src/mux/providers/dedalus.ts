/**
 * Compatibility discriminator for persisted placements, not an active adapter.
 * Never send an old machine ID or credential to Daytona. Retired records remain
 * inspectable in our control plane, but vendor actions fail before any network IO.
 */
import { MuxError, type SandboxProvider } from "../types.js";

export function createDedalusProvider(_credentials: { apiKey?: string; baseUrl?: string } = {}): SandboxProvider {
	const retired = async (): Promise<never> => {
		throw new MuxError("not_supported", "This sandbox provider has been retired. Create a new Worker on Daytona, E2B, Sprites, or Vercel. Existing machine IDs have not been moved or deleted.", { substrate: "dedalus" });
	};
	return {
		kind: "dedalus",
		capabilities: { pty: "none", persistence: "none", reattach: false, publicUrl: false, streamingExec: false, detachedWork: "throttled" },
		ready: () => ({ ok: false, missing: ["Provider retired"] }),
		create: retired, connect: retired, list: retired, describe: retired, remove: retired,
	};
}
