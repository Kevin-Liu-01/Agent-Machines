import { describe, expect, it } from "vitest";
import { buildUsageResourcesFromDailyRows, cpuChartBuckets, normalizeMachineUsagePayload, normalizeUsagePayload } from "./usage-metrics";

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
	it("invariant_no_rows_and_first_sample_have_no_measured_interval_not_zero_allocation", () => {
		for (const rows of [[], [{ bucket_date: "2026-09-09", awake_seconds: 0, cpu_vcpu_seconds: 0, memory_gib_seconds: 0, storage_gib_hours: 0 }]]) {
			const resources = buildUsageResourcesFromDailyRows(rows);
			for (const series of Object.values(resources)) expect(series).toEqual({ total: null, buckets: [], evidence: "no_intervals" });
			expect(cpuChartBuckets(resources)).toEqual([]);
		}
	});
	it("invariant_observed_time_does_not_turn_unknown_disk_into_zero", () => {
		const resources = buildUsageResourcesFromDailyRows([{ bucket_date: "2026-09-09", awake_seconds: 30, cpu_vcpu_seconds: 60, memory_gib_seconds: 15, storage_gib_hours: 0 }]);
		expect(resources.cpu).toMatchObject({ total: 60, evidence: "sampled" });
		expect(resources.memory).toMatchObject({ total: 15, evidence: "sampled" });
		expect(resources.storage).toEqual({ total: null, buckets: [], evidence: "unknown" });
	});
	it("invariant_missing_axes_make_a_known_subtotal_explicitly_partial", () => {
		const resources = buildUsageResourcesFromDailyRows([
			{ bucket_date: "2026-09-08", awake_seconds: 30, cpu_vcpu_seconds: 60 },
			{ bucket_date: "2026-09-09", awake_seconds: 30, cpu_vcpu_seconds: 0 },
		]);
		expect(resources.cpu).toEqual({ total: 60, buckets: [{ date: "2026-09-08", vcpuSeconds: 60 }], evidence: "partial" });
	});
	it("invariant_partial_and_legacy_payloads_do_not_manufacture_zero_measurements", () => {
		for (const raw of [{ ok: true }, { resources: { cpu: { totalVcpuSeconds: 0, buckets: [{ date: "2026-09-09", vcpuSeconds: 0 }] } } }]) {
			const usage = normalizeMachineUsagePayload(raw, 7)!;
			expect(usage.resources.cpu.total).toBeNull();
			expect(usage.resources.cpu.buckets).toEqual([]);
		}
		expect(normalizeUsagePayload({ resources: { cpu: { totalVcpuSeconds: 60, buckets: [{ date: "2026-09-09", vcpuSeconds: 60 }] } } }, 7)?.resources.cpu.total).toBe(60);
	});
	it("invariant_explicit_sampled_zero_is_preserved_but_null_never_coerces_to_zero", () => {
		const zero = normalizeMachineUsagePayload({ resources: { cpu: { totalVcpuSeconds: 0, evidence: "sampled", buckets: [{ date: "2026-09-09", vcpuSeconds: 0 }] } } }, 7)!;
		expect(zero.resources.cpu).toEqual({ total: 0, evidence: "sampled", buckets: [{ date: "2026-09-09", vcpuSeconds: 0 }] });
		const absent = normalizeMachineUsagePayload({ resources: { cpu: { totalVcpuSeconds: null, evidence: "unknown", buckets: [] } } }, 7)!;
		expect(absent.resources.cpu.total).toBeNull();
		expect(cpuChartBuckets(absent.resources)).toEqual([]);
	});
});
