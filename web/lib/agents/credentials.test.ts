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
const empty: CredentialCheckConfig = { providers: {} };

describe("validateAgentCredentials", () => {
	// codex 0.118 only speaks the OpenAI Responses API; the Dedalus router
	// doesn't serve it, so Dedalus alone must NOT satisfy codex.
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

	// claude-code needs the Anthropic Messages API — Dedalus is OpenAI-format.
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

	// hermes / openclaw route through the gateway, so the Dedalus router key
	// (which routes 200+ models, OpenAI-compatible) is sufficient.
	it("accepts hermes and openclaw with only a Dedalus key", () => {
		expect(validateAgentCredentials("hermes", dedalusOnly).ok).toBe(true);
		expect(validateAgentCredentials("openclaw", dedalusOnly).ok).toBe(true);
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
