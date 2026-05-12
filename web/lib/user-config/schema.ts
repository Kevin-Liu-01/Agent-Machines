/**
 * Per-user configuration for the multi-tenant rig.
 *
 * Each signed-in user owns one of these, persisted to their Clerk
 * metadata. Sensitive fields (provider API keys, gateway bearers) live
 * in `privateMetadata`; everything client-readable lives in
 * `publicMetadata`.
 *
 * The shape supports multiple providers (Dedalus, Vercel Sandbox, Fly)
 * and multiple machines per user. Each machine has its own provider,
 * agent kind, spec, and (after install) gateway URL + bearer. The user
 * picks one as `activeMachineId` -- that's the one the chat surface
 * targets and the dashboard polls.
 *
 * Backward compatibility: legacy single-machine configs (`dedalusApiKey`,
 * `machineId`, `apiUrl`, `apiKey`) are migrated on read in clerk.ts so
 * deployed users don't lose state when this schema lands.
 */

export type AgentKind = "hermes" | "openclaw";

export const AGENT_KINDS: ReadonlyArray<AgentKind> = ["hermes", "openclaw"];

/** Where the agent's microVM lives. */
export type ProviderKind = "dedalus" | "vercel-sandbox" | "fly";

export const PROVIDER_KINDS: ReadonlyArray<ProviderKind> = [
	"dedalus",
	"vercel-sandbox",
	"fly",
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

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

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
 * provider-specific scoping the SDK needs (Vercel team, Fly org).
 *
 * Stored in Clerk privateMetadata; the public-config helper strips them.
 */
export type ProviderCredentials = {
	dedalus?: { apiKey: string; baseUrl?: string };
	"vercel-sandbox"?: { apiKey: string; teamId?: string; projectId?: string };
	fly?: { apiKey: string; orgSlug?: string };
};

export type GatewayKind = "dedalus" | "vercel-ai-gateway" | "openai-compatible";

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

export type AgentProfile = {
	id: string;
	name: string;
	agentKind: AgentKind;
	gatewayProfileId: string;
	model: string;
	enabledSkills: string[];
	enabledTools: string[];
	enabledMcpServers: string[];
	environmentProfileId: string | null;
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

export type LoadoutPreset = {
	id: string;
	name: string;
	description: string;
	sourceIds: string[];
	customEntryIds: string[];
	enabledSkillIds: string[];
	enabledToolIds: string[];
	enabledMcpServerIds: string[];
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

export type UserConfig = {
	providers: ProviderCredentials;
	machines: MachineRef[];
	activeMachineId: string | null;
	cursorApiKey: string | null;
	gatewayProfiles: GatewayProfile[];
	agentProfiles: AgentProfile[];
	environmentProfiles: EnvironmentProfile[];
	bootstrapPresets: BootstrapPreset[];
	customLoadout: CustomLoadoutEntry[];
	loadoutSources: LoadoutSource[];
	loadoutPresets: LoadoutPreset[];
	activeLoadoutPresetId: string;
	setupStep: SetupStep;

	/* Wizard scratch -- the choices the user made last in the wizard,
	 * kept so the wizard's "review" step can use them as defaults for
	 * the next provision call. */
	draftAgentKind: AgentKind;
	draftProviderKind: ProviderKind;
	draftSpec: MachineSpec;
	draftModel: string;
};

const DEFAULT_CREATED_AT = new Date(0).toISOString();

export const DEFAULT_GATEWAY_PROFILE: GatewayProfile = {
	id: "dedalus-default",
	name: "Dedalus default",
	kind: "dedalus",
	model: DEFAULT_MODEL,
	baseUrl: "https://api.dedaluslabs.ai/v1",
	apiKey: null,
	createdAt: DEFAULT_CREATED_AT,
	updatedAt: DEFAULT_CREATED_AT,
};

export const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
	{
		id: "hermes-default",
		name: "Hermes default",
		agentKind: "hermes",
		gatewayProfileId: DEFAULT_GATEWAY_PROFILE.id,
		model: DEFAULT_MODEL,
		enabledSkills: [],
		enabledTools: [],
		enabledMcpServers: [],
		environmentProfileId: null,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "openclaw-default",
		name: "OpenClaw default",
		agentKind: "openclaw",
		gatewayProfileId: DEFAULT_GATEWAY_PROFILE.id,
		model: DEFAULT_MODEL,
		enabledSkills: [],
		enabledTools: [],
		enabledMcpServers: [],
		environmentProfileId: null,
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
];

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
];

export const DEFAULT_LOADOUT_SOURCES: LoadoutSource[] = [
	{
		id: "bundled-skills",
		name: "Bundled SKILL.md library",
		kind: "bundled",
		description: "The curated 96-skill wiki-derived library shipped in knowledge/skills.",
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

export const DEFAULT_LOADOUT_PRESET: LoadoutPreset = {
	id: "opinionated-default",
	name: "Opinionated default",
	description:
		"Kevin's curated preset: bundled skills, built-in tools, MCPs, service routing, task hierarchy, and any enabled custom entries.",
	sourceIds: DEFAULT_LOADOUT_SOURCES.map((source) => source.id),
	customEntryIds: [],
	enabledSkillIds: ["*"],
	enabledToolIds: ["*"],
	enabledMcpServerIds: ["*"],
	createdAt: DEFAULT_CREATED_AT,
	updatedAt: DEFAULT_CREATED_AT,
};

export const DEFAULT_LOADOUT_PRESETS: LoadoutPreset[] = [
	DEFAULT_LOADOUT_PRESET,
	{
		id: "frontend-design-lab",
		name: "Frontend design lab",
		description:
			"Design-heavy preset for taste work, browser QA, Figma, animation libraries, and visual implementation loops.",
		sourceIds: [
			"bundled-skills",
			"builtin-tools",
			"service-registry",
			"cursor-skill-packs",
			"npm-tool-packages",
		],
		customEntryIds: [],
		enabledSkillIds: [
			"frontend-design",
			"frontend-design-taste",
			"design-review",
			"taste-redesign",
			"agent-browser",
			"closed-loop-development",
		],
		enabledToolIds: ["browser_*", "vision_analyze", "image_generate"],
		enabledMcpServerIds: ["plugin-figma-figma", "cursor-bridge"],
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "production-ops",
		name: "Production ops",
		description:
			"Operational preset for Vercel, GitHub, Datadog, Sentry, Linear, logs, CI, incidents, and deployment work.",
		sourceIds: [
			"bundled-skills",
			"bundled-mcps",
			"builtin-tools",
			"service-registry",
			"official-mcp-registry",
		],
		customEntryIds: [],
		enabledSkillIds: [
			"production-safety",
			"closed-loop-development",
			"gh-fix-ci",
			"deepsec",
			"perf",
		],
		enabledToolIds: ["terminal", "web_search", "session_search"],
		enabledMcpServerIds: [
			"plugin-vercel-vercel",
			"plugin-linear-linear",
			"plugin-datadog-datadog",
		],
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
	{
		id: "research-browser",
		name: "Research browser",
		description:
			"Research preset for web search, page extraction, social reach, browser automation, citation gathering, and live source review.",
		sourceIds: [
			"bundled-skills",
			"builtin-tools",
			"task-hierarchy",
			"github-agent-repos",
			"url-manifests",
		],
		customEntryIds: [],
		enabledSkillIds: [
			"agent-reach",
			"closed-loop-development",
			"rtfm",
			"read-and-review",
			"content-strategy",
		],
		enabledToolIds: ["web_search", "web_extract", "browser_*"],
		enabledMcpServerIds: ["cursor-ide-browser"],
		createdAt: DEFAULT_CREATED_AT,
		updatedAt: DEFAULT_CREATED_AT,
	},
];

export const DEFAULT_USER_CONFIG: UserConfig = {
	providers: {},
	machines: [],
	activeMachineId: null,
	cursorApiKey: null,
	gatewayProfiles: [DEFAULT_GATEWAY_PROFILE],
	agentProfiles: DEFAULT_AGENT_PROFILES,
	environmentProfiles: [],
	bootstrapPresets: DEFAULT_BOOTSTRAP_PRESETS,
	customLoadout: [],
	loadoutSources: DEFAULT_LOADOUT_SOURCES,
	loadoutPresets: DEFAULT_LOADOUT_PRESETS,
	activeLoadoutPresetId: DEFAULT_LOADOUT_PRESET.id,
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
	| "machines"
	| "cursorApiKey"
	| "gatewayProfiles"
	| "environmentProfiles"
> & {
	providers: Record<ProviderKind, PublicProviderStatus>;
	machines: PublicMachineRef[];
	gatewayProfiles: Array<Omit<GatewayProfile, "apiKey"> & { hasApiKey: boolean }>;
	environmentProfiles: Array<Omit<EnvironmentProfile, "vars"> & { varCount: number }>;
	hasCursorKey: boolean;
};

export function toPublicConfig(config: UserConfig): PublicUserConfig {
	const providers: Record<ProviderKind, PublicProviderStatus> = {
		dedalus: { configured: Boolean(config.providers.dedalus?.apiKey) },
		"vercel-sandbox": {
			configured: Boolean(config.providers["vercel-sandbox"]?.apiKey),
			scopeHint: config.providers["vercel-sandbox"]?.teamId,
		},
		fly: {
			configured: Boolean(config.providers.fly?.apiKey),
			scopeHint: config.providers.fly?.orgSlug,
		},
	};
	const machines: PublicMachineRef[] = config.machines.map((m) => {
		const { apiKey, ...rest } = m;
		return { ...rest, hasApiKey: Boolean(apiKey) };
	});
	return {
		providers,
		machines,
		activeMachineId: config.activeMachineId,
		gatewayProfiles: config.gatewayProfiles.map(({ apiKey, ...profile }) => ({
			...profile,
			hasApiKey: Boolean(apiKey),
		})),
		agentProfiles: config.agentProfiles,
		environmentProfiles: config.environmentProfiles.map(({ vars, ...profile }) => ({
			...profile,
			varCount: Object.keys(vars).length,
		})),
		bootstrapPresets: config.bootstrapPresets,
		customLoadout: config.customLoadout,
		loadoutSources: config.loadoutSources,
		loadoutPresets: config.loadoutPresets,
		activeLoadoutPresetId: config.activeLoadoutPresetId,
		setupStep: config.setupStep,
		draftAgentKind: config.draftAgentKind,
		draftProviderKind: config.draftProviderKind,
		draftSpec: config.draftSpec,
		draftModel: config.draftModel,
		hasCursorKey: Boolean(config.cursorApiKey),
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
	"vercel-sandbox": "Vercel Sandbox",
	fly: "Fly Machines",
};

export const AGENT_LABEL: Record<AgentKind, string> = {
	hermes: "Hermes",
	openclaw: "OpenClaw",
};
