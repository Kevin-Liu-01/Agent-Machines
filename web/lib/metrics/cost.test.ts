/**
 * Guards the retirement (roadmap 4.1), not the arithmetic's correctness.
 *
 * `estimateCost` survives for one display caller. What must not come back is
 * its use as a routing input: the import guard below fails the moment anything
 * under lib/learning reaches for it again, which is how it became the number
 * the router optimized in the first place.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { estimateCost, formatMillicents } from "@/lib/metrics/cost";
import { sandboxCostMillicents } from "@/lib/metrics/prices";

const LIB = join(process.cwd(), "lib");

function sourcesUnder(dir: string): Array<{ path: string; text: string }> {
	const out: Array<{ path: string; text: string }> = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourcesUnder(full));
		else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
			out.push({ path: full, text: readFileSync(full, "utf8") });
		}
	}
	return out;
}

const IMPORTS_DISPLAY_TABLE = /from\s+["'](?:@\/lib\/metrics\/cost|\.\/cost|\.\.\/metrics\/cost)["']/;

describe("the display rate table is no longer a routing input", () => {
	it("is not imported anywhere under lib/learning", () => {
		const offenders = sourcesUnder(join(LIB, "learning"))
			.filter((f) => IMPORTS_DISPLAY_TABLE.test(f.text))
			.map((f) => f.path);
		expect(
			offenders,
			"routing code must price lanes through lib/metrics/prices.ts, per provider",
		).toEqual([]);
	});

	it("has exactly one caller left, and it is the usage rollup", () => {
		const callers = sourcesUnder(LIB)
			.filter((f) => !f.path.endsWith(join("metrics", "cost.ts")))
			.filter((f) => IMPORTS_DISPLAY_TABLE.test(f.text))
			.map((f) => f.path.slice(LIB.length + 1));
		expect(callers).toEqual([join("metrics", "collector.ts")]);
	});

	it("says in its own header that it is display-only and names the replacement", () => {
		const header = readFileSync(join(LIB, "metrics", "cost.ts"), "utf8").slice(0, 1_200);
		expect(header).toContain("DISPLAY ONLY");
		expect(header).toContain("web/lib/metrics/collector.ts");
		expect(header).toContain("web/lib/metrics/prices.ts");
	});
});

describe("estimateCost -- pinned for the display path it still serves", () => {
	it("keeps its arithmetic", () => {
		const cost = estimateCost({ vcpu: 2, memoryMib: 4096, storageGib: 20 }, 60);
		expect(cost.cpuMillicents).toBeCloseTo(0.552, 9);
		expect(cost.memoryMillicents).toBeCloseTo(0.552, 9);
		expect(cost.storageMillicents).toBeCloseTo(0.005, 9);
		expect(cost.totalMillicents).toBeCloseTo(1.109, 9);
		expect(formatMillicents(100_000)).toBe("$1.00");
	});

	it("is nowhere near the published rate for the same run, which is why it cannot route", () => {
		const legacy = estimateCost({ vcpu: 2, memoryMib: 4096, storageGib: 20 }, 60);
		const published = sandboxCostMillicents("e2b", {
			durationMs: 60_000,
			vcpu: 2,
			memoryMib: 4096,
		}) as number;
		expect(published / legacy.totalMillicents).toBeGreaterThan(200);
	});
});
