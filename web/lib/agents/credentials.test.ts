import { describe, expect, it } from "vitest";

import {
	type CredentialCheckConfig,
	validateAgentCredentials,
} from "./credentials";

const dedalusOnly: CredentialCheckConfig = {
	providers: { dedalus: { apiKey: "dsk-live-xxx" } },
};
const nativeOpenAI: CredentialCheckConfig = {
	providers: {},
	aiProviderKeys: { openai: "sk-openai-xxx" },
};
const nativeAnthropic: CredentialCheckConfig = {
	providers: {},
	aiProviderKeys: { anthropic: "sk-ant-xxx" },
};
const vercelGateway: CredentialCheckConfig = {
	providers: {},
	aiProviderKeys: { vercelAiGateway: "vck_xxx" },
};
const openRouter: CredentialCheckConfig = {
	providers: {},
	aiProviderKeys: { openrouter: "sk-or-xxx" },
};
const empty: CredentialCheckConfig = { providers: {} };

describe("validateAgentCredentials", () => {
	// codex 0.118 only speaks the OpenAI Responses API; the Dedalus substrate
	// key is not a model key, so Dedalus alone must NOT satisfy codex.
	it("rejects codex with only a Dedalus key and points to alternatives", () => {
		const res = validateAgentCredentials("codex", dedalusOnly);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.message).toMatch(/native OpenAI/i);
			expect(res.message).toMatch(/Hermes|OpenClaw/);
		}
	});

	it("accepts codex with a native OpenAI key", () => {
		expect(validateAgentCredentials("codex", nativeOpenAI).ok).toBe(true);
	});

	// claude-code needs the Anthropic Messages API.
	it("rejects claude-code with only a Dedalus key", () => {
		const res = validateAgentCredentials("claude-code", dedalusOnly);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.message).toMatch(/native Anthropic/i);
			expect(res.message).toMatch(/Hermes|OpenClaw/);
		}
	});

	it("accepts claude-code with a native Anthropic key", () => {
		expect(validateAgentCredentials("claude-code", nativeAnthropic).ok).toBe(true);
	});

	it("accepts hermes and openclaw with Vercel AI Gateway first", () => {
		expect(validateAgentCredentials("hermes", vercelGateway).ok).toBe(true);
		expect(validateAgentCredentials("openclaw", vercelGateway).ok).toBe(true);
	});

	it("accepts hermes and openclaw with OpenRouter as fallback", () => {
		expect(validateAgentCredentials("hermes", openRouter).ok).toBe(true);
		expect(validateAgentCredentials("openclaw", openRouter).ok).toBe(true);
	});

	it("rejects hermes and openclaw with only a Dedalus substrate key", () => {
		expect(validateAgentCredentials("hermes", dedalusOnly).ok).toBe(false);
		expect(validateAgentCredentials("openclaw", dedalusOnly).ok).toBe(false);
	});

	it("rejects every agent when no key is on file", () => {
		expect(validateAgentCredentials("codex", empty).ok).toBe(false);
		expect(validateAgentCredentials("claude-code", empty).ok).toBe(false);
		expect(validateAgentCredentials("hermes", empty).ok).toBe(false);
		expect(validateAgentCredentials("openclaw", empty).ok).toBe(false);
	});

	it("honors draft keys from the setup form", () => {
		expect(
			validateAgentCredentials("codex", empty, { openai: "sk-draft" }).ok,
		).toBe(true);
		expect(
			validateAgentCredentials("claude-code", empty, { anthropic: "sk-draft" }).ok,
		).toBe(true);
	});
});
