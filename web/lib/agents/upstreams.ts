/**
 * Upstream / model-router catalog — the single source of truth for which
 * LLM backend an agent talks to. Client-safe (no server imports) so the
 * deploy UI, validation, and the bootstrap runner all agree.
 *
 * Two shapes of upstream:
 *  - Routers (OpenAI-compatible): Vercel AI Gateway, OpenRouter, or any
 *    custom openai-compatible endpoint. Hermes/OpenClaw can use any of
 *    these, picked per-machine via the gateway profile (gatewayProfileId).
 *  - Native providers: codex requires native OpenAI (Responses API),
 *    claude-code requires native Anthropic (Messages API). No router can
 *    stand in for these, so the choice is fixed.
 */

import type { AgentKind, GatewayKind } from "@/lib/user-config/schema";

/** Canonical base URLs (the LLM router/inference endpoints, not control planes). */
export const UPSTREAM_BASE_URL = {
	openai: "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
	openrouter: "https://openrouter.ai/api/v1",
	vercelAiGateway: "https://ai-gateway.vercel.sh/v1",
	google: "https://generativelanguage.googleapis.com/v1beta/openai",
} as const;

export const GATEWAY_KIND_LABEL: Record<GatewayKind, string> = {
	"vercel-ai-gateway": "Vercel AI Gateway",
	"openai-compatible": "OpenAI-compatible",
};

/**
 * Which stored credential a router draws its key from. Matches the
 * `aiProviderKeys` slugs so the UI can
 * show a "needs key" hint and the bootstrap can resolve the key.
 */
export type RouterSource =
	| "vercelAiGateway"
	| "openrouter"
	| "openai"
	| "google"
	| "custom";

export type RouterPreset = {
	/** Stored as machine.gatewayProfileId; first two reuse the seeded profile ids. */
	id: string;
	label: string;
	source: RouterSource;
	baseUrl: string | null;
};

/**
 * Built-in routers offered to hermes/openclaw with zero setup. Keep this in
 * fallback order: Vercel AI Gateway first, OpenRouter second, then direct /
 * custom upstreams.
 */
export const ROUTER_PRESETS: ReadonlyArray<RouterPreset> = [
	{ id: "vercel-ai-gateway", label: "Vercel AI Gateway", source: "vercelAiGateway", baseUrl: UPSTREAM_BASE_URL.vercelAiGateway },
	{ id: "openrouter-router", label: "OpenRouter", source: "openrouter", baseUrl: UPSTREAM_BASE_URL.openrouter },
	{ id: "openai-router", label: "OpenAI (direct)", source: "openai", baseUrl: UPSTREAM_BASE_URL.openai },
	{ id: "google-router", label: "Google (OpenAI-compatible)", source: "google", baseUrl: UPSTREAM_BASE_URL.google },
	{ id: "custom-router", label: "Custom OpenAI-compatible", source: "custom", baseUrl: null },
];

export function routerPresetById(id: string | null | undefined): RouterPreset | null {
	if (!id) return null;
	return ROUTER_PRESETS.find((p) => p.id === id) ?? null;
}

export const DEFAULT_ROUTER_ID = "vercel-ai-gateway";

/** Native (non-router) provider an agent is locked to, if any. */
export function requiredNativeUpstream(
	agentKind: AgentKind,
): "openai" | "anthropic" | null {
	if (agentKind === "codex") return "openai";
	if (agentKind === "claude-code") return "anthropic";
	return null;
}

export function nativeUpstreamLabel(provider: "openai" | "anthropic"): string {
	return provider === "openai" ? "OpenAI (native)" : "Anthropic (native)";
}

export function nativeUpstreamReason(provider: "openai" | "anthropic"): string {
	return provider === "openai"
		? "Codex speaks the OpenAI Responses API — only a native OpenAI key works."
		: "Claude Code speaks the Anthropic Messages API — only a native Anthropic key works.";
}

/**
 * True when the agent runs as a gateway over an OpenAI-compatible upstream
 * and can therefore pick any router (Vercel AI Gateway / OpenRouter / custom).
 */
export function agentUsesRouter(agentKind: AgentKind): boolean {
	return agentKind === "hermes" || agentKind === "openclaw";
}

/** Stored-credential slugs a gateway agent can draw an upstream key from. */
export const ROUTER_SOURCE_KEYS: ReadonlyArray<RouterSource> = [
	"vercelAiGateway",
	"openrouter",
	"openai",
	"google",
	"custom",
];

type GatewayFallbackSource = RouterSource | "anthropic";

const GATEWAY_FALLBACK_SOURCE_KEYS: ReadonlyArray<GatewayFallbackSource> = [
	"vercelAiGateway",
	"openrouter",
	"openai",
	"google",
	"custom",
	"anthropic",
];

export type ReadinessStatus = "ready" | "fallback" | "blocked";

export type AgentUpstreamReadiness = {
	/** "blocked" must stop provisioning until the user adds a key. */
	status: ReadinessStatus;
	/** One-line explanation for the UI. */
	detail: string;
	/** The credential slug to add when blocked/fallback (for deep-links). */
	needs: RouterSource | "openai" | "anthropic" | null;
};

/**
 * Client-side mirror of `validateAgentCredentials`, driven by the public
 * `aiConfigured` map (which provider keys are on file). Drives the spin-up
 * gate: a "blocked" result must prevent provisioning until a key is added.
 *
 *  - native agents (codex/claude-code): require their native key, full stop.
 *  - router agents (hermes/openclaw): "ready" when the selected router has a
 *    key, "fallback" when another upstream key exists, "blocked" when none do.
 */
export function agentUpstreamReadiness(
	agentKind: AgentKind,
	routerId: string,
	aiConfigured: Record<string, boolean>,
): AgentUpstreamReadiness {
	const native = requiredNativeUpstream(agentKind);
	if (native) {
		if (aiConfigured[native]) {
			return { status: "ready", detail: `Uses your ${nativeUpstreamLabel(native)} key.`, needs: null };
		}
		return {
			status: "blocked",
			detail: `Needs a native ${native === "openai" ? "OpenAI" : "Anthropic"} key — ${
				agentKind === "codex" ? "the OpenAI Responses API" : "the Anthropic Messages API"
			} can't run through an OpenAI-compatible router.`,
			needs: native,
		};
	}

	const preset = routerPresetById(routerId);
	if (preset && aiConfigured[preset.source]) {
		return { status: "ready", detail: `Uses ${preset.label}.`, needs: null };
	}
	const anyUpstream = GATEWAY_FALLBACK_SOURCE_KEYS.some((key) => aiConfigured[key]);
	if (anyUpstream) {
		return {
			status: "fallback",
			detail: `${preset?.label ?? "Selected router"} has no key — bootstrap falls back in provider priority order.`,
			needs: preset?.source ?? null,
		};
	}
	return {
		status: "blocked",
		detail: "No AI provider key configured. Add one to deploy a gateway agent.",
		needs: preset?.source ?? "vercelAiGateway",
	};
}
