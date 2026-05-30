/**
 * Short-lived in-process cache for `getUserConfig()` on hot dashboard paths
 * (terminal input/stream/exec). Serverless invocations are ephemeral, but
 * within a single warm instance this avoids re-fetching Supabase + Clerk on
 * every keystroke or poll tick.
 */

import { getUserConfig } from "./clerk";
import { getEffectiveUserId } from "./identity";
import type { UserConfig } from "./schema";

const TTL_MS = 2_500;

let entry: { userId: string; config: UserConfig; expiresAt: number } | null = null;

export async function getUserConfigCached(): Promise<UserConfig> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		throw new Error("unauthorized");
	}
	const now = Date.now();
	if (entry && entry.userId === userId && entry.expiresAt > now) {
		return entry.config;
	}
	const config = await getUserConfig();
	entry = { userId, config, expiresAt: now + TTL_MS };
	return config;
}

/** Call after writes so the next read sees fresh machine/bootstrap state. */
export function invalidateUserConfigCache(): void {
	entry = null;
}
