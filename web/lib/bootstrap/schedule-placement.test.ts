/**
 * scheduleWebBootstrap's mux placement mirror: opt-in, post-install, and
 * incapable of failing a bootstrap.
 *
 * Three properties, each protecting a different failure:
 *
 *  - OPT-IN. Only the agent-switch route passes `placementTenantId`. Provision
 *    and wake-repair must behave byte-identically to before, or a change meant
 *    to add bookkeeping has silently altered the two hottest paths.
 *  - POST-INSTALL. The placement carries the agent, and the SDK's own
 *    `Mux.create()` remembers only after `ensureInstalled()` returns. A
 *    placement written on a FAILED bootstrap would claim a harness that is not
 *    on the box -- exactly the defect the old PATCH-agentKind path shipped.
 *  - NON-FATAL. A store failure must not flip bootstrapState to "failed": the
 *    install really did succeed, and the dashboard polls that field.
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
	runWebBootstrap: vi.fn(),
	setUserConfig: vi.fn(),
	/** Every effect in one log, so ordering is assertable. */
	trace: [] as string[],
	tenants: [] as string[],
	writes: [] as Array<{ tenantId: string; name: string; placement: unknown }>,
	storeFails: false,
}));

vi.mock("@/lib/bootstrap/runner", () => ({
	runWebBootstrap: mocks.runWebBootstrap,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	setUserConfig: mocks.setUserConfig,
}));
vi.mock("@/lib/mux/placement-store", () => ({
	createSupabasePlacementStore: (tenantId: string) => {
		mocks.tenants.push(tenantId);
		return {
			read: async () => ({ machines: {} }),
			remember: async (name: string, placement: unknown) => {
				if (mocks.storeFails) throw new Error("supabase: 503");
				mocks.trace.push(`placement:${name}`);
				mocks.writes.push({ tenantId, name, placement });
			},
			forget: async () => undefined,
		};
	},
}));
vi.mock("agent-machines/mux", () => ({
	// hosted-mux.ts value-imports this; nothing here builds a mux, but the
	// import binding must exist or the mocked module throws on access.
	createMux: vi.fn(),
}));

import { scheduleWebBootstrap } from "@/lib/bootstrap/schedule-bootstrap";

function machine(overrides: Partial<MachineRef> = {}): MachineRef {
	return {
		id: "sbx-1",
		providerKind: "e2b",
		agentKind: "openclaw",
		name: "box",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "anthropic/claude-opus-4-8",
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: "2026-08-04T00:00:00.000Z",
		apiUrl: null,
		apiKey: null,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE },
		...overrides,
	};
}

const CONFIG: UserConfig = {
	...DEFAULT_USER_CONFIG,
	providers: { e2b: { apiKey: "e2b_live" } },
	machines: [machine()],
};

const provider = { kind: "e2b" } as never;

/** The bootstrapState phase of the last patch that wrote one. */
function lastPhase(): string | undefined {
	for (let i = mocks.setUserConfig.mock.calls.length - 1; i >= 0; i -= 1) {
		const patch = mocks.setUserConfig.mock.calls[i][0] as {
			patchMachine?: { patch?: { bootstrapState?: { phase?: string } } };
		};
		const phase = patch.patchMachine?.patch?.bootstrapState?.phase;
		if (phase) return phase;
	}
	return undefined;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.trace.length = 0;
	mocks.tenants.length = 0;
	mocks.writes.length = 0;
	mocks.storeFails = false;
	mocks.setUserConfig.mockImplementation(async (patch: Record<string, unknown>) => {
		const pm = patch.patchMachine as { patch?: Record<string, unknown> } | undefined;
		if (pm?.patch && "apiUrl" in pm.patch) mocks.trace.push("write:credentials");
		else mocks.trace.push("write:state");
		return CONFIG;
	});
	mocks.runWebBootstrap.mockImplementation(async () => {
		mocks.trace.push("bootstrap");
		return { apiUrl: "https://new.example/v1", apiKey: "bearer" };
	});
});

describe("scheduleWebBootstrap placement mirror", () => {
	it("records nothing when no tenant is passed (provision and wake are unchanged)", async () => {
		await scheduleWebBootstrap(machine(), provider, CONFIG);
		expect(mocks.tenants).toEqual([]);
		expect(mocks.writes).toEqual([]);
	});

	it("records the placement under the given tenant, AFTER the install and the credential write", async () => {
		await scheduleWebBootstrap(machine(), provider, CONFIG, {
			force: true,
			placementTenantId: "user-alpha",
		});
		expect(mocks.tenants).toEqual(["user-alpha"]);
		expect(mocks.writes).toEqual([
			{
				tenantId: "user-alpha",
				name: "box",
				// The agent is the point of this mirror: the switch route flips it,
				// and the router must agree about which harness answers here.
				placement: { substrate: "e2b", sandboxId: "sbx-1", agent: "openclaw" },
			},
		]);
		expect(mocks.trace).toEqual([
			"write:state",
			"bootstrap",
			"write:credentials",
			"placement:box",
		]);
	});

	it("a different tenant is the only thing that moves the write's scope", async () => {
		// Mutation guard for the assertion above.
		await scheduleWebBootstrap(machine(), provider, CONFIG, { placementTenantId: "user-beta" });
		expect(mocks.tenants).toEqual(["user-beta"]);
		expect(mocks.writes.map((w) => w.tenantId)).toEqual(["user-beta"]);
	});

	it("records NOTHING when the bootstrap failed: the harness is not installed", async () => {
		mocks.runWebBootstrap.mockRejectedValue(new Error("install died"));
		await scheduleWebBootstrap(machine(), provider, CONFIG, {
			placementTenantId: "user-alpha",
		});
		expect(mocks.writes).toEqual([]);
		expect(mocks.tenants).toEqual([]);
		expect(lastPhase()).toBe("failed");
	});

	it("a placement-store failure does NOT report a successful bootstrap as failed", async () => {
		mocks.storeFails = true;
		await scheduleWebBootstrap(machine(), provider, CONFIG, {
			placementTenantId: "user-alpha",
		});
		// The last state write is the "running" one from the top; nothing flipped
		// it to failed, and the credential write landed.
		expect(lastPhase()).toBe("running");
		expect(mocks.trace).toContain("write:credentials");
	});

	it("declines an ambiguous name rather than mislabelling a placement", async () => {
		// Two live machines share "box": a placement keyed by that name would
		// resolve to whichever wrote last.
		const ambiguous: UserConfig = {
			...CONFIG,
			machines: [machine(), machine({ id: "sbx-2" })],
		};
		await scheduleWebBootstrap(machine(), provider, ambiguous, {
			placementTenantId: "user-alpha",
		});
		expect(mocks.writes).toEqual([]);
		// And the bootstrap itself still succeeded.
		expect(lastPhase()).toBe("running");
		expect(mocks.trace).toContain("write:credentials");
	});
});
