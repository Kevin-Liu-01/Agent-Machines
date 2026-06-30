/**
 * Arm enumeration -- the credential-gated feasible set of routing choices.
 *
 * The bandit only ever explores within this set: infeasible runtimes (missing
 * native key / no upstream) and unconfigured substrates are pruned by reusing
 * the existing credential gate (validateAgentCredentials + agentUpstreamReadiness).
 * The router axis applies only to gateway agents (hermes/openclaw).
 */

import {
	validateAgentCredentials,
	type CredentialCheckConfig,
} from "@/lib/agents/credentials";
import {
	ROUTER_PRESETS,
	agentUpstreamReadiness,
	agentUsesRouter,
} from "@/lib/agents/upstreams";
import { MODEL_CATALOG } from "@/lib/dashboard/model-catalog";
import {
	AGENT_KINDS,
	PROVIDER_KINDS,
	type AgentKind,
	type ProviderKind,
	type UserConfig,
} from "@/lib/user-config/schema";
import type { Arm } from "@/lib/learning/types";

/**
 * Candidate models per runtime -- the v1 curated set (decision: small per-runtime
 * list, not the full catalog, which would keep cells sparse forever). These are
 * a tunable seed; the bandit learns to avoid weak ones. Router agents use
 * namespaced ids; native agents use the provider's own ids.
 *
 * TODO(PR#1 review c7): these ids are not validated against any live provider
 * catalog -- an unknown id provisions fine (stored on MachineRef) but fails at
 * inference. Validate against the provider's model list (or a strict per-runtime
 * allowlist) before a recommended model reaches provisioning.
 */
const ANTHROPIC_MODELS = MODEL_CATALOG
	.filter((m) => m.group === "anthropic")
	.map((m) => m.id);

const OPENAI_MODELS = MODEL_CATALOG
	.filter((m) => m.group === "openai")
	.map((m) => m.id);

export const CURATED_MODELS: Record<AgentKind, string[]> = {
	hermes: [...ANTHROPIC_MODELS.slice(0, 4), ...OPENAI_MODELS.slice(0, 2)],
	openclaw: ANTHROPIC_MODELS.slice(0, 4),
	"claude-code": ANTHROPIC_MODELS.slice(0, 4).map((id) =>
		id.replace(/^anthropic\//, ""),
	),
	codex: OPENAI_MODELS.slice(0, 3).map((id) => id.replace(/^openai\//, "")),
};

/** Project a UserConfig into the slice the credential checks read. */
export function credentialCheckConfig(config: UserConfig): CredentialCheckConfig {
	return {
		providers: config.providers,
		aiProviderKeys: config.aiProviderKeys,
	};
}

/** Which upstream credential slugs are on file (drives router readiness). */
export function aiConfiguredMap(config: UserConfig): Record<string, boolean> {
	const keys = config.aiProviderKeys ?? {};
	return {
		anthropic: Boolean(keys.anthropic),
		openai: Boolean(keys.openai),
		openrouter: Boolean(keys.openrouter),
		vercelAiGateway: Boolean(keys.vercelAiGateway),
		google: Boolean(keys.google),
		custom: Boolean(keys.custom?.key),
	};
}

/**
 * Routers a gateway agent can use right now (key on file). When none are ready,
 * fall back to null (let bootstrap pick a configured upstream) rather than
 * fabricating a specific router id the user may not have credentials for.
 */
function readyRouters(runtime: AgentKind, aiConfigured: Record<string, boolean>): (string | null)[] {
	const ready = ROUTER_PRESETS.filter(
		(p) => agentUpstreamReadiness(runtime, p.id, aiConfigured).status === "ready",
	).map((p) => p.id);
	return ready.length > 0 ? ready : [null];
}

function providerConfigured(config: UserConfig, provider: ProviderKind): boolean {
	switch (provider) {
		case "dedalus":
			return Boolean(config.providers.dedalus?.apiKey);
		case "e2b":
			return Boolean(config.providers.e2b?.apiKey);
		case "sprites":
			return Boolean(config.providers.sprites?.apiKey);
		case "vercel":
			return Boolean(config.providers.vercel?.token);
	}
}

/** The credential-gated feasible arm set: {runtime x substrate x model x router}. */
export function enumerateFeasibleArms(config: UserConfig): Arm[] {
	const ccc = credentialCheckConfig(config);
	const aiConfigured = aiConfiguredMap(config);
	const substrates = PROVIDER_KINDS.filter((p) =>
		providerConfigured(config, p),
	);
	const arms: Arm[] = [];

	for (const runtime of AGENT_KINDS) {
		if (!validateAgentCredentials(runtime, ccc).ok) continue;
		const models = CURATED_MODELS[runtime] ?? [];
		const routers = agentUsesRouter(runtime)
			? readyRouters(runtime, aiConfigured)
			: [null];
		for (const substrate of substrates) {
			for (const model of models) {
				for (const routerId of routers) {
					arms.push({ runtime, substrate, model, routerId });
				}
			}
		}
	}
	return arms;
}
