/**
 * Turn an onboarding preset choice into the config mutation that seeds a new
 * user: import the preset's abilities into the account-global pool
 * (customLoadout), create a Memory shaped by the preset, and create a Worker
 * (bound to that Memory and the just-provisioned machine).
 *
 * "No preset" (preset === null) imports nothing and creates a Worker on the
 * default Memory (am-default, whose `*` abilities resolve to the empty pool).
 * Server-only: joins preset ids against the bundled catalogs for entry labels
 * and seeds the Memory with the default persona docs.
 */

import { slug } from "@/lib/dashboard/loadout";
import { listMcpServers } from "@/lib/dashboard/mcps";
import type { Preset } from "@/lib/dashboard/presets";
import { listSkills } from "@/lib/dashboard/skills";
import { defaultBundleDocs, newBundle } from "@/lib/memory/bundle";
import { newWorker } from "@/lib/workers/resolve";
import {
	DEFAULT_MEMORY_BUNDLE_ID,
	type AgentKind,
	type CustomLoadoutEntry,
	type MemoryBundle,
	type UserConfig,
	type Worker,
} from "@/lib/user-config/schema";

const WILDCARD = "*";

/** Preset skill/MCP ids -> imported-pool entries (joined to catalog metadata). */
export function presetToCustomLoadout(preset: Preset): CustomLoadoutEntry[] {
	const now = new Date().toISOString();
	const skillBySlug = new Map(listSkills().map((s) => [s.slug, s]));
	const mcpByName = new Map(listMcpServers().map((m) => [m.name, m]));
	const out: CustomLoadoutEntry[] = [];
	for (const skillSlug of preset.skillIds) {
		if (skillSlug === WILDCARD) continue;
		const meta = skillBySlug.get(skillSlug);
		out.push({
			id: `skill-${skillSlug}`,
			name: meta?.name ?? skillSlug,
			kind: "skill",
			description: meta?.description ?? "",
			command: null,
			enabled: true,
			createdAt: now,
			updatedAt: now,
		});
	}
	for (const name of preset.mcpServerIds) {
		if (name === WILDCARD) continue;
		const meta = mcpByName.get(name);
		out.push({
			id: `mcp-server-${slug(name)}`,
			name,
			kind: "mcp",
			description: meta ? `${meta.tools.length} tools` : "Imported MCP server",
			command: null,
			enabled: true,
			createdAt: now,
			updatedAt: now,
		});
	}
	return out;
}

export type PresetApplication = {
	customLoadout: CustomLoadoutEntry[];
	memoryBundles: MemoryBundle[];
	workers: Worker[];
	workerId: string;
	memoryBundleId: string;
};

export function applyPreset(input: {
	config: UserConfig;
	preset: Preset | null;
	agentKind: AgentKind;
	model: string;
	gatewayProfileId: string;
	machineId: string | null;
}): PresetApplication {
	const { config, preset, agentKind, model, gatewayProfileId, machineId } = input;

	// 1. Import the preset's abilities into the account-global pool (dedupe).
	const imports = preset ? presetToCustomLoadout(preset) : [];
	const existing = new Set(config.customLoadout.map((e) => e.id));
	const customLoadout = [
		...config.customLoadout,
		...imports.filter((e) => !existing.has(e.id)),
	];

	// 2. A Memory shaped by the preset (default persona docs + selected
	//    abilities). No preset -> use the default Memory (am-default).
	let memoryBundles = config.memoryBundles ?? [];
	let memoryBundleId = DEFAULT_MEMORY_BUNDLE_ID;
	if (preset) {
		const memory = newBundle({
			name: `${preset.name} memory`,
			description: preset.description,
			docs: defaultBundleDocs(),
			skillIds: preset.skillIds,
			toolIds: preset.toolIds,
			mcpServerIds: preset.mcpServerIds,
			source: "custom",
		});
		memoryBundles = [...memoryBundles, memory];
		memoryBundleId = memory.id;
	}

	// 3. A Worker on that Memory, linked to the provisioned machine.
	const worker = newWorker({
		name: preset ? preset.name : "Default worker",
		agentKind,
		model,
		gatewayProfileId,
		memoryBundleId,
		rolePrompt: preset?.rolePrompt ?? null,
		source: preset ? "custom" : "default",
		lastMachineId: machineId,
	});
	const workers = [...(config.workers ?? []), worker];

	return {
		customLoadout,
		memoryBundles,
		workers,
		workerId: worker.id,
		memoryBundleId,
	};
}
