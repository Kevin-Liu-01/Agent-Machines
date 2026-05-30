/**
 * Brief cache for `isMachineRunning` — session attach immediately calls
 * stream, which used to duplicate a provider.state() round-trip.
 */

import { getProvider } from "@/lib/providers";
import { getUserConfigCached } from "@/lib/user-config/request-cache";

import { resolveMachine } from "./exec";

const TTL_MS = 3_000;
const cache = new Map<string, { ok: boolean; expiresAt: number }>();

export async function isMachineRunningCached(
	machineId?: string | null,
): Promise<boolean> {
	const key = machineId?.trim() || "__active__";
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && hit.expiresAt > now) {
		return hit.ok;
	}
	let ok = false;
	try {
		const config = await getUserConfigCached();
		const machine = resolveMachine(config, machineId);
		if (!machine) {
			ok = false;
		} else {
			const provider = getProvider(machine.providerKind, config.providers);
			const summary = await provider.state(machine.id);
			ok = summary.state === "ready";
		}
	} catch {
		ok = false;
	}
	cache.set(key, { ok, expiresAt: now + TTL_MS });
	return ok;
}

export function invalidateMachineRunningCache(machineId?: string | null): void {
	if (machineId) cache.delete(machineId);
	else cache.clear();
}
