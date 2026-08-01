/**
 * GET /api/dashboard/route-outcomes?machineId=<id>&days=30
 *
 * Roadmap 1.3: the four owed numbers rolled up per route (agent x substrate).
 * Reads run_traces, which today only the cron ingest writes -- an empty report
 * with `totalRuns: 0` means "no traced runs", not "no runs".
 *
 * Scoping is explicit and never inherited from global active state: a
 * `machineId` must belong to the caller's own config or the request 404s
 * (POSTMORTEM-2026-05-18 item 2 -- routes that resolved the active machine
 * answered about the wrong machine). Omitting it reports the whole fleet.
 */

import { type NextRequest } from "next/server";

import { rollupRouteOutcomes, type RouteOutcomeRow } from "@/lib/learning/route-outcomes";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const ROW_LIMIT = 20_000;

const SELECT = "runtime, substrate, source, success, exit_code, cost_millicents, latency_ms, extra";

/** Clamp an untrusted `days` param; anything unparseable falls back to default. */
export function parseDays(raw: string | null): number {
	if (raw === null) return DEFAULT_DAYS;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
	return Math.min(n, MAX_DAYS);
}

export async function GET(request: NextRequest): Promise<Response> {
	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId");
	const days = parseDays(url.searchParams.get("days"));

	try {
		// Inside the try so even an unexpected throw from identity resolution
		// answers with a status instead of an unhandled 502.
		const userId = await getEffectiveUserId();
		if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

		if (machineId) {
			const config = await getUserConfig();
			// Fail closed on an id the caller does not own: a 404 is honest, where
			// an empty rollup would read as "this machine ran nothing".
			if (!config.machines.some((m) => m.id === machineId)) {
				return Response.json({ error: "unknown_machine" }, { status: 404 });
			}
		}

		const since = new Date(Date.now() - days * 864e5).toISOString();
		let query = supabaseAdmin()
			.from("run_traces")
			.select(SELECT)
			.eq("user_id", userId)
			.gte("recorded_at", since)
			.order("recorded_at", { ascending: false })
			.limit(ROW_LIMIT);
		if (machineId) query = query.eq("machine_id", machineId);
		const { data, error } = await query;
		if (error) {
			return Response.json({ ok: false, error: error.message }, { status: 500 });
		}

		const report = rollupRouteOutcomes((data ?? []) as unknown as RouteOutcomeRow[]);
		return Response.json(
			{ ok: true, scope: { machineId: machineId ?? null, days }, report },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "route_outcomes_failed";
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}
