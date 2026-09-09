import { afterEach, describe, expect, it, vi } from "vitest";

import { getOwnerDefaults } from "./clerk";
import { DEFAULT_USER_CONFIG, toPublicConfig } from "./schema";

afterEach(() => vi.unstubAllEnvs());

describe("owner environment credentials", () => {
	it("makes every supported local provider and native coding runtime available", () => {
		vi.stubEnv("DAYTONA_API_KEY", "daytona-secret");
		vi.stubEnv("DAYTONA_API_URL", "https://app.daytona.io/api");
		vi.stubEnv("DAYTONA_TARGET", "us");
		vi.stubEnv("DEDALUS_API_KEY", "retired-secret");
		vi.stubEnv("E2B_API_KEY", "e2b-secret");
		vi.stubEnv("SPRITES_TOKEN", "sprites-secret");
		vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-secret");
		vi.stubEnv("OPENAI_API_KEY", "openai-secret");
		vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-secret");
		vi.stubEnv("VERCEL_TOKEN", "vercel-secret");
		vi.stubEnv("VERCEL_TEAM_ID", "team-test");
		vi.stubEnv("VERCEL_PROJECT_ID", "project-test");

		const config = getOwnerDefaults();
		expect(config.providers.daytona).toEqual({ apiKey: "daytona-secret", apiUrl: "https://app.daytona.io/api", target: "us" });
		expect(config.providers.dedalus).toBeUndefined();
		expect(config.providers.e2b?.apiKey).toBe("e2b-secret");
		expect(config.providers.sprites?.apiKey).toBe("sprites-secret");
		expect(config.aiProviderKeys.anthropic).toBe("anthropic-secret");
		expect(config.aiProviderKeys.openai).toBe("openai-secret");

		const publicConfig = toPublicConfig(config);
		expect(publicConfig.providers.daytona.configured).toBe(true);
		expect(publicConfig.providers.dedalus.configured).toBe(false);
		expect(publicConfig.providers.e2b.configured).toBe(true);
		expect(publicConfig.providers.sprites.configured).toBe(true);
		expect(publicConfig.providers.vercel.configured).toBe(true);
		expect(publicConfig.aiProviders.anthropic.configured).toBe(true);
		expect(publicConfig.aiProviders.openai.configured).toBe(true);
		expect(JSON.stringify(publicConfig)).not.toContain("secret");
	});
	it("does not advertise deployment OIDC credentials to a tenant without credentials", () => {
		vi.stubEnv("VERCEL_OIDC_TOKEN", "deployment-secret");
		expect(toPublicConfig(DEFAULT_USER_CONFIG).providers.vercel.configured).toBe(false);
	});
});
