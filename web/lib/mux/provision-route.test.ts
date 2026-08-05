/**
 * POST /api/dashboard/admin/provision-machine -- failover, teardown and auth.
 *
 * The handler is imported through the `@/` alias rather than tested next to the
 * route file because vitest.config.ts only collects `lib/**` (same reason as
 * lib/learning/route-outcomes-api.test.ts).
 *
 * The vendors are faked at `createMachineForConfig` and `getProvider`, which is
 * the whole surface the route drives: one fake decides whether a lane accepts
 * the create, the other records whether a rejected lane was torn down.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	type MachineRef,
	type ProviderKind,
	type UserConfig,
} from "@/lib/user-config/schema";
import { MachineProviderError } from "@/lib/providers/types";
import type { ProvisionAttempt } from "@/lib/mux/failover";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	setUserConfig: vi.fn(),
	createMachineForConfig: vi.fn(),
	getProvider: vi.fn(),
	primeConsoleSession: vi.fn(),
	scheduleWebBootstrap: vi.fn(),
	recommendArm: vi.fn(),
	after: vi.fn(),
	loadTenantHealth: vi.fn(),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));

vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
	setUserConfig: mocks.setUserConfig,
}));

vi.mock("@/lib/dashboard/provision", () => ({
	createMachineForConfig: mocks.createMachineForConfig,
}));

// The real module is a facade over four vendor SDKs; only the factory is used
// here. MachineProviderError comes from the real ./types so `instanceof` and the
// error taxonomy behave exactly as they do in production.
vi.mock("@/lib/providers", async () => {
	const actual = await vi.importActual<typeof import("@/lib/providers/types")>(
		"@/lib/providers/types",
	);
	return {
		getProvider: mocks.getProvider,
		MachineProviderError: actual.MachineProviderError,
	};
});

vi.mock("@/lib/dashboard/terminal-session", () => ({
	primeConsoleSession: mocks.primeConsoleSession,
}));

vi.mock("@/lib/bootstrap/schedule-bootstrap", () => ({
	scheduleWebBootstrap: mocks.scheduleWebBootstrap,
}));

vi.mock("@/lib/learning/recommend", () => ({
	recommendArm: mocks.recommendArm,
}));

vi.mock("next/server", () => ({ after: mocks.after }));

// The gate is faked here (lib/mux/health.test.ts drives the real breaker) so a
// route test can decide the verdict without a database. What is under test on
// this side is that the route builds it for the RIGHT tenant, hands it to the
// walk, and never claims a lane failed when health merely demoted it.
vi.mock("@/lib/mux/health", () => ({ loadTenantHealth: mocks.loadTenantHealth }));

import { POST } from "@/app/api/dashboard/admin/provision-machine/route";

type Body = Record<string, unknown>;

function req(body: Body): Request {
	return {
		json: async () => body,
	} as unknown as Request;
}

type ProvisionResponse = {
	ok?: boolean;
	deduped?: boolean;
	machineId?: string;
	providerKind?: ProviderKind;
	state?: string;
	attempts?: ProvisionAttempt[];
	message?: string;
	error?: string;
};

/** Credentials for e2b + sprites; vercel and dedalus stay uncredentialed. */
function configWith(overrides: Partial<UserConfig> = {}): UserConfig {
	return {
		...DEFAULT_USER_CONFIG,
		providers: {
			e2b: { apiKey: "e2b_live" },
			sprites: { apiKey: "sprites_live" },
		},
		...overrides,
	};
}

function machine(id: string, providerKind: ProviderKind): MachineRef {
	return {
		id,
		providerKind,
		agentKind: "claude-code",
		name: "box",
		spec: { vcpu: 2, memoryMib: 2048, storageGib: 10 },
		model: "anthropic/claude-sonnet-4-6",
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: new Date().toISOString(),
		apiUrl: null,
		apiKey: null,
		bootstrapState: {
			phase: "idle",
			current: null,
			completed: [],
			startedAt: null,
			finishedAt: null,
			lastError: null,
		},
	};
}

const BASE_BODY: Body = {
	providerKind: "e2b",
	agentKind: "claude-code",
	model: "anthropic/claude-sonnet-4-6",
	force: true,
	startBootstrap: false,
};

/**
 * A health gate with spied feedback. `demote` is the lane the breaker has
 * evidence against; everything else is healthy and keeps its configured place.
 */
function fakeGate(demote?: ProviderKind) {
	const notes: Array<[string, ProviderKind, string | null]> = [];
	return {
		notes,
		gate: {
			order: (route: readonly ProviderKind[]) =>
				demote === undefined
					? [...route]
					: [...route.filter((lane) => lane !== demote), ...route.filter((lane) => lane === demote)],
			stateOf: (substrate: ProviderKind) => (substrate === demote ? "open" : "healthy"),
			noteOk: async (substrate: ProviderKind) => {
				notes.push(["ok", substrate, null]);
			},
			noteFailure: async (substrate: ProviderKind, kind: string) => {
				notes.push(["failed", substrate, kind]);
			},
			loaded: true,
		},
	};
}

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getEffectiveUserId.mockResolvedValue("user-1");
	mocks.getUserConfig.mockResolvedValue(configWith());
	mocks.setUserConfig.mockResolvedValue(configWith());
	// Default: a loaded breaker with nothing against any lane, so every test
	// that is not about health sees the configured order.
	mocks.loadTenantHealth.mockImplementation(async () => fakeGate().gate);
	// VERCEL_OIDC_TOKEN in the ambient environment would silently add a lane.
	delete process.env.VERCEL_OIDC_TOKEN;
});

describe("provision-machine -- auth fails closed", () => {
	it("401s an unauthenticated caller without provisioning anything", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
	});

	it("401s on an empty user id, not just null", async () => {
		mocks.getEffectiveUserId.mockResolvedValue("");
		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(401);
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
	});
});

describe("provision-machine -- create-time failover", () => {
	it("places on the backup lane when the requested one is transient", async () => {
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				if (opts.providerKind === "e2b") {
					throw new MachineProviderError(
						"e2b",
						"transient",
						"e2b provision failed: 503 sandbox capacity",
					);
				}
				return { machineId: "sp-1", phase: "running", state: "ready" };
			},
		);

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(200);
		const body = (await res.json()) as ProvisionResponse;

		expect(body.ok).toBe(true);
		expect(body.machineId).toBe("sp-1");
		// The lane it actually landed on, not the one that was asked for.
		expect(body.providerKind).toBe("sprites");
		expect(body.message).toContain("Placed on sprites after e2b failed");
		expect(mocks.createMachineForConfig).toHaveBeenCalledTimes(2);
		expect(
			mocks.createMachineForConfig.mock.calls.map(
				(call) => (call[1] as { providerKind: ProviderKind }).providerKind,
			),
		).toEqual(["e2b", "sprites"]);
	});

	it("returns every attempt so the route is explainable", async () => {
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				if (opts.providerKind === "e2b") {
					throw new MachineProviderError("e2b", "rate_limited", "429 too many");
				}
				return { machineId: "sp-1", phase: "running", state: "ready" };
			},
		);

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;
		const attempts = body.attempts ?? [];

		expect(attempts.map((a) => [a.substrate, a.outcome])).toEqual([
			// Uncredentialed lanes are reported, not hidden.
			["vercel", "skipped"],
			["dedalus", "skipped"],
			["e2b", "failed"],
			["sprites", "ok"],
		]);
		expect(attempts[0].reason).toContain("VERCEL_TOKEN");
		expect(attempts[1].reason).toContain("DEDALUS_API_KEY");
		expect(attempts[2].reason).toContain("429 too many");
		expect(typeof attempts[3].durationMs).toBe("number");
	});

	it("502s with every lane named when the whole route fails", async () => {
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				throw new MachineProviderError(
					opts.providerKind,
					"transient",
					`${opts.providerKind} unreachable`,
				);
			},
		);

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(502);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.error).toBe("provision_failed");
		expect(body.message).toContain("e2b=failed");
		expect(body.message).toContain("sprites=failed");
		expect(body.attempts?.filter((a) => a.outcome === "failed")).toHaveLength(2);
	});

	it("does not retry a missing_credentials failure on another lane", async () => {
		mocks.createMachineForConfig.mockRejectedValue(
			new MachineProviderError(
				"e2b",
				"missing_credentials",
				"No E2B API key on file.",
			),
		);

		const res = await POST(req(BASE_BODY));
		// A credential failure is the same answer everywhere, so it is reported as
		// the caller's problem (400) after exactly one attempt.
		expect(res.status).toBe(400);
		expect(mocks.createMachineForConfig).toHaveBeenCalledTimes(1);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.error).toBe("missing_provider_credentials");
	});

	it("501s a not_supported failure without touching the backup lane", async () => {
		mocks.createMachineForConfig.mockRejectedValue(
			new MachineProviderError(
				"e2b",
				"not_supported",
				"e2b cannot honor a 200 GiB disk.",
			),
		);

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(501);
		expect(mocks.createMachineForConfig).toHaveBeenCalledTimes(1);
	});

	it("pins to one lane when the caller disables failover", async () => {
		mocks.createMachineForConfig.mockRejectedValue(
			new MachineProviderError("e2b", "transient", "e2b unreachable"),
		);

		const res = await POST(req({ ...BASE_BODY, failover: false }));
		expect(res.status).toBe(502);
		expect(mocks.createMachineForConfig).toHaveBeenCalledTimes(1);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.attempts?.some((a) => a.substrate === "sprites")).toBe(false);
	});

	it("400s when the requested lane itself has no credentials", async () => {
		mocks.getUserConfig.mockResolvedValue(
			configWith({ providers: { sprites: { apiKey: "sprites_live" } } }),
		);

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(400);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.error).toBe("missing_provider_credentials");
		expect(body.message).toContain("E2B_API_KEY");
		// Never silently placed on a lane the caller did not choose.
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
	});
});

describe("provision-machine -- a rejected lane leaves nothing billing", () => {
	it("destroys the sandbox and drops the row when the machine comes up dead", async () => {
		const destroy = vi.fn(async () => {});
		mocks.getProvider.mockReturnValue({ destroy });
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				if (opts.providerKind === "e2b") {
					// The substrate accepted the create and then reported the machine
					// failed. Before failover this came back as ok:true.
					return { machineId: "e2b-1", phase: "failed", state: "error" };
				}
				return { machineId: "sp-1", phase: "running", state: "ready" };
			},
		);

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(200);
		const body = (await res.json()) as ProvisionResponse;

		expect(body.machineId).toBe("sp-1");
		expect(body.providerKind).toBe("sprites");
		expect(mocks.getProvider).toHaveBeenCalledWith("e2b", expect.anything());
		// Explicit machineId scoping: the dead machine, never the active one.
		expect(destroy).toHaveBeenCalledWith("e2b-1");
		expect(mocks.setUserConfig).toHaveBeenCalledWith({ removeMachine: "e2b-1" });
		expect(body.attempts?.[2].reason).toContain('reported state "error"');
	});

	it("keeps the row when the sandbox could not be destroyed, and says so", async () => {
		const destroy = vi.fn(async () => {
			throw new MachineProviderError("e2b", "transient", "vendor 500 on delete");
		});
		mocks.getProvider.mockReturnValue({ destroy });
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				if (opts.providerKind === "e2b") {
					return { machineId: "e2b-1", phase: "failed", state: "error" };
				}
				return { machineId: "sp-1", phase: "running", state: "ready" };
			},
		);

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;

		// A machine we could not delete stays visible to the operator instead of
		// becoming an invisible quota leak.
		expect(mocks.setUserConfig).not.toHaveBeenCalledWith({
			removeMachine: "e2b-1",
		});
		expect(body.attempts?.[2].reason).toContain("orphaned sandbox e2b-1");
		expect(body.attempts?.[2].reason).toContain("vendor 500 on delete");
		expect(body.machineId).toBe("sp-1");
	});
});

describe("provision-machine -- preserved behavior", () => {
	it("still dedupes a repeat of the same spec inside 60s", async () => {
		const recent = machine("e2b-recent", "e2b");
		mocks.getUserConfig.mockResolvedValue(
			configWith({ machines: [recent], activeMachineId: recent.id }),
		);

		const res = await POST(
			req({
				providerKind: "e2b",
				agentKind: "claude-code",
				spec: recent.spec,
				startBootstrap: false,
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.deduped).toBe(true);
		expect(body.machineId).toBe("e2b-recent");
		expect(body.attempts).toEqual([]);
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
	});

	it("keeps the machineId/phase/state fields callers already read", async () => {
		mocks.createMachineForConfig.mockResolvedValue({
			machineId: "e2b-1",
			phase: "running",
			state: "ready",
		});

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;
		expect(body).toMatchObject({
			ok: true,
			machineId: "e2b-1",
			state: "ready",
			providerKind: "e2b",
		});
		expect(body.message).toBe("Machine accepted. Bootstrap is waiting for the caller.");
		// No failover happened, so the prose is unchanged from before 0.3.
		expect(body.message).not.toContain("Placed on");
	});

	it("500s when the config read fails, before any lane is walked", async () => {
		mocks.getUserConfig.mockRejectedValue(new Error("clerk unavailable"));
		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({
			error: "config_read_failed",
			message: "clerk unavailable",
		});
		expect(mocks.createMachineForConfig).not.toHaveBeenCalled();
	});
});

describe("provision-machine -- health ordering", () => {
	it("builds the breaker for the CALLING tenant, once", async () => {
		mocks.createMachineForConfig.mockResolvedValue({
			machineId: "e2b-1",
			phase: "running",
			state: "ready",
		});
		await POST(req(BASE_BODY));
		expect(mocks.loadTenantHealth).toHaveBeenCalledTimes(1);
		// The effective user id, the same scope key every other hosted table uses.
		// A shared or missing tenant here is how one user's failing key would open
		// another user's circuit.
		expect(mocks.loadTenantHealth).toHaveBeenCalledWith({ tenantId: "user-1" });
	});

	it("places on a healthy backup ahead of a requested lane whose circuit is open", async () => {
		const { gate, notes } = fakeGate("e2b");
		mocks.loadTenantHealth.mockResolvedValue(gate);
		mocks.createMachineForConfig.mockResolvedValue({
			machineId: "sp-1",
			phase: "running",
			state: "ready",
		});

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;

		expect(body.providerKind).toBe("sprites");
		// e2b was never attempted: that skipped attempt is the entire saving, and
		// on a cold lane it is 17-31s (docs/MUX-RESULTS.md).
		expect(
			mocks.createMachineForConfig.mock.calls.map(
				(call) => (call[1] as { providerKind: ProviderKind }).providerKind,
			),
		).toEqual(["sprites"]);
		expect(notes).toEqual([["ok", "sprites", null]]);
	});

	it("does not claim the requested lane failed when health merely demoted it", async () => {
		mocks.loadTenantHealth.mockResolvedValue(fakeGate("e2b").gate);
		mocks.createMachineForConfig.mockResolvedValue({
			machineId: "sp-1",
			phase: "running",
			state: "ready",
		});

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;

		// The pre-health message was hard-coded to "after e2b failed", which would
		// be a plain untruth about a lane that was never touched.
		expect(body.message).not.toContain("after e2b failed");
		expect(body.message).toContain("ahead of e2b");
		expect(body.message).toContain("circuit open");
	});

	it("still says 'after X failed' when the lane really was tried and failed", async () => {
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				if (opts.providerKind === "e2b") {
					throw new MachineProviderError("e2b", "transient", "e2b 503");
				}
				return { machineId: "sp-1", phase: "running", state: "ready" };
			},
		);

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;
		expect(body.message).toContain("Placed on sprites after e2b failed");
	});

	it("feeds every lane's outcome back into the tenant's breaker", async () => {
		const { gate, notes } = fakeGate();
		mocks.loadTenantHealth.mockResolvedValue(gate);
		mocks.createMachineForConfig.mockImplementation(
			async (_config: UserConfig, opts: { providerKind: ProviderKind }) => {
				if (opts.providerKind === "e2b") {
					throw new MachineProviderError("e2b", "rate_limited", "429 slow down");
				}
				return { machineId: "sp-1", phase: "running", state: "ready" };
			},
		);

		const body = (await (await POST(req(BASE_BODY))).json()) as ProvisionResponse;

		expect(notes).toEqual([
			["failed", "e2b", "rate_limited"],
			["ok", "sprites", null],
		]);
		// And the verdict rides the attempt record, so the route stays explainable
		// without a second query.
		const attempts = body.attempts ?? [];
		expect(attempts.find((a) => a.substrate === "e2b")?.health).toBe("healthy");
		expect(attempts.find((a) => a.substrate === "sprites")?.health).toBe("healthy");
	});

	it("provisions normally when the breaker could not be loaded at all", async () => {
		// loadTenantHealth never rejects, but its gate may report no history. A
		// health signal that cannot be read must cost ordering, never a machine.
		mocks.loadTenantHealth.mockImplementation(async () => ({
			order: (route: readonly ProviderKind[]) => [...route],
			stateOf: () => "healthy" as const,
			noteOk: async () => {},
			noteFailure: async () => {},
			loaded: false,
		}));
		mocks.createMachineForConfig.mockResolvedValue({
			machineId: "e2b-1",
			phase: "running",
			state: "ready",
		});

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(200);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.providerKind).toBe("e2b");
	});
});

describe("provision-machine -- a broken breaker never costs a machine", () => {
	it("still answers 200 when the gate throws while the message is composed", async () => {
		// The machine EXISTS and is recorded by the time the confirmation message
		// is built, so nothing in that composition may throw: a 500 here would
		// leave the caller believing the provision failed while it is billing.
		mocks.loadTenantHealth.mockResolvedValue({
			order: (route: readonly ProviderKind[]) => [...route].reverse(),
			stateOf: () => {
				throw new Error("breaker exploded");
			},
			noteOk: async () => {},
			noteFailure: async () => {},
			loaded: true,
		});
		mocks.createMachineForConfig.mockResolvedValue({
			machineId: "sp-1",
			phase: "running",
			state: "ready",
		});

		const res = await POST(req(BASE_BODY));
		expect(res.status).toBe(200);
		const body = (await res.json()) as ProvisionResponse;
		expect(body.providerKind).toBe("sprites");
		expect(body.message).toContain("ahead of e2b");
		expect(body.message).toContain("demoted by health");
	});
});
