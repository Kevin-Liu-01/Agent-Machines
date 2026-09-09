import { describe, expect, it } from "vitest";
import { buildUsageResourcesFromDailyRows, normalizeUsagePayload } from "./usage-metrics";

describe("usage evidence", () => {
	it("invariant_absent_cost_evidence_is_unknown_not_free", () => {
		expect(normalizeUsagePayload({ ok: true }, 7)).toMatchObject({
			totalCostMillicents: null, totalCostFormatted: "Unknown", costStatus: "unknown",
		});
	});
	it("invariant_legacy_cost_without_provenance_is_not_a_verified_estimate", () => {
		expect(normalizeUsagePayload({ totalCostMillicents: 0, totalCostFormatted: "$0.00" }, 7)?.totalCostFormatted).toBe("Unknown");
	});
	it("invariant_database_numeric_strings_are_summed_numerically", () => {
		const resources = buildUsageResourcesFromDailyRows([
			{ bucket_date: "2026-09-09", cpu_vcpu_seconds: "10.5", memory_gib_seconds: "2", storage_gib_hours: "1.25" },
			{ bucket_date: "2026-09-09", cpu_vcpu_seconds: "20.5", memory_gib_seconds: "3", storage_gib_hours: "2.5" },
		]);
		expect(resources.cpu.total).toBe(31);
		expect(resources.memory.total).toBe(5);
		expect(resources.storage.total).toBe(3.75);
	});
	it("invariant_known_subtotals_do_not_become_fleet_totals", () => {
		const usage = normalizeUsagePayload({ costStatus: "partial", totalCostMillicents: null, knownCostMillicents: 276, costCoverage: { sampleCount: 1000, truncated: true } }, 7);
		expect(usage).toMatchObject({ totalCostFormatted: "Unknown", knownCostFormatted: "<$0.01", costStatus: "partial", costCoverage: { truncated: true, sampleCount: 1000 } });
	});
	it("invariant_estimated_small_nonzero_values_remain_visible", () => {
		expect(normalizeUsagePayload({ costStatus: "estimated", totalCostMillicents: 276 }, 7)?.totalCostFormatted).toBe("<$0.01");
	});
});
