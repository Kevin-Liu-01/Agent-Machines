import { describe, expect, it } from "vitest";

import {
	GATEWAY_KIND_LABEL,
	agentUsesRouter,
	requiredNativeUpstream,
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
