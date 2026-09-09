import { estimateCost, formatMillicents } from "./cost";

/** Existing metric records are observations, not provider billing exports. */
export type UsageObservation = {
	machine_id: string;
	recorded_at: string;
	phase: string;
	vcpu: number | null;
	spec_memory_mib: number | null;
};

export const USAGE_SAMPLE_LIMIT = 1000;
export const MAX_OBSERVATION_GAP_MS = 30 * 60_000;

/** Only adjacent ready observations establish an interval. No time is invented
 * before the first sample, after the last sample, or over long gaps. Equal-time
 * duplicate collectors cannot add time twice. Intervals with changing recorded
 * allocation are omitted because the moment of a resize is unknown.
 */
export function observedComputeUsage(
	observations: UsageObservation[],
	providers: Map<string, string>,
	truncated = false,
) {
	const previous = new Map<string, UsageObservation>();
	const machines = new Map<string, { cpuVcpuSeconds: number; memoryGibSeconds: number; observedSeconds: number }>();
	for (const row of observations) {
		machines.set(row.machine_id, { cpuVcpuSeconds: 0, memoryGibSeconds: 0, observedSeconds: 0 });
	}
	for (const row of [...observations].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))) {
		const prior = previous.get(row.machine_id);
		previous.set(row.machine_id, row);
		if (!prior || prior.phase !== "ready" || row.phase !== "ready") continue;
		const elapsed = Date.parse(row.recorded_at) - Date.parse(prior.recorded_at);
		if (!(elapsed > 0 && elapsed <= MAX_OBSERVATION_GAP_MS)) continue;
		if (!(typeof prior.vcpu === "number" && Number.isFinite(prior.vcpu) && prior.vcpu > 0
			&& typeof prior.spec_memory_mib === "number" && Number.isFinite(prior.spec_memory_mib) && prior.spec_memory_mib > 0)) continue;
		if (prior.vcpu !== row.vcpu || prior.spec_memory_mib !== row.spec_memory_mib) continue;
		const usage = machines.get(row.machine_id)!;
		usage.observedSeconds += elapsed / 1000;
		usage.cpuVcpuSeconds += elapsed / 1000 * prior.vcpu;
		usage.memoryGibSeconds += elapsed / 1000 * prior.spec_memory_mib / 1024;
	}
	let knownCostMillicents = 0;
	let pricedMachines = 0;
	const estimates = [...machines].map(([machineId, usage]) => {
		const cost = usage.observedSeconds > 0
			? estimateCost(providers.get(machineId) ?? "unknown", usage)
			: { known: false as const, totalMillicents: null, note: "At least two nearby ready observations with stable allocation are required." };
		if (cost.known) {
			pricedMachines++;
			knownCostMillicents += cost.totalMillicents;
		}
		return { machineId, ...usage, costMillicents: cost.totalMillicents, costFormatted: formatMillicents(cost.totalMillicents), costNote: cost.note };
	});
	const costStatus = pricedMachines === 0 ? "unknown" : truncated || pricedMachines < machines.size ? "partial" : "estimated";
	const totalCostMillicents = costStatus === "estimated" ? knownCostMillicents : null;
	return {
		costStatus,
		totalCostMillicents,
		totalCostFormatted: formatMillicents(totalCostMillicents),
		knownCostMillicents: pricedMachines > 0 ? knownCostMillicents : null,
		knownCostFormatted: formatMillicents(pricedMachines > 0 ? knownCostMillicents : null),
		estimates,
		costCoverage: {
			sampleCount: observations.length, truncated, pricedMachines, observedMachines: machines.size,
			observedSeconds: estimates.reduce((sum, e) => sum + e.observedSeconds, 0),
		},
	};
}
