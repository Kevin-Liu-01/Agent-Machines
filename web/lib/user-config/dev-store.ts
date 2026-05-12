/**
 * File-backed UserConfig store for local dev (no Clerk required).
 *
 * Mirrors the same `UserConfig` shape that `clerk.ts` returns, but
 * persists to `<repo>/web/.dev-user-config.json` instead of Clerk
 * metadata. The dashboard, chat, machine lifecycle, and config
 * mutations all see the same shape regardless of which store is in
 * play, so route handlers don't need to branch.
 *
 * On first read with no file yet, returns `getOwnerDefaults()` so the
 * project owner's env-driven seed (AGENT_API_URL, etc.) is the
 * starting point. The first write materializes the file; subsequent
 * runs reuse it.
 *
 * The dev file is gitignored. Do not check it in.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import {
	DEFAULT_USER_CONFIG,
	type AgentKind,
	type AgentProfile,
	type BootstrapPreset,
	type CustomLoadoutEntry,
	type EnvironmentProfile,
	type GatewayProfile,
	type LoadoutPreset,
	type LoadoutSource,
	type MachineRef,
	type MachineSpec,
	type AiProviderKeys,
	type ProviderCredentials,
	type ProviderKind,
	type SetupStep,
	type UserConfig,
} from "./schema";
import { getOwnerDefaults } from "./clerk";

// Lives next to the rest of the web app's working files. Gitignored
// via web/.gitignore so the user's local dev state doesn't get
// committed into the repo.
const DEV_STORE_PATH = path.join(process.cwd(), ".dev-user-config.json");

type ConfigPatch = {
	providers?: ProviderCredentials;
	aiProviderKeys?: AiProviderKeys;
	cursorApiKey?: string | null;
	gatewayProfiles?: GatewayProfile[];
	agentProfiles?: AgentProfile[];
	environmentProfiles?: EnvironmentProfile[];
	bootstrapPresets?: BootstrapPreset[];
	customLoadout?: CustomLoadoutEntry[];
	loadoutSources?: LoadoutSource[];
	loadoutPresets?: LoadoutPreset[];
	activeLoadoutPresetId?: string;
	setupStep?: SetupStep;
	draftAgentKind?: AgentKind;
	draftProviderKind?: ProviderKind;
	draftSpec?: MachineSpec;
	draftModel?: string;
	activeMachineId?: string | null;
	upsertMachine?: MachineRef;
	patchMachine?: { id: string; patch: Partial<MachineRef> };
	removeMachine?: string;
	archiveMachine?: string;
};

async function readDevStore(): Promise<UserConfig | null> {
	try {
		const raw = await fs.readFile(DEV_STORE_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<UserConfig>;
		// Coerce missing fields against the default shape so callers
		// always get a well-formed UserConfig even if the on-disk file
		// was written by an older code rev with fewer fields.
		const merged = { ...DEFAULT_USER_CONFIG, ...parsed };
		return {
			...merged,
			gatewayProfiles:
				merged.gatewayProfiles.length > 0
					? merged.gatewayProfiles
					: DEFAULT_USER_CONFIG.gatewayProfiles,
			agentProfiles:
				merged.agentProfiles.length > 0
					? merged.agentProfiles
					: DEFAULT_USER_CONFIG.agentProfiles,
			bootstrapPresets:
				merged.bootstrapPresets.length > 0
					? merged.bootstrapPresets
					: DEFAULT_USER_CONFIG.bootstrapPresets,
			loadoutSources:
				merged.loadoutSources.length > 0
					? merged.loadoutSources
					: DEFAULT_USER_CONFIG.loadoutSources,
			loadoutPresets:
				merged.loadoutPresets.length > 0
					? merged.loadoutPresets
					: DEFAULT_USER_CONFIG.loadoutPresets,
			activeLoadoutPresetId:
				merged.activeLoadoutPresetId ||
				DEFAULT_USER_CONFIG.activeLoadoutPresetId,
		};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw err;
	}
}

async function writeDevStore(config: UserConfig): Promise<void> {
	const tmp = `${DEV_STORE_PATH}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(config, null, 2), "utf8");
	await fs.rename(tmp, DEV_STORE_PATH);
}

/**
 * Read the dev user's config. On a fresh checkout with no file yet,
 * this returns the owner-env defaults (AGENT_API_URL etc.) so the
 * dashboard has something to talk to immediately, without writing
 * anything to disk.
 */
export async function getDevUserConfig(): Promise<UserConfig> {
	const stored = await readDevStore();
	if (stored) return stored;
	return getOwnerDefaults();
}

/**
 * Apply a config patch and persist. Same patch shape as the Clerk
 * `setUserConfigById`, so callers can stay store-agnostic.
 */
export async function setDevUserConfig(
	patch: ConfigPatch,
): Promise<UserConfig> {
	const current = await getDevUserConfig();

	const nextProviders: ProviderCredentials = { ...current.providers };
	if (patch.providers) {
		for (const kind of Object.keys(patch.providers) as ProviderKind[]) {
			const value = patch.providers[kind];
			if (value === undefined) continue;
			if (value === null) {
				delete nextProviders[kind];
			} else {
				nextProviders[kind] = value;
			}
		}
	}

	let nextMachines: MachineRef[] = [...current.machines];
	if (patch.upsertMachine) {
		const upsert = patch.upsertMachine;
		const idx = nextMachines.findIndex((m) => m.id === upsert.id);
		if (idx >= 0) nextMachines[idx] = upsert;
		else nextMachines = [upsert, ...nextMachines];
	}
	if (patch.patchMachine) {
		const { id, patch: mp } = patch.patchMachine;
		nextMachines = nextMachines.map((m) =>
			m.id === id ? { ...m, ...mp } : m,
		);
	}
	if (patch.removeMachine) {
		const id = patch.removeMachine;
		nextMachines = nextMachines.filter((m) => m.id !== id);
	}
	if (patch.archiveMachine) {
		const id = patch.archiveMachine;
		nextMachines = nextMachines.map((m) =>
			m.id === id ? { ...m, archived: true } : m,
		);
	}

	let nextActive = current.activeMachineId;
	if (patch.activeMachineId !== undefined) {
		nextActive = patch.activeMachineId;
	}
	if (
		nextActive &&
		!nextMachines.some((m) => m.id === nextActive && !m.archived)
	) {
		nextActive = nextMachines.find((m) => !m.archived)?.id ?? null;
	}
	if (!nextActive) {
		nextActive = nextMachines.find((m) => !m.archived)?.id ?? null;
	}

	const nextAiKeys = patch.aiProviderKeys
		? { ...current.aiProviderKeys, ...patch.aiProviderKeys }
		: current.aiProviderKeys;

	const next: UserConfig = {
		providers: nextProviders,
		aiProviderKeys: nextAiKeys,
		machines: nextMachines,
		activeMachineId: nextActive,
		cursorApiKey:
			patch.cursorApiKey !== undefined
				? patch.cursorApiKey
				: current.cursorApiKey,
		gatewayProfiles: patch.gatewayProfiles ?? current.gatewayProfiles,
		agentProfiles: patch.agentProfiles ?? current.agentProfiles,
		environmentProfiles:
			patch.environmentProfiles ?? current.environmentProfiles,
		bootstrapPresets: patch.bootstrapPresets ?? current.bootstrapPresets,
		customLoadout: patch.customLoadout ?? current.customLoadout,
		loadoutSources: patch.loadoutSources ?? current.loadoutSources,
		loadoutPresets: patch.loadoutPresets ?? current.loadoutPresets,
		activeLoadoutPresetId:
			patch.activeLoadoutPresetId ?? current.activeLoadoutPresetId,
		setupStep: patch.setupStep ?? current.setupStep,
		draftAgentKind: patch.draftAgentKind ?? current.draftAgentKind,
		draftProviderKind: patch.draftProviderKind ?? current.draftProviderKind,
		draftSpec: patch.draftSpec ?? current.draftSpec,
		draftModel: patch.draftModel ?? current.draftModel,
	};

	await writeDevStore(next);
	return next;
}
