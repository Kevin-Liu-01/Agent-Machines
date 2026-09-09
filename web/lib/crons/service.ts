/**
 * Server-side cron execution.
 *
 * Crons are stored per-user in config (`config.crons`). The scheduler tick
 * (`/api/internal/cron/tick`) and the "run now" route both run a cron by
 * enqueueing an idempotent Worker run. The control plane wakes cold machines,
 * executes the configured harness, and persists terminal operation state.
 *
 * The hosted runtime driver also appends a JSON line to
 * `~/.agent-machines/cron/runs.jsonl` on the box, so the machine keeps an
 * authoritative run log independent of the dashboard.
 */

import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { resolveMachine } from "@/lib/dashboard/exec";
import type {
	CronEntry,
	CronStatus,
	UserConfig,
} from "@/lib/user-config/schema";
import { cronDueMinuteSince } from "@/lib/cron/expr";
import { operationRun } from "./history";
export { cronRunHistory } from "./history";

/** The "armed from" baseline: last successful run, else creation time. */
export function cronBaselineMs(cron: CronEntry): number | null {
	const last = cron.lastRunAt ? Date.parse(cron.lastRunAt) : NaN;
	if (Number.isFinite(last)) return last;
	const created = cron.createdAt ? Date.parse(cron.createdAt) : NaN;
	return Number.isFinite(created) ? created : null;
}

/** Enabled crons whose schedule became due at or before `nowMs`. */
export function listDueCrons(config: UserConfig, nowMs: number): CronEntry[] {
	return dueCronOccurrences(config, nowMs).map(({ cron }) => cron);
}

export function dueCronOccurrences(config: UserConfig, nowMs: number): Array<{ cron: CronEntry; scheduledFor: Date }> {
	return (config.crons ?? []).flatMap((cron) => {
		if (!cron.enabled) return [];
		const machine = config.machines.find((m) => m.id === cron.machineId);
		if (!machine || machine.archived) return [];
		const dueAt = cronDueMinuteSince(cron.schedule, cronBaselineMs(cron), nowMs);
		return dueAt === null ? [] : [{ cron, scheduledFor: new Date(dueAt) }];
	});
}

export type CronRunResult = {
	ok: boolean;
	status: CronStatus;
	exitCode?: number;
	output?: string;
	message?: string;
	operationId?: string;
};

/**
 * Run a cron on its bound machine. With `wait`, blocks for the agent and
 * reports the real exit status; otherwise dispatches in the background and
 * reports "running" (the scheduler uses this so a slow agent never stalls
 * the tick).
 */
export async function runCronOnMachine(
	config: UserConfig,
	cron: CronEntry,
	opts: { wait?: boolean; userId?: string; scheduledFor?: Date; executionDeadlineMs?: number } = {},
): Promise<CronRunResult> {
	const machine = resolveMachine(config, cron.machineId);
	if (!machine || machine.archived) {
		return { ok: false, status: "failed", message: "machine_not_found" };
	}
	if (!opts.userId) {
		return { ok: false, status: "failed", message: "user_id_required" };
	}
	try {
		const managed = await submitMachineIntent(opts.userId, machine.id, {
			desiredState: "running",
			...(opts.executionDeadlineMs ? { executionDeadlineMs: opts.executionDeadlineMs } : {}),
		});
		const operation = await managed.controlPlane.dispatchSchedule(
			managed.accepted.worker.id,
			cron.id,
			opts.scheduledFor ?? new Date(),
		);
		if (!opts.wait) {
			const run = operationRun(operation);
			return { ok: operation.status !== "failed", status: run?.status ?? "running", operationId: operation.id, message: run?.summary };
		}

		let terminal = operation;
		for (let step = 0; step < 8; step += 1) {
			if (terminal.status === "succeeded" || terminal.status === "failed") break;
			if (opts.executionDeadlineMs && Date.now() >= opts.executionDeadlineMs - 30_000) break;
			const outcome = await managed.controlPlane.reconcileNext(managed.accepted.worker.id);
			terminal =
				(await managed.controlPlane.store.getOperation(operation.id)) ?? terminal;
			if (!outcome) break;
		}
		if (terminal.status === "succeeded") {
			const result = (terminal.result ?? {}) as { text?: string; exitCode?: number };
			return {
				ok: operationRun(terminal)?.status === "success",
				status: operationRun(terminal)?.status ?? "failed",
				exitCode: result.exitCode,
				output: result.text ?? "",
				operationId: operation.id,
			};
		}
		return {
			ok: false,
			status: terminal.status === "failed" ? "failed" : "running",
			message: terminal.error ?? "operation_pending",
			operationId: operation.id,
		};
	} catch (error) {
		return {
			ok: false,
			status: "failed",
			message: error instanceof Error ? error.message : "dispatch_failed",
		};
	}
}
