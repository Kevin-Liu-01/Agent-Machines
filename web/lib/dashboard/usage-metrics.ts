/**
 * Normalized usage metrics for fleet + per-machine dashboard pages.
 * Guards against partial API/demo payloads so UI never reads undefined.cpu.
 */

export type UsageResourceSeries<TBucket> = {
	total: number | null;
	buckets: TBucket[];
	evidence: "no_intervals" | "unknown" | "partial" | "sampled";
};

export type UsageResources = {
	cpu: UsageResourceSeries<{ date: string; vcpuSeconds: number }>;
	memory: UsageResourceSeries<{ date: string; gibSeconds: number }>;
	storage: UsageResourceSeries<{ date: string; gibHours: number }>;
};

export type UsageMachineRow = {
	machineId: string;
	vcpu?: number;
	memoryMib?: number;
	awakeSeconds: number;
	cpuVcpuSeconds: number | null;
	memoryGibSeconds?: number | null;
	costFormatted?: string;
	costNote?: string;
};

export type NormalizedUsage = {
	ok: true;
	days: number;
	resources: UsageResources;
	machineBreakdown: UsageMachineRow[];
	totalCostMillicents: number | null;
	totalCostFormatted: string;
	costStatus: "unknown" | "partial" | "estimated";
	knownCostFormatted: string;
	costCoverage: { sampleCount: number; truncated: boolean; observedSeconds: number; pricedMachines: number; observedMachines: number };
};

const EMPTY_RESOURCES: UsageResources = {
	cpu: { total: null, buckets: [], evidence: "unknown" },
	memory: { total: null, buckets: [], evidence: "unknown" },
	storage: { total: null, buckets: [], evidence: "unknown" },
};

function asFiniteNumber(value: unknown, fallback = 0): number {
	const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function parseResource<TBucket>(
	raw: unknown,
	totalKey: string,
	valueKey: string,
	makeBucket: (date: string, value: number) => TBucket,
): UsageResourceSeries<TBucket> {
	if (!raw || typeof raw !== "object") return { total: null, buckets: [], evidence: "unknown" };
	const o = raw as Record<string, unknown>;
	if (o.evidence === "no_intervals" || o.evidence === "unknown") {
		return { total: null, buckets: [], evidence: o.evidence };
	}
	const explicitEvidence = o.evidence === "sampled" || o.evidence === "partial";
	const buckets: TBucket[] = [];
	let sum = 0;
	let discarded = false;
	for (const row of Array.isArray(o.buckets) ? o.buckets : []) {
		const value = asFiniteNumber(row?.[valueKey], -1);
		if (typeof row?.date !== "string" || !row.date || value < 0 || (value === 0 && !explicitEvidence)) {
			discarded = true;
			continue;
		}
		buckets.push(makeBucket(row.date, value));
		sum += value;
	}
	const amount = asFiniteNumber(o[totalKey], buckets.length ? sum : -1);
	const total = Number.isFinite(amount) && (amount > 0 || (amount === 0 && explicitEvidence)) ? amount : null;
	return {
		total,
		buckets: total === null ? [] : buckets,
		evidence: total === null ? "unknown" : o.evidence === "partial" || discarded ? "partial" : "sampled",
	};
}

function parseResources(raw: unknown): UsageResources {
	if (!raw || typeof raw !== "object") {
		return {
			cpu: { ...EMPTY_RESOURCES.cpu },
			memory: { ...EMPTY_RESOURCES.memory },
			storage: { ...EMPTY_RESOURCES.storage },
		};
	}
	const o = raw as Record<string, unknown>;
	return {
		cpu: parseResource(o.cpu, "totalVcpuSeconds", "vcpuSeconds", (date, vcpuSeconds) => ({ date, vcpuSeconds })),
		memory: parseResource(o.memory, "totalGibSeconds", "gibSeconds", (date, gibSeconds) => ({ date, gibSeconds })),
		storage: parseResource(o.storage, "totalGibHours", "gibHours", (date, gibHours) => ({ date, gibHours })),
	};
}

function parseMachineBreakdown(raw: unknown): UsageMachineRow[] {
	if (!Array.isArray(raw)) return [];
	const rows: UsageMachineRow[] = [];
	for (const row of raw) {
		if (!row || typeof row !== "object") continue;
		const o = row as Record<string, unknown>;
		const machineId =
			typeof o.machineId === "string"
				? o.machineId
				: typeof o.machine_id === "string"
					? o.machine_id
					: "";
		if (!machineId) continue;
		rows.push({
			machineId,
			vcpu:
				typeof o.vcpu === "number"
					? o.vcpu
					: typeof o.vcpu_count === "number"
						? o.vcpu_count
						: undefined,
			memoryMib:
				typeof o.memoryMib === "number"
					? o.memoryMib
					: typeof o.memory_mib === "number"
						? o.memory_mib
						: undefined,
			awakeSeconds: asFiniteNumber(o.awakeSeconds ?? o.awake_seconds),
			cpuVcpuSeconds: asFiniteNumber(o.cpuVcpuSeconds ?? o.cpu_vcpu_seconds) > 0
				? asFiniteNumber(o.cpuVcpuSeconds ?? o.cpu_vcpu_seconds) : null,
			memoryGibSeconds: asFiniteNumber(o.memoryGibSeconds ?? o.memory_gib_seconds) > 0
				? asFiniteNumber(o.memoryGibSeconds ?? o.memory_gib_seconds) : null,
			costFormatted: typeof o.costFormatted === "string" ? o.costFormatted : "Unknown",
			costNote: typeof o.costNote === "string" ? o.costNote : undefined,
		});
	}
	return rows;
}

function formatCost(millicents: number | null): string {
	if (millicents === null) return "Unknown";
	if (millicents > 0 && millicents < 1000) return "<$0.01";
	return `$${(millicents / 100_000).toFixed(2)}`;
}

const EMPTY_COST_COVERAGE = { sampleCount: 0, truncated: false, observedSeconds: 0, pricedMachines: 0, observedMachines: 0 };

/** Parse any usage-shaped JSON (prod API, demo, partial errors) into a safe shape. */
export function normalizeUsagePayload(
	raw: unknown,
	days: number,
): NormalizedUsage | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	if (o.ok === false) return null;

	const resources = parseResources(o.resources);
	const machineBreakdown = parseMachineBreakdown(
		o.machineBreakdown ?? o.byMachine,
	);
	const costStatus = o.costStatus === "estimated" || o.costStatus === "partial" ? o.costStatus : "unknown";
	const amount = asFiniteNumber(o.totalCostMillicents, -1);
	const totalCostMillicents = costStatus === "estimated" && amount >= 0 ? amount : null;
	const totalCostFormatted = formatCost(totalCostMillicents);
	const knownAmount = asFiniteNumber(o.knownCostMillicents, -1);
	const coverage = o.costCoverage && typeof o.costCoverage === "object" ? o.costCoverage as Record<string, unknown> : {};

	return {
		ok: true,
		days: asFiniteNumber(o.days, days) || days,
		resources,
		machineBreakdown,
		totalCostMillicents,
		totalCostFormatted,
		costStatus,
		knownCostFormatted: formatCost(costStatus !== "unknown" && knownAmount >= 0 ? knownAmount : null),
		costCoverage: {
			sampleCount: asFiniteNumber(coverage.sampleCount), truncated: coverage.truncated === true,
			observedSeconds: asFiniteNumber(coverage.observedSeconds), pricedMachines: asFiniteNumber(coverage.pricedMachines),
			observedMachines: asFiniteNumber(coverage.observedMachines),
		},
	};
}

export type DailyUsageRow = {
	bucket_date: string;
	machine_id?: string;
	awake_seconds?: number | string | null;
	cpu_vcpu_seconds?: number | string | null;
	memory_gib_seconds?: number | string | null;
	storage_gib_hours?: number | string | null;
};

/** Build chart resources from Supabase machine_usage_daily rows. */
export function buildUsageResourcesFromDailyRows(
	rows: DailyUsageRow[],
): UsageResources {
	function series<TBucket>(key: keyof DailyUsageRow, makeBucket: (date: string, value: number) => TBucket): UsageResourceSeries<TBucket> {
		const daily = new Map<string, number>();
		let unknown = false;
		for (const row of rows) {
			// A first sample observes a state, not an elapsed interval. Historical
			// positive rollups without duration metadata remain readable.
			const duration = asFiniteNumber(row.awake_seconds, -1);
			if (duration === 0) continue;
			const value = asFiniteNumber(row[key], -1);
			// The collector uses zero for unknown allocation. Allocated resources
			// over a positive interval cannot establish a true zero measurement.
			if (value <= 0) { unknown = true; continue; }
			daily.set(row.bucket_date, (daily.get(row.bucket_date) ?? 0) + value);
		}
		return {
			total: daily.size ? [...daily.values()].reduce((sum, value) => sum + value, 0) : null,
			buckets: [...daily].map(([date, value]) => makeBucket(date, value)),
			evidence: daily.size ? unknown ? "partial" : "sampled" : unknown ? "unknown" : "no_intervals",
		};
	}
	return {
		cpu: series("cpu_vcpu_seconds", (date, vcpuSeconds) => ({ date, vcpuSeconds })),
		memory: series("memory_gib_seconds", (date, gibSeconds) => ({ date, gibSeconds })),
		storage: series("storage_gib_hours", (date, gibHours) => ({ date, gibHours })),
	};
}

export function usageResourceNote(series: UsageResourceSeries<unknown> | undefined): string {
	switch (series?.evidence) {
		case "no_intervals": return "No measured interval yet";
		case "partial": return "Known samples only · partial";
		case "sampled": return "Sampled intervals only";
		default: return "Allocation unknown";
	}
}

export function fmtUsageAmount(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "–";
	if (value > 0 && value < 0.1) return "<0.1";
	return value.toFixed(1);
}

export function fmtUsageHours(seconds: number | null): string {
	return fmtUsageAmount(seconds === null ? null : seconds / 3600);
}

export function fmtActiveTime(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
	return `${(seconds / 3600).toFixed(1)}h`;
}

export function avgPerDay(total: number, days: number): string {
	if (days <= 0) return "0";
	const avg = total / days;
	return avg >= 10 ? avg.toFixed(0) : avg.toFixed(1);
}

export function cpuChartBuckets(resources: UsageResources): Array<{
	date: string;
	value: number;
}> {
	return resources.cpu.buckets.map((b) => ({
		date: b.date,
		value: b.vcpuSeconds / 3600,
	}));
}

export function memoryChartBuckets(resources: UsageResources): Array<{
	date: string;
	value: number;
}> {
	return resources.memory.buckets.map((b) => ({
		date: b.date,
		value: b.gibSeconds / 3600,
	}));
}

export function storageChartBuckets(resources: UsageResources): Array<{
	date: string;
	value: number;
}> {
	return resources.storage.buckets.map((b) => ({
		date: b.date,
		value: b.gibHours,
	}));
}

export type UsageTransition = { label: string; timestamp: string };

export type NormalizedMachineUsage = NormalizedUsage & {
	machineId: string;
	transitions: UsageTransition[];
};

/** Per-machine usage page — resources + activity timeline. */
export function normalizeMachineUsagePayload(
	raw: unknown,
	days: number,
	fallbackMachineId = "",
): NormalizedMachineUsage | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	if (o.ok === false) return null;

	const resources = parseResources(o.resources);
	const machineId =
		typeof o.machineId === "string"
			? o.machineId
			: typeof o.machine_id === "string"
				? o.machine_id
				: fallbackMachineId;

	const transitions = Array.isArray(o.transitions)
		? o.transitions
				.map((t) => {
					if (!t || typeof t !== "object") return null;
					const row = t as Record<string, unknown>;
					const label = typeof row.label === "string" ? row.label : "";
					const timestamp =
						typeof row.timestamp === "string"
							? row.timestamp
							: typeof row.occurred_at === "string"
								? row.occurred_at
								: "";
					if (!label || !timestamp) return null;
					return { label, timestamp };
				})
				.filter((t): t is UsageTransition => t !== null)
		: [];

	return {
		ok: true,
		days: asFiniteNumber(o.days, days) || days,
		machineId,
		resources,
		machineBreakdown: [],
		totalCostMillicents: null,
		totalCostFormatted: "Unknown",
		costStatus: "unknown",
		knownCostFormatted: "Unknown",
		costCoverage: { ...EMPTY_COST_COVERAGE },
		transitions,
	};
}
