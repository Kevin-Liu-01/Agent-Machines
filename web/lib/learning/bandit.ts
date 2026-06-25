/**
 * Factorized Thompson-sampling bandit for routing.
 *
 * Success is modeled per-arm as a Beta posterior, seeded by a per-substrate
 * prior from provider_benchmarks (no cold start). task_class is *advisory*: a
 * per-class posterior is used only once its cell clears a sample threshold tau,
 * otherwise the global per-arm posterior is used. Cost and latency are tracked
 * as Welford mean/variance and fold into the scalar reward.
 */

import {
	type Arm,
	type ArmAgg,
	type PolicyArtifact,
	type RewardWeights,
	type Welford,
	armKey,
} from "@/lib/learning/types";
import { scalarReward } from "@/lib/learning/reward";

/** Sample threshold tau: a per-task_class cell is trusted only at/above this. */
export const DEFAULT_TASK_CLASS_THRESHOLD = 30;

/** Beta prior pseudo-counts before any data / benchmark seeding. */
const BASE_ALPHA = 1;
const BASE_BETA = 1;
/** Weight of the substrate benchmark prior, in pseudo-observations. */
const SUBSTRATE_PRIOR_STRENGTH = 4;

type Rng = () => number;

// ---- sufficient statistics ------------------------------------------------

export function emptyWelford(): Welford {
	return { n: 0, mean: 0, m2: 0 };
}

export function welfordPush(w: Welford, x: number): Welford {
	const n = w.n + 1;
	const delta = x - w.mean;
	const mean = w.mean + delta / n;
	const m2 = w.m2 + delta * (x - mean);
	return { n, mean, m2 };
}

export function welfordVariance(w: Welford): number {
	return w.n > 1 ? w.m2 / (w.n - 1) : 0;
}

export function emptyAgg(): ArmAgg {
	return { n: 0, successes: 0, cost: emptyWelford(), latency: emptyWelford() };
}

export function pushObservation(
	agg: ArmAgg,
	obs: { success: boolean; costMillicents: number; latencyMs: number },
): ArmAgg {
	return {
		n: agg.n + 1,
		successes: agg.successes + (obs.success ? 1 : 0),
		cost: welfordPush(agg.cost, obs.costMillicents),
		latency: welfordPush(agg.latency, obs.latencyMs),
	};
}

// ---- samplers -------------------------------------------------------------

/** Standard-normal draw via Box-Muller, shifted/scaled to (mean, sd). */
export function sampleNormal(mean: number, sd: number, rng: Rng): number {
	const u1 = Math.max(rng(), Number.EPSILON);
	const u2 = rng();
	const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
	return mean + sd * z;
}

/** Gamma(shape k > 0, scale 1) via Marsaglia-Tsang. */
export function sampleGamma(k: number, rng: Rng): number {
	if (k < 1) {
		const u = Math.max(rng(), Number.EPSILON);
		return sampleGamma(k + 1, rng) * u ** (1 / k);
	}
	const d = k - 1 / 3;
	const c = 1 / Math.sqrt(9 * d);
	for (;;) {
		let x = 0;
		let v = 0;
		do {
			x = sampleNormal(0, 1, rng);
			v = 1 + c * x;
		} while (v <= 0);
		v = v * v * v;
		const u = Math.max(rng(), Number.EPSILON);
		if (u < 1 - 0.0331 * x * x * x * x) return d * v;
		if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
	}
}

/** Beta(a, b) via two gammas. */
export function sampleBeta(a: number, b: number, rng: Rng): number {
	const x = sampleGamma(a, rng);
	const y = sampleGamma(b, rng);
	const s = x + y;
	return s > 0 ? x / s : 0.5;
}

// ---- posterior selection + scoring ---------------------------------------

/** Pick the aggregate for an arm: per-class if it clears tau, else global. */
export function effectiveAgg(
	policy: PolicyArtifact,
	key: string,
	taskClass: string | null,
	threshold = DEFAULT_TASK_CLASS_THRESHOLD,
): ArmAgg {
	if (taskClass) {
		const cell = policy.byClass[taskClass]?.[key];
		if (cell && cell.n >= threshold) return cell;
	}
	return policy.global[key] ?? emptyAgg();
}

/** Beta(alpha,beta) for an arm's success, seeded by the substrate benchmark prior. */
function successBeta(agg: ArmAgg, arm: Arm, policy: PolicyArtifact): { alpha: number; beta: number } {
	const prior = policy.substratePrior[arm.substrate];
	let alpha = BASE_ALPHA;
	let beta = BASE_BETA;
	if (prior && prior.n > 0) {
		alpha += SUBSTRATE_PRIOR_STRENGTH * prior.okRate;
		beta += SUBSTRATE_PRIOR_STRENGTH * (1 - prior.okRate);
	}
	alpha += agg.successes;
	beta += agg.n - agg.successes;
	return { alpha, beta };
}

function sampleMetric(w: Welford, rng: Rng): number {
	if (w.n < 2) return w.mean;
	const sd = Math.sqrt(welfordVariance(w) / w.n);
	const draw = sampleNormal(w.mean, sd, rng);
	return draw < 0 ? 0 : draw;
}

export type ArmScore = { arm: Arm; score: number; meanSuccess: number; n: number };

/** Greedy (exploit): score each arm by posterior-mean reward; return the best. */
export function bestArm(
	arms: Arm[],
	policy: PolicyArtifact,
	weights: RewardWeights,
	taskClass: string | null = null,
	threshold = DEFAULT_TASK_CLASS_THRESHOLD,
): ArmScore | null {
	let best: ArmScore | null = null;
	for (const arm of arms) {
		const key = armKey(arm);
		const agg = effectiveAgg(policy, key, taskClass, threshold);
		const { alpha, beta } = successBeta(agg, arm, policy);
		const meanSuccess = alpha / (alpha + beta);
		const score = scalarReward(
			{ successRate: meanSuccess, costMillicents: agg.cost.mean, latencyMs: agg.latency.mean },
			weights,
		);
		if (!best || score > best.score) best = { arm, score, meanSuccess, n: agg.n };
	}
	return best;
}

/** Thompson sample: draw a reward sample per arm and return the argmax. */
export function sampleArm(
	arms: Arm[],
	policy: PolicyArtifact,
	weights: RewardWeights,
	taskClass: string | null = null,
	rng: Rng = Math.random,
	threshold = DEFAULT_TASK_CLASS_THRESHOLD,
): ArmScore | null {
	let best: ArmScore | null = null;
	for (const arm of arms) {
		const key = armKey(arm);
		const agg = effectiveAgg(policy, key, taskClass, threshold);
		const { alpha, beta } = successBeta(agg, arm, policy);
		const successDraw = sampleBeta(alpha, beta, rng);
		const score = scalarReward(
			{
				successRate: successDraw,
				costMillicents: sampleMetric(agg.cost, rng),
				latencyMs: sampleMetric(agg.latency, rng),
			},
			weights,
		);
		if (!best || score > best.score) {
			best = { arm, score, meanSuccess: alpha / (alpha + beta), n: agg.n };
		}
	}
	return best;
}
