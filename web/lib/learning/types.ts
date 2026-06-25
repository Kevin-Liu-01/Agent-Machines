/**
 * Shared types for the self-learning loop (Loop 0 observation + Loop A routing).
 *
 * An "arm" is a routing choice over four axes; the bandit learns which arm wins
 * for a workload from the outcomes recorded in run_traces. See self-learning-spec.md.
 */

import type { AgentKind, ProviderKind } from "@/lib/user-config/schema";

/**
 * A routing arm -- the four axes the bandit chooses among. `routerId` is null for
 * native-key agents (codex/claude-code), which don't use a model router.
 */
export type Arm = {
	runtime: AgentKind;
	substrate: ProviderKind;
	model: string;
	routerId: string | null;
};

/** Stable key for an arm, used to index posteriors in the policy artifact. */
export function armKey(arm: Arm): string {
	return `${arm.runtime}|${arm.substrate}|${arm.model}|${arm.routerId ?? ""}`;
}

/** Welford running mean/variance accumulator (for cost & latency). */
export type Welford = { n: number; mean: number; m2: number };

/** Per-arm aggregate sufficient statistics. */
export type ArmAgg = {
	/** Total completed runs observed. */
	n: number;
	/** Runs with exit code 0. */
	successes: number;
	/** Cost in millicents. */
	cost: Welford;
	/** Latency in milliseconds. */
	latency: Welford;
};

/** Per-substrate prior seeded from provider_benchmarks. */
export type SubstratePrior = {
	/** Fraction of benchmark probes that succeeded (ok). */
	okRate: number;
	/** Number of benchmark probes backing okRate. */
	n: number;
};

/**
 * The learned routing policy snapshot, stored in routing_policy.posteriors.
 * Computed only from non-PII columns -- never prompt text or memory.
 */
export type PolicyArtifact = {
	/** Global per-arm aggregates (always available). */
	global: Record<string, ArmAgg>;
	/** Per-task_class per-arm aggregates (used only above the sample threshold). */
	byClass: Record<string, Record<string, ArmAgg>>;
	/** Per-substrate priors from provider_benchmarks. */
	substratePrior: Record<string, SubstratePrior>;
};

/** Weights + normalization ranges for the scalar reward. */
export type RewardWeights = {
	lambdaCost: number;
	muLatency: number;
	costRange: { min: number; max: number };
	latRange: { min: number; max: number };
};

/** A run trace (domain object). Maps 1:1 to a row in the run_traces table. */
export type RunTrace = {
	userId: string;
	machineId: string;
	runId: string;
	source: "cron" | "interactive";
	taskClass: string;
	runtime: AgentKind;
	substrate: ProviderKind;
	model: string;
	routerId: string | null;
	loadoutHash: string;
	memoryBundleId: string | null;
	tenantHash: string | null;
	success: boolean | null;
	exitCode: number | null;
	costMillicents: number | null;
	latencyMs: number | null;
	startedAt: string | null;
	finishedAt: string | null;
	extra: Record<string, unknown> | null;
};

/** An empty policy artifact (no data yet -- sampling falls back to priors). */
export function emptyArtifact(): PolicyArtifact {
	return { global: {}, byClass: {}, substratePrior: {} };
}
