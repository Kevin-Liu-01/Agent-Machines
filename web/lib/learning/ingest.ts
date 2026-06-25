/**
 * Loop 0 -- out-of-band trace reader.
 *
 * The scheduler tick fires crons with wait:false, so the control plane never
 * sees a cron's real exit code/timing at dispatch -- only the box's
 * ~/.agent-machines/cron/runs.jsonl has them. This reads that authoritative log
 * per cron machine (no box-side code change; the cron command already writes
 * it), normalizes completed runs into keyed traces, and emits them deduped.
 * Best-effort per machine; never throws into the tick.
 */

import { createHash } from "node:crypto";

import { buildPool, type Pool } from "@/lib/dashboard/pool";
import { estimateCost } from "@/lib/metrics/cost";
import { getProvider } from "@/lib/providers";
import { bundleForMachine, computeLoadoutHash } from "@/lib/learning/loadout-hash";
import { parseRunLog } from "@/lib/learning/run-log";
import { deriveTaskClass } from "@/lib/learning/task-class";
import { emitRunTraces } from "@/lib/learning/trace";
import type { RunTrace } from "@/lib/learning/types";
import type {
	AgentKind,
	CronEntry,
	MachineRef,
	ProviderKind,
	UserConfig,
} from "@/lib/user-config/schema";

const RUN_LOG = "$HOME/.agent-machines/cron/runs.jsonl";
const TAIL_LINES = 100;
const EXEC_TIMEOUT_MS = 15_000;
/** Bounded concurrency + wall-clock budget so ingest can't blow the tick's maxDuration. */
const INGEST_BUDGET_MS = 30_000;
const INGEST_CONCURRENCY = 4;

function tenantHash(userId: string): string {
	return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

async function ingestMachine(
	userId: string,
	config: UserConfig,
	machine: MachineRef,
	cronsById: Map<string, CronEntry>,
	pool: Pool,
): Promise<number> {
	const provider = getProvider(machine.providerKind, config.providers);
	const res = await provider.exec(
		machine.id,
		`tail -n ${TAIL_LINES} ${RUN_LOG} 2>/dev/null || true`,
		{ timeoutMs: EXEC_TIMEOUT_MS },
	);
	const entries = parseRunLog(res.stdout);
	if (entries.length === 0) return 0;

	// loadout_hash is best-effort current-config: the run log carries the routing
	// arm but not the resolved ability set, so this can drift if the loadout
	// changed since the run. The bandit arm itself comes from the embedded snapshot.
	const loadoutHash = computeLoadoutHash(bundleForMachine(config, machine.id), pool);
	const th = tenantHash(userId);
	const traces: RunTrace[] = entries.map((e) => {
		const cron = cronsById.get(e.id);
		const started = Date.parse(e.startedAt);
		const finished = Date.parse(e.finishedAt);
		const latencyMs =
			Number.isFinite(started) && Number.isFinite(finished) && finished >= started
				? finished - started
				: null;
		const costMillicents =
			latencyMs !== null
				? Math.round(estimateCost(machine.spec, latencyMs / 1000).totalMillicents)
				: null;
		return {
			userId,
			machineId: machine.id,
			runId: `${machine.id}:${e.id}:${e.startedAt}:${e.finishedAt}`,
			source: "cron",
			taskClass: cron ? deriveTaskClass(cron) : "unknown",
			// Prefer the arm snapshot embedded at dispatch; fall back to the machine's
			// current config only for legacy lines that predate the snapshot.
			runtime: e.runtime ? (e.runtime as AgentKind) : machine.agentKind,
			substrate: e.substrate ? (e.substrate as ProviderKind) : machine.providerKind,
			model: e.model ?? machine.model,
			routerId: e.router !== undefined ? e.router : machine.gatewayProfileId,
			loadoutHash,
			memoryBundleId: null,
			tenantHash: th,
			success: e.exitCode === 0,
			exitCode: e.exitCode,
			costMillicents,
			latencyMs,
			startedAt: e.startedAt,
			finishedAt: e.finishedAt,
			extra: cron ? { cronId: e.id, skills: cron.skills } : { cronId: e.id },
		};
	});
	await emitRunTraces(traces);
	return traces.length;
}

/** Read + emit run traces for every machine bound to one of the user's crons. */
export async function ingestRunTracesForUser(userId: string, config: UserConfig): Promise<number> {
	const crons = config.crons ?? [];
	if (crons.length === 0) return 0;
	const cronsById = new Map(crons.map((c) => [c.id, c]));
	const machineIds = new Set(crons.map((c) => c.machineId));
	const machines = [...machineIds]
		.map((id) => config.machines.find((m) => m.id === id && !m.archived))
		.filter((m): m is MachineRef => Boolean(m));
	if (machines.length === 0) return 0;
	const pool = buildPool(config);
	const deadline = Date.now() + INGEST_BUDGET_MS;
	let total = 0;
	// Bounded concurrency + a wall-clock budget so a fleet of cron machines can
	// never push the tick past its maxDuration. Machines skipped this tick are
	// picked up on the next one (ingest is idempotent on run_id).
	for (let i = 0; i < machines.length && Date.now() < deadline; i += INGEST_CONCURRENCY) {
		const batch = machines.slice(i, i + INGEST_CONCURRENCY);
		const counts = await Promise.all(
			batch.map((machine) =>
				ingestMachine(userId, config, machine, cronsById, pool).catch(() => 0),
			),
		);
		for (const c of counts) total += c;
	}
	return total;
}
