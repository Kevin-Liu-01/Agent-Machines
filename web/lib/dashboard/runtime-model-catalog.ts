import type { AgentKind } from "@/lib/user-config/schema";
import type { ModelOption } from "./model-catalog";

/** Exclude clearly non-conversational APIs, not unknown/custom text model names. */
export function isTextPickerModel(id: string): boolean {
	const value = id.toLowerCase();
	const slash = value.indexOf("/");
	// A custom model's job name is opaque: "company/audio-notes-assistant"
	// may be a text model. Explicit non-text metadata is handled by the route.
	if (slash >= 0 && !["openai", "google", "anthropic", "black-forest-labs", "stabilityai"].includes(value.slice(0, slash))) return true;
	const slug = slash >= 0 ? value.slice(slash + 1) : value;
	if (/^(?:text-embedding-|text-moderation-|omni-moderation-|tts-\d|whisper-\d|dall-e-\d|gpt-image-|chatgpt-image-|imagen-\d|veo-\d|sora(?:-\d|$)|stable-diffusion-|flux[.-])/.test(slug)) return false;
	if (/^(?:gpt-|gemini-)/.test(slug) && /(?:^|[._-])(?:embeddings?|transcribe|transcription|tts|audio|realtime)(?:$|[._-])/.test(slug)) return false;
	return true;
}

/** Native IDs are normalized without inventing a default for incompatible input. */
export function pickerModelId(agent: AgentKind | null | undefined, id: string): string | null {
	let value = id.trim();
	if (!value || value.length > 200 || /[\x00-\x1f\x7f]/.test(value) || !isTextPickerModel(value)) return null;
	if (agent === "claude-code") {
		value = value.replace(/^anthropic\//, "").replace(/^(claude-[a-z]+-\d+)\.(\d+)(?=$|-|:)/, "$1-$2");
		return /^claude-[a-zA-Z0-9._-]+$/.test(value) ? value : null;
	}
	if (agent === "codex") {
		value = value.replace(/^openai\//, "");
		return /^(?:gpt-|o\d)[a-zA-Z0-9._-]*$/.test(value) ? value : null;
	}
	return value;
}

export function runtimeModelCatalog(models: readonly ModelOption[], agent: AgentKind | null | undefined): ModelOption[] {
	const unique = new Map<string, ModelOption>();
	for (const model of models) {
		const id = pickerModelId(agent, model.id);
		if (id && !unique.has(id)) unique.set(id, { ...model, id });
	}
	return [...unique.values()];
}
