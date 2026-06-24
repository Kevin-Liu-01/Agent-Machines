import { auth } from "@clerk/nextjs/server";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

/**
 * Auth identity resolver for the dashboard.
 *
 * Production: every request comes from a Clerk-authenticated user.
 * `getEffectiveUserId()` returns the Clerk `userId`.
 *
 * SDK/API access: when `AGENT_MACHINES_API_KEY` (or `AM_API_KEY`) matches a
 * bearer token, requests resolve to `AGENT_MACHINES_API_USER_ID` (or
 * `AM_API_USER_ID`). This lets server-side SDK callers use the same routing
 * architecture as the dashboard without a browser Clerk session.
 *
 * Local development: when `ALLOW_DEV_AUTH=1` and `NODE_ENV=development`,
 * unauthenticated requests resolve to a stable `DEV_USER_ID`. The
 * file-backed dev store (`./dev-store.ts`) treats that id as a single
 * local user, so the dashboard, chat, machine lifecycle, and config
 * mutations all work end-to-end without anyone signing in.
 *
 * The bypass is opt-in to prevent accidentally shipping it: `NODE_ENV
 * !== 'development'` or missing `ALLOW_DEV_AUTH` and the helper falls
 * straight through to the Clerk path with no fallback.
 */

export const DEV_USER_ID = "dev-user";

/**
 * True when the local dev auth bypass is opt-in via env. Both the
 * `NODE_ENV=development` AND `ALLOW_DEV_AUTH=1` checks must pass --
 * we never want this active on a Vercel preview/production deploy.
 */
export function isDevBypassEnabled(): boolean {
	return (
		process.env.NODE_ENV === "development" &&
		process.env.ALLOW_DEV_AUTH === "1"
	);
}

function bearerToken(value: string | null): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const match = /^Bearer\s+(.+)$/i.exec(trimmed);
	return match?.[1]?.trim() || null;
}

function safeTokenEquals(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}

async function getSdkUserId(): Promise<string | null> {
	const expectedToken = (
		process.env.AGENT_MACHINES_API_KEY ??
		process.env.AM_API_KEY ??
		""
	).trim();
	const userId = (
		process.env.AGENT_MACHINES_API_USER_ID ??
		process.env.AM_API_USER_ID ??
		process.env.AGENT_MACHINES_OWNER_USER_ID ??
		process.env.CLERK_OWNER_USER_ID ??
		""
	).trim();
	if (!expectedToken || !userId) return null;

	try {
		const token = bearerToken((await headers()).get("authorization"));
		return token && safeTokenEquals(token, expectedToken) ? userId : null;
	} catch {
		return null;
	}
}

/**
 * Resolve the effective user id for the current request.
 *
 * - Returns the Clerk `userId` when the user is signed in.
 * - Returns the SDK/API user id when an owner-scoped bearer token is present.
 * - Returns `DEV_USER_ID` when dev bypass is enabled and no one is
 *   signed in.
 * - Returns `null` otherwise; callers should respond with 401.
 *
 * Never throws -- callers rely on `null` to mean "unauthenticated"
 * and return 401 themselves. Throwing here would crash the entire
 * route handler, producing a Vercel 502 instead of a clean 401.
 */
export async function getEffectiveUserId(): Promise<string | null> {
	try {
		const { userId } = await auth();
		if (userId) return userId;
	} catch {
		// auth() can throw when Clerk middleware never ran (env unset)
		// or on transient Clerk SDK errors. Return null so the route
		// handler responds 401 instead of crashing with a 502.
	}
	const sdkUserId = await getSdkUserId();
	if (sdkUserId) return sdkUserId;
	return isDevBypassEnabled() ? DEV_USER_ID : null;
}

/**
 * True iff the given user id is the local dev fallback identity.
 * Used by the user-config layer to route reads/writes to the
 * file-backed dev store instead of the Clerk metadata store.
 */
export function isDevUserId(userId: string | null | undefined): boolean {
	return userId === DEV_USER_ID;
}
