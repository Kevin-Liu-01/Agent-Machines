import { describe, expect, it } from "vitest";

import {
	openClawModelForEndpoint,
	openClawProviderModelId,
	openclawProviderFor,
	hermesProviderId,
	vercelOpenAiCompatibleBase,
} from "./runner";

it("does not misclassify a custom hostname or path as a native OpenClaw provider", () => {
	expect(openclawProviderFor("https://api.openai.com/v1")).toEqual({ id: "openai", builtin: true });
	expect(openclawProviderFor("https://api.openai.com.custom.example/v1")).toEqual({ id: "router", builtin: false });
	expect(openclawProviderFor("https://custom.example/openrouter/v1")).toEqual({ id: "router", builtin: false });
	expect(hermesProviderId("https://api.openai.com.custom.example/v1")).toEqual({ id: "custom", builtin: false });
	expect(hermesProviderId("https://openrouter.ai/api/v1")).toEqual({ id: "openrouter", builtin: true });
});

describe("openClawModelForEndpoint", () => {
	it("translates native Claude aliases at the Vercel AI Gateway boundary", () => {
		expect(
			openClawModelForEndpoint(
				"anthropic/claude-opus-4-8",
				"https://ai-gateway.vercel.sh/v1",
			),
		).toBe("anthropic/claude-opus-4.8");
	});

	it("uses native IDs for Anthropic and preserves other routed providers", () => {
		expect(
			openClawModelForEndpoint(
				"anthropic/claude-opus-4-8",
				"https://api.anthropic.com/v1",
			),
		).toBe("claude-opus-4-8");
		expect(
			openClawModelForEndpoint(
				"openai/gpt-5.6-sol",
				"https://ai-gateway.vercel.sh/v1",
			),
		).toBe("openai/gpt-5.6-sol");
	});
});

describe("openClawProviderModelId", () => {
	it("removes a matching built-in provider prefix", () => {
		expect(openClawProviderModelId("openai/gpt-5.2", "openai")).toBe("gpt-5.2");
		expect(openClawProviderModelId("anthropic/claude-sonnet-4-6", "anthropic")).toBe(
			"claude-sonnet-4-6",
		);
	});

	it("keeps upstream prefixes inside a router model id", () => {
		expect(openClawProviderModelId("anthropic/claude-sonnet-4.6", "router")).toBe(
			"anthropic/claude-sonnet-4.6",
		);
	});
});

describe("vercelOpenAiCompatibleBase", () => {
	it("adds the OpenAI-compatible /v1 path to the shared root profile", () => {
		expect(
			vercelOpenAiCompatibleBase("https://ai-gateway.vercel.sh"),
		).toBe("https://ai-gateway.vercel.sh/v1");
		expect(
			vercelOpenAiCompatibleBase("https://ai-gateway.vercel.sh/v1/"),
		).toBe("https://ai-gateway.vercel.sh/v1");
	});
});
