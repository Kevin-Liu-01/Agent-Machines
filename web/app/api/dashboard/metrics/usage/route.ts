import { type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";
import { isDemoMode, loadDemoHandlers } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	if (isDemoMode()) {
		const { demoUsageResponse } = await loadDemoHandlers();
		return demoUsageResponse();
	}

	const days = Math.min(
		90,
		Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 7)),
	);

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

	const usageRows = usageRes.data ?? [];
	const costRows = costRes.data ?? [];

	// A) Daily resource totals
	const dailyMap = new Map<
		string,
		{ vcpuSeconds: number; gibSeconds: number; gibHours: number }
	>();
	for (const r of usageRows) {
		const existing = dailyMap.get(r.bucket_date) ?? {
			vcpuSeconds: 0,
			gibSeconds: 0,
			gibHours: 0,
		};
		existing.vcpuSeconds += r.cpu_vcpu_seconds ?? 0;
		existing.gibSeconds += r.memory_gib_seconds ?? 0;
		existing.gibHours += r.storage_gib_hours ?? 0;
		dailyMap.set(r.bucket_date, existing);
	}

	const cpuBuckets: { date: string; vcpuSeconds: number }[] = [];
	const memBuckets: { date: string; gibSeconds: number }[] = [];
	const storageBuckets: { date: string; gibHours: number }[] = [];
	let totalVcpu = 0;
	let totalMem = 0;
	let totalStorage = 0;

	for (const [date, totals] of dailyMap) {
		cpuBuckets.push({ date, vcpuSeconds: totals.vcpuSeconds });
		memBuckets.push({ date, gibSeconds: totals.gibSeconds });
		storageBuckets.push({ date, gibHours: totals.gibHours });
		totalVcpu += totals.vcpuSeconds;
		totalMem += totals.gibSeconds;
		totalStorage += totals.gibHours;
	}

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
			cpu: { totalVcpuSeconds: totalVcpu, buckets: cpuBuckets },
			memory: { totalGibSeconds: totalMem, buckets: memBuckets },
			storage: { totalGibHours: totalStorage, buckets: storageBuckets },
		},
		machineBreakdown,
		totalCostMillicents,
		totalCostFormatted: `$${(totalCostMillicents / 100_000).toFixed(2)}`,
	});
}
