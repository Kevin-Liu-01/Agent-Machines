/**
 * GET /api/dashboard/models
 *
 * Uses the selected Worker's actual native provider or configured router.
 * Public/local suggestions stay runtime-compatible and do not imply availability.
 */

import { createHash } from "node:crypto";

import {
	MODEL_CATALOG,
	modelOptionFromId,
	type ModelOption,
} from "@/lib/dashboard/model-catalog";
import {
	UPSTREAM_BASE_URL,
	routerPresetById,
	requiredNativeUpstream,
	type RouterSource,
} from "@/lib/agents/upstreams";
import { getUserConfig } from "@/lib/user-config/clerk";
import { keyForModelEndpoint } from "@/lib/agents/endpoint-key";
import { pickerModelId, runtimeModelCatalog } from "@/lib/dashboard/runtime-model-catalog";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import type {
	GatewayProfile,
	UserConfig,
	AgentKind,
	MachineRef,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_SOURCE = "local fallback";
const MAX_CACHE_ENTRIES = 200;
const CATALOG_BUDGET_MS = 15_000;
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;

type CatalogSource = {
	id: string;
	label: string;
	baseUrl: string;
	apiKey: string;
	public?: boolean;
};

type UpstreamModel = {
	id?: unknown;
	name?: unknown;
	owned_by?: unknown;
	description?: unknown;
	created?: unknown;
	released?: unknown;
	display_name?: unknown;
	created_at?: unknown;
	type?: unknown;
	architecture?: { output_modalities?: unknown };
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
	const machine = config.machines.find((m) => m.id === (machineId ?? config.activeMachineId) && !m.archived) ?? null;
	if (machineId !== null && !machine) return Response.json({ error: "machine_not_found" }, { status: 404 });
	const agent = machine?.agentKind ?? config.draftAgentKind;
	const sources = catalogSources(config, machine, agent);
	const context = `${machine?.id ?? "draft"}:${agent ?? "unspecified"}`;
	const deadline = Date.now() + CATALOG_BUDGET_MS;
	for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key);

	for (const source of sources) {
		const key = `${userId}:${context}:${source.id}:${source.baseUrl}:${credentialDigest(source.apiKey)}`;
		const cached = cache.get(key);
		if (cached && cached.expiresAt > Date.now()) {
			return json(cached.payload);
		}
		if (Date.now() >= deadline) break;
		try {
			const models = await fetchCatalog(source, agent, deadline);
			if (models.length === 0) continue;
			const payload: ModelsPayload = {
				ok: true,
				source: source.label,
				fallback: source.public === true,
				models,
				fetchedAt: new Date().toISOString(),
			};
			cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
			while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
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
		models: runtimeModelCatalog(MODEL_CATALOG, agent),
		fetchedAt: new Date().toISOString(),
	});
}

function json(payload: ModelsPayload): Response {
	return Response.json(payload, {
		headers: {
			"Cache-Control": "private, no-store",
		},
	});
}

async function fetchCatalog(source: CatalogSource, agent: AgentKind | null | undefined, deadline: number): Promise<ModelOption[]> {
	const response = await fetch(modelsUrl(source.baseUrl), {
		cache: "no-store",
		redirect: "error",
		headers: authHeaders(source),
		signal: AbortSignal.timeout(Math.max(1, Math.min(7000, deadline - Date.now()))),
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	const payload = (await readCatalogJson(response)) as { data?: UpstreamModel[] };
	const raw = Array.isArray(payload.data) ? payload.data : [];
	return curateModels(
		raw
			.map((entry) => {
				if (!entry || typeof entry !== "object") return null;
				const outputs = entry.architecture?.output_modalities;
				if (Array.isArray(outputs) && outputs.length && !outputs.includes("text")) return null;
				if (typeof entry.type === "string" && /^(?:embedding|image|audio|transcription|moderation|rerank)$/.test(entry.type)) return null;
				const id = typeof entry.id === "string" ? pickerModelId(agent, entry.id) : null;
				if (!id) return null;
				return {
					option: modelOptionFromId({
						id,
						name: typeof entry.display_name === "string" ? entry.display_name : typeof entry.name === "string" ? entry.name : null,
						ownedBy:
							typeof entry.owned_by === "string" ? entry.owned_by : null,
					}),
					created:
						typeof entry.created === "number"
							? entry.created
							: typeof entry.released === "number"
								? entry.released
									: typeof entry.created_at === "string" ? (Date.parse(entry.created_at) || 0) / 1000 : 0,
				};
			})
			.filter((entry): entry is { option: ModelOption; created: number } =>
				Boolean(entry),
			),
	);
}

async function readCatalogJson(response: Response): Promise<unknown> {
	if (Number(response.headers.get("content-length")) > MAX_CATALOG_BYTES) throw new Error("Catalog exceeds its byte limit");
	const reader = response.body?.getReader();
	if (!reader) return {};
	const chunks: Uint8Array[] = []; let size = 0;
	try {
		while (true) {
			const chunk = await reader.read(); if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > MAX_CATALOG_BYTES) throw new Error("Catalog exceeds its byte limit");
			chunks.push(chunk.value);
		}
	} finally { await reader.cancel().catch(() => undefined); }
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function curateModels(
	models: Array<{ option: ModelOption; created: number }>,
): ModelOption[] {
	const byId = new Map<string, { option: ModelOption; created: number }>();
	for (const model of models) {
		if (!byId.has(model.option.id)) byId.set(model.option.id, model);
	}

	return [...byId.values()]
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

function catalogSources(
	config: UserConfig,
	machine: MachineRef | null,
	agent: AgentKind | null | undefined,
): CatalogSource[] {
	const sources: CatalogSource[] = [];
	const native = agent ? requiredNativeUpstream(agent) : null;
	if (native) {
		const key = config.aiProviderKeys[native];
		if (key) sources.push({ id: `native-${native}`, label: native === "anthropic" ? "Anthropic" : "OpenAI", baseUrl: UPSTREAM_BASE_URL[native], apiKey: key });
	}
	if (!native) {
		if (machine?.gatewayProfileId) {
			const profile = config.gatewayProfiles.find(
				(p) => p.id === machine.gatewayProfileId,
			);
			if (profile && !profile.baseUrl?.toLowerCase().includes("dedalus")) {
				sources.push(sourceFromProfile(profile, config));
			}
			const preset = routerPresetById(machine.gatewayProfileId);
			if (preset) sources.push(sourceFromRouter(preset.source, preset.baseUrl, config));
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
		if (config.aiProviderKeys.anthropic) sources.push({ id: "anthropic", label: "Anthropic", baseUrl: UPSTREAM_BASE_URL.anthropic, apiKey: config.aiProviderKeys.anthropic });
		if (config.aiProviderKeys.google) {
			sources.push(sourceFromRouter("google", UPSTREAM_BASE_URL.google, config));
		}
		if (config.aiProviderKeys.custom?.url) {
			sources.push(sourceFromRouter("custom", config.aiProviderKeys.custom.url, config));
		}
	}

	sources.push({
		id: "vercel-public",
		label: "Vercel AI Gateway",
		baseUrl: UPSTREAM_BASE_URL.vercelAiGateway,
		apiKey: "",
		public: true,
	});
	sources.push({
		id: "openrouter-public",
		label: "OpenRouter",
		baseUrl: UPSTREAM_BASE_URL.openrouter,
		apiKey: "",
		public: true,
	});

	return dedupeSources(sources.filter((source) => source.baseUrl));
}

function sourceFromProfile(
	profile: GatewayProfile,
	config: UserConfig,
): CatalogSource {
	if (profile.kind === "vercel-ai-gateway") {
		return {
			id: profile.id,
			label: profile.name || "Vercel AI Gateway",
			baseUrl: profile.baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway,
			apiKey: profile.apiKey ?? keyForModelEndpoint(profile.baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway, config.aiProviderKeys),
		};
	}
	const baseUrl = profile.baseUrl ?? UPSTREAM_BASE_URL.openai;
	return {
		id: profile.id,
		label: profile.name || "OpenAI-compatible",
		baseUrl,
		apiKey: profile.apiKey ?? keyForModelEndpoint(baseUrl, config.aiProviderKeys),
	};
}

function sourceFromRouter(
	source: RouterSource,
	baseUrl: string | null,
	config: UserConfig,
): CatalogSource {
	const ai = config.aiProviderKeys;
	switch (source) {
		case "vercelAiGateway":
			return {
				id: "vercel-ai-gateway",
				label: "Vercel AI Gateway",
				baseUrl: baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway,
				apiKey: ai.vercelAiGateway ?? "",
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

function credentialDigest(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

function dedupeSources(sources: CatalogSource[]): CatalogSource[] {
	const seen = new Set<string>();
	const out: CatalogSource[] = [];
	for (const source of sources) {
		const key = `${source.baseUrl.replace(/\/$/, "")}:${credentialDigest(source.apiKey)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(source);
	}
	return out;
}

function modelsUrl(baseUrl: string): string {
	const base = baseUrl.trim().replace(/\/$/, "");
	if (base.endsWith("/v1") || base.endsWith("/api/v1") || base.endsWith("/v1beta/openai")) return `${base}/models`;
	return `${base}/v1/models`;
}

function authHeaders(source: CatalogSource): HeadersInit {
	if (!source.apiKey) return {};
	if (new URL(source.baseUrl).origin === "https://api.anthropic.com") {
		return {
			"x-api-key": source.apiKey,
			"anthropic-version": "2023-06-01",
		};
	}
	return {
		Authorization: `Bearer ${source.apiKey}`,
	};
}
