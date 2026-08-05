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
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
	getProvider: vi.fn(),
	destroy: vi.fn(),
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
	getUserConfig: mocks.getUserConfig,
	setUserConfig: mocks.setUserConfig,
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
	mocks.getUserConfig.mockResolvedValue(CONFIG);
	mocks.setUserConfig.mockResolvedValue(CONFIG);
	mocks.destroy.mockResolvedValue(undefined);
	mocks.getProvider.mockReturnValue({ kind: "e2b", destroy: mocks.destroy });
});

describe("DELETE /api/dashboard/machines/[id] placement pruning", () => {
	it("?destroy=1 destroys the sandbox, then forgets the placement under THIS tenant", async () => {
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			ok: true,
			action: "destroyed",
			placement: { forgotten: true, name: "box" },
		});
		expect(mocks.destroy).toHaveBeenCalledWith("m-1");
		expect(mocks.tenants).toEqual(["user-alpha"]);
		expect(mocks.forgotten).toEqual(["box"]);
	});

	it("prunes under the SIGNED-IN user, and a different user moves it", async () => {
		// Mutation guard: a constant tenant would keep answering "user-alpha" and
		// delete a row belonging to someone else.
		mocks.getEffectiveUserId.mockResolvedValue("user-beta");
		await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(mocks.tenants).toEqual(["user-beta"]);
	});

	it("does NOT forget a name that has moved on to another sandbox", async () => {
		// The post-migration shape: "box" now names the new sandbox. Forgetting it
		// while destroying the old record would strand a live, billing sandbox.
		mocks.rememberedSandboxId = "m-new";
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { placement: { forgotten: boolean; reason: string } };
		expect(body.placement.forgotten).toBe(false);
		expect(body.placement.reason).toContain("m-new");
		expect(mocks.forgotten).toEqual([]);
	});

	it("?remove=1 prunes BEFORE the record goes, so no unprunable row is left", async () => {
		const order: string[] = [];
		mocks.setUserConfig.mockImplementation(async () => {
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

	it("a failed destroy 502s and does NOT prune: the sandbox may still be alive", async () => {
		mocks.destroy.mockRejectedValue(new Error("e2b: 500"));
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(502);
		expect(mocks.forgotten).toEqual([]);
		// The record survives too, so the machine stays visible and destroyable.
		expect(mocks.setUserConfig).not.toHaveBeenCalled();
	});

	it("a placement-store failure does NOT fail a successful destroy", async () => {
		mocks.storeFails = true;
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			action: string;
			placement: { forgotten: boolean; reason: string };
		};
		expect(body.action).toBe("destroyed");
		expect(body.placement).toEqual({ forgotten: false, reason: "supabase: 503" });
		// A stale placement is a bookkeeping problem; a record left pointing at a
		// destroyed sandbox is a user-visible one, so the removal still happened.
		expect(mocks.setUserConfig).toHaveBeenCalledWith({ removeMachine: "m-1" });
	});

	it("401s before any store is constructed", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await DELETE(req("?destroy=1"), ctx("m-1"));
		expect(res.status).toBe(401);
		expect(mocks.tenants).toEqual([]);
	});
});
