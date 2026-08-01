/**
 * Scalar reward for the routing bandit: success-first, with light cost and
 * latency penalties (decision: weighted scalar, success dominates, per-deploy
 * override). Cost/latency are min-max normalized using ranges carried in the
 * policy artifact so the penalties stay in [0,1] regardless of magnitude.
 *
 * A MISSING PENALTY INPUT IS NULL, NOT ZERO (roadmap 4.1). Zero is the best
 * possible value for both terms, so filling an unknown cost with 0 does not
 * merely lose information -- it ranks the lane we know least about as the
 * cheapest one available. A lane with no published rate (`prices.ts` refuses to
 * quote it) passes `costMillicents: null` and is scored on success and latency
 * alone: still routable, simply not cost-ranked. `explainReward` reports which
 * terms actually moved the score so a caller can say so out loud; the reason a
 * lane is unpriced lives with the price table, which is the thing that knows it.
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
	/** Cost in millicents, or null when this lane has no usable price. */
	costMillicents: number | null;
	/** Wall clock in ms, or null when no run on this lane reported one. */
	latencyMs: number | null;
};

/**
 * The score with its terms broken out, so a caller can report that a lane won
 * without being cost-ranked instead of implying its price was competitive.
 */
export type RewardBreakdown = {
	reward: number;
	successRate: number;
	/** Already multiplied by lambdaCost. 0 when the lane is not cost-ranked. */
	costPenalty: number;
	/** Already multiplied by muLatency. 0 when no latency was observed. */
	latencyPenalty: number;
	/** False when cost did not enter the score at all. */
	costRanked: boolean;
	/** False when latency did not enter the score at all. */
	latencyRanked: boolean;
};

export function explainReward(input: RewardInput, weights: RewardWeights): RewardBreakdown {
	const costRanked = input.costMillicents !== null;
	const latencyRanked = input.latencyMs !== null;
	const costPenalty = costRanked
		? weights.lambdaCost * normalize(input.costMillicents as number, weights.costRange)
		: 0;
	const latencyPenalty = latencyRanked
		? weights.muLatency * normalize(input.latencyMs as number, weights.latRange)
		: 0;
	return {
		reward: input.successRate - costPenalty - latencyPenalty,
		successRate: input.successRate,
		costPenalty,
		latencyPenalty,
		costRanked,
		latencyRanked,
	};
}

/** Scalar reward = success - lambda*costNorm - mu*latNorm. Higher is better. */
export function scalarReward(input: RewardInput, weights: RewardWeights): number {
	return explainReward(input, weights).reward;
}
