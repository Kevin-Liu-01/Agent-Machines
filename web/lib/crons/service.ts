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
import { cronIsDueSince } from "@/lib/cron/expr";

/** The "armed from" baseline: last successful run, else creation time. */
export function cronBaselineMs(cron: CronEntry): number | null {
	const last = cron.lastRunAt ? Date.parse(cron.lastRunAt) : NaN;
	if (Number.isFinite(last)) return last;
	const created = cron.createdAt ? Date.parse(cron.createdAt) : NaN;
	return Number.isFinite(created) ? created : null;
}

/** Enabled crons whose schedule became due at or before `nowMs`. */
export function listDueCrons(config: UserConfig, nowMs: number): CronEntry[] {
	return (config.crons ?? []).filter((cron) => {
		if (!cron.enabled) return false;
		const machine = config.machines.find((m) => m.id === cron.machineId);
		if (!machine || machine.archived) return false;
		return cronIsDueSince(cron.schedule, cronBaselineMs(cron), nowMs);
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
	opts: { wait?: boolean; userId?: string; scheduledFor?: Date } = {},
): Promise<CronRunResult> {
	const machine = resolveMachine(config, cron.machineId);
	if (!machine) {
		return { ok: false, status: "failed", message: "machine_not_found" };
	}
	if (!opts.userId) {
		return { ok: false, status: "failed", message: "user_id_required" };
	}
	try {
		const managed = await submitMachineIntent(opts.userId, machine.id, {
			desiredState: "running",
		});
		const operation = await managed.controlPlane.dispatchSchedule(
			managed.accepted.worker.id,
			cron.id,
			opts.scheduledFor ?? new Date(),
		);
		if (!opts.wait) {
			return { ok: true, status: "running", operationId: operation.id };
		}

		let terminal = operation;
		for (let step = 0; step < 8; step += 1) {
			if (terminal.status === "succeeded" || terminal.status === "failed") break;
			await managed.controlPlane.reconcileNext(managed.accepted.worker.id);
			terminal =
				(await managed.controlPlane.store.getOperation(operation.id)) ?? terminal;
		}
		if (terminal.status === "succeeded") {
			const result = (terminal.result ?? {}) as { text?: string; exitCode?: number };
			return {
				ok: true,
				status: "success",
				exitCode: result.exitCode ?? 0,
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
