/**
 * Gateway resolver.
 *
 * Machines own lifecycle. Gateway profiles own model routing. Keeping
 * these separate lets one account reuse the same Dedalus / Vercel AI
 * Gateway / BYO OpenAI-compatible config across many machines and
 * agents without hand-editing `apiUrl` on every MachineRef.
 */

import { resolveMachine } from "@/lib/dashboard/exec";
import { getUserConfig } from "@/lib/user-config/clerk";
import { type GatewayProfile } from "@/lib/user-config/schema";

export type GatewayEnv = {
	apiUrl: string;
	model: string;
	headers: Record<string, string>;
	kind: GatewayProfile["kind"] | "machine";
	apiHost: string;
};

export async function resolveGatewayForUser(machineId?: string | null): Promise<GatewayEnv> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		throw new Error(
			machineId
				? `Machine ${machineId} not found in your account.`
				: "No machine selected. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		);
	}

	if (!machine.apiUrl) {
		throw new Error(
			`Machine ${machine.id} has no agent gateway URL on file yet -- bootstrap the agent first.`,
		);
	}
	if (!machine.apiKey) {
		throw new Error(
			`Machine ${machine.id} has no agent gateway bearer on file -- bootstrap the agent first.`,
		);
	}
	return {
		apiUrl: normalizeOpenAiBase(machine.apiUrl),
		model: machine.agentKind === "openclaw" ? "openclaw" : machine.model,
		headers: { Authorization: `Bearer ${machine.apiKey}` },
		kind: "machine",
		apiHost: hostOf(machine.apiUrl),
	};
}

export async function resolveModelGatewayForUser(machineId?: string | null): Promise<GatewayEnv> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		throw new Error(
			machineId
				? `Machine ${machineId} not found in your account.`
				: "No machine selected. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		);
	}
	const profile =
		(machine.gatewayProfileId
			? config.gatewayProfiles.find((entry) => entry.id === machine.gatewayProfileId)
			: null) ??
		config.gatewayProfiles.find((entry) => entry.kind === "dedalus") ??
		null;
	if (!profile) {
		throw new Error("No model gateway profile configured.");
	}
	return fromProfile(profile, machine.model, config);
}

function fromProfile(
	profile: GatewayProfile,
	machineModel: string,
	config: Awaited<ReturnType<typeof getUserConfig>>,
): GatewayEnv {
	const model = profile.model || machineModel;
	if (profile.kind === "vercel-ai-gateway") {
		const key =
			profile.apiKey ??
			process.env.AI_GATEWAY_API_KEY ??
			process.env.VERCEL_OIDC_TOKEN ??
			null;
		if (!key) {
			throw new Error(
				"Vercel AI Gateway profile has no API key and no VERCEL_OIDC_TOKEN.",
			);
		}
		const base = normalizeOpenAiBase(profile.baseUrl ?? "https://ai-gateway.vercel.sh");
		return {
			apiUrl: base,
			model,
			headers: {
				Authorization: `Bearer ${key}`,
				"x-ai-gateway-api-key": key,
			},
			kind: profile.kind,
			apiHost: hostOf(base),
		};
	}

	if (profile.kind === "dedalus" || profile.kind === "openai-compatible") {
		if (!profile.baseUrl) {
			throw new Error(`Gateway profile '${profile.name}' is missing a base URL.`);
		}
		const apiKey =
			profile.apiKey ??
			(profile.kind === "dedalus" ? config.providers.dedalus?.apiKey : null) ??
			null;
		if (!apiKey) {
			throw new Error(`Gateway profile '${profile.name}' is missing an API key.`);
		}
		const base = normalizeOpenAiBase(profile.baseUrl);
		return {
			apiUrl: base,
			model,
			headers: { Authorization: `Bearer ${apiKey}` },
			kind: profile.kind,
			apiHost: hostOf(base),
		};
	}

	const exhaustive: never = profile.kind;
	throw new Error(`Unknown gateway kind: ${String(exhaustive)}`);
}

function normalizeOpenAiBase(value: string): string {
	const trimmed = value.trim().replace(/\/$/, "");
	if (trimmed.endsWith("/v1")) return trimmed;
	return `${trimmed}/v1`;
}

function hostOf(value: string): string {
	try {
		return new URL(value).host;
	} catch {
		return value;
	}
}
