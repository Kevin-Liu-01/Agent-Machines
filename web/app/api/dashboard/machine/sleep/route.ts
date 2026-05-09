/**
 * POST /api/dashboard/machine/sleep
 *
 * Pauses the running machine to save costs. Sleep preserves disk and
 * process state; the next wake brings everything back including the
 * cloudflared tunnel URL.
 *
 * Idempotent: if the machine is already in any non-running state we
 * return the current summary unchanged. Resolves the machine from the
 * caller's Clerk metadata.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { sleepMachine } from "@/lib/dashboard/dedalus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	try {
		const summary = await sleepMachine();
		return Response.json(summary, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "sleep failed";
		const status = /not set/.test(message) ? 404 : 502;
		const error = status === 404 ? "not_provisioned" : "sleep_failed";
		return Response.json({ error, message }, { status });
	}
}
