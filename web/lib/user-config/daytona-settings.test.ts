import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG } from "./schema";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("./identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("./clerk", () => ({ getUserConfig: mocks.read, setUserConfig: mocks.write }));
import { POST as settings } from "@/app/api/dashboard/admin/settings/route";
import { POST as setup } from "@/app/api/dashboard/admin/setup/route";

function request(body: unknown) {
	return new Request("https://example.test/api/dashboard/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.identity.mockResolvedValue("tenant");
	const current = { ...structuredClone(DEFAULT_USER_CONFIG), providers: { daytona: { apiKey: "stored-private-key", apiUrl: "https://app.daytona.io/api", target: "us" }, e2b: { apiKey: "e2b-private-key" } } };
	mocks.read.mockResolvedValue(current);
	mocks.write.mockImplementation(async (patch) => ({ ...current, ...patch }));
});

describe("Daytona credential routes", () => {
	it("Settings saves the exact Daytona contract and never echoes keys", async () => {
		const response = await settings(request({ providers: { daytona: { apiKey: " replacement-private-key ", apiUrl: " https://app.daytona.io/api ", target: " us " } } }));
		expect(response.status).toBe(200);
		expect(mocks.write).toHaveBeenCalledWith({ providers: { daytona: { apiKey: "replacement-private-key", apiUrl: "https://app.daytona.io/api", target: "us" }, e2b: { apiKey: "e2b-private-key" } } });
		const body = await response.text();
		expect(body).not.toContain("private-key");
		expect(JSON.parse(body).config.providers.daytona.configured).toBe(true);
	});
	it("changing only the endpoint preserves a configured key and other providers", async () => {
		await settings(request({ providers: { daytona: { apiKey: "", apiUrl: "https://daytona.example/api" } } }));
		expect(mocks.write).toHaveBeenCalledWith({ providers: { daytona: { apiKey: "stored-private-key", apiUrl: "https://daytona.example/api", target: "us" }, e2b: { apiKey: "e2b-private-key" } } });
	});
	it("setup accepts Daytona without persisting the old provider identity", async () => {
		const response = await setup(request({ providerCredentials: { daytona: { apiKey: "fixture-key", apiUrl: "https://app.daytona.io/api", target: "us" } }, draftProviderKind: "daytona" }));
		expect(response.status).toBe(200);
		expect(mocks.write).toHaveBeenCalledWith({ providers: { daytona: { apiKey: "fixture-key", apiUrl: "https://app.daytona.io/api", target: "us" } }, draftProviderKind: "daytona" });
	});
	it.each([null, [], "key", { apiKey: 1 }, { target: "../bad" }, { apiUrl: "http://example.test" }, { apiUrl: "https://user:password@example.test/api" }, { apiUrl: "https://example.test/api?token=secret" }])("rejects malformed settings without writing or echoing the input: %j", async (daytona) => {
		for (const [route, body] of [[settings, { providers: { daytona } }], [setup, { providerCredentials: { daytona } }]] as const) {
			const response = await route(request(body));
			expect(response.status).toBe(400);
			expect(mocks.write).not.toHaveBeenCalled();
		}
	});
	it("rejects new credentials for the retired provider", async () => {
		for (const [route, body] of [[settings, { providers: { dedalus: { apiKey: "old-key" } } }], [setup, { providerCredentials: { dedalus: { apiKey: "old-key" } } }]] as const) {
			expect((await route(request(body))).status).toBe(400);
		}
		expect(mocks.write).not.toHaveBeenCalled();
	});
	it("requires authentication before accepting credentials", async () => {
		mocks.identity.mockResolvedValue(null);
		for (const route of [settings, setup]) expect((await route(request({}))).status).toBe(401);
		expect(mocks.read).not.toHaveBeenCalled();
		expect(mocks.write).not.toHaveBeenCalled();
	});
});
