/**
 * Worker resolution helpers. A Worker is the deployable preset (runtime +
 * model/router + Memory + role); a machine's Worker is found via the Worker's
 * reverse `lastMachineId` link (no per-machine column needed). When a machine
 * has no Worker (legacy machines, or provisioned outside onboarding), we
 * synthesize a default Worker bound to the default Memory so bootstrap always
 * has something coherent to install.
 */

import {
	DEFAULT_GATEWAY_PROFILE,
	DEFAULT_MEMORY_BUNDLE_ID,
	DEFAULT_MODEL,
	type AgentKind,
	type MachineRef,
	type UserConfig,
	type Worker,
	type WorkerSource,
} from "@/lib/user-config/schema";

const EPOCH = new Date(0).toISOString();

/** Create a new Worker. Shared by the worker API and the onboarding flow. */
export function newWorker(input: {
	name: string;
	agentKind: AgentKind;
	model?: string;
	gatewayProfileId?: string;
	memoryBundleId?: string;
	rolePrompt?: string | null;
	source?: WorkerSource;
	lastMachineId?: string | null;
}): Worker {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		name: input.name.trim() || "Untitled worker",
		source: input.source ?? "custom",
		agentKind: input.agentKind,
		model: input.model ?? DEFAULT_MODEL,
		gatewayProfileId: input.gatewayProfileId ?? DEFAULT_GATEWAY_PROFILE.id,
		memoryBundleId: input.memoryBundleId ?? DEFAULT_MEMORY_BUNDLE_ID,
		rolePrompt: input.rolePrompt ?? null,
		lastMachineId: input.lastMachineId ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

/** A synthesized default Worker bound to the default Memory bundle. */
export function defaultWorker(input: {
	agentKind: AgentKind;
	model?: string;
	gatewayProfileId?: string | null;
	memoryBundleId?: string;
}): Worker {
	return {
		id: `default-${input.agentKind}`,
		name: "Default worker",
		source: "default",
		agentKind: input.agentKind,
		model: input.model ?? DEFAULT_MODEL,
		gatewayProfileId: input.gatewayProfileId ?? DEFAULT_GATEWAY_PROFILE.id,
		memoryBundleId: input.memoryBundleId ?? DEFAULT_MEMORY_BUNDLE_ID,
		rolePrompt: null,
		lastMachineId: null,
		createdAt: EPOCH,
		updatedAt: EPOCH,
	};
}

/** The Worker deployed onto a machine, via the reverse lastMachineId link. */
export function workerForMachine(
	config: UserConfig,
	machineId: string,
): Worker | null {
	return (config.workers ?? []).find((w) => w.lastMachineId === machineId) ?? null;
}

/**
 * The Worker that governs a machine's loadout: its deployed Worker, or a
 * synthesized default that inherits the machine's runtime/model/router.
 */
export function resolveMachineWorker(config: UserConfig, machine: MachineRef): Worker {
	return (
		workerForMachine(config, machine.id) ??
		defaultWorker({
			agentKind: machine.agentKind,
			model: machine.model,
			gatewayProfileId: machine.gatewayProfileId,
		})
	);
}
