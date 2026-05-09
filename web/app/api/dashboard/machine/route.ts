/**
 * GET /api/dashboard/machine
 *
 * Returns a thin MachineSummary with phase, desired state, spec, and the
 * last error reason if the machine is in `failed`. Auth-gated by Clerk
 * middleware; the route also re-checks `auth()` so a misconfigured matcher
 * can never leak machine state to anonymous callers.
 *
 * Reads the machine ID + Dedalus key from the caller's Clerk metadata
 * (with env fallback for the project owner). Users who haven't run the
 * setup wizard yet get a typed `not_provisioned` response instead of a
 * generic 5xx.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { fetchMachineSummary } from "@/lib/dashboard/dedalus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	try {
		const summary = await fetchMachineSummary();
		return Response.json(summary, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown_error";
		const status = /not set/.test(message) ? 404 : 502;
		const error = status === 404 ? "not_provisioned" : "fetch_failed";
		return Response.json({ error, message }, { status });
	}
}
