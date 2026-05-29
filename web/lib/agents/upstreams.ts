/**
 * Upstream / model-router catalog — the single source of truth for which
 * LLM backend an agent talks to. Client-safe (no server imports) so the
 * deploy UI, validation, and the bootstrap runner all agree.
 *
 * Two shapes of upstream:
 *  - Routers (OpenAI-compatible): Dedalus, Vercel AI Gateway, or any
 *    custom openai-compatible endpoint. Hermes/OpenClaw can use any of
 *    these, picked per-machine via the gateway profile (gatewayProfileId).
 *  - Native providers: codex requires native OpenAI (Responses API),
 *    claude-code requires native Anthropic (Messages API). No router can
 *    stand in for these, so the choice is fixed.
 */

import type { AgentKind, GatewayKind } from "@/lib/user-config/schema";

/** Canonical base URLs (the LLM router/inference endpoints, not control planes). */
export const UPSTREAM_BASE_URL = {
	dedalus: "https://api.dedaluslabs.ai/v1",
	openai: "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
	openrouter: "https://openrouter.ai/api/v1",
	vercelAiGateway: "https://ai-gateway.vercel.sh/v1",
	google: "https://generativelanguage.googleapis.com/v1beta/openai",
} as const;

export const GATEWAY_KIND_LABEL: Record<GatewayKind, string> = {
	dedalus: "Dedalus router",
	"vercel-ai-gateway": "Vercel AI Gateway",
	"openai-compatible": "OpenAI-compatible",
};

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
 * and can therefore pick any router (Dedalus / Vercel AI Gateway / custom).
 */
export function agentUsesRouter(agentKind: AgentKind): boolean {
	return agentKind === "hermes" || agentKind === "openclaw";
}
