/**
 * Turn an onboarding (or worker-create) preset choice into the config mutation
 * that seeds a Worker. The bundled catalog is already the default pool, and a
 * curated preset has a synthesized Memory (`preset-memory:<id>`), so this just
 * creates a Worker bound to that Memory (or the Barebones memory for "no
 * preset") and links it to the just-provisioned machine.
 */

import type { Preset } from "@/lib/dashboard/presets";
import { runtimeModel } from "@/lib/agents/runtime-model";
import { newWorker } from "@/lib/workers/resolve";
import {
	BAREBONES_MEMORY_BUNDLE_ID,
	PRESET_MEMORY_PREFIX,
	type AgentKind,
	type UserConfig,
	type Worker,
} from "@/lib/user-config/schema";

export type PresetApplication = {
	workers: Worker[];
	workerId: string;
	memoryBundleId: string;
};

export function applyPreset(input: {
	workerId?: string;
	config: UserConfig;
	preset: Preset | null;
	agentKind: AgentKind;
	model: string;
	gatewayProfileId: string;
	machineId: string | null;
}): PresetApplication {
	const { config, preset, agentKind, model, gatewayProfileId, machineId } = input;
	const existing = input.workerId
		? config.workers.find((worker) => worker.id === input.workerId)
		: undefined;
	if (existing) {
		return { workers: config.workers, workerId: existing.id, memoryBundleId: existing.memoryBundleId };
	}

	// A curated preset -> its synthesized Memory; "no preset" -> Barebones.
	const memoryBundleId = preset
		? `${PRESET_MEMORY_PREFIX}${preset.id}`
		: BAREBONES_MEMORY_BUNDLE_ID;

	const worker = newWorker({
		name: preset ? preset.name : "Barebones worker",
		agentKind,
		model: runtimeModel(agentKind, model),
		gatewayProfileId,
		memoryBundleId,
		rolePrompt: preset?.rolePrompt ?? null,
		source: preset ? "custom" : "default",
		lastMachineId: machineId,
	});
	if (input.workerId) worker.id = input.workerId;

	return {
		workers: [...(config.workers ?? []), worker],
		workerId: worker.id,
		memoryBundleId,
	};
}
