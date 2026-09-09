import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_USER_CONFIG } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	getUserConfigById: vi.fn(),
	setUserConfig: vi.fn(),
	setUserConfigById: vi.fn(),
	getWorker: vi.fn(),
	apply: vi.fn(),
	reconcileNext: vi.fn(),
	getOperation: vi.fn(),
	after: vi.fn(),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
	getUserConfigById: mocks.getUserConfigById,
	setUserConfig: mocks.setUserConfig,
	setUserConfigById: mocks.setUserConfigById,
}));
vi.mock("@/lib/control-plane/service", () => ({
	createHostedControlPlane: () => ({
		store: {
			getWorker: mocks.getWorker,
			getOperation: mocks.getOperation,
		},
		apply: mocks.apply,
		reconcileNext: mocks.reconcileNext,
	}),
}));
vi.mock("next/server", () => ({ after: mocks.after }));

import { DELETE, PATCH } from "@/app/api/dashboard/workers/[id]/route";

const managedWorker = {
	id: "managed-1",
	spec: {
		name: "Managed",
		runtime: "claude-code",
		sandbox: "sprites",
		schedules: [],
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockResolvedValue({ ...DEFAULT_USER_CONFIG, workers: [] });
	mocks.getWorker.mockResolvedValue(managedWorker);
	mocks.apply.mockResolvedValue({
		operation: { id: "delete-1", status: "queued" },
	});
	mocks.after.mockImplementation(() => undefined);
});

describe("DELETE /api/dashboard/workers/[id]", () => {
	it("warns about retained Vercel snapshots using actual placement, not requested provider", async () => {
		mocks.getWorker.mockResolvedValue({ ...managedWorker, status: { placement: { sandbox: "vercel", sandboxId: "vercel-worker" } } });
		const response = await DELETE(new Request("https://example.invalid/api/dashboard/workers/managed-1", { method: "DELETE" }), { params: Promise.resolve({ id: "managed-1" }) });
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({ storageWarning: expect.stringContaining("explicitly remove them there") });
	});
	it("deletes a control-plane-only Worker without requiring a legacy template row", async () => {
		const response = await DELETE(
			new Request("https://example.invalid/api/dashboard/workers/managed-1", {
				method: "DELETE",
			}),
			{ params: Promise.resolve({ id: "managed-1" }) },
		);

		expect(response.status).toBe(202);
		expect(mocks.apply).toHaveBeenCalledWith({
			id: "managed-1",
			spec: managedWorker.spec,
			desiredState: "deleted",
		});
		expect(mocks.after).toHaveBeenCalledOnce();
	});

	it("returns 404 only when neither durable representation exists", async () => {
		mocks.getWorker.mockResolvedValue(null);
		const response = await DELETE(
			new Request("https://example.invalid/api/dashboard/workers/missing", {
				method: "DELETE",
			}),
			{ params: Promise.resolve({ id: "missing" }) },
		);

		expect(response.status).toBe(404);
		expect(mocks.apply).not.toHaveBeenCalled();
	});
});

describe("PATCH /api/dashboard/workers/[id]", () => {
	it("rejects a retired Dedalus model gateway before reading Worker state", async () => {
		const response = await PATCH(
			new Request("https://example.invalid/api/dashboard/workers/managed-1", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ gatewayProfileId: "dedalus-default" }),
			}),
			{ params: Promise.resolve({ id: "managed-1" }) },
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "unsupported_gateway" });
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
		expect(mocks.apply).not.toHaveBeenCalled();
	});
});
