/**
 * Short-lived in-process cache for `getUserConfig()` on hot dashboard paths
 * (terminal input/stream/exec). Serverless invocations are ephemeral, but
 * within a single warm instance this avoids re-fetching Supabase + Clerk on
 * every keystroke or poll tick.
 */

import { getUserConfigById } from "./clerk";
import { getEffectiveUserId } from "./identity";
import type { UserConfig } from "./schema";

const TTL_MS = 10_000;
const MAX_ENTRIES = 64;

const entries = new Map<string, { config: UserConfig; expiresAt: number }>();

export async function getUserConfigCached(): Promise<UserConfig> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		throw new Error("unauthorized");
	}
	const now = Date.now();
	const entry = entries.get(userId);
	if (entry && entry.expiresAt > now) {
		return entry.config;
	}
	const config = await getUserConfigById(userId);
	if (entries.size >= MAX_ENTRIES && !entries.has(userId)) {
		const oldest = entries.keys().next().value as string | undefined;
		if (oldest) entries.delete(oldest);
	}
	entries.delete(userId);
	entries.set(userId, { config, expiresAt: now + TTL_MS });
	return config;
}

/** Call after writes so the next read sees fresh machine/bootstrap state. */
export function invalidateUserConfigCache(): void {
	entries.clear();
}
