import { type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";
import { isDemoMode, loadDemoHandlers } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const { id: machineId } = await params;
	const days = Math.min(
		90,
		Math.max(1, Number(_request.nextUrl.searchParams.get("days") ?? 7)),
	);

	if (isDemoMode()) {
		const { demoMachineUsageResponse } = await loadDemoHandlers();
		return demoMachineUsageResponse(machineId, days);
	}

	const sb = supabaseAdmin();

	const [dailyRes, metricsRes, transitionsRes] = await Promise.all([
		sb
			.from("machine_usage_daily")
			.select("*")
			.eq("user_id", userId)
			.eq("machine_id", machineId)
			.order("bucket_date", { ascending: false })
			.limit(90),
		sb
			.from("machine_metrics")
			.select("*")
			.eq("user_id", userId)
			.eq("machine_id", machineId)
			.order("recorded_at", { ascending: false })
			.limit(168),
		sb
			.from("machine_transitions")
			.select("*")
			.eq("user_id", userId)
			.eq("machine_id", machineId)
			.order("occurred_at", { ascending: false })
			.limit(50),
	]);

	const firstError =
		dailyRes.error ?? metricsRes.error ?? transitionsRes.error;
	if (firstError) {
		return Response.json(
			{ ok: false, error: firstError.message },
			{ status: 502 },
		);
	}

	return Response.json({
		ok: true,
		machineId,
		dailyUsage: dailyRes.data ?? [],
		recentMetrics: metricsRes.data ?? [],
		transitions: transitionsRes.data ?? [],
	});
}
