/**
 * Per-user configuration for the multi-tenant rig.
 *
 * Each signed-in user owns one of these, persisted to their Clerk
 * metadata. Sensitive fields (provider API keys, gateway bearers) live
 * in `privateMetadata`; everything client-readable lives in
 * `publicMetadata`.
 *
 * The shape supports multiple providers (Dedalus, E2B, Sprites, Vercel)
 * and multiple machines per user. Each machine has its own provider,
 * agent kind, spec, and (after install) gateway URL + bearer. The user
 * picks one as `activeMachineId` -- that's the one the chat surface
 * targets and the dashboard polls.
 *
 * Backward compatibility: legacy single-machine configs (`dedalusApiKey`,
 * `machineId`, `apiUrl`, `apiKey`) are migrated on read in clerk.ts so
 * deployed users don't lose state when this schema lands.
 */

export type AgentKind = "hermes" | "openclaw" | "claude-code" | "codex";

export const AGENT_KINDS: ReadonlyArray<AgentKind> = ["hermes", "openclaw", "claude-code", "codex"];

/** Where the agent's VM lives. */
export type ProviderKind = "dedalus" | "sprites" | "e2b" | "vercel";

export const PROVIDER_KINDS: ReadonlyArray<ProviderKind> = [
	"dedalus",
	"e2b",
	"sprites",
	"vercel",
];

export type MachineSpec = {
	vcpu: number;
	memoryMib: number;
	storageGib: number;
};

export const DEFAULT_MACHINE_SPEC: MachineSpec = {
	vcpu: 1,
	memoryMib: 2048,
	storageGib: 10,
};

export const DEFAULT_MODEL = "anthropic/claude-opus-4-8";

/**
 * Bootstrap phases the wizard executes after a machine is provisioned.
 * Phase IDs are stable keys -- never reorder, only append.
 */
export const BOOTSTRAP_PHASES = [
	"system-deps",
	"install-uv",
	"clone-hermes",
	"install-hermes",
	"install-node",
	"seed-knowledge",
	"install-git-reload",
	"install-cursor-bridge",
	"configure-hermes",
	"register-cursor-mcp",
	"seed-cron-jobs",
	"start-gateway",
	"install-closed-loop-tools",
] as const;

/** Optional tooling installed after the gateway is live — failures must not block chat. */
export const POST_GATEWAY_BOOTSTRAP_PHASES = [
	"install-closed-loop-tools",
] as const;

export const CORE_BOOTSTRAP_PHASES = BOOTSTRAP_PHASES.filter(
	(phase) => !(POST_GATEWAY_BOOTSTRAP_PHASES as readonly string[]).includes(phase),
);

export type BootstrapPhaseId = (typeof BOOTSTRAP_PHASES)[number];

export type BootstrapState = {
	phase: "idle" | "running" | "succeeded" | "failed";
	current: BootstrapPhaseId | null;
	completed: BootstrapPhaseId[];
	startedAt: string | null;
	finishedAt: string | null;
	lastError: string | null;
};

export const INITIAL_BOOTSTRAP_STATE: BootstrapState = {
	phase: "idle",
	current: null,
	completed: [],
	startedAt: null,
	finishedAt: null,
	lastError: null,
};

export type SetupStep =
	| "api-key"
	| "agent"
	| "provider"
	| "spec"
	| "review"
	| "provisioned";

export const SETUP_STEPS: ReadonlyArray<SetupStep> = [
	"api-key",
	"agent",
	"provider",
	"spec",
	"review",
	"provisioned",
];

/**
 * Per-provider credentials. Each entry is the API key plus any
 * provider-specific scoping the SDK needs.
 *
 * Stored in Clerk privateMetadata; the public-config helper strips them.
 */
export type ProviderCredentials = Partial<{
	dedalus: { apiKey: string; baseUrl?: string };
	sprites: { apiKey: string };
	e2b: { apiKey: string };
	vercel: { token: string; teamId: string; projectId: string };
}>;

/**
 * AI provider API keys that power the agent's LLM inference.
 * Separate from infrastructure ProviderCredentials because these
 * are about which model backend the agent talks to, not where the
 * VM runs. Every agent accepts at least one of these; Hermes and
 * OpenClaw accept any OpenAI-compatible endpoint.
 */
export type AiProviderKeys = {
	anthropic?: string;
	openai?: string;
	openrouter?: string;
	google?: string;
	vercelAiGateway?: string;
	custom?: { url: string; key: string; label?: string };
};

export type AiProviderSlug = keyof AiProviderKeys;

export const AI_PROVIDER_SLUGS: ReadonlyArray<AiProviderSlug> = [
	"vercelAiGateway",
	"openrouter",
	"anthropic",
	"openai",
	"google",
	"custom",
];

export type PublicAiProviderStatus = Record<
	AiProviderSlug,
	{ configured: boolean; label?: string }
>;

export type GatewayKind = "vercel-ai-gateway" | "openai-compatible";

export type GatewayProfile = {
	id: string;
	name: string;
	kind: GatewayKind;
	model: string;
	baseUrl: string | null;
	apiKey: string | null;
	createdAt: string;
	updatedAt: string;
};

export type EnvironmentProfile = {
	id: string;
	name: string;
	vars: Record<string, string>;
	createdAt: string;
	updatedAt: string;
};

export type BootstrapPreset = {
	id: string;
	name: string;
	providerKind: ProviderKind;
	agentProfileId: string;
	environmentProfileId: string | null;
	spec: MachineSpec;
	createdAt: string;
	updatedAt: string;
};

export type CustomLoadoutKind = "skill" | "tool" | "mcp" | "cli" | "plugin";

export type CustomLoadoutEntry = {
	id: string;
	name: string;
	kind: CustomLoadoutKind;
	description: string;
	command: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

export type LoadoutSourceKind =
	| "bundled"
	| "github"
	| "git"
	| "wiki"
	| "url"
	| "mcp"
	| "cli"
	| "npm"
	| "manual";

export type LoadoutSource = {
	id: string;
	name: string;
	kind: LoadoutSourceKind;
	description: string;
	uri: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

/**
 * One machine the user owns. Lives in publicMetadata since these are
 * not secrets -- the gateway bearer is the only sensitive bit and it
 * lives in `apiKey` here for ergonomics (API routes need both URL and
 * key in the same call). The bearer is exposed only to the user's own
 * authenticated requests, never to other users.
 */
export type MachineRef = {
	id: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	name: string;
	spec: MachineSpec;
	model: string;
	agentProfileId: string | null;
	gatewayProfileId: string | null;
	environmentProfileId: string | null;
	bootstrapPresetId: string | null;
	createdAt: string;
	apiUrl: string | null;
	apiKey: string | null;
	bootstrapState: BootstrapState;
	archived?: boolean;
};

export type CronStatus = "success" | "failed" | "running";

/**
 * A scheduled agent task. The schedule is a 5-field cron expression in UTC
 * (or an `every Nm|Nh|Nd` shorthand). The server-side scheduler
 * (`/api/internal/cron/tick`) evaluates these on a fixed cadence and execs
 * the agent one-shot on the bound machine. Stored in Clerk privateMetadata
 * (non-secret, per user) so it survives without a DB migration.
 */
export type CronEntry = {
	id: string;
	name: string;
	/** 5-field cron expr (UTC) or `every Nm|Nh|Nd`. */
	schedule: string;
	/** Natural-language task handed to the agent. */
	prompt: string;
	/** Machine this cron runs on. */
	machineId: string;
	skills: string[];
	enabled: boolean;
	createdAt: string;
	lastRunAt: string | null;
	lastStatus: CronStatus | null;
	lastSummary: string | null;
};

/** Stable id of the seeded default memory bundle (synthesized server-side). */
export const DEFAULT_MEMORY_BUNDLE_ID = "am-default";

/** Stable id of the seeded minimal "barebones" memory bundle. */
export const BAREBONES_MEMORY_BUNDLE_ID = "am-barebones";

/** Prefix for a memory synthesized from a curated preset (id = prefix + presetId). */
export const PRESET_MEMORY_PREFIX = "preset-memory:";

export type MemoryBundleSource = "default" | "custom" | "imported";

/**
 * The four persona/context docs that map 1:1 to the runtime files the
 * bootstrap writes: SOUL.md / AGENTS.md / MEMORY.md / USER.md.
 */
export type MemoryBundleDocs = {
	soul: string;
	agentDocs: string;
	memory: string;
	user: string;
};

/**
 * A portable "owned memory": persona + rules + agent docs + a selection of
 * abilities (skills/tools/MCP servers by id). Installs into any agent runtime,
 * exports to a pastable prompt, and imports from an existing setup. Workers
 * reference one by id. The seeded default (id `DEFAULT_MEMORY_BUNDLE_ID`) is
 * synthesized server-side from the bundled `knowledge/` docs.
 */
export type MemoryBundle = {
	id: string;
	name: string;
	description: string;
	source: MemoryBundleSource;
	docs: MemoryBundleDocs;
	skillIds: string[];
	toolIds: string[];
	mcpServerIds: string[];
	createdAt: string;
	updatedAt: string;
};

/** Where a Worker came from: a curated preset we ship, or user-created. */
export type WorkerSource = "default" | "custom";

/**
 * The deployable "preset" layer, built on top of a Memory.
 *
 * A Worker packages a runtime + model/router + a referenced Memory (persona
 * docs + the abilities selected from the imported pool) + an optional role
 * prompt. Created once (often from a curated preset), deployed onto any
 * machine. The machine bootstrap reads the deployed Worker's Memory to write
 * settings.json and install the persona docs. The machine link is the reverse
 * `lastMachineId` pointer (no per-machine column required).
 */
export type Worker = {
	id: string;
	name: string;
	source: WorkerSource;
	agentKind: AgentKind;
	model: string;
	gatewayProfileId: string;
	memoryBundleId: string;
	rolePrompt: string | null;
	lastMachineId: string | null;
	createdAt: string;
	updatedAt: string;
};

export type UserConfig = {
	providers: ProviderCredentials;
	aiProviderKeys: AiProviderKeys;
	machines: MachineRef[];
	activeMachineId: string | null;
	/** Scheduled agent tasks, driven by the server-side cron scheduler. */
	crons: CronEntry[];
	/** Portable owned-memory bundles (persona + rules + abilities). */
	memoryBundles: MemoryBundle[];
	/** Reusable agent templates that reference a memory bundle. */
	workers: Worker[];
	cursorApiKey: string | null;
	/** Cloudflare named tunnel token for stable gateway URLs on a custom domain. */
	cloudflareTunnelToken: string | null;
	gatewayProfiles: GatewayProfile[];
	environmentProfiles: EnvironmentProfile[];
	bootstrapPresets: BootstrapPreset[];
	/**
	 * Account-global imported pool: every skill / MCP / CLI the user installed
	 * from the Registry. The Skills + MCPs library pages render this set, and a
	 * Memory selects a subset (or "*" = all) of it as its abilities.
	 */
	customLoadout: CustomLoadoutEntry[];
	loadoutSources: LoadoutSource[];
	setupStep: SetupStep;

	/* Wizard scratch -- the choices the user made last in the wizard,
	 * kept so the wizard's "review" step can use them as defaults for
	 * the next provision call. */
	draftAgentKind: AgentKind;
	draftProviderKind: ProviderKind;
	draftSpec: MachineSpec;
	draftModel: string;
	metricsEnabled?: boolean;
};

const DEFAULT_CREATED_AT = new Date(0).toISOString();

export const VERCEL_AI_GATEWAY_PROFILE: GatewayProfile = {
	id: "vercel-ai-gateway",
	name: "Vercel AI Gateway",
	kind: "vercel-ai-gateway",
	model: DEFAULT_MODEL,
	baseUrl: "https://ai-gateway.vercel.sh",
	apiKey: null,
	createdAt: DEFAULT_CREATED_AT,
	updatedAt: DEFAULT_CREATED_AT,
};

export const OPENROUTER_GATEWAY_PROFILE: GatewayProfile = {
	id: "openrouter-router",
	name: "OpenRouter",
	kind: "openai-compatible",
	model: DEFAULT_MODEL,
	baseUrl: "https://openrouter.ai/api/v1",
	apiKey: null,
	createdAt: DEFAULT_CREATED_AT,
	updatedAt: DEFAULT_CREATED_AT,
};

export const DEFAULT_GATEWAY_PROFILE: GatewayProfile = VERCEL_AI_GATEWAY_PROFILE;

export const DEFAULT_BOOTSTRAP_PRESETS: BootstrapPreset[] = [
	{
		id: "dedalus-hermes-default",
		name: "Dedalus + Hermes",
		providerKind: "dedalus",
		agentProfileId: "hermes-default",
		environmentProfileId: null,
		spec: DEFAULT_MACHINE_SPEC,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "dedalus-openclaw-default",
		name: "Dedalus + OpenClaw",
		providerKind: "dedalus",
		agentProfileId: "openclaw-default",
		environmentProfileId: null,
		spec: DEFAULT_MACHINE_SPEC,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "dedalus-claude-code-default",
		name: "Dedalus + Claude Code",
		providerKind: "dedalus",
		agentProfileId: "claude-code-default",
		environmentProfileId: null,
		spec: DEFAULT_MACHINE_SPEC,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "dedalus-codex-default",
		name: "Dedalus + Codex CLI",
		providerKind: "dedalus",
		agentProfileId: "codex-default",
		environmentProfileId: null,
		spec: DEFAULT_MACHINE_SPEC,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
];

export const DEFAULT_LOADOUT_SOURCES: LoadoutSource[] = [
	{
		id: "bundled-skills",
		name: "Bundled SKILL.md library",
		kind: "bundled",
		description: "The curated 161-skill wiki-derived library shipped in knowledge/skills.",
		uri: "knowledge/skills",
		enabled: true,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "bundled-mcps",
		name: "Bundled MCP servers",
		kind: "bundled",
		description: "The MCP server catalog installed during agent bootstrap.",
		uri: "knowledge/mcps",
		enabled: true,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "builtin-tools",
		name: "Agent built-ins",
		kind: "bundled",
		description: "Native Hermes and OpenClaw tools such as shell, browser, files, vision, memory, and schedules.",
		uri: "web/lib/dashboard/loadout.ts",
		enabled: true,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "service-registry",
		name: "Service registry",
		kind: "wiki",
		description: "Opinionated interface rankings per external service: MCP, CLI, plugin skills, browser, or docs.",
		uri: "wiki/SKILL-RESOLVER.md",
		enabled: true,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "task-hierarchy",
		name: "Task hierarchy",
		kind: "wiki",
		description: "Per-task routing rules for reviews, QA, research, design, security, deployment, and content work.",
		uri: "config/cursor/rules/tool-hierarchy.mdc",
		enabled: true,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "official-mcp-registry",
		name: "Model Context Protocol registry",
		kind: "github",
		description:
			"Reputable MCP server source for adding official and maintained tool servers beyond the bundled machine defaults.",
		uri: "github:modelcontextprotocol/servers",
		enabled: false,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "cursor-skill-packs",
		name: "Cursor and plugin skill packs",
		kind: "github",
		description:
			"Cursor rules, plugin-provided SKILL.md packs, and local ~/.cursor skills that can be composed into agent presets.",
		uri: "cursor-public plugins + ~/.cursor/skills",
		enabled: false,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "github-agent-repos",
		name: "GitHub agent repositories",
		kind: "github",
		description:
			"Any trusted repository containing SKILL.md files, MCP descriptors, install scripts, package manifests, or docs indexes.",
		uri: "github:<owner>/<repo>",
		enabled: false,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "npm-tool-packages",
		name: "npm / pnpm tool packages",
		kind: "npm",
		description:
			"Package manifests for CLIs and agent tools that should be installed into the VM and exposed in a preset.",
		uri: "npm:<package-name>",
		enabled: false,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "url-manifests",
		name: "Remote agent manifests",
		kind: "url",
		description:
			"JSON or YAML manifests from reputable docs, registries, or internal catalogs describing skills, MCPs, CLIs, and providers.",
		uri: "https://example.com/agent-machines.json",
		enabled: false,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
];

export const DEFAULT_USER_CONFIG: UserConfig = {
	providers: {},
	aiProviderKeys: {},
	machines: [],
	crons: [],
	memoryBundles: [],
	workers: [],
	cloudflareTunnelToken: null,
	activeMachineId: null,
	cursorApiKey: null,
	gatewayProfiles: [
		VERCEL_AI_GATEWAY_PROFILE,
		OPENROUTER_GATEWAY_PROFILE,
	],
	environmentProfiles: [],
	bootstrapPresets: DEFAULT_BOOTSTRAP_PRESETS,
	customLoadout: [],
	loadoutSources: DEFAULT_LOADOUT_SOURCES,
	setupStep: "api-key",
	draftAgentKind: "hermes",
	draftProviderKind: "dedalus",
	draftSpec: DEFAULT_MACHINE_SPEC,
	draftModel: DEFAULT_MODEL,
};

/**
 * Public-facing view of UserConfig. We strip secrets from
 * `providers` (just report which ones are configured) and from
 * `machines[].apiKey` (just report whether each gateway has a bearer
 * on file). The chat API uses the in-memory full config; the client
 * only ever sees the public projection.
 */
export type PublicProviderStatus = {
	configured: boolean;
	scopeHint?: string;
};

export type PublicMachineRef = Omit<MachineRef, "apiKey"> & {
	hasApiKey: boolean;
};

export type PublicUserConfig = Omit<
	UserConfig,
	| "providers"
	| "aiProviderKeys"
	| "machines"
	| "cursorApiKey"
	| "cloudflareTunnelToken"
	| "gatewayProfiles"
	| "environmentProfiles"
	// memoryBundles carry large doc text and workers are fetched on dedicated
	// pages via the API / full server config -- keep them out of the public
	// projection the shell ships to every dashboard page.
	| "memoryBundles"
	| "workers"
> & {
	providers: Record<ProviderKind, PublicProviderStatus>;
	aiProviders: PublicAiProviderStatus;
	machines: PublicMachineRef[];
	gatewayProfiles: Array<Omit<GatewayProfile, "apiKey"> & { hasApiKey: boolean }>;
	environmentProfiles: Array<Omit<EnvironmentProfile, "vars"> & { varCount: number }>;
	hasCursorKey: boolean;
	hasTunnelToken: boolean;
};

export function toPublicConfig(config: UserConfig): PublicUserConfig {
	const providers: Record<ProviderKind, PublicProviderStatus> = {
		dedalus: { configured: Boolean(config.providers.dedalus?.apiKey) },
		e2b: { configured: Boolean(config.providers.e2b?.apiKey) },
		sprites: {
			configured: Boolean(config.providers.sprites?.apiKey),
		},
		vercel: {
			configured: Boolean(config.providers.vercel?.token),
			scopeHint: config.providers.vercel?.teamId
				? `team ${config.providers.vercel.teamId.slice(0, 8)}…`
				: undefined,
		},
	};
	const machines: PublicMachineRef[] = config.machines.map((m) => {
		const { apiKey, ...rest } = m;
		return { ...rest, hasApiKey: Boolean(apiKey) };
	});
	const ai = config.aiProviderKeys;
	const aiProviders: PublicAiProviderStatus = {
		vercelAiGateway: { configured: Boolean(ai.vercelAiGateway) },
		openrouter: { configured: Boolean(ai.openrouter) },
		anthropic: { configured: Boolean(ai.anthropic) },
		openai: { configured: Boolean(ai.openai) },
		google: { configured: Boolean(ai.google) },
		custom: { configured: Boolean(ai.custom?.key), label: ai.custom?.label },
	};

	return {
		providers,
		aiProviders,
		machines,
		crons: config.crons ?? [],
		activeMachineId: config.activeMachineId,
		gatewayProfiles: config.gatewayProfiles.map(({ apiKey, ...profile }) => ({
			...profile,
			hasApiKey: Boolean(apiKey),
		})),
		environmentProfiles: config.environmentProfiles.map(({ vars, ...profile }) => ({
			...profile,
			varCount: Object.keys(vars).length,
		})),
		bootstrapPresets: config.bootstrapPresets,
		customLoadout: config.customLoadout,
		loadoutSources: config.loadoutSources,
		setupStep: config.setupStep,
		draftAgentKind: config.draftAgentKind,
		draftProviderKind: config.draftProviderKind,
		draftSpec: config.draftSpec,
		draftModel: config.draftModel,
		hasCursorKey: Boolean(config.cursorApiKey),
		hasTunnelToken: Boolean(config.cloudflareTunnelToken),
	};
}

export function activeMachine(config: UserConfig): MachineRef | null {
	if (!config.activeMachineId) return null;
	return config.machines.find((m) => m.id === config.activeMachineId) ?? null;
}

export function isProvisioned(config: UserConfig): boolean {
	return config.machines.some((m) => !m.archived);
}

/**
 * Display name for a provider in compact spaces (badges, dropdown).
 * Kept in the schema layer because UI and API both need it.
 */
export const PROVIDER_LABEL: Record<ProviderKind, string> = {
	dedalus: "Dedalus",
	e2b: "E2B Sandbox",
	sprites: "Sprites",
	vercel: "Vercel Sandbox",
};

export const AGENT_LABEL: Record<AgentKind, string> = {
	hermes: "Hermes",
	openclaw: "OpenClaw",
	"claude-code": "Claude Code",
	codex: "Codex CLI",
};
