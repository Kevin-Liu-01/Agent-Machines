import { type NextRequest } from "next/server";

import { buildLiveActivityPayload } from "@/lib/dashboard/activity/build-live-activity";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const config = await getUserConfig();
	const machines = config.machines
		.filter((m) => !m.archived)
		.map((m) => ({
			id: m.id,
			name: m.name,
			agentKind: m.agentKind,
			providerKind: m.providerKind,
			createdAt: m.createdAt,
		}));

	const sb = supabaseAdmin();
	const [transitionsRes, usageRes] = await Promise.all([
		sb
			.from("machine_transitions")
			.select("machine_id, machine_name, to_phase, occurred_at, label")
			.eq("user_id", userId)
			.order("occurred_at", { ascending: false })
			.limit(800),
		sb
			.from("machine_usage_daily")
			.select("bucket_date, cpu_vcpu_seconds")
			.eq("user_id", userId)
			.gte(
				"bucket_date",
				new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10),
			),
	]);

	const usageDays = (usageRes.data ?? []).map((r) => ({
		date: r.bucket_date as string,
		vcpuSeconds: (r.cpu_vcpu_seconds as number) ?? 0,
	}));

	const payload = buildLiveActivityPayload({
		machines,
		transitions: transitionsRes.data ?? [],
		logsByMachine: {},
		usageDays,
	});

	return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
