import { type NextRequest } from "next/server";

import {
	buildUsageResourcesFromDailyRows,
	type DailyUsageRow,
} from "@/lib/dashboard/usage-metrics";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";

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

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	const sb = supabaseAdmin();

	const [dailyRes, transitionsRes] = await Promise.all([
		sb
			.from("machine_usage_daily")
			.select(
				"bucket_date, awake_seconds, cpu_vcpu_seconds, memory_gib_seconds, storage_gib_hours",
			)
			.eq("user_id", userId)
			.eq("machine_id", machineId)
			.gte("bucket_date", cutoffStr)
			.order("bucket_date", { ascending: true }),
		sb
			.from("machine_transitions")
			.select("occurred_at, from_phase, to_phase, reason, machine_name")
			.eq("user_id", userId)
			.eq("machine_id", machineId)
			.order("occurred_at", { ascending: false })
			.limit(50),
	]);

	if (dailyRes.error) {
		return Response.json(
			{ ok: false, error: dailyRes.error.message },
			{ status: 502 },
		);
	}
	if (transitionsRes.error) {
		return Response.json(
			{ ok: false, error: transitionsRes.error.message },
			{ status: 502 },
		);
	}

	const usageRows = (dailyRes.data ?? []) as DailyUsageRow[];
	const resources = buildUsageResourcesFromDailyRows(usageRows);
	const transitions = (transitionsRes.data ?? []).map((row) => {
		const from = row.from_phase ?? "?";
		const to = row.to_phase ?? "?";
		const label =
			typeof row.reason === "string" && row.reason
				? row.reason
				: `${from} → ${to}`;
		return {
			label,
			timestamp:
				typeof row.occurred_at === "string"
					? row.occurred_at
					: new Date().toISOString(),
		};
	});

	return Response.json({
		ok: true,
		machineId,
		days,
		resources: {
			cpu: {
				totalVcpuSeconds: resources.cpu.total,
				buckets: resources.cpu.buckets,
			},
			memory: {
				totalGibSeconds: resources.memory.total,
				buckets: resources.memory.buckets,
			},
			storage: {
				totalGibHours: resources.storage.total,
				buckets: resources.storage.buckets,
			},
		},
		transitions,
	});
}
