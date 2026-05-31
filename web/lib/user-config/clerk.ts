/**
 * Clerk-backed user config store with multi-provider, multi-machine support.
 *
 * Layout:
 *   publicMetadata.providers   -- { dedalus: { configured }, ... } (no secrets)
 *   publicMetadata.machines    -- MachineRef[] minus apiKey
 *   publicMetadata.activeMachineId
 *   publicMetadata.setupStep
 *   publicMetadata.draft*      -- wizard scratch
 *   privateMetadata.providers  -- ProviderCredentials with API keys
 *   privateMetadata.machineApiKeys -- Record<machineId, gateway bearer>
 *   privateMetadata.cursorApiKey
 *
 * Splitting machine bearer tokens out of `MachineRef` and into a sibling
 * private map keeps publicMetadata lean (Clerk caps each metadata field
 * at 8KB) while still letting server code call `getUserConfig()` and
 * receive a fully-populated config in one round-trip.
 *
 * Backward-compat: legacy single-machine configs (`dedalusApiKey`,
 * `machineId`, `apiUrl`, `apiKey`) are migrated on first read into the
 * new shape and persisted back, so deployed users keep their state.
 */

import { clerkClient } from "@clerk/nextjs/server";

import { listMachines, seedMachinesFromClerk, upsertMachine, patchMachine as sbPatchMachine, archiveMachine as sbArchiveMachine, deleteMachine as sbDeleteMachine } from "@/lib/supabase/machines";
import { ensureUser, getUserConfig as sbGetUserConfig, updateUserConfigColumns, type UserRow } from "@/lib/supabase/users";

import { getDevUserConfig, setDevUserConfig } from "./dev-store";
import { getEffectiveUserId, isDevUserId } from "./identity";
import {
	BOOTSTRAP_PHASES,
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MODEL,
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	activeMachine,
	AGENT_KINDS,
	type AgentKind,
	type AgentProfile,
	type BootstrapPreset,
	type BootstrapPhaseId,
	type BootstrapState,
	type CronEntry,
	type CronStatus,
	type EnvironmentProfile,
	type GatewayKind,
	type GatewayProfile,
	type CustomLoadoutEntry,
	type CustomLoadoutKind,
	type LoadoutPreset,
	type LoadoutSource,
	type LoadoutSourceKind,
	type MachineRef,
	type MachineSpec,
	type AiProviderKeys,
	type ProviderCredentials,
	type ProviderKind,
	type SetupStep,
	type UserConfig,
} from "./schema";

const KNOWN_AGENTS: ReadonlySet<AgentKind> = new Set(AGENT_KINDS);
const KNOWN_PROVIDERS: ReadonlySet<ProviderKind> = new Set([
	"dedalus",
	"sprites",
	"e2b",
	"vercel",
]);
const KNOWN_GATEWAYS: ReadonlySet<GatewayKind> = new Set([
	"dedalus",
	"vercel-ai-gateway",
	"openai-compatible",
]);
const KNOWN_LOADOUT: ReadonlySet<CustomLoadoutKind> = new Set([
	"skill",
	"tool",
	"mcp",
	"cli",
	"plugin",
]);
const KNOWN_LOADOUT_SOURCES: ReadonlySet<LoadoutSourceKind> = new Set([
	"bundled",
	"github",
	"git",
	"wiki",
	"url",
	"mcp",
	"cli",
	"npm",
	"manual",
]);
const KNOWN_STEPS: ReadonlySet<SetupStep> = new Set([
	"api-key",
	"agent",
	"provider",
	"spec",
	"review",
	"provisioned",
]);
const KNOWN_PHASES: ReadonlySet<BootstrapPhaseId> = new Set(BOOTSTRAP_PHASES);

function asString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	return undefined;
}

function asAgent(value: unknown, fallback: AgentKind = "hermes"): AgentKind {
	const v = asString(value);
	return v && KNOWN_AGENTS.has(v as AgentKind) ? (v as AgentKind) : fallback;
}

function asProvider(value: unknown, fallback: ProviderKind = "dedalus"): ProviderKind {
	const v = asString(value);
	return v && KNOWN_PROVIDERS.has(v as ProviderKind)
		? (v as ProviderKind)
		: fallback;
}

function asGateway(value: unknown, fallback: GatewayKind = "dedalus"): GatewayKind {
	const v = asString(value);
	return v && KNOWN_GATEWAYS.has(v as GatewayKind)
		? (v as GatewayKind)
		: fallback;
}

function asStep(value: unknown): SetupStep {
	const v = asString(value);
	return v && KNOWN_STEPS.has(v as SetupStep) ? (v as SetupStep) : "api-key";
}

function asSpec(value: unknown): MachineSpec {
	if (!value || typeof value !== "object") return DEFAULT_MACHINE_SPEC;
	const v = value as Record<string, unknown>;
	const vcpu = Number(v.vcpu);
	const mem = Number(v.memoryMib);
	const stor = Number(v.storageGib);
	return {
		vcpu: Number.isFinite(vcpu) && vcpu > 0 ? vcpu : DEFAULT_MACHINE_SPEC.vcpu,
		memoryMib:
			Number.isFinite(mem) && mem > 0 ? mem : DEFAULT_MACHINE_SPEC.memoryMib,
		storageGib:
			Number.isFinite(stor) && stor > 0 ? stor : DEFAULT_MACHINE_SPEC.storageGib,
	};
}

function asBootstrapState(value: unknown): BootstrapState {
	if (!value || typeof value !== "object") return INITIAL_BOOTSTRAP_STATE;
	const raw = value as Record<string, unknown>;
	const phase = asString(raw.phase);
	const allowed = new Set(["idle", "running", "succeeded", "failed"]);
	const completed: BootstrapPhaseId[] = Array.isArray(raw.completed)
		? raw.completed
				.map((entry) => asString(entry))
				.filter(
					(entry): entry is BootstrapPhaseId =>
						typeof entry === "string" &&
						KNOWN_PHASES.has(entry as BootstrapPhaseId),
				)
		: [];
	const currentRaw = asString(raw.current);
	const current =
		currentRaw && KNOWN_PHASES.has(currentRaw as BootstrapPhaseId)
			? (currentRaw as BootstrapPhaseId)
			: null;
	return {
		phase: allowed.has(phase ?? "")
			? (phase as BootstrapState["phase"])
			: "idle",
		current,
		completed,
		startedAt: asString(raw.startedAt) ?? null,
		finishedAt: asString(raw.finishedAt) ?? null,
		lastError: asString(raw.lastError) ?? null,
	};
}

function asMachineRefShallow(value: unknown): Omit<MachineRef, "apiKey"> | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	return {
		id,
		providerKind: asProvider(v.providerKind),
		agentKind: asAgent(v.agentKind),
		name: asString(v.name) ?? id.slice(0, 12),
		spec: asSpec(v.spec),
		model: asString(v.model) ?? DEFAULT_MODEL,
		agentProfileId: asString(v.agentProfileId) ?? null,
		gatewayProfileId: asString(v.gatewayProfileId) ?? null,
		environmentProfileId: asString(v.environmentProfileId) ?? null,
		bootstrapPresetId: asString(v.bootstrapPresetId) ?? null,
		createdAt: asString(v.createdAt) ?? new Date().toISOString(),
		apiUrl: asString(v.apiUrl) ?? null,
		bootstrapState: asBootstrapState(v.bootstrapState),
		archived: v.archived === true,
	};
}

type RawPublic = Record<string, unknown>;
type RawPrivate = Record<string, unknown>;

function readEnvProviderCreds(): ProviderCredentials {
	const out: ProviderCredentials = {};
	const dedalusKey = process.env.DEDALUS_API_KEY?.trim();
	const dedalusBaseUrl = process.env.DEDALUS_BASE_URL?.trim();
	if (dedalusKey) {
		out.dedalus = {
			apiKey: dedalusKey,
			baseUrl: dedalusBaseUrl,
		};
	}
	const vercelToken = process.env.VERCEL_TOKEN?.trim();
	const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim();
	const vercelProjectId = process.env.VERCEL_PROJECT_ID?.trim();
	if (vercelToken && vercelTeamId && vercelProjectId) {
		out.vercel = {
			token: vercelToken,
			teamId: vercelTeamId,
			projectId: vercelProjectId,
		};
	}
	return out;
}

function envFallbackMachine(): MachineRef | null {
	const machineId = (process.env.AGENT_MACHINE_ID ?? process.env.HERMES_MACHINE_ID)?.trim();
	const apiUrl = (process.env.AGENT_API_URL ?? process.env.HERMES_API_URL)?.trim() ?? null;
	const apiKey = (process.env.AGENT_API_KEY ?? process.env.HERMES_API_KEY)?.trim() ?? null;
	const model = (process.env.AGENT_MODEL ?? process.env.HERMES_MODEL)?.trim() || DEFAULT_MODEL;
	if (!machineId) return null;
	const vcpu = Number(process.env.AGENT_VCPU ?? process.env.HERMES_VCPU);
	const mem = Number(process.env.AGENT_MEMORY_MIB ?? process.env.HERMES_MEMORY_MIB);
	const stor = Number(process.env.AGENT_STORAGE_GIB ?? process.env.HERMES_STORAGE_GIB);
	return {
		id: machineId,
		providerKind: "dedalus",
		agentKind: "hermes",
		name: "owner-default",
		spec: {
			vcpu: Number.isFinite(vcpu) && vcpu > 0 ? vcpu : DEFAULT_MACHINE_SPEC.vcpu,
			memoryMib:
				Number.isFinite(mem) && mem > 0 ? mem : DEFAULT_MACHINE_SPEC.memoryMib,
			storageGib:
				Number.isFinite(stor) && stor > 0
					? stor
					: DEFAULT_MACHINE_SPEC.storageGib,
		},
		model,
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: new Date(0).toISOString(),
		apiUrl,
		apiKey,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
	};
}

function defaultDedalusGatewayProfile(): GatewayProfile {
	const now = new Date().toISOString();
	return {
		id: "dedalus-default",
		name: "Dedalus default",
		kind: "dedalus",
		model: DEFAULT_MODEL,
		baseUrl: "https://api.dedaluslabs.ai/v1",
		apiKey: null,
		createdAt: now,
		updatedAt: now,
	};
}

function defaultAgentProfile(agentKind: AgentKind): AgentProfile {
	const now = new Date().toISOString();
	const titles: Record<AgentKind, string> = {
		hermes: "Hermes default",
		openclaw: "OpenClaw default",
		"claude-code": "Claude Code default",
		codex: "Codex CLI default",
	};
	return {
		id: `${agentKind}-default`,
		name: titles[agentKind],
		agentKind,
		gatewayProfileId: "dedalus-default",
		model: DEFAULT_MODEL,
		enabledSkills: [],
		enabledTools: [],
		enabledMcpServers: [],
		environmentProfileId: null,
		createdAt: now,
		updatedAt: now,
	};
}

function defaultBootstrapPreset(): BootstrapPreset {
	return defaultBootstrapPresetFor("hermes");
}

function defaultBootstrapPresetFor(agentKind: AgentKind): BootstrapPreset {
	const now = new Date().toISOString();
	const titles: Record<AgentKind, string> = {
		hermes: "Hermes",
		openclaw: "OpenClaw",
		"claude-code": "Claude Code",
		codex: "Codex CLI",
	};
	return {
		id: `dedalus-${agentKind}-default`,
		name: `Dedalus + ${titles[agentKind]}`,
		providerKind: "dedalus",
		agentProfileId: `${agentKind}-default`,
		environmentProfileId: null,
		spec: DEFAULT_MACHINE_SPEC,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Construct a `UserConfig` from the raw Clerk metadata payload.
 *
 * Migrates legacy fields (`dedalusApiKey`, single `machineId`, etc.)
 * into the new shape so old users don't lose state. Migration is read-
 * only here -- callers can persist back via `setUserConfig` if they
 * want to harden the migration on disk.
 */
const CRON_STATUSES: ReadonlyArray<CronStatus> = ["success", "failed", "running"];

function asCronEntry(value: unknown): CronEntry | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	const schedule = asString(v.schedule);
	const machineId = asString(v.machineId);
	if (!id || !schedule || !machineId) return null;
	const status = asString(v.lastStatus) as CronStatus | undefined;
	return {
		id,
		name: asString(v.name) ?? id,
		schedule,
		prompt: asString(v.prompt) ?? "",
		machineId,
		skills: Array.isArray(v.skills)
			? v.skills.filter((s): s is string => typeof s === "string")
			: [],
		enabled: v.enabled !== false,
		createdAt: asString(v.createdAt) ?? new Date(0).toISOString(),
		lastRunAt: asString(v.lastRunAt) ?? null,
		lastStatus: status && CRON_STATUSES.includes(status) ? status : null,
		lastSummary: asString(v.lastSummary) ?? null,
	};
}

function asCronEntries(value: unknown): CronEntry[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => asCronEntry(entry))
		.filter((entry): entry is CronEntry => entry !== null);
}

function buildConfig(publicMeta: RawPublic, privateMeta: RawPrivate): UserConfig {
	const providers: ProviderCredentials = {};
	const privateProviders =
		(privateMeta.providers as ProviderCredentials | undefined) ?? {};
	if (privateProviders.dedalus?.apiKey) {
		providers.dedalus = {
			apiKey: privateProviders.dedalus.apiKey,
			baseUrl: privateProviders.dedalus.baseUrl,
		};
	}
	if (privateProviders.sprites?.apiKey) {
		providers.sprites = { apiKey: privateProviders.sprites.apiKey };
	}
	if (privateProviders.e2b?.apiKey) {
		providers.e2b = { apiKey: privateProviders.e2b.apiKey };
	}
	if (privateProviders.vercel?.token) {
		providers.vercel = {
			token: privateProviders.vercel.token,
			teamId: privateProviders.vercel.teamId,
			projectId: privateProviders.vercel.projectId,
		};
	}
	// Legacy single-key field.
	const legacyDedalusKey = asString(privateMeta.dedalusApiKey);
	if (legacyDedalusKey && !providers.dedalus) {
		providers.dedalus = { apiKey: legacyDedalusKey };
	}
	// Owner env fallback (project owner who hasn't typed in the wizard).
	const envCreds = readEnvProviderCreds();
	if (!providers.dedalus && envCreds.dedalus) {
		providers.dedalus = envCreds.dedalus;
	}
	if (!providers.vercel && envCreds.vercel) {
		providers.vercel = envCreds.vercel;
	}
	const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
	if (!providers.vercel && oidcToken) {
		const teamId = process.env.VERCEL_TEAM_ID?.trim();
		const projectId = process.env.VERCEL_PROJECT_ID?.trim();
		if (teamId && projectId) {
			providers.vercel = { token: oidcToken, teamId, projectId };
		}
	}

	const machineApiKeys =
		(privateMeta.machineApiKeys as Record<string, string> | undefined) ?? {};

	const rawMachines = Array.isArray(publicMeta.machines) ? publicMeta.machines : [];
	const machines: MachineRef[] = rawMachines
		.map((entry) => asMachineRefShallow(entry))
		.filter((entry): entry is Omit<MachineRef, "apiKey"> => entry !== null)
		.map((entry) => ({
			...entry,
			apiKey: machineApiKeys[entry.id] ?? null,
		}));

	// Legacy single-machine fields -- migrate into machines[].
	const legacyMachineId = asString(publicMeta.machineId);
	if (legacyMachineId && !machines.some((m) => m.id === legacyMachineId)) {
		const legacyApiUrl = asString(publicMeta.apiUrl) ?? null;
		const legacyApiKey =
			asString(privateMeta.apiKey) ?? machineApiKeys[legacyMachineId] ?? null;
		const legacyModel = asString(publicMeta.model) ?? DEFAULT_MODEL;
		const legacySpec = asSpec(publicMeta.machineSpec);
		const legacyAgent = asAgent(publicMeta.agentKind);
		const legacyProvider = asProvider(publicMeta.providerKind);
		machines.push({
			id: legacyMachineId,
			providerKind: legacyProvider,
			agentKind: legacyAgent,
			name: `${legacyAgent} (legacy)`,
			spec: legacySpec,
			model: legacyModel,
			agentProfileId: null,
			gatewayProfileId: null,
			environmentProfileId: null,
			bootstrapPresetId: null,
			createdAt: new Date(0).toISOString(),
			apiUrl: legacyApiUrl,
			apiKey: legacyApiKey,
			bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
		});
	}

	// Owner env fallback as a virtual machine if user has none yet.
	if (machines.length === 0) {
		const envMachine = envFallbackMachine();
		if (envMachine) machines.push(envMachine);
	}

	const gatewayApiKeys =
		(privateMeta.gatewayApiKeys as Record<string, string> | undefined) ?? {};
	const gatewayProfiles = Array.isArray(publicMeta.gatewayProfiles)
		? publicMeta.gatewayProfiles
				.map((entry) => asGatewayProfile(entry, gatewayApiKeys))
				.filter((entry): entry is GatewayProfile => entry !== null)
		: [];
	if (gatewayProfiles.length === 0 && providers.dedalus?.apiKey) {
		gatewayProfiles.push(defaultDedalusGatewayProfile());
	}

	const environmentProfileVars =
		(privateMeta.environmentProfileVars as
			| Record<string, Record<string, string>>
			| undefined) ?? {};
	const environmentProfiles = Array.isArray(publicMeta.environmentProfiles)
		? publicMeta.environmentProfiles
				.map((entry) => asEnvironmentProfile(entry, environmentProfileVars))
				.filter((entry): entry is EnvironmentProfile => entry !== null)
		: [];

	const agentProfiles = Array.isArray(publicMeta.agentProfiles)
		? publicMeta.agentProfiles
				.map((entry) => asAgentProfile(entry))
				.filter((entry): entry is AgentProfile => entry !== null)
		: [];
	if (agentProfiles.length === 0) {
		for (const kind of AGENT_KINDS) {
			agentProfiles.push(defaultAgentProfile(kind));
		}
	}

	const bootstrapPresets = Array.isArray(publicMeta.bootstrapPresets)
		? publicMeta.bootstrapPresets
				.map((entry) => asBootstrapPreset(entry))
				.filter((entry): entry is BootstrapPreset => entry !== null)
		: [];
	if (bootstrapPresets.length === 0) {
		for (const kind of AGENT_KINDS) {
			bootstrapPresets.push(defaultBootstrapPresetFor(kind));
		}
	}
	const customLoadout = Array.isArray(publicMeta.customLoadout)
		? publicMeta.customLoadout
				.map((entry) => asCustomLoadoutEntry(entry))
				.filter((entry): entry is CustomLoadoutEntry => entry !== null)
		: [];
	const loadoutSources = Array.isArray(publicMeta.loadoutSources)
		? publicMeta.loadoutSources
				.map((entry) => asLoadoutSource(entry))
				.filter((entry): entry is LoadoutSource => entry !== null)
		: [];
	if (loadoutSources.length === 0) {
		loadoutSources.push(...DEFAULT_USER_CONFIG.loadoutSources);
	}
	const loadoutPresets = Array.isArray(publicMeta.loadoutPresets)
		? publicMeta.loadoutPresets
				.map((entry) => asLoadoutPreset(entry))
				.filter((entry): entry is LoadoutPreset => entry !== null)
		: [];
	if (loadoutPresets.length === 0) {
		loadoutPresets.push(...DEFAULT_USER_CONFIG.loadoutPresets);
	}
	const activeLoadoutPresetId =
		asString(publicMeta.activeLoadoutPresetId) ??
		loadoutPresets[0]?.id ??
		DEFAULT_USER_CONFIG.activeLoadoutPresetId;

	const activeFromMeta = asString(publicMeta.activeMachineId);
	const activeMachineId = (() => {
		if (activeFromMeta && machines.some((m) => m.id === activeFromMeta)) {
			return activeFromMeta;
		}
		const live = machines.find((m) => !m.archived);
		return live?.id ?? machines[0]?.id ?? null;
	})();

	const cursorApiKey =
		asString(privateMeta.cursorApiKey) ??
		process.env.CURSOR_API_KEY?.trim() ??
		null;

	const aiProviderKeys: AiProviderKeys = (privateMeta.aiProviderKeys as AiProviderKeys) ?? {};

	const cloudflareTunnelToken =
		asString(privateMeta.cloudflareTunnelToken) ??
		process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim() ??
		null;

	return {
		providers,
		aiProviderKeys,
		machines,
		crons: asCronEntries(privateMeta.crons),
		activeMachineId,
		cursorApiKey,
		cloudflareTunnelToken,
		gatewayProfiles,
		agentProfiles,
		environmentProfiles,
		bootstrapPresets,
		customLoadout,
		loadoutSources,
		loadoutPresets,
		activeLoadoutPresetId,
		setupStep: asStep(publicMeta.setupStep),
		draftAgentKind: asAgent(
			publicMeta.draftAgentKind ?? publicMeta.agentKind,
		),
		draftProviderKind: asProvider(
			publicMeta.draftProviderKind ?? publicMeta.providerKind,
		),
		draftSpec: asSpec(publicMeta.draftSpec ?? publicMeta.machineSpec),
		draftModel: asString(publicMeta.draftModel ?? publicMeta.model) ?? DEFAULT_MODEL,
	};
}

/**
 * Defaults exposed to the wizard's first-mount hydration. Shows the
 * project owner's env-derived seed values when present, so the owner
 * doesn't have to retype keys they already wired into Vercel.
 */
export function getOwnerDefaults(): UserConfig {
	return {
		...DEFAULT_USER_CONFIG,
		providers: readEnvProviderCreds(),
		machines: (() => {
			const env = envFallbackMachine();
			return env ? [env] : [];
		})(),
	};
}

export async function getUserConfig(): Promise<UserConfig> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		throw new Error("getUserConfig called without an authenticated user");
	}
	return getUserConfigById(userId);
}

/**
 * Build a UserConfig by merging Supabase config columns with Clerk secrets.
 * If the Supabase row has non-empty config arrays we use those; otherwise
 * we fall back to Clerk publicMetadata (first-read backward compat).
 */
function buildConfigFromSupabase(
	sbRow: UserRow,
	privateMeta: RawPrivate,
	publicMeta: RawPublic,
): UserConfig {
	const base = buildConfig(publicMeta, privateMeta);

	const gatewayApiKeys =
		(privateMeta.gatewayApiKeys as Record<string, string> | undefined) ?? {};
	const environmentProfileVars =
		(privateMeta.environmentProfileVars as
			| Record<string, Record<string, string>>
			| undefined) ?? {};

	const hasSupabaseConfig =
		(Array.isArray(sbRow.agent_profiles) && sbRow.agent_profiles.length > 0) ||
		(Array.isArray(sbRow.gateway_profiles) && sbRow.gateway_profiles.length > 0) ||
		(Array.isArray(sbRow.loadout_presets) && sbRow.loadout_presets.length > 0);

	if (hasSupabaseConfig) {
		const sbAgentProfiles = Array.isArray(sbRow.agent_profiles)
			? sbRow.agent_profiles
					.map((entry) => asAgentProfile(entry))
					.filter((entry): entry is AgentProfile => entry !== null)
			: [];
		const sbGatewayProfiles = Array.isArray(sbRow.gateway_profiles)
			? sbRow.gateway_profiles
					.map((entry) => asGatewayProfile(entry, gatewayApiKeys))
					.filter((entry): entry is GatewayProfile => entry !== null)
			: [];
		const sbEnvironmentProfiles = Array.isArray(sbRow.environment_profiles)
			? sbRow.environment_profiles
					.map((entry) => asEnvironmentProfile(entry, environmentProfileVars))
					.filter((entry): entry is EnvironmentProfile => entry !== null)
			: [];
		const sbBootstrapPresets = Array.isArray(sbRow.bootstrap_presets)
			? sbRow.bootstrap_presets
					.map((entry) => asBootstrapPreset(entry))
					.filter((entry): entry is BootstrapPreset => entry !== null)
			: [];
		const sbCustomLoadout = Array.isArray(sbRow.custom_loadout)
			? sbRow.custom_loadout
					.map((entry) => asCustomLoadoutEntry(entry))
					.filter((entry): entry is CustomLoadoutEntry => entry !== null)
			: [];
		const sbLoadoutSources = Array.isArray(sbRow.loadout_sources)
			? sbRow.loadout_sources
					.map((entry) => asLoadoutSource(entry))
					.filter((entry): entry is LoadoutSource => entry !== null)
			: [];
		const sbLoadoutPresets = Array.isArray(sbRow.loadout_presets)
			? sbRow.loadout_presets
					.map((entry) => asLoadoutPreset(entry))
					.filter((entry): entry is LoadoutPreset => entry !== null)
			: [];

		if (sbAgentProfiles.length > 0) base.agentProfiles = sbAgentProfiles;
		if (sbGatewayProfiles.length > 0) base.gatewayProfiles = sbGatewayProfiles;
		if (sbEnvironmentProfiles.length > 0) base.environmentProfiles = sbEnvironmentProfiles;
		if (sbBootstrapPresets.length > 0) base.bootstrapPresets = sbBootstrapPresets;
		if (sbCustomLoadout.length > 0) base.customLoadout = sbCustomLoadout;
		if (sbLoadoutSources.length > 0) base.loadoutSources = sbLoadoutSources;
		if (sbLoadoutPresets.length > 0) base.loadoutPresets = sbLoadoutPresets;

		base.activeLoadoutPresetId =
			sbRow.active_loadout_preset_id ??
			base.loadoutPresets[0]?.id ??
			DEFAULT_USER_CONFIG.activeLoadoutPresetId;
	}

	return base;
}

export async function getUserConfigById(userId: string): Promise<UserConfig> {
	if (isDevUserId(userId)) return getDevUserConfig();
	const client = await clerkClient();
	const user = await client.users.getUser(userId);
	const publicMeta = (user.publicMetadata ?? {}) as RawPublic;
	const privateMeta = (user.privateMetadata ?? {}) as RawPrivate;

	if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
		return buildConfig(publicMeta, privateMeta);
	}

	try {
		const sbUser = await ensureUser(userId, user.emailAddresses?.[0]?.emailAddress);
		const config = buildConfigFromSupabase(sbUser, privateMeta, publicMeta);

		const machineApiKeys =
			(privateMeta.machineApiKeys as Record<string, string> | undefined) ?? {};
		const sbMachines = await listMachines(userId);

		if (sbMachines.length > 0) {
			config.machines = sbMachines.map((m) => ({
				...m,
				apiKey: m.apiKey ?? machineApiKeys[m.id] ?? null,
			}));
			// Re-validate activeMachineId against the Supabase machines list.
			// The initial validation in buildConfig used Clerk's stale machines
			// array which may not include newly provisioned machines.
			if (config.activeMachineId && !config.machines.some((m) => m.id === config.activeMachineId)) {
				const live = config.machines.find((m) => !m.archived);
				config.activeMachineId = live?.id ?? null;
			}
			if (!config.activeMachineId) {
				const live = config.machines.find((m) => !m.archived);
				config.activeMachineId = live?.id ?? null;
			}
		} else if (config.machines.length > 0) {
			await seedMachinesFromClerk(userId, config.machines);
		}

		config.metricsEnabled = true;
		return config;
	} catch {
		return buildConfig(publicMeta, privateMeta);
	}
}

/* ------------------------------------------------------------------ */
/* Mutators                                                           */
/* ------------------------------------------------------------------ */

type ConfigPatch = {
	providers?: ProviderCredentials;
	aiProviderKeys?: AiProviderKeys;
	crons?: CronEntry[];
	cursorApiKey?: string | null;
	cloudflareTunnelToken?: string | null;
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
	unarchiveMachine?: string;
};

function asGatewayProfile(
	value: unknown,
	apiKeys: Record<string, string>,
): GatewayProfile | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		kind: asGateway(v.kind),
		model: asString(v.model) ?? DEFAULT_MODEL,
		baseUrl: asString(v.baseUrl) ?? null,
		apiKey: apiKeys[id] ?? null,
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asAgentProfile(value: unknown): AgentProfile | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		agentKind: asAgent(v.agentKind),
		gatewayProfileId: asString(v.gatewayProfileId) ?? "dedalus-default",
		model: asString(v.model) ?? DEFAULT_MODEL,
		enabledSkills: asStringArray(v.enabledSkills),
		enabledTools: asStringArray(v.enabledTools),
		enabledMcpServers: asStringArray(v.enabledMcpServers),
		environmentProfileId: asString(v.environmentProfileId) ?? null,
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asEnvironmentProfile(
	value: unknown,
	varsById: Record<string, Record<string, string>>,
): EnvironmentProfile | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		vars: varsById[id] ?? {},
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asBootstrapPreset(value: unknown): BootstrapPreset | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		providerKind: asProvider(v.providerKind),
		agentProfileId: asString(v.agentProfileId) ?? "hermes-default",
		environmentProfileId: asString(v.environmentProfileId) ?? null,
		spec: asSpec(v.spec),
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asCustomLoadoutEntry(value: unknown): CustomLoadoutEntry | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const kindRaw = asString(v.kind);
	const kind =
		kindRaw && KNOWN_LOADOUT.has(kindRaw as CustomLoadoutKind)
			? (kindRaw as CustomLoadoutKind)
			: "tool";
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		kind,
		description: asString(v.description) ?? "",
		command: asString(v.command) ?? null,
		enabled: v.enabled !== false,
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asLoadoutSource(value: unknown): LoadoutSource | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const kindRaw = asString(v.kind);
	const kind =
		kindRaw && KNOWN_LOADOUT_SOURCES.has(kindRaw as LoadoutSourceKind)
			? (kindRaw as LoadoutSourceKind)
			: "manual";
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		kind,
		description: asString(v.description) ?? "",
		uri: asString(v.uri) ?? null,
		enabled: v.enabled !== false,
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asLoadoutPreset(value: unknown): LoadoutPreset | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const id = asString(v.id);
	if (!id) return null;
	const now = new Date().toISOString();
	return {
		id,
		name: asString(v.name) ?? id,
		description: asString(v.description) ?? "",
		sourceIds: asStringArray(v.sourceIds),
		customEntryIds: asStringArray(v.customEntryIds),
		enabledSkillIds: asStringArray(v.enabledSkillIds),
		enabledToolIds: asStringArray(v.enabledToolIds),
		enabledMcpServerIds: asStringArray(v.enabledMcpServerIds),
		createdAt: asString(v.createdAt) ?? now,
		updatedAt: asString(v.updatedAt) ?? now,
	};
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry));
}

function publicShape(machines: MachineRef[]): Array<Omit<MachineRef, "apiKey">> {
	return machines.map(({ apiKey, ...rest }) => rest);
}

function machineKeyMap(machines: MachineRef[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of machines) {
		if (m.apiKey) out[m.id] = m.apiKey;
	}
	return out;
}

function publicGatewayShape(
	profiles: GatewayProfile[],
): Array<Omit<GatewayProfile, "apiKey">> {
	return profiles.map(({ apiKey, ...rest }) => rest);
}

function gatewayKeyMap(profiles: GatewayProfile[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const profile of profiles) {
		if (profile.apiKey) out[profile.id] = profile.apiKey;
	}
	return out;
}

function publicEnvironmentShape(
	profiles: EnvironmentProfile[],
): Array<Omit<EnvironmentProfile, "vars">> {
	return profiles.map(({ vars, ...rest }) => rest);
}

function environmentVarsMap(
	profiles: EnvironmentProfile[],
): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	for (const profile of profiles) {
		out[profile.id] = profile.vars;
	}
	return out;
}

export async function setUserConfig(patch: ConfigPatch): Promise<UserConfig> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		throw new Error("setUserConfig called without an authenticated user");
	}
	return setUserConfigById(userId, patch);
}

export async function setUserConfigById(
	userId: string,
	patch: ConfigPatch,
): Promise<UserConfig> {
	if (isDevUserId(userId)) return setDevUserConfig(patch);
	const client = await clerkClient();
	const user = await client.users.getUser(userId);
	const existingPublic = { ...(user.publicMetadata ?? {}) } as RawPublic;
	const existingPrivate = { ...(user.privateMetadata ?? {}) } as RawPrivate;

	const current = buildConfig(existingPublic, existingPrivate);

	// --- Merge patch into current state ---

	const nextProviders: ProviderCredentials = { ...current.providers };
	if (patch.providers) {
		for (const kind of Object.keys(patch.providers) as ProviderKind[]) {
			const value = patch.providers[kind];
			if (value === undefined) continue;
			if (value === null) {
				delete nextProviders[kind];
			} else {
				nextProviders[kind] = value as never;
			}
		}
	}

	const nextAiKeys: AiProviderKeys = { ...(current.aiProviderKeys ?? {}) };
	if (patch.aiProviderKeys) {
		const ak = patch.aiProviderKeys;
		if (ak.anthropic) nextAiKeys.anthropic = ak.anthropic;
		if (ak.openai) nextAiKeys.openai = ak.openai;
		if (ak.openrouter) nextAiKeys.openrouter = ak.openrouter;
		if (ak.google) nextAiKeys.google = ak.google;
		if (ak.vercelAiGateway) nextAiKeys.vercelAiGateway = ak.vercelAiGateway;
		if (ak.custom) nextAiKeys.custom = ak.custom;
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
	if (patch.unarchiveMachine) {
		const id = patch.unarchiveMachine;
		nextMachines = nextMachines.map((m) =>
			m.id === id ? { ...m, archived: false } : m,
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

	const nextCrons = patch.crons ?? current.crons ?? [];

	const nextCursor =
		patch.cursorApiKey !== undefined ? patch.cursorApiKey : current.cursorApiKey;
	const nextTunnelToken =
		patch.cloudflareTunnelToken !== undefined ? patch.cloudflareTunnelToken : (current.cloudflareTunnelToken ?? null);
	const nextGatewayProfiles = patch.gatewayProfiles ?? current.gatewayProfiles;
	const nextAgentProfiles = patch.agentProfiles ?? current.agentProfiles;
	const nextEnvironmentProfiles =
		patch.environmentProfiles ?? current.environmentProfiles;
	const nextBootstrapPresets =
		patch.bootstrapPresets ?? current.bootstrapPresets;
	const nextCustomLoadout = patch.customLoadout ?? current.customLoadout;
	const nextLoadoutSources = patch.loadoutSources ?? current.loadoutSources;
	const nextLoadoutPresets = patch.loadoutPresets ?? current.loadoutPresets;
	const nextActiveLoadoutPresetId =
		patch.activeLoadoutPresetId ?? current.activeLoadoutPresetId;

	const nextStep = patch.setupStep ?? current.setupStep;
	const nextDraftAgent = patch.draftAgentKind ?? current.draftAgentKind;
	const nextDraftProvider = patch.draftProviderKind ?? current.draftProviderKind;
	const nextDraftSpec = patch.draftSpec ?? current.draftSpec;
	const nextDraftModel = patch.draftModel ?? current.draftModel;

	// --- Clerk: secrets in privateMetadata, minimal scalars in publicMetadata ---

	const nextPublic: RawPublic = {
		activeMachineId: nextActive,
		setupStep: nextStep,
		draftAgentKind: nextDraftAgent,
		draftProviderKind: nextDraftProvider,
		draftSpec: nextDraftSpec,
		draftModel: nextDraftModel,
	};

	const nextPrivate: RawPrivate = {
		...existingPrivate,
		providers: nextProviders,
		aiProviderKeys: nextAiKeys,
		crons: nextCrons,
		machineApiKeys: machineKeyMap(nextMachines),
		gatewayApiKeys: gatewayKeyMap(nextGatewayProfiles),
		environmentProfileVars: environmentVarsMap(nextEnvironmentProfiles),
	};
	if (nextCursor === null) {
		delete nextPrivate.cursorApiKey;
	} else {
		nextPrivate.cursorApiKey = nextCursor;
	}
	if (nextTunnelToken === null) {
		delete nextPrivate.cloudflareTunnelToken;
	} else {
		nextPrivate.cloudflareTunnelToken = nextTunnelToken;
	}
	delete nextPrivate.dedalusApiKey;
	delete nextPrivate.apiKey;

	await client.users.updateUserMetadata(userId, {
		publicMetadata: nextPublic,
		privateMetadata: nextPrivate,
	});

	// --- Supabase: config arrays + machines ---

	if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
		try {
			await ensureUser(userId, user.emailAddresses?.[0]?.emailAddress);

			await updateUserConfigColumns(userId, {
				agent_profiles: nextAgentProfiles as unknown[],
				gateway_profiles: publicGatewayShape(nextGatewayProfiles) as unknown[],
				environment_profiles: publicEnvironmentShape(nextEnvironmentProfiles) as unknown[],
				bootstrap_presets: nextBootstrapPresets as unknown[],
				custom_loadout: nextCustomLoadout as unknown[],
				loadout_sources: nextLoadoutSources as unknown[],
				loadout_presets: nextLoadoutPresets as unknown[],
				active_loadout_preset_id: nextActiveLoadoutPresetId,
				active_machine_id: nextActive ?? undefined,
				setup_step: nextStep,
				draft_agent_kind: nextDraftAgent,
				draft_provider_kind: nextDraftProvider,
				draft_model: nextDraftModel,
				draft_spec: nextDraftSpec as Record<string, unknown>,
			});

			if (patch.upsertMachine) {
				await upsertMachine(userId, patch.upsertMachine);
			}
			if (patch.patchMachine) {
				await sbPatchMachine(userId, patch.patchMachine.id, patch.patchMachine.patch);
			}
			if (patch.archiveMachine) {
				await sbArchiveMachine(userId, patch.archiveMachine);
			}
			if (patch.removeMachine) {
				await sbDeleteMachine(userId, patch.removeMachine);
			}
			if (patch.unarchiveMachine) {
				await sbPatchMachine(userId, patch.unarchiveMachine, { archived: false });
			}
		} catch {
			// Supabase write failed -- Clerk metadata already persisted above
		}
	}

	// Reconstruct final config from the merged values
	const finalPublic: RawPublic = {
		...nextPublic,
		machines: publicShape(nextMachines),
		gatewayProfiles: publicGatewayShape(nextGatewayProfiles),
		agentProfiles: nextAgentProfiles,
		environmentProfiles: publicEnvironmentShape(nextEnvironmentProfiles),
		bootstrapPresets: nextBootstrapPresets,
		customLoadout: nextCustomLoadout,
		loadoutSources: nextLoadoutSources,
		loadoutPresets: nextLoadoutPresets,
		activeLoadoutPresetId: nextActiveLoadoutPresetId,
	};
	return buildConfig(finalPublic, nextPrivate);
}

/* ------------------------------------------------------------------ */
/* Resolvers used by API routes                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve the env-shape needed to talk to a specific machine's
 * Dedalus host. Only Dedalus machines have a Dedalus API call surface;
 * E2B + Sprites use their own SDKs so this throws if you call
 * it on a non-Dedalus machine. The caller picks the right API per kind.
 */
export async function getDedalusEnvForMachine(machine: MachineRef): Promise<{
	apiKey: string;
	baseUrl: string;
	machineId: string;
}> {
	const config = await getUserConfig();
	if (machine.providerKind !== "dedalus") {
		throw new Error(
			`getDedalusEnvForMachine called on a ${machine.providerKind} machine`,
		);
	}
	const apiKey = config.providers.dedalus?.apiKey;
	if (!apiKey) {
		throw new Error(
			"DEDALUS_API_KEY is not set on this user. Add it in /dashboard/setup.",
		);
	}
	const baseUrl = (
		config.providers.dedalus?.baseUrl ??
		process.env.DEDALUS_BASE_URL ??
		"https://dcs.dedaluslabs.ai"
	)
		.trim()
		.replace(/\/$/, "");
	return { apiKey, baseUrl, machineId: machine.id };
}

/**
 * Convenience wrapper -- resolve env for the user's currently-active
 * machine. Most dashboard read paths call this.
 */
export async function getDedalusEnvForUser(): Promise<{
	apiKey: string;
	baseUrl: string;
	machineId: string;
}> {
	const config = await getUserConfig();
	const machine = activeMachine(config);
	if (!machine) {
		throw new Error(
			"No machine selected. Provision one via /dashboard/setup or pick one in /dashboard/machines.",
		);
	}
	return getDedalusEnvForMachine(machine);
}

/**
 * Resolve the gateway env (URL + bearer + model) for the user's
 * currently-active machine. Used by the chat route + gateway probe.
 */
export async function getGatewayEnvForUser(): Promise<{
	apiUrl: string;
	apiKey: string;
	model: string;
}> {
	const config = await getUserConfig();
	const machine = activeMachine(config);
	if (!machine) {
		throw new Error(
			"No machine selected. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		);
	}
	if (!machine.apiUrl) {
		throw new Error(
			`Machine ${machine.id} has no gateway URL on file yet -- finish bootstrap first.`,
		);
	}
	if (!machine.apiKey) {
		throw new Error(
			`Machine ${machine.id} has no gateway bearer on file. Save one via /dashboard/machines.`,
		);
	}
	return {
		apiUrl: machine.apiUrl.replace(/\/$/, ""),
		apiKey: machine.apiKey,
		model: machine.model,
	};
}
