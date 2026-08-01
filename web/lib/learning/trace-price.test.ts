import { describe, expect, it } from "vitest";

import {
	TRACE_PRICE_VERSION,
	buildTraceLanePrice,
	readTraceLanePrice,
} from "@/lib/learning/trace-price";

describe("buildTraceLanePrice", () => {
	it("marks a row priced from a published rate as cost-ranked, with no reason", () => {
		expect(buildTraceLanePrice({ substrate: "e2b", rateBasis: "published" })).toEqual({
			v: 1,
			substrate: "e2b",
			rateBasis: "published",
			costRanked: true,
			reason: null,
		});
	});

	it("carries the refusal reason through for an unpriced lane", () => {
		const price = buildTraceLanePrice({
			substrate: "sprites",
			rateBasis: "unknown",
			unknownReason: "benchmarks.json profiles[sprites].pricing.cpuPerVcpuHour.basis is unknown",
		});
		expect(price.costRanked).toBe(false);
		expect(price.rateBasis).toBe("unknown");
		expect(price.reason).toContain("sprites");
	});

	it("never builds a refusal the strict reader would throw away", () => {
		// An empty reason would round-trip to null and demote the row to "legacy".
		const price = buildTraceLanePrice({
			substrate: "sprites",
			rateBasis: "unknown",
			unknownReason: "",
		});
		expect(price.reason).toBe("no reason recorded by the writer");
		expect(readTraceLanePrice({ price })).toEqual(price);
	});

	it("keeps a published lane published when the ROW is what could not be priced", () => {
		// A run with no usable wall clock on E2B: the lane is still priceable, and
		// recording it as an unknown rate would misreport the lane, not the run.
		const price = buildTraceLanePrice({
			substrate: "e2b",
			rateBasis: "published",
			unknownReason: "run window is unusable",
		});
		expect(price.rateBasis).toBe("published");
		expect(price.costRanked).toBe(false);
		expect(price.reason).toBe("run window is unusable");
	});
});

describe("readTraceLanePrice", () => {
	it("round-trips every shape a writer can produce", () => {
		for (const built of [
			buildTraceLanePrice({ substrate: "e2b", rateBasis: "published" }),
			buildTraceLanePrice({
				substrate: "e2b",
				rateBasis: "published",
				unknownReason: "run window is unusable",
			}),
			buildTraceLanePrice({
				substrate: "dedalus",
				rateBasis: "unknown",
				unknownReason: "no published rate",
			}),
		]) {
			expect(readTraceLanePrice({ price: built })).toEqual(built);
		}
	});

	it("returns null for a row that predates the block", () => {
		expect(readTraceLanePrice({ cronId: "cron-1" })).toBeNull();
		expect(readTraceLanePrice(null)).toBeNull();
		expect(
			readTraceLanePrice([
				{ price: buildTraceLanePrice({ substrate: "e2b", rateBasis: "published" }) },
			]),
		).toBeNull();
	});

	it("rejects an unknown schema version rather than half-reading it", () => {
		const future = {
			...buildTraceLanePrice({ substrate: "e2b", rateBasis: "published" }),
			v: TRACE_PRICE_VERSION + 1,
		};
		expect(readTraceLanePrice({ price: future })).toBeNull();
	});

	it("rejects an incoherent block instead of picking a half", () => {
		// An unknown rate that claims to be rankable is the exact failure this
		// block exists to make impossible.
		expect(
			readTraceLanePrice({
				price: { v: 1, substrate: "sprites", rateBasis: "unknown", costRanked: true, reason: null },
			}),
		).toBeNull();
		// A ranked row with something to explain.
		expect(
			readTraceLanePrice({
				price: {
					v: 1,
					substrate: "e2b",
					rateBasis: "published",
					costRanked: true,
					reason: "unpriced",
				},
			}),
		).toBeNull();
		// A refusal with no reason: unexplainable, so unusable.
		expect(
			readTraceLanePrice({
				price: { v: 1, substrate: "e2b", rateBasis: "published", costRanked: false, reason: null },
			}),
		).toBeNull();
	});

	it("rejects malformed fields", () => {
		const base = buildTraceLanePrice({ substrate: "e2b", rateBasis: "published" });
		expect(readTraceLanePrice({ price: { ...base, substrate: "" } })).toBeNull();
		expect(readTraceLanePrice({ price: { ...base, rateBasis: "estimate" } })).toBeNull();
		expect(readTraceLanePrice({ price: { ...base, costRanked: "yes" } })).toBeNull();
		expect(readTraceLanePrice({ price: { ...base, reason: 7 } })).toBeNull();
	});
});
