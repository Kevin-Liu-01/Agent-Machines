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
function request() { return new Request("https://agent-machines.test/api/dashboard/models"); }
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
