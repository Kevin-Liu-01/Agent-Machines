/**
 * POST /api/dashboard/metrics/collect
 *
 * On-demand collection pass: probe every running machine, store raw
 * samples, detect transitions, and roll up daily usage + cost. The
 * background scheduler (/api/internal/cron/tick) is the primary driver;
 * this route stays available for manual/foreground refreshes and is
 * rate-limited to one pass per 15s per user.
 */

import { collectMetricsForUser } from "@/lib/metrics/collector";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 15_000;
const FOREGROUND_INTERVAL_SECONDS = 30;

const lastCollectAt = new Map<string, number>();

export async function POST(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const now = Date.now();
	const prev = lastCollectAt.get(userId) ?? 0;
	if (now - prev < MIN_INTERVAL_MS) {
		return Response.json(
			{
				ok: false,
				error: "too_soon",
				message: `Last collection was ${Math.round((now - prev) / 1000)}s ago. Wait at least 15s.`,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	}
	lastCollectAt.set(userId, now);

	const config = await getUserConfig();
	const result = await collectMetricsForUser(
		userId,
		config,
		FOREGROUND_INTERVAL_SECONDS,
	);

	return Response.json({
		ok: true,
		collected: result.collected,
		transitions: result.transitions,
	});
}
