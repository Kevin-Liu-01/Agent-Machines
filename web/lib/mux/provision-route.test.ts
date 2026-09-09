import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	type UserConfig,
} from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
	apply: vi.fn(),
	reconcileNext: vi.fn(),
	recommendArm: vi.fn(),
	after: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
	setUserConfig: mocks.setUserConfig,
}));
vi.mock("@/lib/control-plane/service", () => ({
	createHostedControlPlane: () => ({
		apply: mocks.apply,
		reconcileNext: mocks.reconcileNext,
	}),
}));
vi.mock("@/lib/learning/recommend", () => ({
	recommendArm: mocks.recommendArm,
}));
vi.mock("next/server", () => ({ after: mocks.after }));

import { POST } from "@/app/api/dashboard/admin/provision-machine/route";

function config(overrides: Partial<UserConfig> = {}): UserConfig {
	return {
		...DEFAULT_USER_CONFIG,
		providers: {
			e2b: { apiKey: "e2b_live" },
			sprites: { apiKey: "sprites_live" },
		},
		aiProviderKeys: { anthropic: "anthropic_live" },
		...overrides,
	};
}

function request(body: Record<string, unknown>, idempotencyKey?: string): Request {
	return new Request("https://example.invalid/api/dashboard/admin/provision-machine", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
		},
		body: JSON.stringify(body),
	});
}

const BASE = {
	providerKind: "e2b",
	agentKind: "claude-code",
	model: "anthropic/claude-sonnet-4-6",
	name: "reviewer",
	spec: { vcpu: 2, memoryMib: 4096, storageGib: 20 },
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockResolvedValue(config());
	mocks.setUserConfig.mockImplementation(async () => config());
	mocks.reconcileNext.mockResolvedValue(null);
	mocks.apply.mockResolvedValue({
		worker: {
			id: "worker-1",
			status: { phase: "pending", placement: null },
		},
		operation: { id: "op-1", status: "queued" },
		reused: false,
	});
	mocks.after.mockImplementation((fn: () => unknown) => fn());
});

it("refuses an explicitly retired provider before applying intent or choosing a fallback", async () => {
	const response = await POST(request({ ...BASE, providerKind: "dedalus" }));
	expect(response.status).toBe(400);
	expect(mocks.apply).not.toHaveBeenCalled();
	expect(mocks.recommendArm).not.toHaveBeenCalled();
});

it("accepts Daytona credentials and preserves the requested provider in intent", async () => {
	mocks.getUserConfig.mockResolvedValue(config({ providers: { daytona: { apiKey: "daytona-fixture", apiUrl: "https://app.daytona.io/api" } } }));
	const response = await POST(request({ ...BASE, providerKind: "daytona" }));
	expect(response.status).toBe(202);
	expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({ sandbox: "daytona" }) }), expect.anything());
});

describe("POST /api/dashboard/admin/provision-machine", () => {
	it("fails authentication before reading tenant config", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const response = await POST(request(BASE));
		expect(response.status).toBe(401);
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("rejects a retired Dedalus model gateway before reading tenant config", async () => {
		const response = await POST(request({ ...BASE, gatewayProfileId: "dedalus-default" }));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "unsupported_gateway" });
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("rejects a missing native runtime credential before journaling", async () => {
		mocks.getUserConfig.mockResolvedValue(
			config({ aiProviderKeys: { openrouter: "router_only" } }),
		);
		const response = await POST(request(BASE));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "missing_ai_credentials" });
		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("rejects an uncredentialed requested substrate with named keys", async () => {
		mocks.getUserConfig.mockResolvedValue(
			config({ providers: { sprites: { apiKey: "sprites_live" } } }),
		);
		const response = await POST(request(BASE));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "missing_provider_credentials",
		});
		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("returns 404 for an explicit Worker that does not exist", async () => {
		const response = await POST(request({ ...BASE, workerId: "missing" }));
		expect(response.status).toBe(404);
		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("creates a durable Worker intent and returns the queued operation", async () => {
		const response = await POST(request(BASE, "launch-1"));
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({
			ok: true,
			workerId: expect.any(String),
			machineId: null,
			providerKind: "e2b",
			phase: "pending",
			operation: { id: "op-1", status: "queued" },
			bootstrapScheduled: true,
		});
		expect(mocks.setUserConfig).toHaveBeenCalledTimes(1);
		expect(mocks.apply).toHaveBeenCalledWith(
			expect.objectContaining({
				desiredState: "running",
				spec: expect.objectContaining({
					name: "reviewer",
					runtime: "claude-code",
					sandbox: "e2b",
					sandboxRoute: expect.arrayContaining(["e2b", "sprites"]),
					model: "claude-sonnet-4-6",
					resources: { vcpu: 2, memoryMib: 4096, diskGib: 20 },
				}),
			}),
			{ idempotencyKey: "launch-1" },
		);
		expect(mocks.reconcileNext).toHaveBeenCalledWith(expect.any(String));
	});

	it("pins the durable route when failover is disabled", async () => {
		await POST(request({ ...BASE, failover: false }));
		const input = mocks.apply.mock.calls[0][0] as {
			spec: { sandboxRoute: string[] };
		};
		expect(input.spec.sandboxRoute).toEqual(["e2b"]);
	});

	it("reuses an explicit Worker rather than creating a duplicate", async () => {
		const existing = {
			id: "existing",
			name: "existing worker",
			agentKind: "claude-code" as const,
			model: "claude-opus-4-8",
			gatewayProfileId: "vercel-ai-gateway",
			memoryBundleId: "am-default",
			rolePrompt: null,
			source: "custom" as const,
			lastMachineId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		mocks.getUserConfig.mockResolvedValue(config({ workers: [existing] }));
		await POST(request({ ...BASE, workerId: "existing" }));
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
		expect(mocks.apply).toHaveBeenCalledWith(
			expect.objectContaining({ id: "existing" }),
			expect.any(Object),
		);
	});

	it("uses an auto-route recommendation as desired intent", async () => {
		mocks.recommendArm.mockResolvedValue({
			arm: {
				runtime: "claude-code",
				substrate: "sprites",
				model: "anthropic/claude-opus-4-8",
				routerId: "vercel-ai-gateway",
			},
		});
		await POST(request({ autoRoute: true, name: "auto" }));
		const input = mocks.apply.mock.calls[0][0] as {
			spec: { sandbox: string; model: string };
		};
		expect(input.spec.sandbox).toBe("sprites");
		expect(input.spec.model).toBe("claude-opus-4-8");
	});
});
