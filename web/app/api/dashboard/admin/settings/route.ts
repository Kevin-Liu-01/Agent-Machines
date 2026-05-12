/**
 * GET / POST /api/dashboard/admin/settings
 *
 * Full account configuration surface. Onboarding writes the first
 * draft; this route lets the user update durable provider, gateway,
 * agent, environment, bootstrap, and custom loadout settings later.
 *
 * Terminal compatibility: if the active machine has
 * `/home/machine/.agent-machines/settings.json`, POST `{ syncFromMachine: true }`
 * imports the same shape from disk, so config edited from the terminal
 * can be reflected back into the UI.
 */

import { APP_DATA_ROOT, readTextFile } from "@/lib/storage/machine-fs";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import {
	toPublicConfig,
	type AgentProfile,
	type AiProviderKeys,
	type BootstrapPreset,
	type CustomLoadoutEntry,
	type EnvironmentProfile,
	type GatewayProfile,
	type LoadoutPreset,
	type LoadoutSource,
	type ProviderCredentials,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SettingsBody = Partial<{
	providers: ProviderCredentials;
	aiProviderKeys: AiProviderKeys;
	cursorApiKey: string | null;
	gatewayProfiles: Array<Partial<GatewayProfile>>;
	agentProfiles: AgentProfile[];
	environmentProfiles: Array<Partial<EnvironmentProfile>>;
	bootstrapPresets: BootstrapPreset[];
	customLoadout: CustomLoadoutEntry[];
	loadoutSources: LoadoutSource[];
	loadoutPresets: LoadoutPreset[];
	activeLoadoutPresetId: string;
	syncFromMachine: boolean;
}>;

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const config = await getUserConfig();
	return Response.json({
		config: toPublicConfig(config),
		secretStatus: {
			gatewayProfiles: Object.fromEntries(
				config.gatewayProfiles.map((profile) => [profile.id, Boolean(profile.apiKey)]),
			),
			environmentProfiles: Object.fromEntries(
				config.environmentProfiles.map((profile) => [
					profile.id,
					Object.keys(profile.vars).length,
				]),
			),
		},
	});
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const current = await getUserConfig();
	const input = (await request.json().catch(() => ({}))) as SettingsBody;
	let body = input;
	if (input.syncFromMachine) {
		try {
			body = await readMachineSettings();
		} catch (err) {
			return Response.json(
				{
					error: "machine_settings_unavailable",
					message:
						err instanceof Error
							? err.message
							: "could not read machine settings.json",
				},
				{ status: 502 },
			);
		}
	}

	const patch: Parameters<typeof setUserConfig>[0] = {};
	if (body.providers) patch.providers = body.providers;
	if (body.aiProviderKeys) patch.aiProviderKeys = body.aiProviderKeys;
	if (body.cursorApiKey !== undefined) {
		patch.cursorApiKey = body.cursorApiKey;
	}
	if (body.gatewayProfiles) {
		patch.gatewayProfiles = body.gatewayProfiles.map((profile) =>
			mergeGatewayProfile(profile, current.gatewayProfiles),
		);
	}
	if (body.agentProfiles) patch.agentProfiles = body.agentProfiles;
	if (body.environmentProfiles) {
		patch.environmentProfiles = body.environmentProfiles.map((profile) =>
			mergeEnvironmentProfile(profile, current.environmentProfiles),
		);
	}
	if (body.bootstrapPresets) patch.bootstrapPresets = body.bootstrapPresets;
	if (body.customLoadout) patch.customLoadout = body.customLoadout;
	if (body.loadoutSources) patch.loadoutSources = body.loadoutSources;
	if (body.loadoutPresets) patch.loadoutPresets = body.loadoutPresets;
	if (body.activeLoadoutPresetId) {
		patch.activeLoadoutPresetId = body.activeLoadoutPresetId;
	}

	const next = await setUserConfig(patch);
	return Response.json({ config: toPublicConfig(next) });
}

async function readMachineSettings(): Promise<SettingsBody> {
	const text = await readTextFile(`${APP_DATA_ROOT}/settings.json`);
	if (!text) return {};
	const parsed = JSON.parse(text) as SettingsBody;
	return parsed;
}

function mergeGatewayProfile(
	partial: Partial<GatewayProfile>,
	current: GatewayProfile[],
): GatewayProfile {
	const existing = current.find((profile) => profile.id === partial.id);
	const now = new Date().toISOString();
	const id = partial.id ?? existing?.id ?? crypto.randomUUID();
	return {
		id,
		name: partial.name ?? existing?.name ?? id,
		kind: partial.kind ?? existing?.kind ?? "openai-compatible",
		model: partial.model ?? existing?.model ?? "anthropic/claude-sonnet-4-6",
		baseUrl: partial.baseUrl ?? existing?.baseUrl ?? null,
		apiKey: partial.apiKey ?? existing?.apiKey ?? null,
		createdAt: partial.createdAt ?? existing?.createdAt ?? now,
		updatedAt: now,
	};
}

function mergeEnvironmentProfile(
	partial: Partial<EnvironmentProfile>,
	current: EnvironmentProfile[],
): EnvironmentProfile {
	const existing = current.find((profile) => profile.id === partial.id);
	const now = new Date().toISOString();
	const id = partial.id ?? existing?.id ?? crypto.randomUUID();
	return {
		id,
		name: partial.name ?? existing?.name ?? id,
		vars: partial.vars ?? existing?.vars ?? {},
		createdAt: partial.createdAt ?? existing?.createdAt ?? now,
		updatedAt: now,
	};
}
