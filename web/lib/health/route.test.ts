import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	getServerConfig: () => ({
		apiUrl: "https://legacy.example/v1",
		apiKey: "legacy-key",
		model: "legacy-model",
	}),
}));

import { GET } from "@/app/api/health/route";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("GET /api/health", () => {
	it("probes the active AI gateway instead of a stale legacy sandbox", async () => {
		vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
		vi.stubEnv("OPENROUTER_API_KEY", "");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await GET();

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			ok: true,
			source: "vercel-ai-gateway",
			apiHost: "ai-gateway.vercel.sh",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://ai-gateway.vercel.sh/v1/models",
			expect.objectContaining({
				headers: { Authorization: "Bearer gateway-key" },
			}),
		);
	});

	it("falls back to the legacy agent only when no modern route is configured", async () => {
		vi.stubEnv("AI_GATEWAY_API_KEY", "");
		vi.stubEnv("AI_GATEWAY_KEY", "");
		vi.stubEnv("OPENROUTER_API_KEY", "");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await GET();

		expect(await response.json()).toMatchObject({
			ok: true,
			source: "legacy-agent",
			model: "legacy-model",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://legacy.example/v1/models",
			expect.any(Object),
		);
	});

	it("fails with a real 503 when every configured route is unavailable", async () => {
		vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
		vi.stubEnv("OPENROUTER_API_KEY", "router-key");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

		const response = await GET();

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			ok: false,
			error: "upstream_unavailable",
			sources: ["vercel-ai-gateway", "openrouter"],
		});
	});
});
