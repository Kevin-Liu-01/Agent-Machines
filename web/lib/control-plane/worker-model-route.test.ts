import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ getUserConfig: vi.fn(), userId: vi.fn(), apply: vi.fn(), reconcile: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.getUserConfig }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.userId }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: () => ({ apply: mocks.apply, reconcileNext: mocks.reconcile }) }));
import { POST } from "@/app/api/dashboard/control-plane/workers/route";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.userId.mockResolvedValue("test-user");
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.providers = { e2b: { apiKey: "test-e2b" } };
	config.aiProviderKeys = { openai: "test-openai" };
	mocks.getUserConfig.mockResolvedValue(config);
	mocks.apply.mockResolvedValue({ worker: { id: "worker" }, operation: { id: "operation" } });
});
function request(fields: Record<string, unknown> = {}) {
	return new Request("https://example.invalid/api/dashboard/control-plane/workers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runtime: "hermes", sandbox: "e2b", ...fields }) });
}

it.each(["hermes", "openclaw"])("selects an endpoint-compatible default for a %s launch", async (runtime) => {
	expect((await POST(request({ runtime }))).status).toBe(202);
	expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({ model: expect.stringMatching(/^openai\/gpt-/) }) }));
});

it("does not provision an explicit native-provider mismatch", async () => {
	const response = await POST(request({ model: "anthropic/claude-sonnet-4-6" }));
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: "model_required" });
	expect(mocks.apply).not.toHaveBeenCalled();
	expect(mocks.after).not.toHaveBeenCalled();
});

it("preserves a custom endpoint's exact model through the launch intent", async () => {
	const config = await mocks.getUserConfig();
	config.aiProviderKeys = { custom: { url: "https://custom.example/v1", key: "test-custom" } };
	expect((await POST(request({ gatewayProfileId: "custom-router", model: "gpt-custom-id" }))).status).toBe(202);
	expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({ model: "gpt-custom-id", gatewayProfileId: "custom-router" }) }));
});

it("requires an explicit Google model before launching compute", async () => {
	const config = await mocks.getUserConfig();
	config.aiProviderKeys = { google: "test-google" };
	expect((await POST(request({ gatewayProfileId: "google-router" }))).status).toBe(400);
	expect(mocks.apply).not.toHaveBeenCalled();
});
