/**
 * DISPLAY ONLY: sampled compute allocation, never an invoice or routing input.
 * Uses the same published rates as web/lib/metrics/prices.ts. The former
 * provider-agnostic table in web/lib/metrics/collector.ts was underpriced and
 * must not be read back from machine_cost_estimates as trustworthy money.
 */
import { MILLICENTS_PER_USD, substratePrice } from "./prices";

export const COMPUTE_PRICE_SOURCES = [
	{ label: "E2B pricing", url: "https://e2b.dev/pricing" },
	{ label: "Vercel pricing", url: "https://vercel.com/docs/sandbox/pricing" },
	{ label: "Sprites metering", url: "https://fly.io/sprites/" },
];

export type CostEstimate =
	| { known: true; cpuMillicents: number; memoryMillicents: number; totalMillicents: number; note: string }
	| { known: false; totalMillicents: null; note: string };

/** Price accumulated resource-time, not the current machine shape × all history.
 * Rates verified against the linked official pages on 2026-09-09. Vercel uses
 * regional active CPU metering; without its region/meter we cannot quote it.
 * Sprites meters cpu.stat and actual RAM, neither recoverable from allocations.
 */
export function estimateCost(
	provider: string,
	usage: { cpuVcpuSeconds: number; memoryGibSeconds: number },
): CostEstimate {
	if (![usage.cpuVcpuSeconds, usage.memoryGibSeconds].every((n) => Number.isFinite(n) && n >= 0)) {
		return { known: false, totalMillicents: null, note: "Resource-time evidence is missing or invalid." };
	}
	if (provider === "sprites") {
		return { known: false, totalMillicents: null, note: "Sprites bills actual CPU and RAM usage; allocation samples are not its billing meter." };
	}
	if (provider === "vercel") {
		return { known: false, totalMillicents: null, note: "Vercel cost requires regional pricing and active CPU usage, which these samples do not record." };
	}
	const rate = substratePrice(provider);
	if (!rate.known) return { known: false, totalMillicents: null, note: "No verified compute price is available for this provider." };
	const cpuMillicents = usage.cpuVcpuSeconds / 3600 * rate.vcpuHourUsd * MILLICENTS_PER_USD;
	const memoryUnits = usage.memoryGibSeconds * (rate.memoryUnit === "GB" ? 1_073_741_824 / 1_000_000_000 : 1);
	const memoryMillicents = memoryUnits / 3600 * rate.memoryHourUsd * MILLICENTS_PER_USD;
	return {
		known: true, cpuMillicents, memoryMillicents, totalMillicents: cpuMillicents + memoryMillicents,
		note: "E2B list-price estimate for sampled allocation. Not a provider invoice.",
	};
}

export function formatMillicents(millicents: number | null): string {
	if (millicents === null || !Number.isFinite(millicents) || millicents < 0) return "Unknown";
	if (millicents > 0 && millicents < 1000) return "<$0.01";
	return `$${(millicents / MILLICENTS_PER_USD).toFixed(2)}`;
}
