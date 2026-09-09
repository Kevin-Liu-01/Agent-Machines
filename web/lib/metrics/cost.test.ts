import { describe, expect, it } from "vitest";
import { estimateCost, formatMillicents } from "./cost";

describe("sampled compute pricing", () => {
	it("prices a minute of E2B allocation at its published per-second rates", () => {
		const cost = estimateCost("e2b", { cpuVcpuSeconds: 120, memoryGibSeconds: 240 });
		expect(cost.known).toBe(true);
		expect(cost.totalMillicents).toBeCloseTo(276, 8);
	});
	it("invariant_different_historical_shapes_price_the_accumulated_resources", () => {
		const small = estimateCost("e2b", { cpuVcpuSeconds: 60, memoryGibSeconds: 120 });
		const large = estimateCost("e2b", { cpuVcpuSeconds: 240, memoryGibSeconds: 480 });
		const total = estimateCost("e2b", { cpuVcpuSeconds: 300, memoryGibSeconds: 600 });
		expect(total.totalMillicents).toBeCloseTo(small.totalMillicents! + large.totalMillicents!, 8);
	});
	it.each(["sprites", "vercel", "dedalus", "missing"])("invariant_%s_without_matching_meter_evidence_is_not_free", (provider) => {
		expect(estimateCost(provider, { cpuVcpuSeconds: 120, memoryGibSeconds: 240 })).toMatchObject({ known: false, totalMillicents: null });
	});
	it.each([NaN, Infinity, -1])("invariant_invalid_resource_time_cannot_be_priced (%s)", (value) => {
		expect(estimateCost("e2b", { cpuVcpuSeconds: value, memoryGibSeconds: 240 }).known).toBe(false);
	});
	it("invariant_nonzero_cost_does_not_round_to_free", () => {
		expect(formatMillicents(276)).toBe("<$0.01");
		expect(formatMillicents(0)).toBe("$0.00");
		expect(formatMillicents(null)).toBe("Unknown");
		expect(formatMillicents(100_000)).toBe("$1.00");
	});
});
