/**
 * GET /api/dashboard/mux/placements -- auth, tenant scoping, fail closed.
 *
 * Lives under lib/ because vitest.config.ts only collects `lib/**` (the
 * route-outcomes-api.test.ts precedent). Only `createHostedMux` is faked:
 * lib/mux/placements.ts and lib/mux/route.ts run REAL, so what this asserts is
 * that the id `getEffectiveUserId()` returned is the id the router was built
 * for -- the one defect on this route that no user would ever see, because a
 * cross-tenant read looks like a working page.
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
	createHostedMux: vi.fn(),
	setPlacementStore: vi.fn(),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));
vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
}));
vi.mock("@/lib/mux/hosted-mux", () => ({
	createHostedMux: mocks.createHostedMux,
	// Exported by the real module; nothing on this route may reach it.
	muxConfigForUser: vi.fn(),
}));
vi.mock("agent-machines/mux", () => ({
	// The process-global installer. A route that called it would make every
	// concurrent request in this process read one tenant's placements.
	setPlacementStore: mocks.setPlacementStore,
}));

import { GET } from "@/app/api/dashboard/mux/placements/route";

function machine(overrides: Partial<MachineRef> = {}): MachineRef {
	return {
		id: "sbx-1",
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
	providers: { e2b: { apiKey: "e2b_live" }, sprites: { apiKey: "sp_live" } },
	machines: [machine(), machine({ id: "sbx-2", name: "second" })],
};

const REMEMBERED = {
	box: {
		substrate: "e2b",
		sandboxId: "sbx-1",
		agent: "codex",
		updatedAt: "2026-08-04T00:00:00.000Z",
	},
};

/** Tenants a mux was built for, in order. */
let built: string[] = [];
let describeImpl: () => Promise<unknown>;
let placementsImpl: () => Promise<Record<string, unknown>>;

function req(query = ""): Request {
	return new Request(`https://example.invalid/api/dashboard/mux/placements${query}`);
}

beforeEach(() => {
	vi.clearAllMocks();
	built = [];
	delete process.env.VERCEL_OIDC_TOKEN;
	placementsImpl = async () => REMEMBERED;
	describeImpl = async () => ({ state: "paused", rawPhase: "stopped" });
	mocks.getEffectiveUserId.mockResolvedValue("user-alpha");
	mocks.getUserConfig.mockResolvedValue(CONFIG);
	mocks.createHostedMux.mockImplementation((userId: string) => {
		built.push(userId);
		return { placements: () => placementsImpl(), describe: () => describeImpl() };
	});
});

describe("GET /api/dashboard/mux/placements", () => {
	it("401s when unauthenticated, before reading config or building a mux", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await GET(req());
		expect(res.status).toBe(401);
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
		expect(mocks.createHostedMux).not.toHaveBeenCalled();
	});

	it("reports the signed-in user's placements, joined against their records", async () => {
		const res = await GET(req());
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			placements: Array<{ name: string; machineId: string | null; credentialed: boolean }>;
			unremembered: Array<{ machineId: string }>;
		};
		expect(body.ok).toBe(true);
		expect(body.placements).toHaveLength(1);
		expect(body.placements[0]).toMatchObject({
			name: "box",
			machineId: "sbx-1",
			credentialed: true,
		});
		// The second machine has no placement -- expected today (only the agent
		// switch and migrate verbs mirror), and reported rather than hidden.
		expect(body.unremembered).toEqual([
			{ machineId: "sbx-2", name: "second", providerKind: "e2b" },
		]);
	});

	it("builds the mux for the id getEffectiveUserId returned, and NEVER sets the global store", async () => {
		await GET(req());
		expect(built).toEqual(["user-alpha"]);
		expect(mocks.createHostedMux).toHaveBeenCalledWith("user-alpha", CONFIG);
		expect(mocks.setPlacementStore).not.toHaveBeenCalled();
	});

	it("a different signed-in user reads a different tenant", async () => {
		// The mutation guard for the assertion above: a hard-coded tenant, or one
		// cached at module scope, would keep answering "user-alpha".
		await GET(req());
		mocks.getEffectiveUserId.mockResolvedValue("user-beta");
		await GET(req());
		expect(built).toEqual(["user-alpha", "user-beta"]);
	});

	it("502s an unreadable store rather than reporting an empty tenant", async () => {
		placementsImpl = async () => {
			throw new Error("supabase: 503");
		};
		const res = await GET(req());
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string; message: string };
		expect(body.error).toBe("placements_unavailable");
		expect(body.message).toContain("503");
	});

	it("?name= returns the no-wake description of that placement", async () => {
		const res = await GET(req("?name=box"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			ok: true,
			name: "box",
			substrate: "e2b",
			description: { state: "paused", rawPhase: "stopped" },
		});
	});

	it("?name= 404s a name this tenant does not have remembered", async () => {
		const res = await GET(req("?name=ghost"));
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("unknown_placement");
	});

	it("?name= 409s an uncredentialed lane, NAMING the missing key", async () => {
		// Fail closed before the vendor call: mux providers report missing keys
		// from ready() rather than throwing at construction, so without the gate
		// this would surface as an opaque auth error from dedalus.
		placementsImpl = async () => ({
			box: {
				substrate: "dedalus",
				sandboxId: "sbx-1",
				agent: "codex",
				updatedAt: "2026-08-04T00:00:00.000Z",
			},
		});
		const res = await GET(req("?name=box"));
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; missing: string[] };
		expect(body.error).toBe("missing_provider_credentials");
		expect(body.missing).toContain("DEDALUS_API_KEY");
	});

	it("?name= 501s a substrate that cannot report status without resuming", async () => {
		describeImpl = async () => {
			throw Object.assign(new Error("sprites cannot report status without resuming"), {
				kind: "not_supported",
			});
		};
		const res = await GET(req("?name=box"));
		expect(res.status).toBe(501);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("not_supported");
	});

	it("?name= 400s a blank name instead of listing everything", async () => {
		const res = await GET(req("?name=%20%20"));
		expect(res.status).toBe(400);
		expect(mocks.createHostedMux).not.toHaveBeenCalled();
	});
});
