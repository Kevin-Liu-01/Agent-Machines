/**
 * Normalized usage metrics for fleet + per-machine dashboard pages.
 * Guards against partial API/demo payloads so UI never reads undefined.cpu.
 */

export type UsageResourceSeries<TBucket> = {
	total: number;
	buckets: TBucket[];
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
	cpuVcpuSeconds: number;
	memoryGibSeconds?: number;
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
	cpu: { total: 0, buckets: [] },
	memory: { total: 0, buckets: [] },
	storage: { total: 0, buckets: [] },
};

function asFiniteNumber(value: unknown, fallback = 0): number {
	const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function parseCpuResource(raw: unknown): UsageResources["cpu"] {
	if (!raw || typeof raw !== "object") {
		return { ...EMPTY_RESOURCES.cpu };
	}
	const o = raw as Record<string, unknown>;
	const buckets = Array.isArray(o.buckets)
		? o.buckets
				.map((b) => {
					if (!b || typeof b !== "object") return null;
					const row = b as Record<string, unknown>;
					const date = typeof row.date === "string" ? row.date : "";
					if (!date) return null;
					return {
						date,
						vcpuSeconds: asFiniteNumber(row.vcpuSeconds),
					};
				})
				.filter((b): b is { date: string; vcpuSeconds: number } => b !== null)
		: [];
	const total = asFiniteNumber(
		o.totalVcpuSeconds,
		buckets.reduce((n, b) => n + b.vcpuSeconds, 0),
	);
	return { total, buckets };
}

function parseMemoryResource(raw: unknown): UsageResources["memory"] {
	if (!raw || typeof raw !== "object") {
		return { ...EMPTY_RESOURCES.memory };
	}
	const o = raw as Record<string, unknown>;
	const buckets = Array.isArray(o.buckets)
		? o.buckets
				.map((b) => {
					if (!b || typeof b !== "object") return null;
					const row = b as Record<string, unknown>;
					const date = typeof row.date === "string" ? row.date : "";
					if (!date) return null;
					return {
						date,
						gibSeconds: asFiniteNumber(row.gibSeconds),
					};
				})
				.filter((b): b is { date: string; gibSeconds: number } => b !== null)
		: [];
	const total = asFiniteNumber(
		o.totalGibSeconds,
		buckets.reduce((n, b) => n + b.gibSeconds, 0),
	);
	return { total, buckets };
}

function parseStorageResource(raw: unknown): UsageResources["storage"] {
	if (!raw || typeof raw !== "object") {
		return { ...EMPTY_RESOURCES.storage };
	}
	const o = raw as Record<string, unknown>;
	const buckets = Array.isArray(o.buckets)
		? o.buckets
				.map((b) => {
					if (!b || typeof b !== "object") return null;
					const row = b as Record<string, unknown>;
					const date = typeof row.date === "string" ? row.date : "";
					if (!date) return null;
					return {
						date,
						gibHours: asFiniteNumber(row.gibHours),
					};
				})
				.filter((b): b is { date: string; gibHours: number } => b !== null)
		: [];
	const total = asFiniteNumber(
		o.totalGibHours,
		buckets.reduce((n, b) => n + b.gibHours, 0),
	);
	return { total, buckets };
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
		cpu: parseCpuResource(o.cpu),
		memory: parseMemoryResource(o.memory),
		storage: parseStorageResource(o.storage),
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
			cpuVcpuSeconds: asFiniteNumber(
				o.cpuVcpuSeconds ?? o.cpu_vcpu_seconds,
			),
			memoryGibSeconds: asFiniteNumber(
				o.memoryGibSeconds ?? o.memory_gib_seconds,
			),
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
	const dailyMap = new Map<
		string,
		{ vcpuSeconds: number; gibSeconds: number; gibHours: number }
	>();
	for (const r of rows) {
		const existing = dailyMap.get(r.bucket_date) ?? {
			vcpuSeconds: 0,
			gibSeconds: 0,
			gibHours: 0,
		};
		existing.vcpuSeconds += asFiniteNumber(r.cpu_vcpu_seconds);
		existing.gibSeconds += asFiniteNumber(r.memory_gib_seconds);
		existing.gibHours += asFiniteNumber(r.storage_gib_hours);
		dailyMap.set(r.bucket_date, existing);
	}

	const cpuBuckets: UsageResources["cpu"]["buckets"] = [];
	const memBuckets: UsageResources["memory"]["buckets"] = [];
	const storageBuckets: UsageResources["storage"]["buckets"] = [];
	let totalVcpu = 0;
	let totalMem = 0;
	let totalStorage = 0;

	for (const [date, totals] of dailyMap) {
		cpuBuckets.push({ date, vcpuSeconds: totals.vcpuSeconds });
		memBuckets.push({ date, gibSeconds: totals.gibSeconds });
		storageBuckets.push({ date, gibHours: totals.gibHours });
		totalVcpu += totals.vcpuSeconds;
		totalMem += totals.gibSeconds;
		totalStorage += totals.gibHours;
	}

	return {
		cpu: { total: totalVcpu, buckets: cpuBuckets },
		memory: { total: totalMem, buckets: memBuckets },
		storage: { total: totalStorage, buckets: storageBuckets },
	};
}

export function fmtUsageHours(seconds: number): string {
	const h = seconds / 3600;
	return h >= 10 ? h.toFixed(0) : h.toFixed(1);
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
