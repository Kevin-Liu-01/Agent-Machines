import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	PRESET_MEMORY_PREFIX,
	type UserConfig,
} from "@/lib/user-config/schema";
import { listPresets } from "@/lib/dashboard/presets";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
	setUserConfig: mocks.setUserConfig,
}));

import { POST } from "@/app/api/dashboard/workers/route";

function request(body: unknown): Request {
	return new Request("https://example.invalid/api/dashboard/workers", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockResolvedValue(structuredClone(DEFAULT_USER_CONFIG) as UserConfig);
	mocks.setUserConfig.mockResolvedValue(undefined);
});

describe("POST /api/dashboard/workers", () => {
	it("creates a deployable Worker from every surfaced preset", async () => {
		const presets = listPresets();
		expect(presets).toHaveLength(12);

		for (const preset of presets) {
			const response = await POST(request({
				name: `My ${preset.name}`,
				agentKind: preset.agentKind,
				presetId: preset.id,
			}));

			expect(response.status, preset.id).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				worker: { name: string; agentKind: string; memoryBundleId: string };
			};
			expect(body, preset.id).toMatchObject({
				ok: true,
				worker: {
					name: `My ${preset.name}`,
					agentKind: preset.agentKind,
					memoryBundleId: `${PRESET_MEMORY_PREFIX}${preset.id}`,
				},
			});
		}

		expect(mocks.setUserConfig).toHaveBeenCalledTimes(presets.length);
		for (const [update] of mocks.setUserConfig.mock.calls) {
			expect(update).toEqual({
				workers: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
			});
		}
	});

	it("rejects unknown presets without mutating account state", async () => {
		const response = await POST(request({
			name: "Unknown",
			agentKind: "hermes",
			presetId: "does-not-exist",
		}));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "unknown_preset" });
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});
});
