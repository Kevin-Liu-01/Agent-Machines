import type {
	ApplyWorkerResult,
	WorkerDesiredState,
	WorkerSpec,
} from "agent-machines/control-plane";

import { createHostedControlPlane } from "./service";
import { getUserConfigById } from "@/lib/user-config/clerk";
import type { MachineRef } from "@/lib/user-config/schema";

export type ManagedMachineIntent = {
	desiredState?: WorkerDesiredState;
	spec?: Partial<WorkerSpec>;
	idempotencyKey?: string;
	forceBootstrap?: boolean;
	/** Absolute request deadline for bounded hosted Console execution. */
	executionDeadlineMs?: number;
};

/**
 * Resolve a legacy MachineRef to its declarative Worker, adopting the sandbox
 * in place when it predates control-plane v2. No provider side effect happens
 * until the returned journal operation is reconciled.
 */
export async function submitMachineIntent(
	userId: string,
	machineId: string,
	intent: ManagedMachineIntent,
): Promise<{
	controlPlane: ReturnType<typeof createHostedControlPlane>;
	machine: MachineRef;
	accepted: ApplyWorkerResult;
}> {
	const config = await getUserConfigById(userId);
	const machine = config.machines.find(
		(candidate) => candidate.id === machineId && !candidate.archived,
	);
	if (!machine) throw new Error(`machine ${machineId} does not exist`);
	const linkedWorker = config.workers.find(
		(candidate) => candidate.lastMachineId === machine.id,
	);
	const workerId = linkedWorker?.id ?? machine.id;
	const controlPlane = createHostedControlPlane(userId, null, {
		executionDeadlineMs: intent.executionDeadlineMs,
	});
	const existing = await controlPlane.store.getWorker(workerId);
	const schedules = (config.crons ?? [])
		.filter((cron) => cron.machineId === machine.id)
		.map((cron) => ({
			id: cron.id,
			schedule: cron.schedule,
			prompt: cron.prompt,
			enabled: cron.enabled,
		}));
	const spec: WorkerSpec = {
		name: linkedWorker?.name ?? machine.name,
		runtime: machine.agentKind,
		sandbox: machine.providerKind,
		model: linkedWorker?.model ?? machine.model,
		memoryBundleId: linkedWorker?.memoryBundleId,
		rolePrompt: linkedWorker?.rolePrompt,
		gatewayProfileId:
			linkedWorker?.gatewayProfileId ?? machine.gatewayProfileId,
		environmentProfileId: machine.environmentProfileId,
		resources: {
			vcpu: machine.spec.vcpu,
			memoryMib: machine.spec.memoryMib,
			diskGib: machine.spec.storageGib,
		},
		migrationPolicy: "live",
		...(existing?.spec ?? {}),
		// Schedules are owned by the per-user cron registry. Re-resolve them on
		// every adoption/apply so a newly-created cron is dispatchable even when
		// the Worker already has an older spec in the journal.
		schedules,
		...(intent.spec ?? {}),
	};
	const desiredState = intent.desiredState ?? existing?.desiredState ?? "running";
	const options = {
		idempotencyKey: intent.idempotencyKey,
		forceBootstrap: intent.forceBootstrap,
	};
	const accepted = existing
		? await controlPlane.apply(
				{ id: workerId, spec, desiredState },
				options,
			)
		: await controlPlane.adopt(
				{
					id: workerId,
					spec,
					desiredState,
					placement: {
						workerId,
						sandboxId: machine.id,
						sandbox: machine.providerKind,
						runtime: machine.agentKind,
					},
				},
				options,
			);
	return { controlPlane, machine, accepted };
}
