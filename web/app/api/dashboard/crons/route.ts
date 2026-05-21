/**
 * GET /api/dashboard/crons
 *
 * Live cron registry + last-run summaries.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { listCrons } from "@/lib/dashboard/crons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	return Response.json({
		ok: true,
		scheduled: listCrons(),
		runs: [],
		message: "Live cron telemetry ships in a future release.",
		fetchedAt: new Date().toISOString(),
	});
}
