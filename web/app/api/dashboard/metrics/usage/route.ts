import { type NextRequest } from "next/server";

import {
	buildUsageResourcesFromDailyRows,
	type DailyUsageRow,
} from "@/lib/dashboard/usage-metrics";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";
import { isDemoMode, loadDemoHandlers } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const days = Math.min(
		90,
		Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 7)),
	);

	if (isDemoMode()) {
		const { demoUsageResponse } = await loadDemoHandlers();
		return demoUsageResponse(days);
	}

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	const sb = supabaseAdmin();

	const [usageRes, costRes] = await Promise.all([
		sb
			.from("machine_usage_daily")
			.select(
				"bucket_date, machine_id, awake_seconds, cpu_vcpu_seconds, memory_gib_seconds, storage_gib_hours",
			)
			.eq("user_id", userId)
			.gte("bucket_date", cutoffStr)
			.order("bucket_date", { ascending: true }),
		sb
			.from("machine_cost_estimates")
			.select("bucket_date, total_cost_millicents")
			.eq("user_id", userId)
			.gte("bucket_date", cutoffStr),
	]);

	if (usageRes.error) {
		return Response.json(
			{ ok: false, error: usageRes.error.message },
			{ status: 502 },
		);
	}
	if (costRes.error) {
		return Response.json(
			{ ok: false, error: costRes.error.message },
			{ status: 502 },
		);
	}

	const usageRows = (usageRes.data ?? []) as DailyUsageRow[];
	const costRows = costRes.data ?? [];
	const resources = buildUsageResourcesFromDailyRows(usageRows);

	// B) Per-machine breakdown
	const machineMap = new Map<
		string,
		{
			awakeSeconds: number;
			cpuVcpuSeconds: number;
			memoryGibSeconds: number;
		}
	>();
	for (const r of usageRows) {
		if (!r.machine_id) continue;
		const existing = machineMap.get(r.machine_id) ?? {
			awakeSeconds: 0,
			cpuVcpuSeconds: 0,
			memoryGibSeconds: 0,
		};
		existing.awakeSeconds += r.awake_seconds ?? 0;
		existing.cpuVcpuSeconds += r.cpu_vcpu_seconds ?? 0;
		existing.memoryGibSeconds += r.memory_gib_seconds ?? 0;
		machineMap.set(r.machine_id, existing);
	}

	const machineBreakdown = [...machineMap.entries()].map(
		([machineId, stats]) => ({
			machineId,
			awakeSeconds: stats.awakeSeconds,
			cpuVcpuSeconds: stats.cpuVcpuSeconds,
			memoryGibSeconds: stats.memoryGibSeconds,
		}),
	);

	// C) Cost totals
	let totalCostMillicents = 0;
	for (const r of costRows) {
		totalCostMillicents += r.total_cost_millicents ?? 0;
	}

	return Response.json({
		ok: true,
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
		machineBreakdown,
		totalCostMillicents,
		totalCostFormatted: `$${(totalCostMillicents / 100_000).toFixed(2)}`,
	});
}
