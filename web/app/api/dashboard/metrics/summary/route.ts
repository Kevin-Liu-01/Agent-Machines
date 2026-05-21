import { type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const sb = supabaseAdmin();

	const { data, error } = await sb
		.from("machine_transitions")
		.select("machine_id, to_phase, machine_name, occurred_at")
		.eq("user_id", userId)
		.order("occurred_at", { ascending: false })
		.limit(500);

	if (error) {
		return Response.json({ ok: false, error: error.message }, { status: 502 });
	}

	const latest = new Map<
		string,
		{ phase: string; name: string | null; at: string }
	>();
	for (const row of data ?? []) {
		if (!latest.has(row.machine_id)) {
			latest.set(row.machine_id, {
				phase: row.to_phase,
				name: row.machine_name,
				at: row.occurred_at,
			});
		}
	}

	let running = 0;
	let sleeping = 0;
	let failed = 0;
	const machines: {
		machineId: string;
		phase: string;
		name: string | null;
		lastTransitionAt: string;
	}[] = [];

	for (const [machineId, info] of latest) {
		machines.push({
			machineId,
			phase: info.phase,
			name: info.name,
			lastTransitionAt: info.at,
		});
		if (info.phase === "running") running++;
		else if (info.phase === "sleeping") sleeping++;
		else if (info.phase === "failed") failed++;
	}

	return Response.json({
		ok: true,
		running,
		sleeping,
		failed,
		total: machines.length,
		machines,
	});
}
