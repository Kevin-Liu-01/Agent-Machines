import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG } from "./schema";
import { CREDENTIAL_OPTIONS } from "./credential-removal";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(), client: vi.fn(), getUser: vi.fn(), updateMetadata: vi.fn(),
	identity: vi.fn(), readConfig: vi.fn(), writeConfig: vi.fn(), defaults: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.client }));
vi.mock("./identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("./clerk", () => ({ getUserConfig: mocks.readConfig, setUserConfig: mocks.writeConfig, getOwnerDefaults: mocks.defaults }));
import { DELETE } from "@/app/api/dashboard/admin/settings/route";

type Metadata = Record<string, unknown>;
const userId = "user-qa-self";
let saved: Metadata;

/** Clerk updateUserMetadata deep-merges nested maps and deletes explicit nulls. */
function mergeMetadata(target: Metadata, patch: Metadata): Metadata {
	const next = structuredClone(target);
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) delete next[key];
		else if (typeof value === "object" && !Array.isArray(value)) {
			next[key] = mergeMetadata((next[key] ?? {}) as Metadata, value as Metadata);
		} else next[key] = value;
	}
	return next;
}

function request(body: unknown, headers?: HeadersInit): Request {
	return new Request("https://example.test/api/dashboard/admin/settings", {
		method: "DELETE", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("AGENT_MACHINES_OWNER_USER_ID", "different-owner");
	vi.stubEnv("CLERK_OWNER_USER_ID", "");
	vi.stubEnv("CURSOR_API_KEY", "deployment-cursor-secret");
	saved = {
		providers: { daytona: { apiKey: "daytona-secret", target: "us" }, e2b: { apiKey: "e2b-secret" }, sprites: { apiKey: "sprites-secret" }, vercel: { token: "vercel-secret", teamId: "team", projectId: "project" }, dedalus: { apiKey: "retired-secret" } },
		aiProviderKeys: { anthropic: "anthropic-secret", openai: "openai-secret", openrouter: "router-secret", google: "google-secret", vercelAiGateway: "gateway-secret", custom: { url: "https://example.test/v1", key: "custom-secret" } },
		cursorApiKey: "cursor-secret", dedalusApiKey: "legacy-retired-secret",
		apiKey: "legacy-machine-secret", machineApiKeys: { machine: "machine-secret" },
		gatewayApiKeys: { profile: "separately-saved-secret" }, environmentProfileVars: { profile: { TOKEN: "environment-secret" } },
		agentMachinesApiKey: { hash: "sdk-key-hash" }, unrelated: { keep: true },
	};
	mocks.auth.mockResolvedValue({ userId });
	mocks.identity.mockResolvedValue("different-sdk-user");
	mocks.client.mockResolvedValue({ users: { getUser: mocks.getUser, updateUserMetadata: mocks.updateMetadata } });
	mocks.getUser.mockImplementation(async (id: string) => ({ id, privateMetadata: structuredClone(saved), publicMetadata: { keep: "public" }, unsafeMetadata: { keep: "unsafe" } }));
	mocks.updateMetadata.mockImplementation(async (_id: string, patch: { privateMetadata: Metadata }) => {
		saved = mergeMetadata(saved, patch.privateMetadata);
		return { id: userId, privateMetadata: structuredClone(saved) };
	});
	mocks.defaults.mockReturnValue({ ...structuredClone(DEFAULT_USER_CONFIG), providers: { daytona: { apiKey: "deployment-daytona-secret" } }, aiProviderKeys: { anthropic: "deployment-anthropic-secret" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("saved credential removal", () => {
	it("invariant_only_the_signed_in_user_is_mutated_with_explicit_null_tombstones", async () => {
		const before = structuredClone(saved);
		const response = await DELETE(request({ credentials: ["provider:daytona", "model:anthropic"] }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ removed: ["provider:daytona", "model:anthropic"], stillConfigured: [] });
		expect(mocks.updateMetadata).toHaveBeenCalledExactlyOnceWith(userId, { privateMetadata: { providers: { daytona: null }, aiProviderKeys: { anthropic: null } } });
		expect(saved).toEqual(mergeMetadata(before, { providers: { daytona: null }, aiProviderKeys: { anthropic: null } }));
		expect(mocks.getUser.mock.calls.map(([id]) => id)).toEqual([userId, userId]);
		expect(mocks.identity).not.toHaveBeenCalled();
		expect(mocks.readConfig).not.toHaveBeenCalled();
		expect(mocks.writeConfig).not.toHaveBeenCalled();
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("invariant_every_selector_removes_only_its_account_storage_including_retired_fallback", async () => {
		const response = await DELETE(request({ credentials: CREDENTIAL_OPTIONS.map(option => option.id) }));
		expect(response.status).toBe(200);
		expect(saved).toEqual({ providers: {}, aiProviderKeys: {}, apiKey: "legacy-machine-secret", machineApiKeys: { machine: "machine-secret" }, gatewayApiKeys: { profile: "separately-saved-secret" }, environmentProfileVars: { profile: { TOKEN: "environment-secret" } }, agentMachinesApiKey: { hash: "sdk-key-hash" }, unrelated: { keep: true } });
		expect(await response.text()).not.toContain("secret");
	});

	it.each([null, undefined])("invariant_an_sdk_or_development_identity_cannot_replace_a_real_session (%s)", async (sessionUser) => {
		mocks.auth.mockResolvedValue({ userId: sessionUser });
		const response = await DELETE(request({ credentials: ["model:anthropic"] }, { Authorization: "Bearer fake-sdk-key" }));
		expect(response.status).toBe(401);
		expect(mocks.client).not.toHaveBeenCalled();
		expect(mocks.updateMetadata).not.toHaveBeenCalled();
	});

	it("invariant_session_read_failure_does_not_access_the_credential_store", async () => {
		mocks.auth.mockRejectedValue(new Error("private auth details"));
		expect((await DELETE(request({ credentials: ["cursor"] }))).status).toBe(401);
		expect(mocks.client).not.toHaveBeenCalled();
	});

	it.each([null, [], {}, { credentials: [] }, { credentials: "cursor" }, { credentials: [1] }, { credentials: ["model:unknown"] }, { credentials: ["cursor", "private-secret-input"] }, { credentials: ["__proto__"] }, { credentials: ["cursor"], userId: "other-user" }, { credentials: Array(13).fill("cursor") }])("invariant_invalid_selectors_never_partially_mutate_state (%j)", async (body) => {
		const response = await DELETE(request(body));
		expect(response.status).toBe(400);
		expect(await response.text()).not.toContain("private-secret-input");
		expect(mocks.client).not.toHaveBeenCalled();
	});

	it("invariant_invalid_json_does_not_mutate_state", async () => {
		const response = await DELETE(new Request("https://example.test/api/dashboard/admin/settings", { method: "DELETE", body: "{" }));
		expect(response.status).toBe(400);
		expect(mocks.client).not.toHaveBeenCalled();
	});

	it.each(["write-error", "verification-error", "no-persistence", "wrong-user"])("invariant_unconfirmed_persistence_never_claims_success (%s)", async (mode) => {
		if (mode === "write-error") mocks.updateMetadata.mockRejectedValue(new Error("private-secret-store-error"));
		if (mode === "verification-error") mocks.getUser.mockResolvedValueOnce({ id: userId, privateMetadata: saved }).mockRejectedValueOnce(new Error("private-secret-read-error"));
		if (mode === "no-persistence") mocks.updateMetadata.mockResolvedValue({ id: userId, privateMetadata: {} });
		if (mode === "wrong-user") mocks.getUser.mockResolvedValue({ id: "other-user", privateMetadata: saved });
		const response = await DELETE(request({ credentials: ["provider:e2b"] }));
		expect(response.status).toBe(503);
		const body = await response.text();
		expect(body).not.toContain("private-secret");
		expect(body).not.toContain('"removed"');
		if (mode === "wrong-user") expect(mocks.updateMetadata).not.toHaveBeenCalled();
	});

	it("invariant_removed_account_keys_are_distinct_from_owner_only_deployment_defaults", async () => {
		vi.stubEnv("AGENT_MACHINES_OWNER_USER_ID", userId);
		const selectors = ["provider:daytona", "model:anthropic", "model:openai", "cursor"];
		const response = await DELETE(request({ credentials: selectors }));
		expect(await response.json()).toEqual({ removed: selectors, stillConfigured: ["provider:daytona", "model:anthropic", "cursor"] });
		expect((saved.providers as Metadata).daytona).toBeUndefined();
		expect((saved.aiProviderKeys as Metadata).anthropic).toBeUndefined();
		expect(saved.cursorApiKey).toBeUndefined();
	});

	it.each([undefined, null, "malformed-private-metadata", [], { providers: "malformed-provider-map" }, { providers: [] }])("invariant_malformed_fresh_metadata_is_not_evidence_of_removal (%j)", async (privateMetadata) => {
		mocks.getUser.mockResolvedValueOnce({ id: userId, privateMetadata: saved }).mockResolvedValueOnce({ id: userId, privateMetadata });
		const response = await DELETE(request({ credentials: ["provider:e2b"] }));
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('"removed"');
	});

	it.each([{}, { providers: null }, { providers: {} }])("invariant_missing_credential_ancestors_in_valid_metadata_are_absent (%j)", async (privateMetadata) => {
		mocks.getUser.mockResolvedValueOnce({ id: userId, privateMetadata: saved }).mockResolvedValueOnce({ id: userId, privateMetadata });
		const response = await DELETE(request({ credentials: ["provider:e2b"] }));
		expect(await response.json()).toEqual({ removed: ["provider:e2b"], stillConfigured: [] });
	});

	it("invariant_owner_oidc_access_is_not_reported_as_removed_with_a_saved_vercel_token", async () => {
		vi.stubEnv("AGENT_MACHINES_OWNER_USER_ID", userId);
		vi.stubEnv("VERCEL_OIDC_TOKEN", "deployment-oidc-secret");
		mocks.defaults.mockReturnValue({ ...structuredClone(DEFAULT_USER_CONFIG), providers: { vercel: { token: "", teamId: "", projectId: "", allowDeploymentCredentials: true } } });
		const response = await DELETE(request({ credentials: ["provider:vercel"] }));
		expect(await response.json()).toEqual({ removed: ["provider:vercel"], stillConfigured: ["provider:vercel"] });
		expect((saved.providers as Metadata).vercel).toBeUndefined();
	});

	it("invariant_removing_an_already_absent_credential_is_idempotent", async () => {
		delete saved.cursorApiKey;
		const response = await DELETE(request({ credentials: ["cursor", "cursor"] }));
		expect(await response.json()).toEqual({ removed: ["cursor"], stillConfigured: [] });
		expect(mocks.updateMetadata).toHaveBeenCalledExactlyOnceWith(userId, { privateMetadata: { cursorApiKey: null } });
	});
});
