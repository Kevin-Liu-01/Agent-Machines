/**
 * DISPLAY ONLY -- the daily machine-cost rollup. NOT a routing input.
 *
 * One caller: `web/lib/metrics/collector.ts` (`upsert` of `machine_costs`,
 * rendered at /dashboard/usage). It has no provider argument, so it applies the
 * single rate table below to every machine on every substrate, which is exactly
 * why it may not price a route. Retired as a routing input by roadmap 4.1;
 * `web/lib/metrics/prices.ts` is what a router reads now, per provider, from the
 * published rates in `web/data/benchmarks.json`, with the lanes that publish no
 * rate refused rather than filled in from here.
 *
 * The gap is not small. These rates price 60s of a 2 vCPU / 4 GiB box at 1.1
 * millicents where E2B's published rate says 276 -- ~250x, and the same table
 * is applied to three other vendors whose rates differ from each other. Any
 * figure produced here is an order-of-magnitude display estimate, not money.
 * `cost.test.ts` guards that nothing under lib/learning imports it again.
 *
 * Rates are expressed in millicents (1/1000 of a cent) to avoid
 * floating-point rounding in running totals. Final display uses
 * `formatMillicents` to convert to dollars.
 */

const CPU_RATE_MILLICENTS_PER_VCPU_SECOND = 0.0046;
const MEMORY_RATE_MILLICENTS_PER_GIB_SECOND = 0.0023;
const STORAGE_RATE_MILLICENTS_PER_GIB_HOUR = 0.015;

export type CostEstimate = {
	cpuMillicents: number;
	memoryMillicents: number;
	storageMillicents: number;
	totalMillicents: number;
};

export function estimateCost(
	spec: { vcpu: number; memoryMib: number; storageGib: number },
	awakeSeconds: number,
): CostEstimate {
	const cpuMillicents =
		spec.vcpu * awakeSeconds * CPU_RATE_MILLICENTS_PER_VCPU_SECOND;
	const memoryGib = spec.memoryMib / 1024;
	const memoryMillicents =
		memoryGib * awakeSeconds * MEMORY_RATE_MILLICENTS_PER_GIB_SECOND;
	const awakeHours = awakeSeconds / 3600;
	const storageMillicents =
		spec.storageGib * awakeHours * STORAGE_RATE_MILLICENTS_PER_GIB_HOUR;
	const totalMillicents = cpuMillicents + memoryMillicents + storageMillicents;

	return { cpuMillicents, memoryMillicents, storageMillicents, totalMillicents };
}

export function formatMillicents(millicents: number): string {
	const dollars = millicents / 100_000;
	return `$${dollars.toFixed(2)}`;
}
