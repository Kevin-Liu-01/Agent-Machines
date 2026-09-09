import type { ControlPlaneOperation } from "agent-machines/control-plane";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import type { CronEntry, CronStatus, UserConfig } from "@/lib/user-config/schema";

export type CronRunView = {
	operationId: string; scheduleId: string; workerId: string; status: CronStatus;
	createdAt: string; startedAt: string | null; finishedAt: string | null; scheduledFor: string | null;
	exitCode?: number; output: string; summary: string;
};

export function operationRun(operation: ControlPlaneOperation): CronRunView | null {
	if (operation.payload.type !== "run" || !operation.payload.scheduleId) return null;
	const result = (operation.result ?? {}) as { text?: string; exitCode?: number; events?: Array<{ type: string; isError?: boolean; message?: string; text?: string }> };
	const error = result.events?.find((event) => event.type === "error" || (event.type === "result" && event.isError));
	const pending = operation.status === "queued" || operation.status === "running";
	const status: CronStatus = pending ? "running" : operation.status === "succeeded" && result.exitCode === 0 && !error ? "success" : "failed";
	return {
		operationId: operation.id, scheduleId: operation.payload.scheduleId, workerId: operation.workerId, status,
		createdAt: operation.createdAt, startedAt: operation.startedAt ?? null, finishedAt: operation.finishedAt ?? null,
		scheduledFor: operation.payload.scheduledFor ?? null, exitCode: result.exitCode,
		output: typeof result.text === "string" ? result.text.slice(-4000) : "",
		summary: operation.error ?? error?.message ?? error?.text ?? (pending ? operation.status : status === "success" ? "Completed successfully" : `Run failed (exit ${result.exitCode ?? "unknown"})`),
	};
}

/** Derive current status from the journal rather than stale dispatch metadata. */
export async function cronRunHistory(config: UserConfig, userId: string): Promise<{ crons: CronEntry[]; runs: CronRunView[] }> {
	const operations = await createHostedControlPlane(userId).store.listOperations();
	const runs = operations.flatMap((operation) => {
		const run = operationRun(operation);
		return run ? [run] : [];
	}).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.operationId.localeCompare(a.operationId));
	const latest = new Map<string, CronRunView>();
	for (const run of runs) if (!latest.has(run.scheduleId)) latest.set(run.scheduleId, run);
	return {
		crons: (config.crons ?? []).map((cron) => {
			const run = latest.get(cron.id);
			return run ? { ...cron, lastRunAt: run.startedAt ?? run.createdAt, lastStatus: run.status, lastSummary: run.summary } : cron;
		}),
		runs: runs.slice(0, 100),
	};
}
