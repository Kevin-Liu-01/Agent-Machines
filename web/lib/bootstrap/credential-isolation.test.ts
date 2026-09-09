import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWebBootstrap } from "./runner";
import { BOOTSTRAP_PHASES, DEFAULT_USER_CONFIG, type MachineRef, type UserConfig } from "@/lib/user-config/schema";
import type { MachineProvider } from "@/lib/providers";

beforeEach(() => {
	for (const name of ["AI_GATEWAY_API_KEY", "AI_GATEWAY_KEY", "VERCEL_OIDC_TOKEN", "OPENROUTER_API_KEY", "OPENAI_API_KEY"]) {
		vi.stubEnv(name, `deployment-secret-${name}`);
	}
});
afterEach(() => vi.unstubAllEnvs());

async function bootstrapConfig(config: UserConfig, gatewayProfileId: string | null) {
	const exec = vi.fn(async () => ({ stdout: "ok", stderr: "", exitCode: 0 }));
	const machine: MachineRef = {
		id: "tenant-worker", name: "Tenant worker", providerKind: "e2b", agentKind: "hermes",
		model: "anthropic/claude-sonnet-4-6", gatewayProfileId, apiKey: "worker-bearer",
		spec: DEFAULT_USER_CONFIG.draftSpec, agentProfileId: null, environmentProfileId: null,
		bootstrapPresetId: null, createdAt: "2026-09-09", apiUrl: null,
		bootstrapState: { phase: "idle", startedAt: null, finishedAt: null, current: null, lastError: null, completed: BOOTSTRAP_PHASES.filter((phase) => phase !== "configure-hermes") },
	};
	const result = await runWebBootstrap({ machine, config, provider: { kind: "e2b", exec } as unknown as MachineProvider, onState: vi.fn() });
	expect(result.apiKey).toBe("worker-bearer");
	return exec.mock.calls.flat().join("\n");
}

describe("bootstrap tenant credential boundary", () => {
	it.each([null, "vercel-ai-gateway", "openrouter-router"])("uses the tenant native fallback for router %s even when host keys exist", async (gatewayProfileId) => {
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { anthropic: "tenant-anthropic-key" };
		const commands = await bootstrapConfig(config, gatewayProfileId);
		expect(commands).toContain("tenant-anthropic-key");
		expect(commands).toContain("hermes auth add anthropic");
		expect(commands).not.toContain("deployment-secret-");
	});

	it.each(["private-router", null])("boots with only a saved keyed profile when selection is %s", async (gatewayProfileId) => {
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = {};
		config.gatewayProfiles = [{ id: "private-router", name: "Private router", kind: "openai-compatible", baseUrl: "https://models.tenant.test/v1", apiKey: "tenant-profile-key", model: "", createdAt: "2026-09-09", updatedAt: "2026-09-09" }];
		const commands = await bootstrapConfig(config, gatewayProfileId);
		expect(commands).toContain("tenant-profile-key");
		expect(commands).toContain("https://models.tenant.test/v1");
		expect(commands).not.toContain("deployment-secret-");
	});

	it("does not infer tenant provider keys for a lookalike profile endpoint", async () => {
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { openai: "tenant-openai-key" };
		config.gatewayProfiles = [{ id: "lookalike", name: "Lookalike", kind: "openai-compatible", baseUrl: "https://api.openai.com.attacker.test/v1", apiKey: null, model: "", createdAt: "2026-09-09", updatedAt: "2026-09-09" }];
		const commands = await bootstrapConfig(config, "lookalike");
		expect(commands).toContain("hermes auth add openai");
		expect(commands).not.toContain("attacker.test");
	});
});
