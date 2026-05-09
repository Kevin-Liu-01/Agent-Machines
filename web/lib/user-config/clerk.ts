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

import { getDevUserConfig, setDevUserConfig } from "./dev-store";
import { getEffectiveUserId, isDevUserId } from "./identity";
import {
	BOOTSTRAP_PHASES,
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MODEL,
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	activeMachine,
	type AgentKind,
	type BootstrapPhaseId,
	type BootstrapState,
	type MachineRef,
	type MachineSpec,
	type ProviderCredentials,
	type ProviderKind,
	type SetupStep,
	type UserConfig,
} from "./schema";

const KNOWN_AGENTS: ReadonlySet<AgentKind> = new Set(["hermes", "openclaw"]);
const KNOWN_PROVIDERS: ReadonlySet<ProviderKind> = new Set([
	"dedalus",
	"vercel-sandbox",
	"fly",
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
	if (dedalusKey) out.dedalus = { apiKey: dedalusKey };
	return out;
}

function envFallbackMachine(): MachineRef | null {
	const machineId = process.env.HERMES_MACHINE_ID?.trim();
	const apiUrl = process.env.HERMES_API_URL?.trim() ?? null;
	const apiKey = process.env.HERMES_API_KEY?.trim() ?? null;
	const model = process.env.HERMES_MODEL?.trim() || DEFAULT_MODEL;
	if (!machineId) return null;
	const vcpu = Number(process.env.HERMES_VCPU);
	const mem = Number(process.env.HERMES_MEMORY_MIB);
	const stor = Number(process.env.HERMES_STORAGE_GIB);
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
		createdAt: new Date(0).toISOString(),
		apiUrl,
		apiKey,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
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
function buildConfig(publicMeta: RawPublic, privateMeta: RawPrivate): UserConfig {
	const providers: ProviderCredentials = {};
	const privateProviders =
		(privateMeta.providers as ProviderCredentials | undefined) ?? {};
	if (privateProviders.dedalus?.apiKey) {
		providers.dedalus = { apiKey: privateProviders.dedalus.apiKey };
	}
	if (privateProviders["vercel-sandbox"]?.apiKey) {
		providers["vercel-sandbox"] = {
			apiKey: privateProviders["vercel-sandbox"].apiKey,
			teamId: privateProviders["vercel-sandbox"].teamId,
		};
	}
	if (privateProviders.fly?.apiKey) {
		providers.fly = {
			apiKey: privateProviders.fly.apiKey,
			orgSlug: privateProviders.fly.orgSlug,
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

	return {
		providers,
		machines,
		activeMachineId,
		cursorApiKey,
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

export async function getUserConfigById(userId: string): Promise<UserConfig> {
	// Dev bypass: route the local dev identity to the file-backed
	// store. Lets the dashboard read/write a UserConfig without
	// hitting Clerk at all when ALLOW_DEV_AUTH=1 is set locally.
	if (isDevUserId(userId)) return getDevUserConfig();
	const client = await clerkClient();
	const user = await client.users.getUser(userId);
	const publicMeta = (user.publicMetadata ?? {}) as RawPublic;
	const privateMeta = (user.privateMetadata ?? {}) as RawPrivate;
	return buildConfig(publicMeta, privateMeta);
}

/* ------------------------------------------------------------------ */
/* Mutators                                                           */
/* ------------------------------------------------------------------ */

type ConfigPatch = {
	providers?: ProviderCredentials;
	cursorApiKey?: string | null;
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
	// Dev bypass: persist to the file-backed store. Same patch shape,
	// same UserConfig output -- callers stay store-agnostic.
	if (isDevUserId(userId)) return setDevUserConfig(patch);
	const client = await clerkClient();
	const user = await client.users.getUser(userId);
	const existingPublic = { ...(user.publicMetadata ?? {}) } as RawPublic;
	const existingPrivate = { ...(user.privateMetadata ?? {}) } as RawPrivate;

	const current = buildConfig(existingPublic, existingPrivate);

	// Providers (privateMetadata.providers).
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

	// Machines (publicMetadata.machines + privateMetadata.machineApiKeys).
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

	const nextCursor =
		patch.cursorApiKey !== undefined ? patch.cursorApiKey : current.cursorApiKey;

	const nextStep = patch.setupStep ?? current.setupStep;
	const nextDraftAgent = patch.draftAgentKind ?? current.draftAgentKind;
	const nextDraftProvider = patch.draftProviderKind ?? current.draftProviderKind;
	const nextDraftSpec = patch.draftSpec ?? current.draftSpec;
	const nextDraftModel = patch.draftModel ?? current.draftModel;

	const nextPublic: RawPublic = {
		...existingPublic,
		machines: publicShape(nextMachines),
		activeMachineId: nextActive,
		setupStep: nextStep,
		draftAgentKind: nextDraftAgent,
		draftProviderKind: nextDraftProvider,
		draftSpec: nextDraftSpec,
		draftModel: nextDraftModel,
	};
	// Tear down legacy single-machine fields once we've migrated them
	// into machines[]. Leave keys we don't own untouched.
	delete nextPublic.machineId;
	delete nextPublic.apiUrl;
	delete nextPublic.machineSpec;
	delete nextPublic.model;
	delete nextPublic.agentKind;
	delete nextPublic.providerKind;

	const nextPrivate: RawPrivate = {
		...existingPrivate,
		providers: nextProviders,
		machineApiKeys: machineKeyMap(nextMachines),
	};
	if (nextCursor === null) {
		delete nextPrivate.cursorApiKey;
	} else {
		nextPrivate.cursorApiKey = nextCursor;
	}
	// Drop the legacy single-key field once we've absorbed it.
	delete nextPrivate.dedalusApiKey;
	delete nextPrivate.apiKey;

	await client.users.updateUserMetadata(userId, {
		publicMetadata: nextPublic,
		privateMetadata: nextPrivate,
	});

	return buildConfig(nextPublic, nextPrivate);
}

/* ------------------------------------------------------------------ */
/* Resolvers used by API routes                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve the env-shape needed to talk to a specific machine's
 * Dedalus host. Only Dedalus machines have a Dedalus API call surface;
 * Vercel Sandbox + Fly use their own SDKs so this throws if you call
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
	const baseUrl = (process.env.DEDALUS_BASE_URL ?? "https://dcs.dedaluslabs.ai")
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
