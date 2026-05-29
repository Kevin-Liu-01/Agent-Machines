import { describe, expect, it } from "vitest";

import {
	DEFAULT_ROUTER_ID,
	GATEWAY_KIND_LABEL,
	ROUTER_PRESETS,
	agentUsesRouter,
	requiredNativeUpstream,
	routerPresetById,
} from "./upstreams";

describe("requiredNativeUpstream", () => {
	it("locks codex to OpenAI and claude-code to Anthropic", () => {
		expect(requiredNativeUpstream("codex")).toBe("openai");
		expect(requiredNativeUpstream("claude-code")).toBe("anthropic");
	});

	it("leaves router agents unlocked", () => {
		expect(requiredNativeUpstream("hermes")).toBeNull();
		expect(requiredNativeUpstream("openclaw")).toBeNull();
	});
});

describe("agentUsesRouter", () => {
	it("is true for hermes/openclaw and false for the native CLIs", () => {
		expect(agentUsesRouter("hermes")).toBe(true);
		expect(agentUsesRouter("openclaw")).toBe(true);
		expect(agentUsesRouter("codex")).toBe(false);
		expect(agentUsesRouter("claude-code")).toBe(false);
	});
});

describe("GATEWAY_KIND_LABEL", () => {
	it("labels every gateway kind", () => {
		expect(GATEWAY_KIND_LABEL.dedalus).toMatch(/Dedalus/);
		expect(GATEWAY_KIND_LABEL["vercel-ai-gateway"]).toMatch(/Vercel/);
		expect(GATEWAY_KIND_LABEL["openai-compatible"]).toMatch(/OpenAI/);
	});
});

describe("ROUTER_PRESETS", () => {
	it("covers the named routers and reuses seeded profile ids for the first two", () => {
		const ids = ROUTER_PRESETS.map((p) => p.id);
		expect(ids).toContain("dedalus-default");
		expect(ids).toContain("vercel-ai-gateway");
		expect(ids).toContain("openai-router");
		expect(ids).toContain("openrouter-router");
		expect(ids).toContain("custom-router");
		expect(DEFAULT_ROUTER_ID).toBe("dedalus-default");
	});

	it("maps each preset to a distinct credential source", () => {
		expect(routerPresetById("openrouter-router")?.source).toBe("openrouter");
		expect(routerPresetById("custom-router")?.baseUrl).toBeNull();
		expect(routerPresetById("nope")).toBeNull();
	});
});
