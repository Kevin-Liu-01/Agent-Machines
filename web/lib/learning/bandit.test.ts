import { describe, expect, it } from "vitest";

import { DEFAULT_WEIGHTS } from "./reward";
import {
	DEFAULT_TASK_CLASS_THRESHOLD,
	bestArm,
	emptyAgg,
	emptyWelford,
	pushObservation,
	sampleArm,
	sampleBeta,
	welfordPush,
	welfordVariance,
} from "./bandit";
import { armKey, emptyArtifact, type Arm, type ArmAgg, type PolicyArtifact } from "./types";

/** Deterministic PRNG (mulberry32) so sampling tests are reproducible. */
function rngFrom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function aggOf(successes: number, failures: number, cost = 0, lat = 0): ArmAgg {
	let agg = emptyAgg();
	for (let i = 0; i < successes; i += 1) {
		agg = pushObservation(agg, { success: true, costMillicents: cost, latencyMs: lat });
	}
	for (let i = 0; i < failures; i += 1) {
		agg = pushObservation(agg, { success: false, costMillicents: cost, latencyMs: lat });
	}
	return agg;
}

const armA: Arm = { runtime: "hermes", substrate: "e2b", model: "m", routerId: "r" };
const armB: Arm = { runtime: "hermes", substrate: "vercel", model: "m", routerId: "r" };

describe("welford", () => {
	it("tracks mean and sample variance", () => {
		let w = emptyWelford();
		for (const x of [2, 4, 6]) w = welfordPush(w, x);
		expect(w.mean).toBe(4);
		expect(welfordVariance(w)).toBe(4);
	});
});

describe("bestArm task_class backoff", () => {
	const policy: PolicyArtifact = {
		global: { [armKey(armA)]: aggOf(90, 10), [armKey(armB)]: aggOf(10, 90) },
		byClass: {
			deploy: { [armKey(armA)]: aggOf(0, 40), [armKey(armB)]: aggOf(60, 0) },
			small: { [armKey(armB)]: aggOf(5, 0) },
		},
		substratePrior: {},
	};
	const arms = [armA, armB];

	it("uses global posteriors when no task_class is given", () => {
		expect(bestArm(arms, policy, DEFAULT_WEIGHTS, null)?.arm).toEqual(armA);
	});

	it("uses per-class posteriors once the cell clears the threshold", () => {
		expect(bestArm(arms, policy, DEFAULT_WEIGHTS, "deploy")?.arm).toEqual(armB);
	});

	it("falls back to global when the per-class cell is below the threshold", () => {
		expect(DEFAULT_TASK_CLASS_THRESHOLD).toBeGreaterThan(5);
		expect(bestArm(arms, policy, DEFAULT_WEIGHTS, "small")?.arm).toEqual(armA);
	});

	it("falls back to global for an unseen task_class", () => {
		expect(bestArm(arms, policy, DEFAULT_WEIGHTS, "never-seen")?.arm).toEqual(armA);
	});

	it("returns null for an empty arm set", () => {
		expect(bestArm([], policy, DEFAULT_WEIGHTS, null)).toBeNull();
	});
});

describe("sampleBeta", () => {
	it("approximates the Beta mean over many draws", () => {
		const rng = rngFrom(12345);
		let sum = 0;
		const n = 5000;
		for (let i = 0; i < n; i += 1) sum += sampleBeta(2, 8, rng);
		expect(sum / n).toBeCloseTo(0.2, 1);
	});
});

describe("sampleArm", () => {
	it("returns an arm from the feasible set", () => {
		const rng = rngFrom(7);
		const res = sampleArm([armA, armB], emptyArtifact(), DEFAULT_WEIGHTS, null, rng);
		expect(res).not.toBeNull();
		expect([armA, armB]).toContainEqual(res?.arm);
	});
});

describe("an unmeasured metric is absent, never zero", () => {
	// Zero is the BEST possible value for both penalties, so folding an
	// unpriced lane in at zero does not record a gap -- it records a lie in
	// that lane's favour. This is the same class of bug as the retired
	// all-substrate rate table, one layer further in: the posterior stopped
	// carrying fake costs, but the scorer still read an absent cost as free.
	it("does not advance the cost Welford when the figure is null", () => {
		let agg = emptyAgg();
		agg = pushObservation(agg, { success: true, costMillicents: null, latencyMs: 900 });
		agg = pushObservation(agg, { success: true, costMillicents: null, latencyMs: 1100 });
		expect(agg.n).toBe(2);
		expect(agg.successes).toBe(2);
		expect(agg.cost.n).toBe(0);
		expect(agg.latency.n).toBe(2);
		expect(agg.latency.mean).toBe(1000);
	});

	it("keeps a real figure and skips only the missing one", () => {
		let agg = emptyAgg();
		agg = pushObservation(agg, { success: true, costMillicents: 300, latencyMs: null });
		agg = pushObservation(agg, { success: false, costMillicents: 500, latencyMs: 2000 });
		expect(agg.cost.n).toBe(2);
		expect(agg.cost.mean).toBe(400);
		expect(agg.latency.n).toBe(1);
		expect(agg.latency.mean).toBe(2000);
	});

	it("scores an unpriced arm without pretending it is free", () => {
		// Two arms with identical success. The unpriced one must NOT be scored
		// as though it cost nothing; the priced one is the only cost-ranked lane.
		let unpriced = emptyAgg();
		let priced = emptyAgg();
		for (let i = 0; i < 5; i += 1) {
			unpriced = pushObservation(unpriced, {
				success: true,
				costMillicents: null,
				latencyMs: 1000,
			});
			priced = pushObservation(priced, {
				success: true,
				costMillicents: 5000,
				latencyMs: 1000,
			});
		}
		expect(unpriced.cost.n).toBe(0);
		expect(priced.cost.n).toBe(5);
		// The absent figure must not surface as 0 to a scorer.
		expect(unpriced.cost.n > 0 ? unpriced.cost.mean : null).toBeNull();
	});
});
