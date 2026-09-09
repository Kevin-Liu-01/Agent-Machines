import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type UserConfig } from "@/lib/user-config/schema";
import { DEFAULT_CODEX_MODEL } from "@/lib/agents/runtime-model";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), config: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config, setUserConfig: mocks.save }));
import { POST } from "@/app/api/dashboard/workers/route";

let config: UserConfig;
beforeEach(() => {
	vi.clearAllMocks();
	config = structuredClone(DEFAULT_USER_CONFIG);
	mocks.identity.mockResolvedValue("new-account");
	mocks.config.mockImplementation(async () => config);
	mocks.save.mockImplementation(async (patch: Partial<UserConfig>) => { config = { ...config, ...patch }; return config; });
});
function request(body: unknown) {
	return new Request("https://example.invalid/api/dashboard/workers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function payload(preset: boolean, overrides: Record<string, unknown> = {}) {
	return { name: "My specialist", agentKind: "hermes", ...(preset ? { presetId: "coding-agent" } : {}), ...overrides };
}

describe.each([false, true])("Worker create model contract (preset=%s)", (preset) => {
	it("uses the real OpenAI fallback endpoint instead of the unrelated saved draft model", async () => {
		config.aiProviderKeys.openai = "test-openai-key";
		config.draftModel = "anthropic/claude-opus-4-8";
		const response = await POST(request(payload(preset)));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.worker).toMatchObject({ name: "My specialist", model: `openai/${DEFAULT_CODEX_MODEL}`, gatewayProfileId: "vercel-ai-gateway" });
		expect(config.workers).toHaveLength(1);
		if (preset) expect(body.worker.memoryBundleId).toBe("preset-memory:coding-agent");
	});

	it("retains an explicit compatible model and trims the gateway selection once", async () => {
		config.aiProviderKeys.openai = "test-openai-key";
		const response = await POST(request(payload(preset, { model: " openai/gpt-explicit-custom ", gatewayProfileId: " openai-router " })));
		expect(response.status).toBe(200);
		expect((await response.json()).worker).toMatchObject({ model: "openai/gpt-explicit-custom", gatewayProfileId: "openai-router" });
	});

	it("rejects a provider/model mismatch before saving any Worker", async () => {
		config.aiProviderKeys.openai = "test-openai-key";
		const response = await POST(request(payload(preset, { model: "anthropic/claude-sonnet-4-6", gatewayProfileId: "openai-router" })));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "model_required", message: expect.stringContaining("OpenAI model") });
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("requires an explicit model for a selected custom endpoint", async () => {
		config.aiProviderKeys.custom = { url: "https://models.example.invalid/v1", key: "test-custom-key" };
		const response = await POST(request(payload(preset, { gatewayProfileId: "custom-router" })));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "model_required", message: expect.stringContaining("model ID") });
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("preserves an explicit opaque custom model ID", async () => {
		config.aiProviderKeys.custom = { url: "https://models.example.invalid/v1", key: "test-custom-key" };
		const response = await POST(request(payload(preset, { gatewayProfileId: "custom-router", model: "my-org/domain-specialist-v2" })));
		expect(response.status).toBe(200);
		expect((await response.json()).worker).toMatchObject({ model: "my-org/domain-specialist-v2", gatewayProfileId: "custom-router" });
	});

	it("keeps native Claude selection independent of unrelated router credentials", async () => {
		config.aiProviderKeys.openai = "test-openai-key";
		config.aiProviderKeys.anthropic = "test-anthropic-key";
		const response = await POST(request(payload(preset, { agentKind: "claude-code", model: "anthropic/claude-sonnet-4-6", gatewayProfileId: "openai-router" })));
		expect(response.status).toBe(200);
		expect((await response.json()).worker.model).toBe("claude-sonnet-4-6");
	});
});

it("refuses signed-out Worker creation without reading or saving account state", async () => {
	mocks.identity.mockResolvedValue(null);
	expect((await POST(request(payload(false)))).status).toBe(401);
	expect(mocks.config).not.toHaveBeenCalled();
	expect(mocks.save).not.toHaveBeenCalled();
});
