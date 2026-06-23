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

	await Promise.all(
		runningSamples.map((s) => upsertDailyUsage(db, userId, s, today, intervalSeconds)),
	);

	await Promise.all(
		runningSamples.map((s) => upsertCostEstimate(db, userId, s, today, intervalSeconds)),
	);

	return { transitions, metricsStored };
}

async function upsertDailyUsage(
	db: ReturnType<typeof supabaseAdmin>,
	userId: string,
	sample: CollectedSample,
	bucketDate: string,
	intervalSeconds: number,
): Promise<void> {
	const { data: existing } = await db
		.from("machine_usage_daily")
		.select("*")
		.eq("user_id", userId)
		.eq("machine_id", sample.machineId)
		.eq("bucket_date", bucketDate)
		.maybeSingle();

	const memoryGib = sample.specMemoryMib / 1024;
	const addAwake = intervalSeconds;
	const addCpuSeconds = sample.vcpu * intervalSeconds;
	const addMemoryGibSeconds = memoryGib * intervalSeconds;
	const addStorageGibHours =
		(sample.specStorageGib * intervalSeconds) / 3600;

	const row = {
		user_id: userId,
		machine_id: sample.machineId,
		bucket_date: bucketDate,
		awake_seconds: (existing?.awake_seconds ?? 0) + addAwake,
		cpu_vcpu_seconds: Number(existing?.cpu_vcpu_seconds ?? 0) + addCpuSeconds,
		memory_gib_seconds:
			Number(existing?.memory_gib_seconds ?? 0) + addMemoryGibSeconds,
		storage_gib_hours:
			Number(existing?.storage_gib_hours ?? 0) + addStorageGibHours,
		sample_count: (existing?.sample_count ?? 0) + 1,
		vcpu: sample.vcpu,
		spec_memory_mib: sample.specMemoryMib,
		spec_storage_gib: sample.specStorageGib,
	};

	await db
		.from("machine_usage_daily")
		.upsert(row, { onConflict: "user_id,machine_id,bucket_date" });
}

async function upsertCostEstimate(
	db: ReturnType<typeof supabaseAdmin>,
	userId: string,
	sample: CollectedSample,
	bucketDate: string,
	intervalSeconds: number,
): Promise<void> {
	const { data: usage } = await db
		.from("machine_usage_daily")
		.select("awake_seconds")
		.eq("user_id", userId)
		.eq("machine_id", sample.machineId)
		.eq("bucket_date", bucketDate)
		.maybeSingle();

	const awakeSeconds = usage?.awake_seconds ?? intervalSeconds;
	const cost = estimateCost(
		{
			vcpu: sample.vcpu,
			memoryMib: sample.specMemoryMib,
			storageGib: sample.specStorageGib,
		},
		awakeSeconds,
	);

	await db.from("machine_cost_estimates").upsert(
		{
			user_id: userId,
			machine_id: sample.machineId,
			bucket_date: bucketDate,
			cpu_cost_millicents: Math.round(cost.cpuMillicents),
			memory_cost_millicents: Math.round(cost.memoryMillicents),
			storage_cost_millicents: Math.round(cost.storageMillicents),
			total_cost_millicents: Math.round(cost.totalMillicents),
		},
		{ onConflict: "user_id,machine_id,bucket_date" },
	);
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
