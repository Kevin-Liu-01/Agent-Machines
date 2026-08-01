/**
 * Routing policy store + recompute (Loop A learn).
 *
 * The active policy is a single global snapshot in routing_policy (no user_id --
 * routing priors pool across the fleet, like provider_benchmarks). recompute
 * reads only the arm/outcome columns of run_traces (privacy: never prompt or
 * memory), rebuilds the posteriors, seeds per-substrate priors from
 * provider_benchmarks, and publishes a new active version.
 *
 * WHAT MAY ENTER THE COST POSTERIOR (roadmap 4.1). Four gates, all of which a
 * row must pass, because a cost statistic is only as honest as its worst
 * sample:
 *
 *   1. The row must carry an `extra.price` block. Rows without one were written
 *      by the retired single-table estimator in metrics/cost.ts, which prices a
 *      60s 2 vCPU / 4 GiB run at 1.1 millicents where E2B's published rate says
 *      276 -- averaging the two produces a number that describes neither.
 *   2. That block must say a published rate actually priced THIS row.
 *   3. The lane must still be published in TODAY's table. Comparing lanes means
 *      comparing them under one table, the same rule src/mux/traces.ts follows
 *      when it reprices a group rather than summing what each record stored.
 *   4. The figure itself must be present and finite.
 *
 * A row that fails a gate still contributes its success and its latency -- the
 * lane stays routable and keeps learning, it is only not cost-ranked, and
 * `costRanking` on the active policy names every such lane and why. What must
 * NOT happen is the old `cost_millicents ?? 0`: zero is the cheapest possible
 * cost, so it did not record a gap, it recorded a lie in the lane's favor.
 */

import { supabaseAdmin } from "@/lib/supabase/client";
import { emptyAgg, pushObservation } from "@/lib/learning/bandit";
import { readTraceLanePrice } from "@/lib/learning/trace-price";
import { DEFAULT_WEIGHTS } from "@/lib/learning/reward";
import {
	costRankingReport,
	isCostRankable,
	type CostRankingReport,
	type PriceTable,
	SUBSTRATE_PRICES,
} from "@/lib/metrics/prices";
import {
	emptyArtifact,
	type ArmAgg,
	type PolicyArtifact,
	type RewardWeights,
} from "@/lib/learning/types";

export type ActivePolicy = {
	version: number;
	artifact: PolicyArtifact;
	weights: RewardWeights;
	/**
	 * Which lanes price optimization can speak for, and why not for the rest.
	 * Derived from the committed price table rather than stored on the snapshot,
	 * so it is current even for a policy computed before the table changed.
	 */
	costRanking: CostRankingReport;
};

export type TraceRow = {
	task_class: string | null;
	runtime: string;
	substrate: string;
	model: string;
	router_id: string | null;
	success: boolean | null;
	cost_millicents: number | null;
	latency_ms: number | null;
	/**
	 * The jsonb blob, of which ONLY `extra.price` is consumed (via the strict
	 * reader in trace-price.ts). Nothing else in it is inspected here, and the
	 * privacy rule above is unchanged: no prompt text, no memory.
	 */
	extra: unknown;
};

const TRACE_READ_LIMIT = 50_000;

export function shouldRecomputePolicy(
	activeComputedAt: string | null,
	latestTraceAt: string | null,
): boolean {
	if (!activeComputedAt) return true;
	if (!latestTraceAt) return false;
	const activeMs = Date.parse(activeComputedAt);
	const traceMs = Date.parse(latestTraceAt);
	return !Number.isFinite(activeMs) || !Number.isFinite(traceMs) || traceMs > activeMs;
}

function rowArmKey(r: TraceRow): string {
	return `${r.runtime}|${r.substrate}|${r.model}|${r.router_id ?? ""}`;
}

/** Why a row's cost was refused. Counted so a recompute can report the shape. */
export type CostSkipReason =
	/** No `extra.price` block: written by the retired single-table estimator. */
	| "legacy_estimate"
	/** The row itself was not priced from a published rate -- see its `reason`. */
	| "not_cost_ranked"
	/** Priced when written, but today's table no longer publishes that lane. */
	| "lane_unpriced_now"
	/** Cost-ranked row that nonetheless carries no usable figure. */
	| "no_figure";

export type PolicyBuild = {
	artifact: PolicyArtifact;
	weights: RewardWeights;
	/** Rows whose sandbox cost was admitted into the posteriors. */
	costObservations: number;
	/** Rows whose cost was refused, by reason. They still count for success. */
	costSkipped: Record<CostSkipReason, number>;
};

/**
 * The cost this row may contribute, or the reason it may not.
 *
 * Sandbox compute only: `cost_millicents` has only ever carried the sandbox
 * half (route-outcomes.ts documents the same invariant on the read side), and
 * the model half is not persisted on the hosted path at all. Nothing here adds
 * the two, so no total can be implied from one.
 */
function rowCost(
	row: TraceRow,
	prices: PriceTable,
): { millicents: number } | { skip: CostSkipReason } {
	const price = readTraceLanePrice(row.extra);
	if (!price) return { skip: "legacy_estimate" };
	if (!price.costRanked) return { skip: "not_cost_ranked" };
	if (!isCostRankable(row.substrate, prices)) return { skip: "lane_unpriced_now" };
	if (typeof row.cost_millicents !== "number" || !Number.isFinite(row.cost_millicents)) {
		return { skip: "no_figure" };
	}
	return { millicents: row.cost_millicents };
}


/**
 * Rebuild the posteriors and the reward ranges from trace rows.
 *
 * Pure: no Supabase, no clock. The normalization ranges are derived only from
 * observations that passed the cost gates, so one unpriced lane cannot stretch
 * the scale every priced lane is judged on. When nothing was observed the range
 * is left degenerate (max 0), which `normalize` reads as "this term is off" --
 * the previous `?: 1` fallback instead made any run costing a single millicent
 * absorb the entire cost penalty.
 */
export function buildPolicyFromTraces(
	rows: readonly TraceRow[],
	prices: PriceTable = SUBSTRATE_PRICES,
): PolicyBuild {
	const artifact = emptyArtifact();
	let costMax = 0;
	let latMax = 0;
	let costObservations = 0;
	const costSkipped: Record<CostSkipReason, number> = {
		legacy_estimate: 0,
		not_cost_ranked: 0,
		lane_unpriced_now: 0,
		no_figure: 0,
	};

	for (const r of rows) {
		if (r.success === null) continue;
		const key = rowArmKey(r);
		const priced = rowCost(r, prices);
		const cost = "millicents" in priced ? priced.millicents : null;
		if (cost === null) costSkipped[(priced as { skip: CostSkipReason }).skip] += 1;
		else costObservations += 1;
		const lat =
			typeof r.latency_ms === "number" && Number.isFinite(r.latency_ms) ? r.latency_ms : null;
		const obs = { success: r.success, costMillicents: cost, latencyMs: lat };
		artifact.global[key] = pushObservation(artifact.global[key] ?? emptyAgg(), obs);
		const cls = r.task_class || "unknown";
		const byClass = (artifact.byClass[cls] ??= {});
		byClass[key] = pushObservation(byClass[key] ?? emptyAgg(), obs);
		if (cost !== null && cost > costMax) costMax = cost;
		if (lat !== null && lat > latMax) latMax = lat;
	}

	return {
		artifact,
		weights: {
			...DEFAULT_WEIGHTS,
			costRange: { min: 0, max: costMax },
			latRange: { min: 0, max: latMax },
		},
		costObservations,
		costSkipped,
	};
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
		costRanking: costRankingReport(),
	};
}

/**
 * Recompute the global routing policy and publish a new active snapshot.
 * Assumes a single scheduled writer (the hourly Vercel cron); concurrent runs
 * could produce duplicate version numbers, which readActivePolicy tolerates by
 * also ordering on computed_at.
 */
export async function recomputePolicy(): Promise<{
	version: number;
	nTraces: number;
	updated: boolean;
	/** Rows whose sandbox cost was admitted; 0 when nothing could be priced. */
	costObservations?: number;
	costSkipped?: Record<CostSkipReason, number>;
	/** Lanes routable but not cost-ranked, each with the reason. */
	costRanking?: CostRankingReport;
}> {
	const sb = supabaseAdmin();
	const [activeResult, traceResult] = await Promise.all([
		sb
			.from("routing_policy")
			.select("version,n_traces,computed_at")
			.eq("active", true)
			.order("computed_at", { ascending: false })
			.limit(1)
			.maybeSingle(),
		sb
			.from("run_traces")
			.select("recorded_at")
			.not("success", "is", null)
			.order("recorded_at", { ascending: false })
			.limit(1)
			.maybeSingle(),
	]);
	if (activeResult.error) {
		throw new Error(`recomputePolicy read active: ${activeResult.error.message}`);
	}
	if (traceResult.error) {
		throw new Error(`recomputePolicy read latest trace: ${traceResult.error.message}`);
	}
	const active = activeResult.data;
	const latestTrace = traceResult.data;
	if (
		active &&
		!shouldRecomputePolicy(
			active.computed_at as string | null,
			(latestTrace?.recorded_at as string | null | undefined) ?? null,
		)
	) {
		return {
			version: active.version as number,
			nTraces: (active.n_traces as number | null) ?? 0,
			updated: false,
		};
	}

	const { data: traceData, error: traceErr } = await sb
		.from("run_traces")
		.select(
			"task_class, runtime, substrate, model, router_id, success, cost_millicents, latency_ms, extra",
		)
		.not("success", "is", null)
		.order("recorded_at", { ascending: false })
		.limit(TRACE_READ_LIMIT);
	if (traceErr) throw new Error(`recomputePolicy read traces: ${traceErr.message}`);
	const traces = (traceData ?? []) as TraceRow[];

	const built = buildPolicyFromTraces(traces);
	const artifact = built.artifact;

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

	const weights = built.weights;

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

	return {
		version,
		nTraces: traces.length,
		updated: true,
		costObservations: built.costObservations,
		costSkipped: built.costSkipped,
		costRanking: costRankingReport(),
	};
}
