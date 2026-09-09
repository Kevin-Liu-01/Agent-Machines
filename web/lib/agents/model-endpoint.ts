import type { AgentKind } from "@/lib/user-config/schema";
import { DEFAULT_MODEL } from "@/lib/user-config/schema";
import { DEFAULT_CODEX_MODEL, runtimeModel } from "./runtime-model";

function host(baseUrl: string): string {
	try { return new URL(baseUrl).hostname.toLowerCase(); } catch { return ""; }
}

/** Translate portable model names only at a known provider API boundary. */
export function modelForEndpoint(model: string, baseUrl: string): string {
	const endpoint = host(baseUrl);
	if (endpoint === "openrouter.ai" || endpoint === "ai-gateway.vercel.sh") {
		// Both live catalogs use Claude 4.8/4.6; Anthropic native uses 4-8/4-6.
		return model.replace(/^(anthropic\/claude-[a-z]+-\d+)-(\d+)(?=$|-|:)/, "$1.$2");
	}
	if (endpoint === "api.anthropic.com") {
		return model.replace(/^anthropic\//, "").replace(/^(claude-[a-z]+-\d+)\.(\d+)(?=$|-|:)/, "$1-$2");
	}
	if (endpoint === "api.openai.com") return model.replace(/^openai\//, "");
	if (endpoint === "generativelanguage.googleapis.com") return model.replace(/^google\//, "");
	return model;
}

/** Pick an initial model for the endpoint actually selected after key fallback.
 * Explicit choices are retained; obvious native-provider mismatches fail before
 * paid provisioning. Opaque/custom endpoints need an explicit model identifier. */
export function initialWorkerModel(agent: AgentKind, baseUrl: string, requested?: string | null, previous?: string | null): string {
	const explicit = requested?.trim();
	if (explicit && (explicit.length > 200 || /[\x00-\x1f\x7f]/.test(explicit))) throw new Error("Enter a valid model ID (up to 200 characters, without control characters).");
	if (agent === "claude-code" || agent === "codex") return runtimeModel(agent, modelForEndpoint(explicit || previous || "", baseUrl));
	const endpoint = host(baseUrl);
	const known = ["api.openai.com", "api.anthropic.com", "openrouter.ai", "ai-gateway.vercel.sh"].includes(endpoint);
	if (!explicit && !known) throw new Error("Enter the model ID supported by your Google or custom endpoint before launching.");
	let model = explicit || previous?.trim() || DEFAULT_MODEL;
	if (endpoint === "api.openai.com") {
		if (!explicit && !/^(?:openai\/)?(?:gpt-|o\d|ft:)/.test(model)) model = `openai/${DEFAULT_CODEX_MODEL}`;
		if (/^(?:anthropic|google|meta-llama)\//.test(model) || model.startsWith("claude-")) throw new Error("The selected OpenAI endpoint needs an OpenAI model, not a model from another provider.");
	} else if (endpoint === "api.anthropic.com") {
		if (!explicit && !/^(?:anthropic\/)?claude-/.test(model)) model = DEFAULT_MODEL;
		if (!/^(?:anthropic\/)?claude-/.test(model)) throw new Error("The selected Anthropic endpoint needs a Claude model.");
	} else if (endpoint === "generativelanguage.googleapis.com" && /^(?:openai|anthropic)\//.test(model)) {
		throw new Error("The selected Google endpoint needs a model ID from Google.");
	}
	// A custom endpoint's model ID is opaque, even if it happens to start with
	// 'gpt-'. Do not add a provider prefix it did not request.
	return known ? runtimeModel(agent, model) : model;
}
