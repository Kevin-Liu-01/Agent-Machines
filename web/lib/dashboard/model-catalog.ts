import type { Mark } from "@/components/Logo";
import { DEFAULT_MODEL } from "@/lib/user-config/schema";

export type ModelProviderGroup = "anthropic" | "openai" | "google" | "meta" | "other";

export type ModelOption = {
	id: string;
	label: string;
	group: ModelProviderGroup;
	/** Short hint in the picker list */
	hint?: string;
	mark?: Mark;
};

export { DEFAULT_MODEL };

export const MODEL_PROVIDER_LABEL: Record<ModelProviderGroup, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	google: "Google",
	meta: "Meta",
	other: "More",
};

/** Curated slugs for the dashboard model picker (Dedalus router format). */
export const MODEL_CATALOG: readonly ModelOption[] = [
	{
		id: "anthropic/claude-opus-4-8",
		label: "Opus 4.8",
		group: "anthropic",
		hint: "default · deepest reasoning",
		mark: "anthropic",
	},
	{
		id: "anthropic/claude-opus-4-8-fast",
		label: "Opus 4.8 Fast",
		group: "anthropic",
		hint: "faster",
		mark: "anthropic",
	},
	{
		id: "anthropic/claude-opus-4-7",
		label: "Opus 4.7",
		group: "anthropic",
		mark: "anthropic",
	},
	{
		id: "anthropic/claude-opus-4-6",
		label: "Opus 4.6",
		group: "anthropic",
		mark: "anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		label: "Sonnet 4.6",
		group: "anthropic",
		hint: "balanced",
		mark: "anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-5",
		label: "Sonnet 4.5",
		group: "anthropic",
		mark: "anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		label: "Haiku 4.5",
		group: "anthropic",
		hint: "fast",
		mark: "anthropic",
	},
	{
		id: "openai/gpt-5.2",
		label: "GPT-5.2",
		group: "openai",
		mark: "openai",
	},
	{
		id: "openai/gpt-5.1",
		label: "GPT-5.1",
		group: "openai",
		mark: "openai",
	},
	{
		id: "openai/o4-mini",
		label: "o4-mini",
		group: "openai",
		hint: "reasoning · efficient",
		mark: "openai",
	},
	{
		id: "openai/gpt-4.1",
		label: "GPT-4.1",
		group: "openai",
		mark: "openai",
	},
	{
		id: "google/gemini-2.5-pro",
		label: "Gemini 2.5 Pro",
		group: "google",
	},
	{
		id: "google/gemini-2.5-flash",
		label: "Gemini 2.5 Flash",
		group: "google",
		hint: "fast",
	},
	{
		id: "meta-llama/llama-4-maverick",
		label: "Llama 4 Maverick",
		group: "meta",
	},
	{
		id: "deepseek/deepseek-v3.2",
		label: "DeepSeek V3.2",
		group: "other",
	},
	{
		id: "mistral/mistral-large-latest",
		label: "Mistral Large",
		group: "other",
	},
] as const;

const CATALOG_BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

const GROUP_ORDER: ModelProviderGroup[] = [
	"anthropic",
	"openai",
	"google",
	"meta",
	"other",
];

export function modelDisplayLabel(
	modelId: string,
	catalog: readonly ModelOption[] = MODEL_CATALOG,
): string {
	return (
		catalog.find((m) => m.id === modelId)?.label ??
		CATALOG_BY_ID.get(modelId)?.label ??
		formatModelSlug(modelId)
	);
}

export function modelProviderMark(modelId: string): Mark | null {
	const known = CATALOG_BY_ID.get(modelId)?.mark;
	if (known) return known;
	if (modelId.startsWith("anthropic/")) return "anthropic";
	if (modelId.startsWith("openai/")) return "openai";
	return null;
}

export function modelProviderGroup(
	modelId: string,
	ownedBy?: string | null,
	name?: string | null,
): ModelProviderGroup {
	const text = `${modelId} ${ownedBy ?? ""} ${name ?? ""}`.toLowerCase();
	if (text.includes("anthropic") || text.includes("claude")) return "anthropic";
	if (text.includes("openai") || text.includes("gpt-") || text.includes("/o")) return "openai";
	if (text.includes("google") || text.includes("gemini")) return "google";
	if (text.includes("meta") || text.includes("llama")) return "meta";
	return "other";
}

export function modelOptionFromId(input: {
	id: string;
	name?: string | null;
	ownedBy?: string | null;
	hint?: string;
}): ModelOption {
	const known = CATALOG_BY_ID.get(input.id);
	if (known) return known;
	const group = modelProviderGroup(input.id, input.ownedBy, input.name);
	return {
		id: input.id,
		label: formatModelName(input.id, input.name),
		group,
		hint: input.hint,
		mark: group === "anthropic" || group === "openai" ? group : undefined,
	};
}

export function groupedModelCatalog(
	catalog: readonly ModelOption[] = MODEL_CATALOG,
): Array<{
	group: ModelProviderGroup;
	label: string;
	models: ModelOption[];
}> {
	const buckets = new Map<ModelProviderGroup, ModelOption[]>();
	for (const option of catalog) {
		const list = buckets.get(option.group) ?? [];
		list.push(option);
		buckets.set(option.group, list);
	}
	return GROUP_ORDER.filter((g) => buckets.has(g)).map((group) => ({
		group,
		label: MODEL_PROVIDER_LABEL[group],
		models: buckets.get(group) ?? [],
	}));
}

function formatModelName(modelId: string, name?: string | null): string {
	const clean = name
		?.replace(/^[^:]+:\s*/, "")
		.replace(/^Claude\s+/i, "")
		.replace(/^OpenAI\s+/i, "")
		.trim();
	return clean || formatModelSlug(modelId);
}

function formatModelSlug(modelId: string): string {
	const slug = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
	return slug
		.replace(/^claude-/, "")
		.replace(/-(\d)-(\d)(?=$|-)/g, "-$1.$2")
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}
