import { describe, expect, it } from "vitest";

import {
	openClawModelForEndpoint,
	openClawProviderModelId,
	vercelOpenAiCompatibleBase,
} from "./runner";

describe("openClawModelForEndpoint", () => {
	it("translates native Claude aliases at the Vercel AI Gateway boundary", () => {
		expect(
			openClawModelForEndpoint(
				"anthropic/claude-opus-4-8",
				"https://ai-gateway.vercel.sh/v1",
			),
		).toBe("anthropic/claude-opus-4.8");
	});

	it("does not rewrite native or unrelated provider endpoints", () => {
		expect(
			openClawModelForEndpoint(
				"anthropic/claude-opus-4-8",
				"https://api.anthropic.com/v1",
			),
		).toBe("anthropic/claude-opus-4-8");
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
