/**
 * Authorization for internal scheduler/cron endpoints.
 *
 * Vercel injects `Authorization: Bearer $CRON_SECRET` on scheduled
 * invocations; the local dev bypass also passes. The `x-vercel-cron` header is
 * useful telemetry, but it is not authentication because a direct caller can
 * supply arbitrary request headers.
 */

import { isDevBypassEnabled } from "@/lib/user-config/identity";

export function authorizedInternalRequest(req: Request): boolean {
	if (isDevBypassEnabled()) return true;
	const secret = process.env.CRON_SECRET?.trim();
	if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
		return true;
	}
	return false;
}
