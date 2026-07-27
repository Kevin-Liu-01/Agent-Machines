/**
 * Metrics collector -- stores raw samples, detects state transitions,
 * maintains daily usage rollups, and upserts cost estimates.
 *
 * The API route does the parallel exec calls; this module receives
 * pre-collected data and handles all Supabase writes in batch.
 */

import { getProvider, MachineProviderError } from "@/lib/providers";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getLatestPhasePerMachine } from "@/lib/supabase/metrics";
import type {
	MachineRef,
	ProviderCredentials,
	ProviderKind,
	UserConfig,
} from "@/lib/user-config/schema";
import { estimateCost } from "./cost";
import { parseResourceSnapshot, type ResourceSnapshot } from "./parser";

/** Default cadence assumed when a caller doesn't specify one. */
const DEFAULT_INTERVAL_SECONDS = 30;
const EXEC_TIMEOUT_MS = 10_000;

/** Resource probe: CPU, memory, disk, and load in one round trip. */
const RESOURCE_CMD = [
	"cat /proc/stat",
	"echo '---DELIM---'",
	"free -b",
	"echo '---DELIM---'",
	"df -B1 /home/machine",
	"echo '---DELIM---'",
	"cat /proc/loadavg",
].join(" && ");

export type CollectedSample = {
	machineId: string;
	machineName: string;
	phase: string;
	vcpu: number;
	specMemoryMib: number;
	specStorageGib: number;
	snapshot: ResourceSnapshot | null;
};

type ExistingDailyUsage = {
	machine_id: string;
	awake_seconds: number | null;
	cpu_vcpu_seconds: number | string | null;
	memory_gib_seconds: number | string | null;
	storage_gib_hours: number | string | null;
	sample_count: number | null;
};

/**
 * Build all usage and cost rows in memory so one collection pass needs one
 * read and two writes, regardless of how many machines are running.
 */
export function buildDailyRollupRows(
	userId: string,
	samples: CollectedSample[],
	existingRows: ExistingDailyUsage[],
	bucketDate: string,
	intervalSeconds: number,
) {
	const existingByMachine = new Map(
		existingRows.map((row) => [row.machine_id, row]),
	);
	const usageRows = samples.map((sample) => {
		const existing = existingByMachine.get(sample.machineId);
		const awakeSeconds = (existing?.awake_seconds ?? 0) + intervalSeconds;
		return {
			user_id: userId,
			machine_id: sample.machineId,
			bucket_date: bucketDate,
			awake_seconds: awakeSeconds,
			cpu_vcpu_seconds:
				Number(existing?.cpu_vcpu_seconds ?? 0) + sample.vcpu * intervalSeconds,
			memory_gib_seconds:
				Number(existing?.memory_gib_seconds ?? 0) +
				(sample.specMemoryMib / 1024) * intervalSeconds,
			storage_gib_hours:
				Number(existing?.storage_gib_hours ?? 0) +
				(sample.specStorageGib * intervalSeconds) / 3600,
			sample_count: (existing?.sample_count ?? 0) + 1,
			vcpu: sample.vcpu,
			spec_memory_mib: sample.specMemoryMib,
			spec_storage_gib: sample.specStorageGib,
		};
	});
	const costRows = samples.map((sample, index) => {
		const cost = estimateCost(
			{
				vcpu: sample.vcpu,
				memoryMib: sample.specMemoryMib,
				storageGib: sample.specStorageGib,
			},
			usageRows[index].awake_seconds,
		);
		return {
			user_id: userId,
			machine_id: sample.machineId,
			bucket_date: bucketDate,
			cpu_cost_millicents: Math.round(cost.cpuMillicents),
			memory_cost_millicents: Math.round(cost.memoryMillicents),
			storage_cost_millicents: Math.round(cost.storageMillicents),
			total_cost_millicents: Math.round(cost.totalMillicents),
		};
	});

	return { usageRows, costRows };
}

function isSupabaseConfigured(): boolean {
	return Boolean(
		process.env.NEXT_PUBLIC_SUPABASE_URL &&
			(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
	);
}

export async function collectAndStore(
	userId: string,
	samples: CollectedSample[],
	lastPhases: Map<string, string>,
	intervalSeconds: number = DEFAULT_INTERVAL_SECONDS,
): Promise<{ transitions: number; metricsStored: number }> {
	const db = supabaseAdmin();
	const now = new Date().toISOString();
	const today = now.slice(0, 10);

	const withSnapshots = samples.filter((s) => s.snapshot);
	let metricsStored = 0;
	let transitions = 0;

	if (withSnapshots.length > 0) {
		const rows = withSnapshots.map((s) => ({
			user_id: userId,
			machine_id: s.machineId,
			recorded_at: now,
			cpu_percent: s.snapshot!.cpuPercent,
			memory_used_mib: s.snapshot!.memoryUsedMib,
			memory_total_mib: s.snapshot!.memoryTotalMib,
			storage_used_gib: s.snapshot!.storageUsedGib,
			storage_total_gib: s.snapshot!.storageTotalGib,
			load_avg_1m: s.snapshot!.loadAvg1m,
			phase: s.phase,
			vcpu: s.vcpu,
			spec_memory_mib: s.specMemoryMib,
		}));
		const { error } = await db.from("machine_metrics").insert(rows);
		if (!error) metricsStored = rows.length;
	}

	const transitionRows: Array<{
		user_id: string;
		machine_id: string;
		occurred_at: string;
		from_phase: string | null;
		to_phase: string;
		machine_name: string;
		reason: string | null;
	}> = [];

	for (const s of samples) {
		const prev = lastPhases.get(s.machineId);
		if (prev === undefined) {
			// First time we observe this machine: seed a baseline entry so the
			// activity timeline has a starting point (otherwise a stable
			// machine never produces a row).
			transitionRows.push({
				user_id: userId,
				machine_id: s.machineId,
				occurred_at: now,
				from_phase: null,
				to_phase: s.phase,
				machine_name: s.machineName,
				reason: `first observed: ${s.phase}`,
			});
		} else if (prev !== s.phase) {
			transitionRows.push({
				user_id: userId,
				machine_id: s.machineId,
				occurred_at: now,
				from_phase: prev,
				to_phase: s.phase,
				machine_name: s.machineName,
				reason: null,
			});
		}
	}

	if (transitionRows.length > 0) {
		const { error } = await db
			.from("machine_transitions")
			.insert(transitionRows);
		if (!error) transitions = transitionRows.length;
	}

	const runningSamples = samples.filter((s) => s.phase === "ready");
	if (runningSamples.length > 0) {
		const machineIds = runningSamples.map((sample) => sample.machineId);
		const { data: existingRows, error: existingError } = await db
			.from("machine_usage_daily")
			.select(
				"machine_id,awake_seconds,cpu_vcpu_seconds,memory_gib_seconds,storage_gib_hours,sample_count",
			)
			.eq("user_id", userId)
			.eq("bucket_date", today)
			.in("machine_id", machineIds);
		if (existingError) return { transitions, metricsStored };
		const { usageRows, costRows } = buildDailyRollupRows(
			userId,
			runningSamples,
			(existingRows ?? []) as ExistingDailyUsage[],
			today,
			intervalSeconds,
		);
		const { error: usageError } = await db
			.from("machine_usage_daily")
			.upsert(usageRows, { onConflict: "user_id,machine_id,bucket_date" });
		if (!usageError) {
			await db
				.from("machine_cost_estimates")
				.upsert(costRows, { onConflict: "user_id,machine_id,bucket_date" });
		}
	}

	return { transitions, metricsStored };
}

/**
 * Probe one machine for resource metrics. Only execs when the machine is
 * `ready` so a sleeping machine is never woken by the metrics poll — for
 * non-ready machines we still report the phase (for transition detection)
 * but carry no snapshot.
 */
export async function probeMachine(
	machine: MachineRef,
	credentials: ProviderCredentials,
): Promise<CollectedSample> {
	const base: Omit<CollectedSample, "phase" | "snapshot"> = {
		machineId: machine.id,
		machineName: machine.name,
		vcpu: machine.spec.vcpu,
		specMemoryMib: machine.spec.memoryMib,
		specStorageGib: machine.spec.storageGib,
	};

	try {
		const provider = getProvider(machine.providerKind as ProviderKind, credentials);
		const summary = await provider.state(machine.id);
		if (summary.state !== "ready") {
			return { ...base, phase: summary.rawPhase, snapshot: null };
		}
		let snapshot: ResourceSnapshot | null = null;
		try {
			const exec = await provider.exec(machine.id, RESOURCE_CMD, {
				timeoutMs: EXEC_TIMEOUT_MS,
			});
			snapshot = exec.exitCode === 0 ? parseResourceSnapshot(exec.stdout) : null;
		} catch {
			// Usage rollups are spec-based; keep the machine ready even when the
			// optional resource probe fails so billing/usage does not silently stop.
			snapshot = null;
		}
		return { ...base, phase: summary.state, snapshot };
	} catch (err) {
		const phase = err instanceof MachineProviderError ? "provider_error" : "unreachable";
		return { ...base, phase, snapshot: null };
	}
}

/**
 * One full collection pass for a user: probe every non-archived machine,
 * store raw samples + daily rollups + cost, and record transitions against
 * the durable last-known phase (read from Supabase, so it survives the
 * stateless serverless scheduler). No-ops cleanly when Supabase isn't
 * configured. `intervalSeconds` is the cadence this pass represents — used
 * to accumulate awake/CPU/memory/storage time.
 */
export async function collectMetricsForUser(
	userId: string,
	config: UserConfig,
	intervalSeconds: number,
): Promise<{ collected: number; transitions: number }> {
	if (!isSupabaseConfigured()) return { collected: 0, transitions: 0 };
	const machines = config.machines.filter((m) => !m.archived);
	if (machines.length === 0) return { collected: 0, transitions: 0 };

	const samples = await Promise.all(
		machines.map((m) => probeMachine(m, config.providers)),
	);

	const latest = await getLatestPhasePerMachine(userId);
	const lastPhases = new Map<string, string>();
	for (const [id, info] of latest) lastPhases.set(id, info.phase);

	const result = await collectAndStore(userId, samples, lastPhases, intervalSeconds);
	return { collected: result.metricsStored, transitions: result.transitions };
}
