/**
 * run_traces sink. Inserts are deduped on run_id (idempotent: re-reading the
 * same runs.jsonl tail on a later tick is a no-op). Throws on a real DB error;
 * the tick path swallows it (best-effort observation).
 */

import { supabaseAdmin } from "@/lib/supabase/client";
import type { RunTrace } from "@/lib/learning/types";

type RunTraceRow = {
	user_id: string;
	machine_id: string;
	run_id: string;
	source: string;
	task_class: string;
	runtime: string;
	substrate: string;
	model: string;
	router_id: string | null;
	loadout_hash: string;
	memory_bundle_id: string | null;
	tenant_hash: string | null;
	success: boolean | null;
	exit_code: number | null;
	cost_millicents: number | null;
	latency_ms: number | null;
	started_at: string | null;
	finished_at: string | null;
	extra: Record<string, unknown> | null;
};

function toRow(t: RunTrace): RunTraceRow {
	return {
		user_id: t.userId,
		machine_id: t.machineId,
		run_id: t.runId,
		source: t.source,
		task_class: t.taskClass,
		runtime: t.runtime,
		substrate: t.substrate,
		model: t.model,
		router_id: t.routerId,
		loadout_hash: t.loadoutHash,
		memory_bundle_id: t.memoryBundleId,
		tenant_hash: t.tenantHash,
		success: t.success,
		exit_code: t.exitCode,
		cost_millicents: t.costMillicents,
		latency_ms: t.latencyMs,
		started_at: t.startedAt,
		finished_at: t.finishedAt,
		extra: t.extra,
	};
}

export async function emitRunTraces(traces: RunTrace[]): Promise<void> {
	if (traces.length === 0) return;
	const sb = supabaseAdmin();
	const { error } = await sb
		.from("run_traces")
		.upsert(traces.map(toRow), { onConflict: "run_id", ignoreDuplicates: true });
	if (error) throw new Error(`emitRunTraces: ${error.message}`);
}
