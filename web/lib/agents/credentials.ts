/**
 * Agent credential requirements — which API keys each runtime needs
 * and validation before bootstrap / provision.
 */

import { getAgentMeta } from "@/lib/agents";
import type { AgentKind, PublicAiProviderStatus, UserConfig } from "@/lib/user-config/schema";

export type AiKeyField = "anthropic" | "openai" | "dedalus";

export type AgentCredentialRequirement = {
	field: AiKeyField;
	label: string;
	hint: string;
	signupUrl?: string;
	/** When true, bootstrap cannot proceed without this key (or on-file equivalent). */
	required: boolean;
};

/** Config slice used for credential validation (private or public projection). */
export type CredentialCheckConfig = {
	providers: {
		dedalus?: { apiKey?: string; baseUrl?: string; configured?: boolean };
		sprites?: { apiKey?: string; configured?: boolean };
		e2b?: { apiKey?: string; configured?: boolean };
	};
	aiProviderKeys?: UserConfig["aiProviderKeys"];
	aiProviders?: PublicAiProviderStatus;
};

const SIGNUP = {
	anthropic: "https://console.anthropic.com/settings/keys",
	openai: "https://platform.openai.com/api-keys",
	dedalus: "https://dedaluslabs.ai/dashboard/api-keys",
} as const;

/** Keys the UI should surface for a given agent during setup. */
export function agentCredentialRequirements(
	agentKind: AgentKind,
): AgentCredentialRequirement[] {
	switch (agentKind) {
		case "claude-code":
			return [
				{
					field: "anthropic",
					label: "Anthropic API key",
					hint: "Required for headless Claude Code (console.anthropic.com). Subscription login is interactive-only on the VM.",
					signupUrl: SIGNUP.anthropic,
					required: true,
				},
			];
		case "codex":
			return [
				{
					field: "openai",
					label: "OpenAI API key",
					hint: "Required for headless Codex (platform.openai.com). ChatGPT login is interactive-only on the VM.",
					signupUrl: SIGNUP.openai,
					required: true,
				},
			];
		case "openclaw":
			return [
				{
					field: "anthropic",
					label: "Anthropic API key",
					hint: "Default upstream for OpenClaw",
					signupUrl: SIGNUP.anthropic,
					required: false,
				},
				{
					field: "openai",
					label: "OpenAI API key",
					hint: "Optional fallback upstream",
					signupUrl: SIGNUP.openai,
					required: false,
				},
				{
					field: "dedalus",
					label: "Dedalus router key",
					hint: "Routes 200+ models via api.dedaluslabs.ai/v1",
					signupUrl: SIGNUP.dedalus,
					required: false,
				},
			];
		case "hermes":
			return [
				{
					field: "dedalus",
					label: "Dedalus router key",
					hint: "Recommended — one key routes 200+ models",
					signupUrl: SIGNUP.dedalus,
					required: false,
				},
				{
					field: "anthropic",
					label: "Anthropic API key",
					hint: "Direct Anthropic upstream",
					signupUrl: SIGNUP.anthropic,
					required: false,
				},
				{
					field: "openai",
					label: "OpenAI API key",
					hint: "Direct OpenAI upstream",
					signupUrl: SIGNUP.openai,
					required: false,
				},
			];
		default:
			return [];
	}
}

function keyOnFile(config: CredentialCheckConfig, field: AiKeyField): boolean {
	if (field === "dedalus") {
		const p = config.providers.dedalus;
		return Boolean(p?.apiKey || p?.configured);
	}
	if (config.aiProviderKeys?.[field]) return true;
	if (config.aiProviders) {
		if (field === "anthropic") return config.aiProviders.anthropic?.configured ?? false;
		if (field === "openai") return config.aiProviders.openai?.configured ?? false;
	}
	return false;
}

export type DraftAiKeys = Partial<Record<AiKeyField, string>>;

function keyAvailable(
	config: CredentialCheckConfig,
	field: AiKeyField,
	draft?: DraftAiKeys,
): boolean {
	const draftVal = draft?.[field]?.trim();
	if (draftVal) return true;
	return keyOnFile(config, field);
}

function hasAnyGatewayUpstream(
	config: CredentialCheckConfig,
	draft?: DraftAiKeys,
): boolean {
	if (keyAvailable(config, "dedalus", draft)) return true;
	if (keyAvailable(config, "anthropic", draft)) return true;
	if (keyAvailable(config, "openai", draft)) return true;
	if (config.aiProviderKeys?.openrouter?.trim()) return true;
	if (config.aiProviderKeys?.vercelAiGateway?.trim()) return true;
	if (config.aiProviderKeys?.google?.trim()) return true;
	if (config.aiProviderKeys?.custom?.key?.trim()) return true;
	if (config.aiProviders?.openrouter?.configured) return true;
	if (config.aiProviders?.vercelAiGateway?.configured) return true;
	if (config.aiProviders?.google?.configured) return true;
	if (config.aiProviders?.custom?.configured) return true;
	return false;
}

/** Validate that config (plus optional draft keys from a form) can bootstrap this agent. */
export function validateAgentCredentials(
	agentKind: AgentKind,
	config: CredentialCheckConfig,
	draft?: DraftAiKeys,
): { ok: true } | { ok: false; message: string } {
	const label = getAgentMeta(agentKind).name;

	switch (agentKind) {
		case "claude-code":
			if (!keyAvailable(config, "anthropic", draft) && !keyAvailable(config, "dedalus", draft)) {
				return {
					ok: false,
					message:
						"Anthropic API key or Dedalus router key required for Claude Code.",
				};
			}
			return { ok: true };
		case "codex":
			if (!keyAvailable(config, "openai", draft) && !keyAvailable(config, "dedalus", draft)) {
				return {
					ok: false,
					message:
						"OpenAI API key or Dedalus router key required for Codex CLI.",
				};
			}
			return { ok: true };
		case "openclaw":
		case "hermes":
			if (!hasAnyGatewayUpstream(config, draft)) {
				return {
					ok: false,
					message: `At least one AI provider key is required for ${label} (Anthropic, OpenAI, Dedalus, or another configured upstream).`,
				};
			}
			return { ok: true };
		default:
			return { ok: true };
	}
}

/** True when every *required* credential for the agent is on file or in draft. */
export function canBootstrapAgent(
	agentKind: AgentKind,
	config: CredentialCheckConfig,
	draft?: DraftAiKeys,
): boolean {
	return validateAgentCredentials(agentKind, config, draft).ok;
}
