/**
 * GET /api/dashboard/crons
 *
 * Live cron registry + last-run summaries. In demo mode returns scripted
 * fixtures for the YC demo video (3:12am health check, $0.04, etc.).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { listCrons } from "@/lib/dashboard/crons";
import { isDemoMode } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	if (isDemoMode()) {
		const { DEMO_CRON_RUNS } = await import("@/lib/demo/fixtures");
		return Response.json({
			ok: true,
			scheduled: listCrons(),
			runs: DEMO_CRON_RUNS,
			fetchedAt: new Date().toISOString(),
		});
	}

	return Response.json({
		ok: true,
		scheduled: listCrons(),
		runs: [],
		message: "Live cron telemetry ships in a future release.",
		fetchedAt: new Date().toISOString(),
	});
}
