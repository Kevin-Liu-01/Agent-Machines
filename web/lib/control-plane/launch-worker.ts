/**
 * Hosted adapter for one declarative worker launch.
 *
 * The dashboard submits runtime + sandbox once. This module owns the legacy
 * Worker/MachineRef writes and bootstrap scheduling beneath that intent, so UI
 * surfaces no longer reproduce the lifecycle sequence themselves.
 */

import { after } from "next/server";

import { primeConsoleSession } from "@/lib/dashboard/terminal-session";
import { createMachineForConfig } from "@/lib/dashboard/provision";
import { scheduleWebBootstrap } from "@/lib/bootstrap/schedule-bootstrap";
import { getProvider } from "@/lib/providers";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import type {
	MachineSpec,
	ProviderKind,
	UserConfig,
	Worker,
} from "@/lib/user-config/schema";

export type HostedWorkerLaunch = {
	worker: Worker;
	machineId: string;
	providerKind: ProviderKind;
	phase: string;
	state: string;
	bootstrapScheduled: true;
};

export async function launchHostedWorker(
	config: UserConfig,
	worker: Worker,
	input: { providerKind: ProviderKind; spec: MachineSpec },
): Promise<HostedWorkerLaunch> {
	const created = await createMachineForConfig(config, {
		providerKind: input.providerKind,
		agentKind: worker.agentKind,
		spec: input.spec,
		model: worker.model,
		name: `${worker.name}-${worker.id.slice(-6)}`.slice(0, 80),
		gatewayProfileId: worker.gatewayProfileId,
	});

	const deployedAt = new Date().toISOString();
	const workers = (config.workers ?? []).map((candidate) =>
		candidate.id === worker.id
			? { ...candidate, lastMachineId: created.machineId, updatedAt: deployedAt }
			: candidate,
	);
	await setUserConfig({ workers });

	let latest = await getUserConfig();
	let machine = latest.machines.find((candidate) => candidate.id === created.machineId);
	if (!machine) throw new Error(`provisioned machine ${created.machineId} was not persisted`);
	const provider = getProvider(machine.providerKind, latest.providers);
	primeConsoleSession(provider, machine.id);

	await setUserConfig({
		patchMachine: {
			id: machine.id,
			patch: {
				bootstrapState: {
					...machine.bootstrapState,
					phase: "running",
					current: null,
					startedAt: machine.bootstrapState.startedAt ?? deployedAt,
					finishedAt: null,
					lastError: null,
				},
			},
		},
	});

	// Refresh after every durable write. The bootstrap resolves the Worker by
	// lastMachineId, so handing it the pre-deploy config would install the
	// default memory instead of the worker the operator just selected.
	latest = await getUserConfig();
	machine = latest.machines.find((candidate) => candidate.id === created.machineId);
	if (!machine) throw new Error(`machine ${created.machineId} disappeared before bootstrap`);
	const scheduledMachine = machine;
	const scheduledConfig = latest;
	after(() => scheduleWebBootstrap(scheduledMachine, provider, scheduledConfig));

	return {
		worker: workers.find((candidate) => candidate.id === worker.id) ?? worker,
		machineId: created.machineId,
		providerKind: input.providerKind,
		phase: created.phase,
		state: created.state,
		bootstrapScheduled: true,
	};
}
