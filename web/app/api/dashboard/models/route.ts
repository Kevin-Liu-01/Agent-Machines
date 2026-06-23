/**
 * GET /api/dashboard/models
 *
 * Returns a model picker catalog from the user's active router when possible.
 * Falls back to public OpenAI-compatible catalogs, then the local curated list.
 */

import {
	MODEL_CATALOG,
	modelOptionFromId,
	type ModelOption,
} from "@/lib/dashboard/model-catalog";
import {
	UPSTREAM_BASE_URL,
	routerPresetById,
	type RouterSource,
} from "@/lib/agents/upstreams";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import type {
	GatewayProfile,
	UserConfig,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const DEDALUS_DCS_HOST = "dcs.dedaluslabs.ai";
const CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_SOURCE = "local fallback";

type CatalogSource = {
	id: string;
	label: string;
	baseUrl: string;
	apiKey: string;
};

type UpstreamModel = {
	id?: unknown;
	name?: unknown;
	owned_by?: unknown;
	description?: unknown;
	created?: unknown;
	released?: unknown;
};

type CacheEntry = {
	expiresAt: number;
	payload: ModelsPayload;
};

type ModelsPayload = {
	ok: true;
	source: string;
	fallback: boolean;
	models: ModelOption[];
	fetchedAt: string;
};

const cache = new Map<string, CacheEntry>();

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const config = await getUserConfig();
	const machineId = new URL(request.url).searchParams.get("machineId");
	const sources = catalogSources(config, machineId);

	for (const source of sources) {
		const key = `${source.id}:${source.baseUrl}:${Boolean(source.apiKey)}`;
		const cached = cache.get(key);
		if (cached && cached.expiresAt > Date.now()) {
			return json(cached.payload);
		}
		try {
			const models = await fetchCatalog(source);
			if (models.length === 0) continue;
			const payload: ModelsPayload = {
				ok: true,
				source: source.label,
				fallback: false,
				models,
				fetchedAt: new Date().toISOString(),
			};
			cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
			return json(payload);
		} catch (err) {
			console.warn(
				"model catalog source failed",
				source.label,
				err instanceof Error ? err.message : err,
			);
		}
	}

	return json({
		ok: true,
		source: FALLBACK_SOURCE,
		fallback: true,
		models: [...MODEL_CATALOG],
		fetchedAt: new Date().toISOString(),
	});
}

function json(payload: ModelsPayload): Response {
	return Response.json(payload, {
		headers: {
			"Cache-Control": "private, max-age=300",
		},
	});
}

async function fetchCatalog(source: CatalogSource): Promise<ModelOption[]> {
	const response = await fetch(modelsUrl(source.baseUrl), {
		cache: "no-store",
		headers: authHeaders(source),
		signal: AbortSignal.timeout(7000),
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	const payload = (await response.json()) as { data?: UpstreamModel[] };
	const raw = Array.isArray(payload.data) ? payload.data : [];
	return curateModels(
		raw
			.map((entry) => {
				const id = typeof entry.id === "string" ? entry.id.trim() : "";
				if (!id) return null;
				return {
					option: modelOptionFromId({
						id,
						name: typeof entry.name === "string" ? entry.name : null,
						ownedBy:
							typeof entry.owned_by === "string" ? entry.owned_by : null,
					}),
					created:
						typeof entry.created === "number"
							? entry.created
							: typeof entry.released === "number"
								? entry.released
								: 0,
				};
			})
			.filter((entry): entry is { option: ModelOption; created: number } =>
				Boolean(entry),
			),
	);
}

function curateModels(
	models: Array<{ option: ModelOption; created: number }>,
): ModelOption[] {
	const byId = new Map<string, { option: ModelOption; created: number }>();
	for (const model of models) {
		if (!byId.has(model.option.id)) byId.set(model.option.id, model);
	}

	const useful = [...byId.values()].filter(({ option }) => isPickerModel(option.id));
	const source = useful.length >= 12 ? useful : [...byId.values()];
	return source
		.sort((a, b) => scoreModel(b) - scoreModel(a))
		.slice(0, 80)
		.map(({ option }) => option);
}

function scoreModel(model: { option: ModelOption; created: number }): number {
	const id = model.option.id.toLowerCase();
	let score = model.created / 1000;
	if (id.includes("claude-opus")) score += 10_000_000;
	if (id.includes("claude-sonnet")) score += 9_000_000;
	if (id.includes("gpt-5")) score += 8_000_000;
	if (id.includes("gemini")) score += 7_000_000;
	score += modelVersionScore(id);
	if (id.includes("latest")) score += 500_000;
	if (id.includes("fast")) score -= 1_000;
	return score;
}

function modelVersionScore(id: string): number {
	const familyMatch = /(?:opus|sonnet|haiku|gpt|gemini|llama)[^\d]*(\d+)(?:[.-](\d{1,2})(?!\d))?/.exec(id);
	if (!familyMatch) return 0;
	const major = Number(familyMatch[1] ?? 0);
	const minor = Number(familyMatch[2] ?? 0);
	const dateMatch = /(?:^|[.-])((?:20)?\d{6,8})(?:$|[.-])/.exec(id);
	const date = dateMatch ? Number(dateMatch[1]) : 0;
	return major * 1_000_000 + minor * 100_000 + Math.min(date / 100_000, 999);
}

function isPickerModel(id: string): boolean {
	const value = id.toLowerCase();
	return [
		/anthropic\/claude-(opus|sonnet|haiku|fable|mythos)/,
		/~anthropic\/claude-/,
		/openai\/(gpt-[45]|o[0-9]|chatgpt)/,
		/google\/gemini/,
		/(meta-llama|meta)\/llama/,
		/deepseek\//,
		/mistral(ai)?\//,
		/x-ai\//,
	].some((pattern) => pattern.test(value));
}

function catalogSources(
	config: UserConfig,
	machineId: string | null,
): CatalogSource[] {
	const machine =
		config.machines.find((m) => m.id === machineId) ??
		config.machines.find((m) => m.id === config.activeMachineId) ??
		null;
	const sources: CatalogSource[] = [];
	if (machine?.gatewayProfileId) {
		const profile = config.gatewayProfiles.find(
			(p) => p.id === machine.gatewayProfileId,
		);
		if (profile) sources.push(sourceFromProfile(profile, config));
		const preset = routerPresetById(machine.gatewayProfileId);
		if (preset) sources.push(sourceFromRouter(preset.source, preset.baseUrl, config));
	}

	if (config.providers.dedalus?.apiKey) {
		sources.push(sourceFromRouter("dedalus", UPSTREAM_BASE_URL.dedalus, config));
	}
	if (config.aiProviderKeys.vercelAiGateway) {
		sources.push(sourceFromRouter("vercelAiGateway", UPSTREAM_BASE_URL.vercelAiGateway, config));
	}
	if (config.aiProviderKeys.openrouter) {
		sources.push(sourceFromRouter("openrouter", UPSTREAM_BASE_URL.openrouter, config));
	}
	if (config.aiProviderKeys.openai) {
		sources.push(sourceFromRouter("openai", UPSTREAM_BASE_URL.openai, config));
	}
	if (config.aiProviderKeys.google) {
		sources.push(sourceFromRouter("google", UPSTREAM_BASE_URL.google, config));
	}
	if (config.aiProviderKeys.custom?.url) {
		sources.push(sourceFromRouter("custom", config.aiProviderKeys.custom.url, config));
	}

	sources.push({
		id: "vercel-public",
		label: "Vercel AI Gateway",
		baseUrl: UPSTREAM_BASE_URL.vercelAiGateway,
		apiKey: "",
	});
	sources.push({
		id: "openrouter-public",
		label: "OpenRouter",
		baseUrl: UPSTREAM_BASE_URL.openrouter,
		apiKey: "",
	});

	return dedupeSources(sources.filter((source) => source.baseUrl));
}

function sourceFromProfile(
	profile: GatewayProfile,
	config: UserConfig,
): CatalogSource {
	if (profile.kind === "dedalus") {
		return sourceFromRouter("dedalus", profile.baseUrl, config);
	}
	if (profile.kind === "vercel-ai-gateway") {
		return {
			id: profile.id,
			label: profile.name || "Vercel AI Gateway",
			baseUrl: profile.baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway,
			apiKey:
				profile.apiKey ??
				config.aiProviderKeys.vercelAiGateway ??
				process.env.VERCEL_OIDC_TOKEN?.trim() ??
				"",
		};
	}
	const baseUrl = profile.baseUrl ?? UPSTREAM_BASE_URL.openai;
	return {
		id: profile.id,
		label: profile.name || "OpenAI-compatible",
		baseUrl,
		apiKey: profile.apiKey ?? inferKey(baseUrl, config),
	};
}

function sourceFromRouter(
	source: RouterSource,
	baseUrl: string | null,
	config: UserConfig,
): CatalogSource {
	const ai = config.aiProviderKeys;
	switch (source) {
		case "dedalus":
			return {
				id: "dedalus",
				label: "Dedalus router",
				baseUrl: normalizeDedalusBase(baseUrl ?? config.providers.dedalus?.baseUrl),
				apiKey: config.providers.dedalus?.apiKey ?? "",
			};
		case "vercelAiGateway":
			return {
				id: "vercel-ai-gateway",
				label: "Vercel AI Gateway",
				baseUrl: baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway,
				apiKey: ai.vercelAiGateway ?? process.env.VERCEL_OIDC_TOKEN?.trim() ?? "",
			};
		case "openai":
			return {
				id: "openai",
				label: "OpenAI",
				baseUrl: baseUrl ?? UPSTREAM_BASE_URL.openai,
				apiKey: ai.openai ?? "",
			};
		case "openrouter":
			return {
				id: "openrouter",
				label: "OpenRouter",
				baseUrl: baseUrl ?? UPSTREAM_BASE_URL.openrouter,
				apiKey: ai.openrouter ?? "",
			};
		case "google":
			return {
				id: "google",
				label: "Google",
				baseUrl: baseUrl ?? UPSTREAM_BASE_URL.google,
				apiKey: ai.google ?? "",
			};
		case "custom":
			return {
				id: "custom",
				label: ai.custom?.label ?? "Custom router",
				baseUrl: baseUrl ?? ai.custom?.url ?? "",
				apiKey: ai.custom?.key ?? "",
			};
	}
}

function inferKey(baseUrl: string, config: UserConfig): string {
	const lower = baseUrl.toLowerCase();
	if (lower.includes("openrouter")) return config.aiProviderKeys.openrouter ?? "";
	if (lower.includes("openai.com")) return config.aiProviderKeys.openai ?? "";
	if (lower.includes("dedalus")) return config.providers.dedalus?.apiKey ?? "";
	if (lower.includes("ai-gateway.vercel")) {
		return config.aiProviderKeys.vercelAiGateway ?? process.env.VERCEL_OIDC_TOKEN?.trim() ?? "";
	}
	if (lower.includes("googleapis")) return config.aiProviderKeys.google ?? "";
	return config.aiProviderKeys.custom?.key ?? "";
}

function dedupeSources(sources: CatalogSource[]): CatalogSource[] {
	const seen = new Set<string>();
	const out: CatalogSource[] = [];
	for (const source of sources) {
		const key = `${source.baseUrl.replace(/\/$/, "")}:${Boolean(source.apiKey)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(source);
	}
	return out;
}

function normalizeDedalusBase(baseUrl: string | null | undefined): string {
	if (!baseUrl || baseUrl.includes(DEDALUS_DCS_HOST)) return UPSTREAM_BASE_URL.dedalus;
	const trimmed = baseUrl.trim().replace(/\/$/, "");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function modelsUrl(baseUrl: string): string {
	const base = baseUrl.trim().replace(/\/$/, "");
	if (base.endsWith("/v1") || base.endsWith("/api/v1")) return `${base}/models`;
	return `${base}/v1/models`;
}

function authHeaders(source: CatalogSource): HeadersInit {
	if (!source.apiKey) return {};
	const lower = source.baseUrl.toLowerCase();
	if (lower.includes("anthropic.com")) {
		return {
			"x-api-key": source.apiKey,
			"anthropic-version": "2023-06-01",
		};
	}
	return {
		Authorization: `Bearer ${source.apiKey}`,
		"x-api-key": source.apiKey,
	};
}
