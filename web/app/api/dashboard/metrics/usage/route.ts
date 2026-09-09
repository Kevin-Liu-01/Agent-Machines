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
			rows: DailyUsageRow[];
		}
	>();
	for (const r of usageRows) {
		if (!r.machine_id) continue;
		const existing = machineMap.get(r.machine_id) ?? {
			awakeSeconds: 0,
			rows: [],
		};
		existing.awakeSeconds += Number(r.awake_seconds) || 0;
		existing.rows.push(r);
		machineMap.set(r.machine_id, existing);
	}

	const machineBreakdown = [...machineMap.entries()].map(
		([machineId, stats]) => {
			const sampled = buildUsageResourcesFromDailyRows(stats.rows);
			return {
				machineId,
				awakeSeconds: stats.awakeSeconds,
				// This compact table has no partial-series label. Do not present
				// a known subtotal as complete machine allocation.
				cpuVcpuSeconds: sampled.cpu.evidence === "sampled" ? sampled.cpu.total : null,
				memoryGibSeconds: sampled.memory.evidence === "sampled" ? sampled.memory.total : null,
				costFormatted: estimatesByMachine.get(machineId)?.costFormatted ?? "Unknown",
				costNote: estimatesByMachine.get(machineId)?.costNote ?? "No usable cost observations for this machine.",
			};
		},
	);

	return Response.json({
		ok: true,
		days,
		resources: {
			cpu: {
				evidence: resources.cpu.evidence,
				totalVcpuSeconds: resources.cpu.total,
				buckets: resources.cpu.buckets,
			},
			memory: {
				evidence: resources.memory.evidence,
				totalGibSeconds: resources.memory.total,
				buckets: resources.memory.buckets,
			},
			storage: {
				evidence: resources.storage.evidence,
				totalGibHours: resources.storage.total,
				buckets: resources.storage.buckets,
			},
		},
		machineBreakdown,
		...cost,
		costSources: COMPUTE_PRICE_SOURCES,
	}, { headers: { "Cache-Control": "no-store" } });
}
