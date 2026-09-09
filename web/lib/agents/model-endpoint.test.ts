import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL } from "@/lib/user-config/schema";
import { DEFAULT_CODEX_MODEL } from "./runtime-model";
import { initialWorkerModel, modelForEndpoint } from "./model-endpoint";

describe("model names at known endpoint boundaries", () => {
	it.each([
		["anthropic/claude-opus-4-8", "https://openrouter.ai/api/v1", "anthropic/claude-opus-4.8"],
		["anthropic/claude-sonnet-4-6", "https://ai-gateway.vercel.sh/v1", "anthropic/claude-sonnet-4.6"],
		["anthropic/claude-opus-4.8", "https://openrouter.ai/api/v1", "anthropic/claude-opus-4.8"],
		["anthropic/claude-sonnet-4.6", "https://api.anthropic.com/v1", "claude-sonnet-4-6"],
		["openai/gpt-5.6-sol", "https://api.openai.com/v1", "gpt-5.6-sol"],
		["google/gemini-example", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-example"],
		["anthropic/claude-opus-4-8", "https://openrouter.ai.example.com/v1", "anthropic/claude-opus-4-8"],
		["my-model", "https://custom.example/v1", "my-model"],
		["anthropic/claude-opus-4-8", "not-a-url", "anthropic/claude-opus-4-8"],
	])("maps %s for %s", (model, endpoint, expected) => {
		expect(modelForEndpoint(model, endpoint)).toBe(expected);
	});
});

describe.each(["hermes", "openclaw"] as const)("%s initial model", (agent) => {
	it("does not send a new account's default Claude model to OpenAI", () => {
		expect(initialWorkerModel(agent, "https://api.openai.com/v1", undefined, DEFAULT_MODEL)).toBe(`openai/${DEFAULT_CODEX_MODEL}`);
	});
	it("keeps an explicitly selected OpenAI model", () => {
		expect(initialWorkerModel(agent, "https://api.openai.com/v1", "gpt-example", DEFAULT_MODEL)).toBe("openai/gpt-example");
	});
	it("rejects an explicit Claude/OpenAI mismatch before provisioning", () => {
		expect(() => initialWorkerModel(agent, "https://api.openai.com/v1", "anthropic/claude-sonnet-4-6")).toThrow("OpenAI endpoint");
		expect(() => initialWorkerModel(agent, "https://api.anthropic.com/v1", "openai/gpt-example")).toThrow("Anthropic endpoint");
	});
	it("selects Claude when the fallback endpoint is native Anthropic", () => {
		expect(initialWorkerModel(agent, "https://api.anthropic.com/v1", undefined, "openai/gpt-example")).toBe(DEFAULT_MODEL);
	});
	it("retains the portable model on multi-provider routers", () => {
		expect(initialWorkerModel(agent, "https://openrouter.ai/api/v1", undefined, DEFAULT_MODEL)).toBe(DEFAULT_MODEL);
	});
	it("requires an explicit model on Google or an opaque custom endpoint", () => {
		expect(() => initialWorkerModel(agent, "https://generativelanguage.googleapis.com/v1beta/openai", undefined, DEFAULT_MODEL)).toThrow("model ID");
		expect(() => initialWorkerModel(agent, "https://custom.example/v1", undefined, DEFAULT_MODEL)).toThrow("model ID");
		expect(initialWorkerModel(agent, "https://custom.example/v1", "gpt-custom-id")).toBe("gpt-custom-id");
		expect(initialWorkerModel(agent, "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-example")).toBe("gemini-example");
	});
	it("rejects malformed model identifiers", () => {
		expect(() => initialWorkerModel(agent, "https://custom.example/v1", "a".repeat(201))).toThrow("valid model ID");
		expect(() => initialWorkerModel(agent, "https://custom.example/v1", "a\nb")).toThrow("valid model ID");
	});
});

it("normalizes routed Claude names before native CLI setup", () => {
	expect(initialWorkerModel("claude-code", "https://api.anthropic.com/v1", "anthropic/claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
});
