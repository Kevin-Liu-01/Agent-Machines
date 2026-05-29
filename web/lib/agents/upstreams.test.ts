import { describe, expect, it } from "vitest";

import {
	DEFAULT_ROUTER_ID,
	GATEWAY_KIND_LABEL,
	ROUTER_PRESETS,
	agentUpstreamReadiness,
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

describe("agentUpstreamReadiness", () => {
	// Native CLIs are blocked without their native key (no router substitute).
	it("blocks codex without an OpenAI key and points at openai", () => {
		const r = agentUpstreamReadiness("codex", DEFAULT_ROUTER_ID, { dedalus: true });
		expect(r.status).toBe("blocked");
		expect(r.needs).toBe("openai");
	});

	it("readies codex once a native OpenAI key is on file", () => {
		expect(agentUpstreamReadiness("codex", DEFAULT_ROUTER_ID, { openai: true }).status).toBe("ready");
	});

	it("blocks claude-code without an Anthropic key", () => {
		const r = agentUpstreamReadiness("claude-code", DEFAULT_ROUTER_ID, { openai: true });
		expect(r.status).toBe("blocked");
		expect(r.needs).toBe("anthropic");
	});

	// Router agents are ready when the *selected* router has a key.
	it("readies hermes when the selected router has a key", () => {
		const r = agentUpstreamReadiness("hermes", "openrouter-router", { openrouter: true });
		expect(r.status).toBe("ready");
	});

	// Selected router has no key but another upstream exists -> soft fallback.
	it("flags fallback when the selected router lacks a key but another exists", () => {
		const r = agentUpstreamReadiness("hermes", "openrouter-router", { dedalus: true });
		expect(r.status).toBe("fallback");
		expect(r.needs).toBe("openrouter");
	});

	// No usable key at all -> hard block.
	it("blocks router agents when no upstream key is configured", () => {
		const r = agentUpstreamReadiness("openclaw", DEFAULT_ROUTER_ID, {});
		expect(r.status).toBe("blocked");
	});
});
