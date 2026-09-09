import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type MachineRef, type UserConfig } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), getUserId: vi.fn() }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.getConfig }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.getUserId }));

let GET: typeof import("@/app/api/dashboard/models/route").GET;
beforeEach(async () => {
	vi.resetModules();
	vi.clearAllMocks();
	for (const name of ["AI_GATEWAY_API_KEY", "AI_GATEWAY_KEY", "VERCEL_OIDC_TOKEN", "OPENROUTER_API_KEY", "OPENAI_API_KEY"]) vi.stubEnv(name, `deployment-secret-${name}`);
	mocks.getUserId.mockResolvedValue("tenant-a");
	mocks.getConfig.mockResolvedValue(structuredClone(DEFAULT_USER_CONFIG));
	({ GET } = await import("@/app/api/dashboard/models/route"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function catalog(id: string) { return Response.json({ data: [{ id }] }); }
function request(machineId?: string) { return new Request(`https://agent-machines.test/api/dashboard/models${machineId === undefined ? "" : `?machineId=${encodeURIComponent(machineId)}`}`); }
function privateConfig(key: string): UserConfig {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys = { custom: { key, url: "https://models.tenant.test/v1", label: "Private models" } };
	return config;
}

describe("GET /api/dashboard/models credential isolation", () => {
	it("fetches public catalogs without deployment credentials for a new account", async () => {
		const fetcher = vi.fn(async () => catalog("openai/gpt-5"));
		vi.stubGlobal("fetch", fetcher);
		const response = await GET(request());
		expect(response.status).toBe(200);
		expect(fetcher).toHaveBeenCalled();
		for (const [, options] of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
			expect(new Headers(options.headers).has("authorization")).toBe(false);
			expect(new Headers(options.headers).has("x-api-key")).toBe(false);
		}
	});

	it("does not serve another tenant's private cached catalog", async () => {
		const fetcher = vi.fn(async (_url: string, options: RequestInit) => catalog(new Headers(options.headers).get("authorization") === "Bearer tenant-a-key" ? "private/model-a" : "private/model-b"));
		vi.stubGlobal("fetch", fetcher);
		mocks.getConfig.mockResolvedValue(privateConfig("tenant-a-key"));
		const first = await (await GET(request())).json();
		mocks.getUserId.mockResolvedValue("tenant-b");
		mocks.getConfig.mockResolvedValue(privateConfig("tenant-b-key"));
		const second = await (await GET(request())).json();
		expect(first.models[0].id).toBe("private/model-a");
		expect(second.models[0].id).toBe("private/model-b");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("refreshes a private catalog after the same tenant rotates its key", async () => {
		const fetcher = vi.fn(async () => catalog("private/model"));
		vi.stubGlobal("fetch", fetcher);
		mocks.getConfig.mockResolvedValue(privateConfig("old-key"));
		await GET(request());
		await GET(request());
		expect(fetcher).toHaveBeenCalledTimes(1);
		mocks.getConfig.mockResolvedValue(privateConfig("new-key"));
		await GET(request());
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("never sends a provider key to an origin that merely contains the provider name", async () => {
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { openai: "tenant-openai-key" };
		config.activeMachineId = "worker";
		config.machines = [{ id: "worker", gatewayProfileId: "lookalike" } as MachineRef];
		config.gatewayProfiles = [{ id: "lookalike", name: "Lookalike", kind: "openai-compatible", baseUrl: "https://api.openai.com.attacker.test/v1", apiKey: null, model: "", createdAt: "2026-09-09", updatedAt: "2026-09-09" }];
		mocks.getConfig.mockResolvedValue(config);
		const fetcher = vi.fn(async () => catalog("private/model"));
		vi.stubGlobal("fetch", fetcher);
		await GET(request());
		const [, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(new Headers(options.headers).has("authorization")).toBe(false);
	});
});

function runtimeConfig(agentKind: MachineRef["agentKind"]): UserConfig {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.activeMachineId = "worker";
	config.machines = [{ id: "worker", agentKind, model: agentKind === "claude-code" ? "claude-sonnet-4-6" : "gpt-5.2", archived: false } as MachineRef];
	return config;
}
function entries(...data: Array<string | Record<string, unknown>>) { return Response.json({ data: data.map(value => typeof value === "string" ? { id: value } : value) }); }

describe("GET /api/dashboard/models runtime correctness", () => {
	it("uses the actual native Anthropic catalog and tenant key for Claude Code", async () => {
		const config = runtimeConfig("claude-code");
		config.aiProviderKeys = { anthropic: "tenant-anthropic", openai: "tenant-openai", vercelAiGateway: "tenant-gateway" };
		mocks.getConfig.mockResolvedValue(config);
		const fetcher = vi.fn(async () => entries({ id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" }, "anthropic/claude-sonnet-4.6", "gpt-5.2", "google/gemini-2.5-pro"));
		vi.stubGlobal("fetch", fetcher);
		const body = await (await GET(request("worker"))).json();
		const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(new URL(url).origin).toBe("https://api.anthropic.com");
		expect(new Headers(options.headers).get("x-api-key")).toBe("tenant-anthropic");
		expect(new Headers(options.headers).get("anthropic-version")).toBe("2023-06-01");
		expect(body.models.map((m: { id: string }) => m.id)).toEqual(["claude-sonnet-4-6"]);
		expect(body.models[0].label).toBe("Sonnet 4.6");
		expect(body.fallback).toBe(false);
	});

	it("Codex prefers OpenAI and never returns audio, embeddings, or image generation models", async () => {
		const config = runtimeConfig("codex"); config.aiProviderKeys = { openai: "tenant-openai", openrouter: "tenant-router" };
		mocks.getConfig.mockResolvedValue(config);
		const fetcher = vi.fn(async () => entries("gpt-5.2", "openai/gpt-5.2", "o4-mini", "gpt-4o-mini-transcribe", "gpt-4o-audio-preview", "gpt-image-1", "text-embedding-3-small", "google/gemini-2.5-pro"));
		vi.stubGlobal("fetch", fetcher);
		const body = await (await GET(request("worker"))).json();
		expect(new URL((fetcher.mock.calls[0] as unknown as [string])[0]).origin).toBe("https://api.openai.com");
		expect(body.models.map((m: { id: string }) => m.id).sort()).toEqual(["gpt-5.2", "o4-mini"]);
	});

	it.each(["foreign-worker", "", "archived-worker"])("rejects explicit unavailable machine %j without an active-machine fallback", async (id) => {
		const config = runtimeConfig("claude-code"); config.machines.push({ id: "archived-worker", archived: true, agentKind: "codex" } as MachineRef);
		mocks.getConfig.mockResolvedValue(config); const fetcher = vi.fn(async () => catalog("gpt-5.2")); vi.stubGlobal("fetch", fetcher);
		expect((await GET(request(id))).status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
	});

	it("normalizes and filters a small public fallback instead of restoring incompatible models", async () => {
		mocks.getConfig.mockResolvedValue(runtimeConfig("claude-code"));
		vi.stubGlobal("fetch", vi.fn(async () => entries("anthropic/claude-sonnet-4.6", "claude-sonnet-4-6", "openai/gpt-5.2", "google/gemini-2.5-pro", "openai/text-embedding-3-small")));
		const body = await (await GET(request("worker"))).json();
		expect(body.models.map((m: { id: string }) => m.id)).toEqual(["claude-sonnet-4-6"]);
		expect(body.fallback).toBe(true);
	});

	it("keeps runtime-specific caches separate for the same tenant and public source", async () => {
		const config = runtimeConfig("claude-code"); config.machines.push({ id: "codex-worker", agentKind: "codex" } as MachineRef);
		mocks.getConfig.mockResolvedValue(config);
		const fetcher = vi.fn(async () => entries("anthropic/claude-sonnet-4.6", "openai/gpt-5.2")); vi.stubGlobal("fetch", fetcher);
		const a = await (await GET(request("worker"))).json(); const b = await (await GET(request("codex-worker"))).json();
		expect(a.models.map((m: { id: string }) => m.id)).toEqual(["claude-sonnet-4-6"]);
		expect(b.models.map((m: { id: string }) => m.id)).toEqual(["gpt-5.2"]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("keeps opaque custom models for router runtimes, excluding explicit non-text model metadata", async () => {
		const config = runtimeConfig("hermes"); config.aiProviderKeys = { custom: { key: "custom-key", url: "https://custom.test/v1" } };
		mocks.getConfig.mockResolvedValue(config);
		vi.stubGlobal("fetch", vi.fn(async () => entries("company-private-v7", "qwen/qwen3-vl", { id: "opaque-image-model", architecture: { output_modalities: ["image"] } }, { id: "opaque-vector-model", type: "embedding" }, "openai/gpt-4o-mini-tts")));
		const body = await (await GET(request("worker"))).json();
		expect(body.models.map((m: { id: string }) => m.id).sort()).toEqual(["company-private-v7", "qwen/qwen3-vl"]);
	});
	it("retains opaque custom text IDs even when their name describes an audio or moderation job",async()=>{
		const config=runtimeConfig("hermes");config.aiProviderKeys={custom:{key:"private-key",url:"https://private.test/v1"}};mocks.getConfig.mockResolvedValue(config);
		vi.stubGlobal("fetch",vi.fn(async()=>entries({id:"company/audio-notes-assistant",architecture:{output_modalities:["text"]}},{id:"moderation-helper",architecture:{output_modalities:["text"]}},"embedding-research-assistant")));
		const body=await(await GET(request("worker"))).json();expect(body.models.map((model:{id:string})=>model.id).sort()).toEqual(["company/audio-notes-assistant","embedding-research-assistant","moderation-helper"]);
	});

	it("local fallback remains native compatible after upstream failures", async () => {
		mocks.getConfig.mockResolvedValue(runtimeConfig("codex")); vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
		const body = await (await GET(request("worker"))).json();
		expect(body.fallback).toBe(true); expect(body.models.length).toBeGreaterThan(0);
		expect(body.models.every((m: { id: string }) => /^(gpt-|o\d)/.test(m.id) && !m.id.includes("/"))).toBe(true);
	});

	it("does not leak host Anthropic keys when a native tenant has no saved key",async()=>{
		vi.stubEnv("ANTHROPIC_API_KEY","host-anthropic-secret");mocks.getConfig.mockResolvedValue(runtimeConfig("claude-code"));
		const fetcher=vi.fn(async()=>entries("anthropic/claude-sonnet-4.6"));vi.stubGlobal("fetch",fetcher);
		await GET(request("worker"));
		for(const [url,init] of fetcher.mock.calls as unknown as Array<[string,RequestInit]>){expect(new URL(url).origin).not.toBe("https://api.anthropic.com");expect(new Headers(init.headers).get("x-api-key")).toBeNull();expect(new Headers(init.headers).get("authorization")).toBeNull();}
	});

	it("forbids upstream redirects and bounds oversized catalog bodies",async()=>{
		const config=runtimeConfig("claude-code");config.aiProviderKeys={anthropic:"tenant-key"};mocks.getConfig.mockResolvedValue(config);
		const fetcher=vi.fn(async()=>new Response("x".repeat(2*1024*1024+1)));vi.stubGlobal("fetch",fetcher);
		const body=await(await GET(request("worker"))).json();expect(body.source).toBe("local fallback");
		for(const [,init] of fetcher.mock.calls as unknown as Array<[string,RequestInit]>)expect(init.redirect).toBe("error");
	});

	it("evicts old cache entries rather than growing without a bound",async()=>{
		const fetcher=vi.fn(async()=>entries("gpt-5.2"));vi.stubGlobal("fetch",fetcher);
		for(let index=0;index<201;index++){
			const config=runtimeConfig("codex");config.machines[0].id=`worker-${index}`;mocks.getConfig.mockResolvedValue(config);
			await GET(request(`worker-${index}`));
		}
		const config=runtimeConfig("codex");config.machines[0].id="worker-0";mocks.getConfig.mockResolvedValue(config);
		await GET(request("worker-0"));expect(fetcher).toHaveBeenCalledTimes(202);
	});

	it("limits sequential provider attempts to one request budget",async()=>{
		const config=privateConfig("private-key");config.aiProviderKeys.openai="openai-key";config.aiProviderKeys.openrouter="router-key";config.aiProviderKeys.vercelAiGateway="vercel-key";mocks.getConfig.mockResolvedValue(config);
		let now=1000;vi.spyOn(Date,"now").mockImplementation(()=>now);
		const signals=vi.spyOn(AbortSignal,"timeout");
		vi.stubGlobal("fetch",vi.fn(async()=>{now+=7000;return new Response(null,{status:503});}));
		try{await GET(request());expect(signals.mock.calls.map(([timeout])=>timeout)).toEqual([7000,7000,1000]);}finally{vi.restoreAllMocks();}
	});
});
