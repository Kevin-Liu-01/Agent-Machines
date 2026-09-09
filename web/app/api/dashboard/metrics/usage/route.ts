import { type NextRequest } from "next/server";

import {
	buildUsageResourcesFromDailyRows,
	type DailyUsageRow,
} from "@/lib/dashboard/usage-metrics";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";
import { observedComputeUsage, USAGE_SAMPLE_LIMIT, type UsageObservation } from "@/lib/metrics/observed-usage";
import { COMPUTE_PRICE_SOURCES } from "@/lib/metrics/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 7);
	const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, Math.floor(requestedDays))) : 7;

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	const sb = supabaseAdmin();

	const [usageRes, observationRes, machinesRes] = await Promise.all([
		sb
			.from("machine_usage_daily")
			.select(
				"bucket_date, machine_id, awake_seconds, cpu_vcpu_seconds, memory_gib_seconds, storage_gib_hours",
			)
			.eq("user_id", userId)
			.gte("bucket_date", cutoffStr)
			.order("bucket_date", { ascending: true }),
		sb
			.from("machine_metrics")
			.select("machine_id,recorded_at,phase,vcpu,spec_memory_mib", { count: "exact" })
			.eq("user_id", userId)
			.gte("recorded_at", `${cutoffStr}T00:00:00Z`)
			.order("recorded_at", { ascending: false })
			.limit(USAGE_SAMPLE_LIMIT),
		sb.from("machines").select("id,provider_kind").eq("user_id", userId),
	]);

	if (usageRes.error) {
		return Response.json(
			{ ok: false, error: usageRes.error.message },
			{ status: 502 },
		);
	}
	if (observationRes.error || machinesRes.error) {
		return Response.json(
			{ ok: false, error: observationRes.error?.message ?? machinesRes.error?.message },
			{ status: 502 },
		);
	}

	const usageRows = (usageRes.data ?? []) as DailyUsageRow[];
	const resources = buildUsageResourcesFromDailyRows(usageRows);
	const observations = (observationRes.data ?? []) as UsageObservation[];
	const cost = observedComputeUsage(
		observations,
		new Map((machinesRes.data ?? []).map((m) => [m.id, m.provider_kind])),
		observationRes.count === null || (observationRes.count ?? 0) > observations.length,
	);
	const estimatesByMachine = new Map(cost.estimates.map((estimate) => [estimate.machineId, estimate]));

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
		existing.awakeSeconds += Number(r.awake_seconds) || 0;
		existing.cpuVcpuSeconds += Number(r.cpu_vcpu_seconds) || 0;
		existing.memoryGibSeconds += Number(r.memory_gib_seconds) || 0;
		machineMap.set(r.machine_id, existing);
	}

	const machineBreakdown = [...machineMap.entries()].map(
		([machineId, stats]) => ({
			machineId,
			awakeSeconds: stats.awakeSeconds,
			cpuVcpuSeconds: stats.cpuVcpuSeconds,
			memoryGibSeconds: stats.memoryGibSeconds,
			costFormatted: estimatesByMachine.get(machineId)?.costFormatted ?? "Unknown",
			costNote: estimatesByMachine.get(machineId)?.costNote ?? "No usable cost observations for this machine.",
		}),
	);

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
		...cost,
		costSources: COMPUTE_PRICE_SOURCES,
	}, { headers: { "Cache-Control": "no-store" } });
}
