import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.getConfig }));
import { resolveModelGatewayForUser } from "./resolver";

beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "deployment-openai-key"));
afterEach(() => vi.unstubAllEnvs());

describe("model gateway endpoint credential boundary", () => {
	it.each(["openai-compatible", "vercel-ai-gateway"] as const)("does not infer account keys for a lookalike %s profile", async (kind) => {
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { openai: "tenant-openai-key", vercelAiGateway: "tenant-gateway-key" };
		config.machines = [{ id: "worker", model: "openai/gpt-5", gatewayProfileId: "lookalike" } as MachineRef];
		config.gatewayProfiles = [{ id: "lookalike", name: "Lookalike", kind, baseUrl: "https://api.openai.com.attacker.test/v1", apiKey: null, model: "", createdAt: "2026-09-09", updatedAt: "2026-09-09" }];
		mocks.getConfig.mockResolvedValue(config);
		const gateway = await resolveModelGatewayForUser("worker");
		expect(gateway.apiUrl).toBe("https://ai-gateway.vercel.sh/v1");
		expect(gateway.headers.Authorization).toBe("Bearer tenant-gateway-key");
	});

	it("accepts a saved profile's explicit key for its chosen custom endpoint", async () => {
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = {};
		config.machines = [{ id: "worker", model: "custom/model", gatewayProfileId: "private" } as MachineRef];
		config.gatewayProfiles = [{ id: "private", name: "Private", kind: "openai-compatible", baseUrl: "https://models.tenant.test/v1", apiKey: "profile-key", model: "", createdAt: "2026-09-09", updatedAt: "2026-09-09" }];
		mocks.getConfig.mockResolvedValue(config);
		const gateway = await resolveModelGatewayForUser("worker");
		expect(gateway.apiUrl).toBe("https://models.tenant.test/v1");
		expect(gateway.headers.Authorization).toBe("Bearer profile-key");
	});
});
