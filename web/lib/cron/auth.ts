/**
 * Authorization for internal scheduler/cron endpoints.
 *
 * Vercel injects an `x-vercel-cron` header and an
 * `Authorization: Bearer $CRON_SECRET` on scheduled invocations; the local dev
 * bypass also passes. Anything else is rejected so these routes can't be
 * triggered by the public.
 */

import { isDevBypassEnabled } from "@/lib/user-config/identity";

export function authorizedInternalRequest(req: Request): boolean {
	if (isDevBypassEnabled()) return true;
	if (req.headers.get("x-vercel-cron") != null) return true;
	const secret = process.env.CRON_SECRET;
	if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
		return true;
	}
	return false;
}
