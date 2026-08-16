/**
 * DELETE /api/dashboard/machines/[id] -- the mux placement is pruned exactly
 * when the record ends, and never when it does not.
 *
 * Why this needs a test at all: the placement store has NO TTL by design
 * (src/mux/state.ts "Staleness" -- an age threshold would either delete live
 * long-running machines or keep dead ones), so pruning happens only when
 * something with authority says the sandbox is gone. This route is that
 * authority on two of its four paths, and gets it wrong in two different
 * dangerous ways if unguarded: pruning on ARCHIVE would forget a machine the
 * user can still unarchive, and pruning by NAME alone would forget the new
 * sandbox after a migration re-pointed the name at it -- leaving a live sandbox
 * unreachable by name from the SDK while it keeps billing.
 *
 * lib/mux/placements.ts runs REAL; only the Supabase store is faked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type MachineRef,
	type UserConfig,
} from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfigById: vi.fn(),
	setOperationalUserConfigById: vi.fn(),
	getProvider: vi.fn(),
	destroy: vi.fn(),
	submitMachineIntent: vi.fn(),
	reconcileNext: vi.fn(),
	after: vi.fn((fn: () => unknown) => fn()),
	/** Tenants the placement store was constructed for, in order. */
	tenants: [] as string[],
	/** Names forgotten, in order. */
	forgotten: [] as string[],
	/** What the store claims to remember for "box". */
	rememberedSandboxId: "m-1" as string | null,
	storeFails: false,
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfigById: mocks.getUserConfigById,
	setOperationalUserConfigById: mocks.setOperationalUserConfigById,
}));
vi.mock("@/lib/providers", async () => {
	const actual = await vi.importActual<typeof import("@/lib/providers/types")>(
		"@/lib/providers/types",
	);
	return {
		getProvider: mocks.getProvider,
		MachineProviderError: actual.MachineProviderError,
	};
});
vi.mock("@/lib/control-plane/adopt-machine", () => ({
	submitMachineIntent: mocks.submitMachineIntent,
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/mux/placement-store", () => ({
	createSupabasePlacementStore: (tenantId: string) => {
		mocks.tenants.push(tenantId);
		return {
			read: async () => {
				if (mocks.storeFails) throw new Error("supabase: 503");
				return {
					machines:
						mocks.rememberedSandboxId === null
							? {}
							: {
									box: {
										substrate: "e2b",
										sandboxId: mocks.rememberedSandboxId,
										agent: "codex",
										updatedAt: "2026-08-04T00:00:00.000Z",
									},
								},
				};
			},
			remember: async () => undefined,
			forget: async (name: string) => {
				mocks.forgotten.push(name);
			},
		};
	},
}));
vi.mock("agent-machines/mux", () => ({
	// hosted-mux.ts value-imports this; DELETE never builds a mux, but the
	// import binding must exist or the mocked module throws on access.
	createMux: vi.fn(),
}));

import { DELETE } from "@/app/api/dashboard/machines/[id]/route";

function machine(overrides: Partial<MachineRef> = {}): MachineRef {
	return {
		id: "m-1",
		providerKind: "e2b",
		agentKind: "codex",
		name: "box",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "gpt-5.2-codex",
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: "2026-08-04T00:00:00.000Z",
		apiUrl: null,
		apiKey: null,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
		...overrides,
	};
}

const CONFIG: UserConfig = {
	...DEFAULT_USER_CONFIG,
	providers: { e2b: { apiKey: "e2b_live" } },
	machines: [machine()],
};

function req(query = ""): Request {
	return new Request(`https://example.invalid/api/dashboard/machines/m-1${query}`, {
		method: "DELETE",
	});
}

function ctx(id: string) {
	return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.tenants.length = 0;
	mocks.forgotten.length = 0;
	mocks.rememberedSandboxId = "m-1";
	mocks.storeFails = false;
	mocks.getEffectiveUserId.mockResolvedValue("user-alpha");
	mocks.getUserConfigById.mockResolvedValue(CONFIG);
	mocks.setOperationalUserConfigById.mockResolvedValue(CONFIG);
	mocks.destroy.mockResolvedValue(undefined);
	mocks.getProvider.mockReturnValue({ kind: "e2b", destroy: mocks.destroy });
	mocks.reconcileNext.mockResolvedValue(null);
	mocks.submitMachineIntent.mockResolvedValue({
		accepted: {
			worker: { id: "worker-1" },
			operation: { id: "op-1", status: "queued" },
		},
		controlPlane: { reconcileNext: mocks.reconcileNext },
	});
	mocks.after.mockImplementation((fn: () => unknown) => fn());
});

describe("DELETE /api/dashboard/machines/[id] placement pruning", () => {
	it("?destroy=1 journals deletion and schedules reconciliation", async () => {
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(202);
		expect(await res.json()).toMatchObject({
			ok: true,
			action: "destroy_scheduled",
			operation: { id: "op-1", status: "queued" },
		});
		expect(mocks.submitMachineIntent).toHaveBeenCalledWith(
			"user-alpha",
			"m-1",
			expect.objectContaining({ desiredState: "deleted" }),
		);
		expect(mocks.reconcileNext).toHaveBeenCalledWith("worker-1");
	});

	it("journals under the SIGNED-IN user", async () => {
		// Mutation guard: a constant tenant would keep answering "user-alpha" and
		// delete a row belonging to someone else.
		mocks.getEffectiveUserId.mockResolvedValue("user-beta");
		await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(mocks.submitMachineIntent).toHaveBeenCalledWith(
			"user-beta",
			"m-1",
			expect.any(Object),
		);
	});

	it("does not prune placement before the journaled provider destroy commits", async () => {
		// The post-migration shape: "box" now names the new sandbox. Forgetting it
		// while destroying the old record would strand a live, billing sandbox.
		mocks.rememberedSandboxId = "m-new";
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(202);
		expect(mocks.forgotten).toEqual([]);
	});

	it("?remove=1 prunes BEFORE the record goes, so no unprunable row is left", async () => {
		const order: string[] = [];
		mocks.setOperationalUserConfigById.mockImplementation(async () => {
			order.push("removeMachine");
			return CONFIG;
		});
		const res = await DELETE(req("?remove=1"), ctx("m-1"));
		expect(res.status).toBe(200);
		expect(mocks.forgotten).toEqual(["box"]);
		expect(order).toEqual(["removeMachine"]);
		// Nothing on this plane could identify the placement after the row is
		// gone, and the store has no TTL -- so the prune must come first.
		expect(mocks.destroy).not.toHaveBeenCalled();
	});

	it("the default ARCHIVE leaves the placement alone", async () => {
		// An archived machine is unarchivable and still addressable; forgetting
		// its placement would make it unreachable by name from the SDK.
		const res = await DELETE(req(), ctx("m-1"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, action: "archived" });
		expect(mocks.tenants).toEqual([]);
		expect(mocks.forgotten).toEqual([]);
	});

	it("?unarchive=1 leaves the placement alone", async () => {
		const res = await DELETE(req("?unarchive=1"), ctx("m-1"));
		expect(res.status).toBe(200);
		expect(mocks.tenants).toEqual([]);
	});

	it("a failed journal submission 502s and does not prune", async () => {
		mocks.submitMachineIntent.mockRejectedValue(new Error("journal unavailable"));
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(502);
		expect(mocks.forgotten).toEqual([]);
		expect(mocks.setOperationalUserConfigById).not.toHaveBeenCalled();
	});

	it("a placement-store outage cannot block journal acceptance", async () => {
		mocks.storeFails = true;
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(202);
		expect(mocks.tenants).toEqual([]);
	});

	it("401s before any store is constructed", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(401);
		expect(mocks.tenants).toEqual([]);
	});
});
