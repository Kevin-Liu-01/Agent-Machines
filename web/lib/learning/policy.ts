/**
 * Routing policy store + recompute (Loop A learn).
 *
 * The active policy is a single global snapshot in routing_policy (no user_id --
 * routing priors pool across the fleet, like provider_benchmarks). recompute
 * reads only the arm/outcome columns of run_traces (privacy: never prompt or
 * memory), rebuilds the posteriors, seeds per-substrate priors from
 * provider_benchmarks, and publishes a new active version.
 */

import { supabaseAdmin } from "@/lib/supabase/client";
import { emptyAgg, pushObservation } from "@/lib/learning/bandit";
import { DEFAULT_WEIGHTS } from "@/lib/learning/reward";
import { emptyArtifact, type PolicyArtifact, type RewardWeights } from "@/lib/learning/types";

export type ActivePolicy = {
	version: number;
	artifact: PolicyArtifact;
	weights: RewardWeights;
};

type TraceRow = {
	task_class: string | null;
	runtime: string;
	substrate: string;
	model: string;
	router_id: string | null;
	success: boolean | null;
	cost_millicents: number | null;
	latency_ms: number | null;
};

const TRACE_READ_LIMIT = 50_000;

function rowArmKey(r: TraceRow): string {
	return `${r.runtime}|${r.substrate}|${r.model}|${r.router_id ?? ""}`;
}

/** Read the most recent active routing policy snapshot, if any. */
export async function readActivePolicy(): Promise<ActivePolicy | null> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("routing_policy")
		.select("version, posteriors, weights")
		.eq("active", true)
		.order("version", { ascending: false })
		.order("computed_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error || !data) return null;
	return {
		version: data.version as number,
		artifact: (data.posteriors as PolicyArtifact | null) ?? emptyArtifact(),
		weights: (data.weights as RewardWeights | null) ?? DEFAULT_WEIGHTS,
	};
}

/**
 * Recompute the global routing policy and publish a new active snapshot.
 * Assumes a single scheduled writer (the hourly Vercel cron); concurrent runs
 * could produce duplicate version numbers, which readActivePolicy tolerates by
 * also ordering on computed_at.
 */
export async function recomputePolicy(): Promise<{ version: number; nTraces: number }> {
	const sb = supabaseAdmin();

	const { data: traceData, error: traceErr } = await sb
		.from("run_traces")
		.select("task_class, runtime, substrate, model, router_id, success, cost_millicents, latency_ms")
		.not("success", "is", null)
		.order("recorded_at", { ascending: false })
		.limit(TRACE_READ_LIMIT);
	if (traceErr) throw new Error(`recomputePolicy read traces: ${traceErr.message}`);
	const traces = (traceData ?? []) as TraceRow[];

	const artifact = emptyArtifact();
	let costMax = 0;
	let latMax = 0;

	for (const r of traces) {
		if (r.success === null) continue;
		const key = rowArmKey(r);
		const cost = r.cost_millicents ?? 0;
		const lat = r.latency_ms ?? 0;
		const obs = { success: r.success, costMillicents: cost, latencyMs: lat };
		artifact.global[key] = pushObservation(artifact.global[key] ?? emptyAgg(), obs);
		const cls = r.task_class || "unknown";
		const byClass = (artifact.byClass[cls] ??= {});
		byClass[key] = pushObservation(byClass[key] ?? emptyAgg(), obs);
		if (cost > costMax) costMax = cost;
		if (lat > latMax) latMax = lat;
	}

	// Per-substrate prior from provider_benchmarks (global, non-user table).
	const { data: benchData } = await sb
		.from("provider_benchmarks")
		.select("provider_kind, ok")
		.limit(5_000);
	const benchAgg = new Map<string, { ok: number; n: number }>();
	for (const b of (benchData ?? []) as { provider_kind: string; ok: boolean }[]) {
		const cur = benchAgg.get(b.provider_kind) ?? { ok: 0, n: 0 };
		cur.n += 1;
		if (b.ok) cur.ok += 1;
		benchAgg.set(b.provider_kind, cur);
	}
	for (const [substrate, agg] of benchAgg) {
		artifact.substratePrior[substrate] = {
			okRate: agg.n > 0 ? agg.ok / agg.n : 0.5,
			n: agg.n,
		};
	}

	const weights: RewardWeights = {
		...DEFAULT_WEIGHTS,
		costRange: { min: 0, max: costMax > 0 ? costMax : 1 },
		latRange: { min: 0, max: latMax > 0 ? latMax : 1 },
	};

	const { data: verRow } = await sb
		.from("routing_policy")
		.select("version")
		.order("version", { ascending: false })
		.limit(1)
		.maybeSingle();
	const version = ((verRow?.version as number | undefined) ?? 0) + 1;

	// Insert the new active snapshot FIRST, then deactivate the prior ones, so a
	// failed insert can never leave zero active policies (readActivePolicy would
	// otherwise return null and routing would fall back to uninformed priors).
	const { error: insErr } = await sb.from("routing_policy").insert({
		version,
		weights,
		posteriors: artifact,
		n_traces: traces.length,
		active: true,
	});
	if (insErr) throw new Error(`recomputePolicy write: ${insErr.message}`);

	const { error: deErr } = await sb
		.from("routing_policy")
		.update({ active: false })
		.eq("active", true)
		.neq("version", version);
	if (deErr) console.error(`recomputePolicy deactivate prior failed: ${deErr.message}`);

	return { version, nTraces: traces.length };
}
