import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_USER_CONFIG, type UserConfig } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
}));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.getEffectiveUserId }));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
	setUserConfig: mocks.setUserConfig,
}));

import { POST } from "@/app/api/dashboard/admin/apply-preset/route";

function request(body: unknown) {
	return new Request("https://example.invalid/api/dashboard/admin/apply-preset", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	let config = structuredClone(DEFAULT_USER_CONFIG);
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockImplementation(async () => config);
	mocks.setUserConfig.mockImplementation(async (patch: Partial<UserConfig>) => {
		config = { ...config, ...patch };
		return config;
	});
});

describe("onboarding recipe API", () => {
	it("returns the same Worker for a retried launch request", async () => {
		const body = {
			workerId: "cf5dbe1d-f475-4c4e-852a-18c7d816ee97",
			presetId: "coding-agent",
			agentKind: "codex",
		};
		const first = await POST(request(body));
		const retry = await POST(request(body));
		expect(first.status).toBe(200);
		expect(retry.status).toBe(200);
		expect(await retry.json()).toMatchObject({ workerId: body.workerId });
		const stored = await mocks.getUserConfig();
		expect(stored.workers).toHaveLength(1);
		expect(stored.workers[0].agentKind).toBe("codex");
		expect(stored.workers[0].model).toMatch(/^gpt-/);
	});

	it.each([null, [], { workerId: "../../invalid" }])("rejects malformed request %j", async (body) => {
		const response = await POST(request(body));
		expect(response.status).toBe(400);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("rejects signed-out recipe creation", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		expect((await POST(request({ presetId: "coding-agent" }))).status).toBe(401);
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});
});
