/**
 * GET /api/dashboard/machine
 *
 * Returns a thin MachineSummary with phase, desired state, spec, and the
 * last error reason if the machine is in `failed`. Auth-gated by Clerk
 * middleware; the route also re-checks `auth()` so a misconfigured matcher
 * can never leak machine state to anonymous callers.
 */

import { auth } from "@clerk/nextjs/server";

import { fetchMachineSummary } from "@/lib/dashboard/dedalus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const { userId } = await auth();
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
		return Response.json(
			{ error: "fetch_failed", message },
			{ status: 502 },
		);
	}
}
