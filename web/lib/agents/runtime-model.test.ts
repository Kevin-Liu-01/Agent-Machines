import { describe, expect, it } from "vitest";

import {
	DEFAULT_CLAUDE_CODE_MODEL,
	DEFAULT_CODEX_MODEL,
	runtimeModel,
} from "./runtime-model";

describe("runtimeModel", () => {
	it("removes the router prefix Claude Code cannot send to Anthropic", () => {
		expect(runtimeModel("claude-code", "anthropic/claude-opus-4-8")).toBe(
			"claude-opus-4-8",
		);
	});

	it("does not pass an Anthropic model to Codex", () => {
		expect(runtimeModel("codex", "anthropic/claude-opus-4-8")).toBe(
			DEFAULT_CODEX_MODEL,
		);
	});

	it("uses native defaults for empty coding-runtime selections", () => {
		expect(runtimeModel("claude-code")).toBe(DEFAULT_CLAUDE_CODE_MODEL);
		expect(runtimeModel("codex")).toBe(DEFAULT_CODEX_MODEL);
	});

	it("adds the provider namespace router-driven runtimes require", () => {
		expect(runtimeModel("hermes", "gpt-5.6-sol")).toBe("openai/gpt-5.6-sol");
		expect(runtimeModel("openclaw", "claude-opus-4-8")).toBe(
			"anthropic/claude-opus-4-8",
		);
	});
});
