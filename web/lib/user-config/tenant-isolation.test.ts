import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateMetadata: vi.fn(), ensureUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
	clerkClient: async () => ({ users: { getUser: mocks.getUser, updateUserMetadata: mocks.updateMetadata } }),
}));
vi.mock("./identity", () => ({ getEffectiveUserId: async () => "tenant", isDevUserId: () => false }));
vi.mock("./dev-store", () => ({ getDevUserConfig: vi.fn(), setDevUserConfig: vi.fn() }));
vi.mock("@/lib/supabase/users", () => ({ ensureUser: mocks.ensureUser, getUserConfig: vi.fn(), updateUserConfigColumns: vi.fn() }));

import { getUserConfigById, setUserConfigById } from "./clerk";
import { getProvider } from "@/lib/providers";
import { resolveRoute } from "@/lib/mux/route";
import { toPublicConfig } from "./schema";

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
	vi.stubEnv("AGENT_MACHINES_OWNER_USER_ID", "owner");
	vi.stubEnv("CLERK_OWNER_USER_ID", "");
	vi.stubEnv("E2B_API_KEY", "deployment-e2b-secret");
	vi.stubEnv("DAYTONA_API_KEY", "deployment-daytona-secret");
	vi.stubEnv("DAYTONA_API_URL", "https://app.daytona.io/api");
	vi.stubEnv("AI_GATEWAY_API_KEY", "deployment-model-secret");
	vi.stubEnv("CURSOR_API_KEY", "deployment-cursor-secret");
	vi.stubEnv("CLOUDFLARE_TUNNEL_TOKEN", "deployment-tunnel-secret");
	vi.stubEnv("AGENT_MACHINE_ID", "owner-machine");
	vi.stubEnv("AGENT_API_KEY", "deployment-machine-secret");
	mocks.getUser.mockResolvedValue({ publicMetadata: {}, privateMetadata: {}, emailAddresses: [] });
	mocks.updateMetadata.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("tenant deployment credential isolation", () => {
	it("starts a new account with no owner machines or deployment secrets", async () => {
		const config = await getUserConfigById("new-user");
		expect(config.providers).toEqual({});
		expect(config.aiProviderKeys).toEqual({});
		expect(config.machines).toEqual([]);
		expect(config.cursorApiKey).toBeNull();
		expect(config.cloudflareTunnelToken).toBeNull();
		expect(JSON.stringify(config)).not.toContain("deployment-");
	});
	it("allows only the configured owner to use deployment defaults", async () => {
		const config = await getUserConfigById("owner");
		expect(config.providers.e2b?.apiKey).toBe("deployment-e2b-secret");
		expect(config.providers.daytona?.apiKey).toBe("deployment-daytona-secret");
		expect(config.aiProviderKeys.vercelAiGateway).toBe("deployment-model-secret");
		expect(config.machines[0]?.id).toBe("owner-machine");
	});
	it("fails closed when no deployment owner is configured", async () => {
		vi.stubEnv("AGENT_MACHINES_OWNER_USER_ID", "");
		expect((await getUserConfigById("owner")).providers).toEqual({});
	});
	it("never copies deployment credentials into a tenant's private metadata on save", async () => {
		const config = await setUserConfigById("new-user", { providers: { e2b: { apiKey: "tenant-key" } } });
		expect(config.providers).toEqual({ e2b: { apiKey: "tenant-key" } });
		expect(JSON.stringify(mocks.updateMetadata.mock.calls)).not.toContain("deployment-");
	});
	it("preserves explicitly saved tenant credentials", async () => {
		mocks.getUser.mockResolvedValue({ publicMetadata: {}, privateMetadata: {
			providers: { e2b: { apiKey: "tenant-e2b" } }, aiProviderKeys: { anthropic: "tenant-ai" },
		}, emailAddresses: [] });
		const config = await getUserConfigById("new-user");
		expect(config.providers).toEqual({ e2b: { apiKey: "tenant-e2b" } });
		expect(config.aiProviderKeys).toEqual({ anthropic: "tenant-ai" });
	});
	it("keeps a legacy machine identity while switching only the new-worker draft", async () => {
		mocks.getUser.mockResolvedValue({ publicMetadata: { machineId: "dm-legacy", providerKind: "dedalus", draftProviderKind: "dedalus" }, privateMetadata: { providers: { dedalus: { apiKey: "legacy-key" }, daytona: { apiKey: "tenant-daytona", apiUrl: "https://app.daytona.io/api", target: "us" } } }, emailAddresses: [] });
		const config = await getUserConfigById("new-user");
		expect(config.machines[0]).toMatchObject({ id: "dm-legacy", providerKind: "dedalus" });
		expect(config.draftProviderKind).toBe("daytona");
		expect(config.providers.daytona?.apiKey).toBe("tenant-daytona");
		expect(resolveRoute(config).route).toEqual(["daytona"]);
		expect(toPublicConfig(config).providers.dedalus.configured).toBe(false);
		expect(JSON.stringify(toPublicConfig(config))).not.toContain("tenant-daytona");
	});
	it("ignores a spoofed deployment-auth marker stored by an ordinary tenant", async () => {
		vi.stubEnv("VERCEL_OIDC_TOKEN", "deployment-oidc-secret");
		mocks.getUser.mockResolvedValue({ publicMetadata: {}, privateMetadata: {
			providers: { vercel: { token: "tenant-token", teamId: "", projectId: "", allowDeploymentCredentials: true } },
		}, emailAddresses: [] });
		const config = await getUserConfigById("new-user");
		expect(config.providers.vercel?.allowDeploymentCredentials).not.toBe(true);
		expect(resolveRoute(config).route).not.toContain("vercel");
		expect(toPublicConfig(config).providers.vercel.configured).toBe(false);
		expect(() => getProvider("vercel", config.providers)).toThrow("credentials required");
	});
	it("preserves owner OIDC access without exposing its credentials or marker", async () => {
		vi.stubEnv("VERCEL_OIDC_TOKEN", "deployment-oidc-secret");
		vi.stubEnv("VERCEL_TOKEN", "");
		vi.stubEnv("VERCEL_TEAM_ID", "");
		vi.stubEnv("VERCEL_PROJECT_ID", "");
		const config = await getUserConfigById("owner");
		expect(config.providers.vercel?.allowDeploymentCredentials).toBe(true);
		expect(resolveRoute(config).route).toContain("vercel");
		expect(getProvider("vercel", config.providers).hasCredentials).toBe(true);
		const publicConfig = toPublicConfig(config);
		expect(publicConfig.providers.vercel.configured).toBe(true);
		expect(JSON.stringify(publicConfig)).not.toContain("deployment-");
		expect(JSON.stringify(publicConfig)).not.toContain("allowDeploymentCredentials");
	});
});
