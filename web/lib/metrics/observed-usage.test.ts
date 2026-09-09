import { describe, expect, it } from "vitest";
import { observedComputeUsage, type UsageObservation } from "./observed-usage";

const providers = new Map([["m", "e2b"]]);
const point = (seconds: number, extra: Partial<UsageObservation> = {}): UsageObservation => ({
	machine_id: "m", recorded_at: new Date(Date.parse("2026-09-09T00:00:00Z") + seconds * 1000).toISOString(),
	phase: "ready", vcpu: 2, spec_memory_mib: 4096, ...extra,
});

describe("timestamped usage evidence", () => {
	it("invariant_duplicate_and_faster_polls_cannot_manufacture_elapsed_time", () => {
		const usage = observedComputeUsage([point(60), point(15), point(0), point(15), point(30)], providers);
		expect(usage.totalCostMillicents).toBeCloseTo(276, 8);
		expect(usage.costCoverage.observedSeconds).toBe(60);
	});
	it("invariant_empty_or_single_samples_are_unknown_not_zero_cost", () => {
		for (const samples of [[], [point(0)]]) {
			expect(observedComputeUsage(samples, providers)).toMatchObject({ costStatus: "unknown", totalCostMillicents: null });
		}
	});
	it("invariant_long_gaps_and_sleep_transitions_are_not_extrapolated", () => {
		const usage = observedComputeUsage([point(0), point(3600), point(3630, { phase: "sleeping" }), point(3660)], providers);
		expect(usage.costCoverage.observedSeconds).toBe(0);
		expect(usage.totalCostMillicents).toBeNull();
	});
	it("invariant_resize_or_missing_allocation_does_not_backdate_a_new_shape", () => {
		for (const extra of [{ vcpu: 4 }, { vcpu: null }, { spec_memory_mib: 0 }]) {
			expect(observedComputeUsage([point(0), point(60, extra)], providers).totalCostMillicents).toBeNull();
		}
	});
	it("invariant_unpriced_machine_and_truncated_history_keep_the_fleet_total_unknown", () => {
		const partial = observedComputeUsage([point(0), point(60), point(0, { machine_id: "other" }), point(60, { machine_id: "other" })], providers);
		expect(partial).toMatchObject({ costStatus: "partial", totalCostMillicents: null, knownCostMillicents: 276 });
		expect(observedComputeUsage([point(0), point(60)], providers, true)).toMatchObject({ costStatus: "partial", totalCostMillicents: null });
	});
});
