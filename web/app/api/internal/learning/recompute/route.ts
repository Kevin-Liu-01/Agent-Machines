/**
 * POST|GET /api/internal/learning/recompute -- Loop A policy recompute.
 *
 * Reads run_traces (arm + outcome columns only), rebuilds the global routing
 * policy posteriors, and publishes a new active snapshot. Scheduled via Vercel
 * Cron (see web/vercel.json). Same auth as the scheduler tick.
 */

import { authorizedInternalRequest } from "@/lib/cron/auth";
import { recomputePolicy } from "@/lib/learning/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request): Promise<Response> {
	if (!authorizedInternalRequest(req)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	try {
		const { version, nTraces } = await recomputePolicy();
		return Response.json({ ok: true, version, nTraces, at: new Date().toISOString() });
	} catch (err) {
		const message = err instanceof Error ? err.message : "recompute_failed";
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function POST(req: Request): Promise<Response> {
	return handle(req);
}

export async function GET(req: Request): Promise<Response> {
	return handle(req);
}
