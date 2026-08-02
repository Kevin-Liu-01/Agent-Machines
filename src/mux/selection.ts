/**
 * Learned lane selection: which substrate a harness should try FIRST.
 *
 * `Mux.routeFor()` used to walk the configured `primary -> backups` order and
 * nothing else, so a lane that fails half its runs stayed first forever. This
 * module supplies the missing signal, and it reads OUR OWN measurements: the
 * run traces `src/mux/traces.ts` writes for every mux run, summarized per
 * harness x substrate lane by `summarize()`. Nothing here reaches for the web
 * bandit -- that lives across a boundary web/ cannot import (docs/ROADMAP.md
 * section 3c), and its labels come from cron probes rather than from real runs.
 *
 * THE OBJECTIVE, in the roadmap's stated priority (section 1, "Value"):
 * task success first, then total cost to a successful result, then time to
 * first useful output. All three are measured only on COMPLETED runs -- a run
 * that never finished is a failure, counted as one by `isSuccessfulTrace`, and
 * never a data point about how fast or how cheap a lane is.
 *
 * COST IS PER SUCCESSFUL RESULT, and only half measured. The figure is
 * cost.ts `costToSuccessfulResult` reached through `summarize()`, so the failed
 * runs on a lane are charged to the successes it did produce: a lane that is
 * cheaper per hour and fails a third of its runs costs MORE per result than the
 * lane it undercuts (roadmap 4.2). Two kinds of number go into it and they do
 * not deserve equal trust:
 *
 *   metered   -- model spend the harness itself reported for the turn
 *                (`RunTrace.modelCostUsd`). Someone's meter produced it.
 *   estimated -- sandbox compute modeled from the run's wall clock and a
 *                published list rate (`RunTrace.sandboxCostUsd`). A model of a
 *                bill and not a bill: cost.ts prices every lane at one
 *                comparison size, charges an active-cpu lane at full
 *                utilization (its own `upperBound`), and excludes plan fees,
 *                free allowances and egress (its own `note` fields).
 *
 * The difference belongs in the CONFIDENCE, not in the number: an estimated
 * figure is not shifted toward "expensive", it is believed less. Estimated runs
 * are discounted by ESTIMATED_EVIDENCE_WEIGHT and then capped at the prior
 * strength, so a lane priced only by the model travels at most halfway from the
 * neutral prior toward that modeled position however many runs it holds, while a
 * metered lane has no such ceiling. The cap is there because the model's error
 * is systematic and not noise -- averaging a thousand runs priced at the wrong
 * utilization does not make the utilization right -- and `costEvidence` reports
 * which kind was used with the sample count behind each, because a caller
 * comparing two prices has to be able to see that one of them is a model.
 *
 * EVERY RANK EXPLAINS ITSELF. An unexplainable route is a bug here, so
 * `LaneScore.ranking` carries the lane's distance from the leader and the
 * weighted term that decided its position: the term it lost the most on, or for
 * the leader the term it beat the runner-up on. Inside the deadband the honest
 * answer is "configured-order" -- there the evidence decided nothing and the
 * caller's own preference stood.
 *
 * COLD START IS THE HARD PART, and it is where a scorer usually lies. Two runs
 * on a fresh lane, one of which happened to succeed, is not evidence that the
 * lane beats one with 50 runs behind it. So every term is shrunk toward a prior
 * by its own sample count (see `shrink`), which makes the score a posterior
 * mean rather than a raw rate. Consequences, all deliberate:
 *
 *   - A lane with zero traces scores exactly the prior. It is therefore never
 *     starved to zero and stays reachable, which is the only way an unexplored
 *     lane ever earns evidence.
 *   - A single lucky run cannot outrank a long good record. Worked example with
 *     the defaults below: one successful run scores 0.571 even when it is also
 *     the cheapest and fastest lane on offer, while 45 successes in 50 runs
 *     score 0.723 even when it is the most expensive and slowest. The margin is
 *     a property of the prior strength, not of the example.
 *   - Nothing is ever removed. `rank()` returns a permutation of its input, so
 *     a policy that has learned to hate every lane still cannot make create()
 *     impossible. Health takes the same stance for the same reason.
 *
 * DETERMINISTIC. No `Math.random`, no clock inside the scoring, no iteration
 * over object key order. Same traces and same candidates in, same order out;
 * exact ties keep the caller's order, which is the operator's configured
 * preference.
 *
 * NOT A BANDIT. There is no exploration bonus and no randomized arm pull. That
 * is a real limitation, stated rather than hidden: this ranks on evidence and
 * leans on the prior where evidence is thin. A lane that is genuinely bad will
 * be visited again whenever the lanes above it fail over, and that is the only
 * exploration on offer today.
 */

import {
	readTraces,
	routeKey,
	summarize,
	type RouteStats,
	type RunTrace,
} from "./traces.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";

/**
 * Identifies the scoring rule, so an attempt recorded months ago can be read
 * against the rule that produced it. Bump on any change that would move a
 * score: weights, prior, shrinkage, or the set of terms.
 */
export const SELECTION_POLICY_VERSION = "traces-metered-1";

/**
 * Prior for a relative term (cost, time to first output).
 *
 * Unlike success, a relative term has no natural prior: the value of "cheap"
 * depends entirely on which lanes are on offer. 0.5 is the midpoint, so a lane
 * nobody has priced or timed is scored as neither the best nor the worst
 * available -- which is what "unknown" means. It is NOT scored as cheap.
 */
const NEUTRAL_RELATIVE = 0.5;

/**
 * What one ESTIMATED run is worth against one metered run, as evidence about
 * price. Four to one.
 *
 * Not a measured ratio, and there is none to be had: we hold no invoice to
 * compare cost.ts's arithmetic against, so the model's error is undocumented in
 * size and known only in direction and cause (one comparison size for every
 * lane, full utilization on an active-cpu lane, plan fees and egress excluded).
 * A weight is a policy choice, so it is chosen for the behavior it buys and
 * stated here rather than dressed up as a measurement: at 1/4, an estimated
 * lane needs four runs to move its cost term as far as a metered lane moves it
 * with one, which keeps an estimated figure from winning a close comparison
 * against a metered one while leaving it able to win a wide one (see
 * `relativeToBest` -- the discount touches the sample count, never the price).
 *
 * Combined with the cap at `priorStrength` in `costEvidenceOf`, the guarantee
 * is: no volume of estimated runs can push a lane's cost term past the midpoint
 * between the neutral prior and the position the model puts it in.
 */
export const ESTIMATED_EVIDENCE_WEIGHT = 0.25;

/**
 * What kind of number a lane's cost-per-success rests on.
 *
 *   "metered"   -- every priced run behind it reported model spend. The
 *                  DOMINANT component was metered, not the whole figure:
 *                  sandbox compute is still modeled from duration, because no
 *                  lane here is priced by reading a bill.
 *   "mixed"     -- some priced runs reported spend, others were priced from
 *                  duration alone.
 *   "estimated" -- no run reported any spend; the figure is entirely cost.ts
 *                  arithmetic over a published rate.
 *   "none"      -- there is no cost figure at all. See `absentReason`.
 */
export type CostBasis = "metered" | "mixed" | "estimated" | "none";

/**
 * Why a lane has no cost-per-success figure. Named rather than reported as a
 * zero, since each of these means something different to an operator and none
 * of them means "free".
 */
export type CostAbsentReason =
	/** Nothing ran on this lane in the window. */
	| "no_runs"
	/** The vendor publishes no compute rate for it (sprites today, cost.ts). */
	| "unpriced_substrate"
	/** Runs happened and none produced a result, so cost per result is undefined. */
	| "no_successes";

/** The metered/estimated split behind a lane's price, and its weight. */
export type CostEvidence = {
	basis: CostBasis;
	/** Priced runs whose figure carried harness-reported model spend. */
	meteredRuns: number;
	/** Priced runs priced from duration alone. */
	estimatedRuns: number;
	/**
	 * Sample count the cost term was actually shrunk with: metered runs at full
	 * weight plus estimated runs discounted and capped. Policy-derived rather than
	 * measured, and reported anyway, because it is the only thing that explains
	 * why two lanes at the same price hold different cost terms.
	 */
	effectiveSamples: number;
	/**
	 * Priced spend on runs that produced nothing. Present whenever anything on
	 * the lane could be priced -- including when `basis` is "none" because
	 * nothing succeeded, which is exactly the case where an operator most wants
	 * to know what the lane burned.
	 */
	wastedUsd?: number;
	/** Set only when `basis` is "none". */
	absentReason?: CostAbsentReason;
};

/**
 * Which weighted term separated a lane from the one it was compared against.
 * "configured-order" is the honest answer when no term did: inside the
 * deadband, or with no other lane to compare against.
 */
export type DecidingTerm = "success" | "cost" | "firstOutput" | "configured-order";

export type SelectionTuning = {
	/** Success rate assumed for a lane with no traces. */
	priorSuccessRate: number;
	/** Pseudo-runs of prior every term is shrunk toward. */
	priorStrength: number;
	/** Weight on measured task success. */
	successWeight: number;
	/** Weight on total cost to a successful result. */
	costWeight: number;
	/** Weight on time to first useful output. */
	firstOutputWeight: number;
	/** Score grid width; differences finer than this are not evidence. */
	deadband: number;
	/** Evidence window, measured back from now, in milliseconds. */
	windowMs: number;
};

/**
 * Defaults, and why each one:
 *
 * priorSuccessRate: 0.5 -- deliberately uninformative. The roadmap says priors
 *   "come from the benchmark matrix", and we do not have one for this: the only
 *   measured numbers we hold (docs/MUX-RESULTS.md) are create, install and a
 *   sentinel echo on 8 lanes, which is a reachability check and not a
 *   task-success rate on real work. Promoting it to a prior would be inventing
 *   a label. 0.5 places an unexplored lane strictly between a proven-good and a
 *   proven-bad one, which is exactly the honest position.
 *
 * priorStrength: 6 -- derived from the requirement that one lucky run must not
 *   outrank a long good record. At strength K a lane's success term is
 *   (p*K + ok) / (K + runs). A single success gives (3 + 1) / (6 + 1) = 0.571;
 *   45 of 50 gives (3 + 45) / (6 + 50) = 0.857. Weighted as below, the thin
 *   lane cannot close that gap even holding both tiebreakers. K = 2 would leave
 *   the two within 0.02 of each other and the ordering would turn on noise.
 *
 * successWeight / costWeight / firstOutputWeight: 0.7 / 0.2 / 0.1 -- the
 *   roadmap's priority order, expressed as a weighted sum rather than a strict
 *   lexicographic one because these are noisy estimates and a lexicographic
 *   rule would let a 0.001 difference in success decide the route. The exact
 *   dominance this buys, stated so nobody has to guess: since every term is in
 *   0..1, cost and speed together can move a score by at most 0.30, so a lane
 *   ahead by more than 0.30/0.70 = 0.43 on shrunk success wins no matter what.
 *   Below that margin, price and latency genuinely do decide -- which is the
 *   intended trade, not a bug.
 *
 * deadband: 0.02 -- two lanes this close are not distinguishable by this
 *   evidence, so the configured order (an operator's own preference: cost
 *   agreements, region, features) keeps them. Without it a routine reshuffle on
 *   a 0.001 difference would silently override that preference.
 *
 * windowMs: 7 days -- long enough that a lane used a few times a day
 * accumulates the double-digit sample count at which shrinkage starts yielding
 *   to evidence, short enough that a vendor regression fixed last month stops
 *   steering routes. Deliberately far longer than the health window's 5
 *   minutes: health answers "is this lane up right now", selection answers
 *   "which lane pays off", and those are different time constants.
 */
export const DEFAULT_SELECTION_TUNING: SelectionTuning = {
	priorSuccessRate: 0.5,
	priorStrength: 6,
	successWeight: 0.7,
	costWeight: 0.2,
	firstOutputWeight: 0.1,
	deadband: 0.02,
	windowMs: 604_800_000,
};

/** What a lane actually measured. Every field absent means unmeasured. */
export type LaneMeasurement = {
	/** ok / runs as recorded. Absent with no runs: no rate to report. */
	successRate?: number;
	/**
	 * Total cost to a successful result, per success, from cost.ts
	 * `costToSuccessfulResult` via `summarize()` -- failed runs on the lane
	 * included, since a cheap lane that fails a third of the time costs more
	 * per result than the lane it undercuts. Absent when nothing on the lane
	 * could be priced (sprites publishes no compute rate) or nothing succeeded.
	 */
	perSuccessUsd?: number;
	/**
	 * `perSuccessUsd` omits a component nobody could price, so it is a FLOOR
	 * and this lane may look cheaper than it is. Surfaced rather than silently
	 * ranked on, because a floor compared against a complete figure is exactly
	 * how an unpriced lane wins a cost comparison it should not.
	 */
	costIsFloor: boolean;
	/**
	 * Runs the cost figure rests on, counted before the metered/estimated
	 * discount. `costEvidence.effectiveSamples` is what the score used; this is
	 * the raw evidence, so the two together show the discount's size.
	 */
	costSamples: number;
	/** What kind of number the price is, and how much of each kind. */
	costEvidence: CostEvidence;
	/** p50 milliseconds to the first normalized agent event. */
	firstOutputP50Ms?: number;
	firstOutputSamples: number;
};

/** Where a lane landed and what put it there. */
export type RankingExplanation = {
	/** Position in the returned order; the chosen lane is 0. */
	rank: number;
	/**
	 * Deadbands between this lane's score and the leader's. 0 means the
	 * evidence could not separate them and the caller's order decided.
	 */
	bucket: number;
	/** Score gap to the leader; exactly 0 for the leader itself. */
	scoreGap: number;
	/**
	 * For a demoted lane, the weighted term it lost the most to the leader on.
	 * For the leader, the one it beat the runner-up by the most on.
	 */
	decidedBy: DecidingTerm;
	/** The gap on `decidedBy`; 0 when nothing but the configured order decided. */
	decidedByGap: number;
	/** Each term times its weight, so a caller can show the whole arithmetic. */
	weighted: { success: number; cost: number; firstOutput: number };
};

export type LaneScore = {
	harness: HarnessKind;
	substrate: SubstrateKind;
	/**
	 * 0..1, higher is better, and comparable only WITHIN the ranking it came
	 * from. The cost and first-output terms are relative to the best lane on
	 * offer for that one request (see `relativeToBest`), so the same lane scores
	 * differently against a different candidate set. Two scores recorded by two
	 * requests are therefore not a like-for-like comparison; `terms.success` and
	 * `measured` are the absolute figures, and those do compare.
	 */
	score: number;
	/** Completed runs for this lane in the window. 0 is normal, not a defect. */
	samples: number;
	ok: number;
	/** The shrunk terms behind `score`, so a route can show its work. */
	terms: { success: number; cost: number; firstOutput: number };
	measured: LaneMeasurement;
	/** Why this lane sits where it does, relative to the lanes it was ranked with. */
	ranking: RankingExplanation;
	/** Rule that produced `score`; see SELECTION_POLICY_VERSION. */
	policy: string;
};

function requireRate(name: string, value: number): number {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new MuxError(
			"fatal",
			`selection ${name} must be a number in 0..1 (got ${String(value)})`,
		);
	}
	return value;
}

/**
 * Validate tuning and fill the gaps from the defaults.
 *
 * Fails closed on every dimension, because each bad value silently produces a
 * plausible-looking but wrong ranking: weights that do not sum to 1 change the
 * scale of the score without changing its shape, and a prior strength below 1
 * hands the route to whichever lane got lucky first.
 */
export function resolveSelectionTuning(
	overrides: Partial<SelectionTuning> = {},
): SelectionTuning {
	const tuning: SelectionTuning = {
		priorSuccessRate:
			overrides.priorSuccessRate ?? DEFAULT_SELECTION_TUNING.priorSuccessRate,
		priorStrength: overrides.priorStrength ?? DEFAULT_SELECTION_TUNING.priorStrength,
		successWeight: overrides.successWeight ?? DEFAULT_SELECTION_TUNING.successWeight,
		costWeight: overrides.costWeight ?? DEFAULT_SELECTION_TUNING.costWeight,
		firstOutputWeight:
			overrides.firstOutputWeight ?? DEFAULT_SELECTION_TUNING.firstOutputWeight,
		deadband: overrides.deadband ?? DEFAULT_SELECTION_TUNING.deadband,
		windowMs: overrides.windowMs ?? DEFAULT_SELECTION_TUNING.windowMs,
	};
	requireRate("priorSuccessRate", tuning.priorSuccessRate);
	requireRate("successWeight", tuning.successWeight);
	requireRate("costWeight", tuning.costWeight);
	requireRate("firstOutputWeight", tuning.firstOutputWeight);
	// Below 1 pseudo-run the prior stops protecting the cold-start case at all:
	// a lane with one sample would be scored on that sample alone.
	if (!Number.isFinite(tuning.priorStrength) || tuning.priorStrength < 1) {
		throw new MuxError(
			"fatal",
			`selection priorStrength must be a number >= 1 (got ${String(tuning.priorStrength)}); a weaker prior lets a single lucky run decide the route`,
		);
	}
	if (
		!Number.isFinite(tuning.deadband) ||
		tuning.deadband <= 0 ||
		tuning.deadband > 1
	) {
		throw new MuxError(
			"fatal",
			`selection deadband must be a number in (0, 1] (got ${String(tuning.deadband)})`,
		);
	}
	if (!Number.isFinite(tuning.windowMs) || tuning.windowMs <= 0) {
		throw new MuxError(
			"fatal",
			`selection windowMs must be a positive number (got ${String(tuning.windowMs)})`,
		);
	}
	const sum = tuning.successWeight + tuning.costWeight + tuning.firstOutputWeight;
	if (Math.abs(sum - 1) > 1e-9) {
		throw new MuxError(
			"fatal",
			`selection weights must sum to 1 (got ${sum}); an unnormalized score cannot be compared against a recorded one`,
		);
	}
	return tuning;
}

/**
 * Shrink one measurement toward the prior in proportion to the evidence.
 *
 * `prior + (n / (n + K)) * (raw - prior)`: with no samples the result is the
 * prior exactly, and it approaches the measurement as samples accumulate. For
 * the success term this is precisely the Beta-Binomial posterior mean with a
 * prior of K pseudo-runs at rate `prior` -- the identity is
 * (pK + ok) / (K + n) = p + (n / (n + K)) * (ok/n - p) -- so one rule covers
 * all three terms and there is no second formula to keep consistent.
 */
function shrink(
	raw: number | undefined,
	samples: number,
	prior: number,
	priorStrength: number,
): number {
	if (raw === undefined || samples <= 0) return prior;
	const weight = samples / (samples + priorStrength);
	return prior + weight * (raw - prior);
}

/**
 * Score a lower-is-better measurement against the best lane on offer:
 * `best / value`, so the best lane scores 1 and a lane costing twice as much
 * scores 0.5.
 *
 * Relative rather than absolute, so no constant has to be invented for
 * "expensive" or "slow" -- there is no defensible dollar figure for either, and
 * inventing one would be a guess routed on. The comparison is always against
 * the candidates actually available for this request.
 */
function relativeToBest(
	value: number | undefined,
	best: number | undefined,
): number | undefined {
	if (value === undefined || best === undefined) return undefined;
	// A zero measurement cannot be beaten, and it makes every positive lane
	// relatively worst. Guarded rather than divided, so neither case is a NaN.
	if (value <= 0) return 1;
	if (best <= 0) return 0;
	return best / value;
}

function bestOf(values: readonly (number | undefined)[]): number | undefined {
	let best: number | undefined;
	for (const value of values) {
		if (value === undefined) continue;
		if (best === undefined || value < best) best = value;
	}
	return best;
}

type LaneEvidence = {
	harness: HarnessKind;
	substrate: SubstrateKind;
	runs: number;
	ok: number;
	measurement: LaneMeasurement;
};

/**
 * Split a lane's price into the evidence it rests on.
 *
 * `summarize()` hands over one blended figure per lane, so the split is read off
 * the counts beside it: `cost.pricedRuns` is how many runs reached the figure at
 * all, and `modelCostKnownRuns` is how many of the lane's runs reported metered
 * spend. The latter is clamped to the former because a run on an unpriced
 * substrate is dropped by `costToSuccessfulResult` whatever it reported, so its
 * metered half never reaches the number being explained.
 */
function costEvidenceOf(stats: RouteStats, tuning: SelectionTuning): CostEvidence {
	const pricedRuns = stats.cost.pricedRuns;
	const meteredRuns = Math.min(stats.modelCostKnownRuns, pricedRuns);
	const estimatedRuns = Math.max(pricedRuns - meteredRuns, 0);
	const evidence: CostEvidence = {
		basis: "none",
		meteredRuns,
		estimatedRuns,
		effectiveSamples: 0,
	};
	if (stats.cost.wastedUsd !== undefined) evidence.wastedUsd = stats.cost.wastedUsd;
	if (stats.cost.perSuccessUsd === undefined) {
		// Three different gaps, and a caller acts differently on each: nothing
		// ran, the vendor publishes no rate, or money was spent and no result
		// came out of it. Ordered most-fundamental first, since the later
		// conditions are also true of the earlier ones.
		evidence.absentReason =
			stats.runs === 0
				? "no_runs"
				: pricedRuns === 0
					? "unpriced_substrate"
					: "no_successes";
		return evidence;
	}
	evidence.basis =
		meteredRuns === 0 ? "estimated" : estimatedRuns === 0 ? "metered" : "mixed";
	// Discounted, then capped at the prior strength so the weight a purely
	// estimated lane can reach is at most priorStrength / (2 * priorStrength).
	const estimated = Math.min(
		tuning.priorStrength,
		ESTIMATED_EVIDENCE_WEIGHT * estimatedRuns,
	);
	// Bounded by the successes too: perSuccessUsd divides by them, so a lane with
	// 40 priced runs and 2 successes knows its cost per result only 2 runs well.
	evidence.effectiveSamples = Math.min(stats.ok, meteredRuns + estimated);
	return evidence;
}

function measureLane(
	harness: HarnessKind,
	substrate: SubstrateKind,
	stats: RouteStats | undefined,
	tuning: SelectionTuning,
): LaneEvidence {
	if (!stats) {
		return {
			harness,
			substrate,
			runs: 0,
			ok: 0,
			measurement: {
				costIsFloor: false,
				costSamples: 0,
				costEvidence: {
					basis: "none",
					meteredRuns: 0,
					estimatedRuns: 0,
					effectiveSamples: 0,
					absentReason: "no_runs",
				},
				firstOutputSamples: 0,
			},
		};
	}
	const measurement: LaneMeasurement = {
		costIsFloor: false,
		costSamples: 0,
		costEvidence: costEvidenceOf(stats, tuning),
		firstOutputSamples: stats.firstOutputKnownRuns,
	};
	// summarize() reports successRate 0 for an empty group; that is the empty
	// set, not a measured failure rate, so it stays absent here.
	if (stats.runs > 0) measurement.successRate = stats.successRate;
	if (stats.cost.perSuccessUsd !== undefined) {
		measurement.perSuccessUsd = stats.cost.perSuccessUsd;
		measurement.costIsFloor = !stats.cost.complete;
		// Confidence in a cost-per-success is bounded by both halves of the
		// division: how many runs could be priced, and how many succeeded.
		measurement.costSamples = Math.min(stats.ok, stats.cost.pricedRuns);
	}
	if (stats.firstOutputP50Ms !== undefined) {
		measurement.firstOutputP50Ms = stats.firstOutputP50Ms;
	}
	return { harness, substrate, runs: stats.runs, ok: stats.ok, measurement };
}

/** A scored lane, before it knows what it was ranked against. */
type ScoredLane = Omit<LaneScore, "ranking">;

function scoreLane(
	evidence: LaneEvidence,
	bestCost: number | undefined,
	bestFirstOutput: number | undefined,
	tuning: SelectionTuning,
): ScoredLane {
	const measured = evidence.measurement;
	const success = shrink(
		measured.successRate,
		evidence.runs,
		tuning.priorSuccessRate,
		tuning.priorStrength,
	);
	const cost = shrink(
		relativeToBest(measured.perSuccessUsd, bestCost),
		// The discounted count, not the raw one: a price nobody metered is
		// believed less, and this is the single place that happens.
		measured.costEvidence.effectiveSamples,
		NEUTRAL_RELATIVE,
		tuning.priorStrength,
	);
	const firstOutput = shrink(
		relativeToBest(measured.firstOutputP50Ms, bestFirstOutput),
		measured.firstOutputSamples,
		NEUTRAL_RELATIVE,
		tuning.priorStrength,
	);
	return {
		harness: evidence.harness,
		substrate: evidence.substrate,
		score:
			tuning.successWeight * success +
			tuning.costWeight * cost +
			tuning.firstOutputWeight * firstOutput,
		samples: evidence.runs,
		ok: evidence.ok,
		terms: { success, cost, firstOutput },
		measured,
		policy: SELECTION_POLICY_VERSION,
	};
}

type WeightedTerms = { success: number; cost: number; firstOutput: number };

/**
 * Each term times its weight. Comparing lanes term by term has to happen on
 * these and not on the raw terms: a 0.3 lead on first output is worth 0.03 of
 * score and a 0.3 lead on success is worth 0.21, so the raw numbers would name
 * the wrong winner as the reason.
 */
function weigh(terms: WeightedTerms, tuning: SelectionTuning): WeightedTerms {
	return {
		success: tuning.successWeight * terms.success,
		cost: tuning.costWeight * terms.cost,
		firstOutput: tuning.firstOutputWeight * terms.firstOutput,
	};
}

/** The objective's priority order, which also breaks a tie between equal gaps. */
const TERM_ORDER = ["success", "cost", "firstOutput"] as const;

/**
 * The term `ahead` gained the most on `behind`.
 *
 * A strictly-greater test from a starting gap of 0 means an exact tie, or a lane
 * that is not actually ahead on any single term, reports "configured-order"
 * rather than picking a term at random.
 */
function decidingTerm(
	ahead: WeightedTerms,
	behind: WeightedTerms | undefined,
): { term: DecidingTerm; gap: number } {
	if (behind === undefined) return { term: "configured-order", gap: 0 };
	let term: DecidingTerm = "configured-order";
	let gap = 0;
	for (const candidate of TERM_ORDER) {
		const difference = ahead[candidate] - behind[candidate];
		if (difference > gap) {
			term = candidate;
			gap = difference;
		}
	}
	return { term, gap };
}

export type RankLanesInput = {
	harness: HarnessKind;
	/** Candidates in the caller's preferred order; ties keep that order. */
	candidates: readonly SubstrateKind[];
	/** The evidence window. Runs for other harnesses are ignored. */
	traces: readonly RunTrace[];
	tuning?: Partial<SelectionTuning>;
};

/**
 * Rank the candidate lanes best-first. The result is always a permutation of
 * `candidates`: an unexplored or badly-performing lane is demoted, never
 * dropped, so this can only change what is tried FIRST.
 */
export function rankLanes(input: RankLanesInput): LaneScore[] {
	const tuning = resolveSelectionTuning(input.tuning);
	// A lane is harness x substrate, so another harness's runs say nothing
	// about this one: claude-code succeeding on e2b is no evidence that hermes
	// will (docs/MUX-RESULTS.md finding 10 is the counterexample).
	const mine = input.traces.filter((trace) => trace.harness === input.harness);
	const summary = summarize([...mine]);
	const evidence = input.candidates.map((substrate) =>
		measureLane(
			input.harness,
			substrate,
			summary.byRoute[routeKey(input.harness, substrate)],
			tuning,
		),
	);
	// A lane with no price is not in this comparison at all: `bestOf` skips
	// undefined, so an unpriced lane can neither become the benchmark nor be
	// scored against one, and it keeps the neutral prior on cost instead.
	const bestCost = bestOf(evidence.map((lane) => lane.measurement.perSuccessUsd));
	const bestFirstOutput = bestOf(
		evidence.map((lane) => lane.measurement.firstOutputP50Ms),
	);
	const scores = evidence.map((lane) =>
		scoreLane(lane, bestCost, bestFirstOutput, tuning),
	);
	const leadingScore = Math.max(...scores.map((score) => score.score));
	const ordered = scores
		.map((score, index) => ({
			score,
			index,
			// Distance from the leading score, in whole deadbands.
			//
			// Bucketed rather than compared with a tolerance because "within
			// deadband" is not transitive -- a~b and b~c does not give a~c -- and
			// an intransitive comparator makes Array#sort's output depend on its
			// internal pivot choices, which would forfeit determinism. Measured
			// from the leader rather than against an absolute grid so the one
			// property that decides a route is a guarantee and not a coincidence:
			// every lane within one deadband of the best lands in bucket 0 with
			// it, so the caller's configured order picks between them.
			bucket: Math.floor((leadingScore - score.score) / tuning.deadband),
		}))
		.sort((left, right) => left.bucket - right.bucket || left.index - right.index);
	// An empty candidate list is a question, not an error -- a caller whose
	// constraints excluded everything still asks for an order -- and there is no
	// leader to explain anything against.
	if (ordered.length === 0) return [];

	const leaderWeighted = weigh(ordered[0].score.terms, tuning);
	const runnerUp = ordered[1];
	return ordered.map((entry, rank) => {
		const weighted = weigh(entry.score.terms, tuning);
		let decided: { term: DecidingTerm; gap: number };
		if (rank === 0) {
			// The leader's own margin is over the lane that would otherwise have
			// been tried first -- and only when the deadband did not already put
			// that lane level with it.
			decided = decidingTerm(
				weighted,
				runnerUp !== undefined && runnerUp.bucket > 0
					? weigh(runnerUp.score.terms, tuning)
					: undefined,
			);
		} else if (entry.bucket > 0) {
			decided = decidingTerm(leaderWeighted, weighted);
		} else {
			// Level with the leader on this evidence, so the caller's order is
			// what put it here. Claiming a term decided it would be a fiction.
			decided = { term: "configured-order", gap: 0 };
		}
		return {
			...entry.score,
			ranking: {
				rank,
				bucket: entry.bucket,
				scoreGap: leadingScore - entry.score.score,
				decidedBy: decided.term,
				decidedByGap: decided.gap,
				weighted,
			},
		};
	});
}

/**
 * Where evidence comes from. An array is used verbatim -- tests, and any caller
 * that already holds the window in memory. A function is called on every
 * `rank()`, so a live store is always read fresh rather than cached behind a
 * timeout that could hide the run that just landed.
 */
export type SelectionTraceSource =
	| readonly RunTrace[]
	| (() => readonly RunTrace[]);

export type SelectionPolicyOptions = {
	tuning?: Partial<SelectionTuning>;
	traces?: SelectionTraceSource;
	/** Injected clock; the evidence window is measured back from it. */
	now?: () => number;
};

/**
 * A configured scorer over the local trace store.
 *
 * Constructed with no arguments it reads `~/.agent-machines/traces` (or
 * `AGENT_MACHINES_MUX_TRACES`) for the tuned window on every `rank()`. Inject
 * `traces` to isolate it from the store entirely, which tests need: a scorer
 * that reads the developer's real history would make assertions depend on what
 * that developer happened to run yesterday.
 */
export class SelectionPolicy {
	readonly version = SELECTION_POLICY_VERSION;
	readonly tuning: SelectionTuning;
	private readonly source: () => readonly RunTrace[];

	constructor(options: SelectionPolicyOptions = {}) {
		this.tuning = resolveSelectionTuning(options.tuning);
		const source = options.traces;
		if (source === undefined) {
			const now = options.now ?? (() => Date.now());
			const windowMs = this.tuning.windowMs;
			this.source = () => readTraces({ since: now() - windowMs });
		} else if (typeof source === "function") {
			this.source = source;
		} else {
			this.source = () => source;
		}
	}

	/** Score every candidate, best first. Always a permutation of the input. */
	rank(harness: HarnessKind, candidates: readonly SubstrateKind[]): LaneScore[] {
		return rankLanes({
			harness,
			candidates,
			traces: this.source(),
			tuning: this.tuning,
		});
	}

	/** `rank()` with the scores dropped, mirroring `SubstrateHealth.order`. */
	order(harness: HarnessKind, candidates: readonly SubstrateKind[]): SubstrateKind[] {
		return this.rank(harness, candidates).map((score) => score.substrate);
	}
}

/**
 * Three significant figures. Enough to tell two lane prices apart, and short
 * enough that a route report stays one line per lane; the full value is on the
 * score for anyone who needs it.
 */
function usd(value: number): string {
	return value.toPrecision(3);
}

function explainCost(measured: LaneMeasurement): string {
	const evidence = measured.costEvidence;
	if (measured.perSuccessUsd === undefined) {
		const why = evidence.absentReason === undefined ? "" : ` (${evidence.absentReason})`;
		const wasted =
			evidence.wastedUsd === undefined || evidence.wastedUsd === 0
				? ""
				: `, $${usd(evidence.wastedUsd)} spent on runs that produced nothing`;
		return `cost unknown${why}${wasted}`;
	}
	return [
		`cost $${usd(measured.perSuccessUsd)} per success,`,
		`basis ${evidence.basis}`,
		`(${evidence.meteredRuns} metered, ${evidence.estimatedRuns} estimated runs)`,
		measured.costIsFloor ? "-- a floor, some component was unpriced" : "",
	]
		.filter((part) => part.length > 0)
		.join(" ");
}

function explainDecision(ranking: RankingExplanation): string {
	if (ranking.decidedBy === "configured-order") {
		return "no term separated it, so the configured order decided";
	}
	// "of score" because the gap is weighted score and not dollars, and it lands
	// right after a dollar figure where it would otherwise read as one.
	const gap = ranking.decidedByGap.toPrecision(2);
	return ranking.rank === 0
		? `won on ${ranking.decidedBy} (+${gap} of score)`
		: `lost on ${ranking.decidedBy} (-${gap} of score)`;
}

/**
 * One line saying why a lane sits where it does.
 *
 * Lives beside the scorer rather than in each surface so the CLI, the dashboard
 * and a trace reader quote the same numbers in the same words. Three surfaces
 * inventing three phrasings for one decision is how "why did it pick that?"
 * stops being answerable, and an unexplainable route is a bug here.
 */
export function explainLane(score: LaneScore): string {
	return [
		`${score.harness}@${score.substrate}`,
		`score ${score.score.toFixed(3)}`,
		`${score.ok}/${score.samples} runs ok`,
		explainCost(score.measured),
		explainDecision(score.ranking),
	].join(", ");
}
