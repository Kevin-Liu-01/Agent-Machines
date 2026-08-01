/**
 * Exact arithmetic against the committed seed, plus the two refusals that make
 * this table safe to route on: an unpriced lane produces no number at all, and
 * a priced lane produces the vendor's published number rather than the retired
 * single-table estimate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { estimateCost } from "@/lib/metrics/cost";
import {
	MILLICENTS_PER_USD,
	MIB_PER_GB,
	SUBSTRATE_PRICES,
	costRankingReport,
	isCostRankable,
	priceFromPricingBlock,
	priceSandboxRun,
	rankByPrice,
	sandboxCostMillicents,
	substratePrice,
	type PriceTable,
} from "@/lib/metrics/prices";

/** 60s on the shape used by the ingest fixtures: 2 vCPU, 4 GiB. */
const RUN = { durationMs: 60_000, vcpu: 2, memoryMib: 4096 };
const HOURS = 60_000 / 3_600_000;

describe("the seed is read with its provenance intact", () => {
	it("prices the two lanes benchmarks.json publishes and refuses the two it does not", () => {
		expect(SUBSTRATE_PRICES.e2b).toEqual({
			known: true,
			vcpuHourUsd: 0.0504,
			memoryHourUsd: 0.0162,
			memoryUnit: "GiB",
			rateBasis: "published",
			note: "Firecracker microVMs; ~150ms published cold start.",
		});
		expect(SUBSTRATE_PRICES.vercel).toMatchObject({
			known: true,
			vcpuHourUsd: 0.128,
			memoryHourUsd: 0.0212,
			// Read off the unit string "$/GB-hr", not off the key name
			// `memoryPerGibHour` -- Vercel meters decimal GB.
			memoryUnit: "GB",
			rateBasis: "published",
		});
		expect(SUBSTRATE_PRICES.sprites.known).toBe(false);
		expect(SUBSTRATE_PRICES.dedalus.known).toBe(false);
	});

	it("names the seed field behind every refusal", () => {
		for (const substrate of ["sprites", "dedalus"] as const) {
			const price = SUBSTRATE_PRICES[substrate];
			expect(price.known).toBe(false);
			if (price.known) return;
			expect(price.rateBasis).toBe("unknown");
			expect(price.reason).toContain(`profiles[${substrate}].pricing.cpuPerVcpuHour.basis`);
			expect(price.reason).toContain("web/data/benchmarks.json");
		}
	});

	it("refuses a substrate name it does not know instead of coercing one", () => {
		const price = substratePrice("modal");
		expect(price.known).toBe(false);
		expect(isCostRankable("modal")).toBe(false);
	});

});

describe("the parser fails closed on every seed shape the committed file lacks", () => {
	const published = (value: number, unit: string) => ({ value, unit, basis: "published" });
	const good = {
		cpuPerVcpuHour: published(0.05, "$/vCPU-hr"),
		memoryPerGibHour: published(0.016, "$/GiB-hr"),
		note: "seeded",
	};

	it("accepts a fully published block", () => {
		expect(priceFromPricingBlock("test", good)).toEqual({
			known: true,
			vcpuHourUsd: 0.05,
			memoryHourUsd: 0.016,
			memoryUnit: "GiB",
			rateBasis: "published",
			note: "seeded",
		});
	});

	it("refuses an estimate basis -- a derived rate is not a price", () => {
		const price = priceFromPricingBlock("test", {
			...good,
			cpuPerVcpuHour: { value: 0.07, unit: "$/vCPU-hr", basis: "estimate" },
		});
		expect(price.known).toBe(false);
		if (price.known) return;
		expect(price.rateBasis).toBe("estimate");
		expect(price.reason).toContain('is "estimate", not "published"');
	});

	it("refuses a published basis with no usable value", () => {
		for (const bad of [null, 0, -1]) {
			const price = priceFromPricingBlock("test", {
				...good,
				memoryPerGibHour: { value: bad, unit: "$/GiB-hr", basis: "published" },
			});
			expect(price.known).toBe(false);
			if (price.known) return;
			expect(price.reason).toContain("published with no usable value");
		}
	});

	it("refuses a memory unit it cannot map to GiB or GB", () => {
		const price = priceFromPricingBlock("test", {
			...good,
			memoryPerGibHour: published(0.016, "$/MB-hr"),
		});
		expect(price.known).toBe(false);
		if (price.known) return;
		expect(price.reason).toContain("names neither GiB nor GB");
	});

	it("refuses a missing or malformed block", () => {
		expect(priceFromPricingBlock("test", null).known).toBe(false);
		expect(priceFromPricingBlock("test", { cpuPerVcpuHour: "cheap" }).known).toBe(false);
		expect(priceFromPricingBlock("test", { ...good, memoryPerGibHour: {} }).known).toBe(false);
	});

	it("carries a hand-built table through pricing unchanged", () => {
		const table = {
			...SUBSTRATE_PRICES,
			sprites: priceFromPricingBlock("sprites", good),
		} as PriceTable;
		const quote = priceSandboxRun("sprites", RUN, table);
		expect(quote.sandboxMillicents).toBeCloseTo(
			(HOURS * 2 * 0.05 + 4 * HOURS * 0.016) * MILLICENTS_PER_USD,
			9,
		);
		expect(isCostRankable("sprites", table)).toBe(true);
		// ...and the real table still refuses it.
		expect(isCostRankable("sprites")).toBe(false);
	});
});

describe("priceSandboxRun -- exact arithmetic", () => {
	it("prices e2b at its published GiB rates", () => {
		const quote = priceSandboxRun("e2b", RUN);
		// cpu: (60000/3600000) h * 2 vCPU * $0.0504 = $0.00168
		// mem: 4096/1024 = 4 GiB * (1/60) h * $0.0162 = $0.00108
		// total $0.00276 -> 276 millicents
		const cpuUsd = HOURS * 2 * 0.0504;
		const memUsd = 4 * HOURS * 0.0162;
		expect(cpuUsd).toBeCloseTo(0.00168, 12);
		expect(memUsd).toBeCloseTo(0.00108, 12);
		expect(quote.sandboxMillicents).toBeCloseTo((cpuUsd + memUsd) * MILLICENTS_PER_USD, 9);
		expect(sandboxCostMillicents("e2b", RUN)).toBe(276);
		expect(quote.rateBasis).toBe("published");
		expect(quote.lines.map((l) => l.label)).toEqual(["cpu", "memory"]);
		// A GiB lane is billed on wall clock, so the figure is not an upper bound.
		expect(quote.upperBound).toBeUndefined();
	});

	it("bills a decimal-GB lane more units than a GiB lane for the same MiB", () => {
		const quote = priceSandboxRun("vercel", RUN);
		const cpuUsd = HOURS * 2 * 0.128;
		const memUsd = (4096 / MIB_PER_GB) * HOURS * 0.0212;
		expect(4096 / MIB_PER_GB).toBeCloseTo(4.294967296, 9);
		expect(quote.sandboxMillicents).toBeCloseTo((cpuUsd + memUsd) * MILLICENTS_PER_USD, 9);
		expect(sandboxCostMillicents("vercel", RUN)).toBe(578);
		// src/mux/cost.ts records vercel as active-CPU billed and the seed carries
		// no cpuBasis, so full utilization is an upper bound, flagged as one.
		expect(quote.upperBound).toBe(true);
	});

	it("returns no figure -- not zero -- for an unpriced lane, with the reason", () => {
		for (const substrate of ["sprites", "dedalus"]) {
			const quote = priceSandboxRun(substrate, RUN);
			expect(quote.known).toBe(false);
			expect(quote.sandboxMillicents).toBeUndefined();
			expect(quote.lines).toEqual([]);
			expect(quote.unknownReason).toContain("not \"published\"");
			expect(sandboxCostMillicents(substrate, RUN)).toBeNull();
		}
	});

	it("refuses an unusable window rather than pricing negative time", () => {
		const quote = priceSandboxRun("e2b", { ...RUN, durationMs: -1 });
		expect(quote.sandboxMillicents).toBeUndefined();
		expect(quote.unknownReason).toContain("not a usable window");
	});

	it("prices only sandbox compute -- no line is a model or a total", () => {
		const quote = priceSandboxRun("e2b", RUN);
		const summed = quote.lines.reduce((total, line) => total + line.millicents, 0);
		expect(summed).toBeCloseTo(quote.sandboxMillicents as number, 9);
		expect(quote.lines.some((l) => l.label === "cpu")).toBe(true);
		expect(quote.lines.some((l) => l.label === "memory")).toBe(true);
		expect(quote.lines).toHaveLength(2);
	});
});

describe("ranking", () => {
	it("ranks a known lane on the published rate, not the retired table", () => {
		// The retired estimator gives this run ~1 millicent on every substrate;
		// E2B's own published rate gives 276. Routing on the first is routing on
		// a number no vendor charges.
		const legacy = estimateCost({ vcpu: 2, memoryMib: 4096, storageGib: 20 }, 60);
		expect(Math.round(legacy.totalMillicents)).toBe(1);
		expect(sandboxCostMillicents("e2b", RUN)).toBe(276);
		expect(sandboxCostMillicents("e2b", RUN) as number).toBeGreaterThan(
			legacy.totalMillicents * 100,
		);
	});

	it("orders priced lanes cheapest-first and parks unpriced lanes last", () => {
		const ranked = rankByPrice(["dedalus", "vercel", "sprites", "e2b"], RUN);
		expect(ranked.map((q) => q.substrate)).toEqual(["e2b", "vercel", "dedalus", "sprites"]);
		// The two unpriced lanes keep the caller's order: a tie must not silently
		// override an operator's stated preference.
		expect(ranked.slice(2).every((q) => q.sandboxMillicents === undefined)).toBe(true);
	});

	it("never lets an unpriced lane sort ahead of the most expensive priced one", () => {
		const ranked = rankByPrice(["sprites", "vercel"], { ...RUN, durationMs: 36_000_000 });
		expect(ranked[0].substrate).toBe("vercel");
		expect(ranked[1].sandboxMillicents).toBeUndefined();
	});

	it("reports which lanes are cost-ranked and why the rest are not", () => {
		const report = costRankingReport();
		expect(report.ranked.sort()).toEqual(["e2b", "vercel"]);
		expect(report.unpriced.map((u) => u.substrate).sort()).toEqual(["dedalus", "sprites"]);
		for (const lane of report.unpriced) {
			expect(lane.reason.length).toBeGreaterThan(20);
			expect(lane.rateBasis).toBe("unknown");
		}
	});
});

/**
 * Drift guard against the mux half of the same product. The web package cannot
 * import across the package boundary, so the mux table is read as source text
 * (same technique as web/lib/mux/capabilities.test.ts).
 */
describe("agreement with src/mux/cost.ts", () => {
	const MUX_COST = readFileSync(join(process.cwd(), "..", "src", "mux", "cost.ts"), "utf8");

	function muxBlock(substrate: string): string {
		const start = MUX_COST.indexOf(`\n\t${substrate}: {`);
		expect(start, `src/mux/cost.ts must declare ${substrate}`).toBeGreaterThan(-1);
		const end = MUX_COST.indexOf("\n\t},", start);
		expect(end).toBeGreaterThan(start);
		return MUX_COST.slice(start, end);
	}

	it("prices the published lanes at the same rates as the mux", () => {
		for (const substrate of ["e2b", "vercel"] as const) {
			const price = SUBSTRATE_PRICES[substrate];
			expect(price.known).toBe(true);
			if (!price.known) return;
			const block = muxBlock(substrate);
			expect(block).toContain(`vcpuHourUsd: ${price.vcpuHourUsd}`);
			expect(block).toContain(`memoryHourUsd: ${price.memoryHourUsd}`);
			expect(block).toContain(`memoryUnit: "${price.memoryUnit}"`);
		}
	});

	it("records that the seed still lacks the dedalus rate the mux cites", () => {
		// Not a contradiction to paper over: src/mux/cost.ts cites
		// dedaluslabs.ai/pricing while web/data/benchmarks.json still says "Not
		// publicly listed". Until the seed is updated the hosted router must not
		// rank dedalus, and when it IS updated this test fails and says so.
		expect(muxBlock("dedalus")).toContain("known: true");
		expect(SUBSTRATE_PRICES.dedalus.known).toBe(false);
		expect(muxBlock("sprites")).toContain("known: false");
		expect(SUBSTRATE_PRICES.sprites.known).toBe(false);
	});

	it("shares the decimal-GB conversion constant with the mux", () => {
		expect(MUX_COST).toContain("MIB_PER_GB = 1_000_000_000 / 1_048_576");
		expect(MIB_PER_GB).toBe(1_000_000_000 / 1_048_576);
	});
});
