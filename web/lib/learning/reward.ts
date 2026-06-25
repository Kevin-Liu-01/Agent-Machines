/**
 * Scalar reward for the routing bandit: success-first, with light cost and
 * latency penalties (decision: weighted scalar, success dominates, per-deploy
 * override). Cost/latency are min-max normalized using ranges carried in the
 * policy artifact so the penalties stay in [0,1] regardless of magnitude.
 */

import type { RewardWeights } from "@/lib/learning/types";

/** Default weights: success dominates; cost penalized lightly, latency less. */
export const DEFAULT_WEIGHTS: RewardWeights = {
	lambdaCost: 0.2,
	muLatency: 0.1,
	costRange: { min: 0, max: 1 },
	latRange: { min: 0, max: 1 },
};

/** Clamp x into [0,1] across an inclusive range; 0 for a degenerate range. */
export function normalize(x: number, range: { min: number; max: number }): number {
	const span = range.max - range.min;
	if (!Number.isFinite(span) || span <= 0) return 0;
	const t = (x - range.min) / span;
	if (t < 0) return 0;
	if (t > 1) return 1;
	return t;
}

export type RewardInput = {
	/** Success probability in [0,1]. */
	successRate: number;
	costMillicents: number;
	latencyMs: number;
};

/** Scalar reward = success - lambda*costNorm - mu*latNorm. Higher is better. */
export function scalarReward(input: RewardInput, weights: RewardWeights): number {
	const costNorm = normalize(input.costMillicents, weights.costRange);
	const latNorm = normalize(input.latencyMs, weights.latRange);
	return input.successRate - weights.lambdaCost * costNorm - weights.muLatency * latNorm;
}
