/**
 * Create-time failover contract (ROADMAP 0.3), tested with faked lanes.
 *
 * Every case here fails against the pre-0.3 hosted behavior, which had no walk
 * at all: the first provider error became a 502.
 */

import { describe, expect, it, vi } from "vitest";

import {
	assertUsableProvisionState,
	isRoutableProviderError,
	provisionWithFailover,
	type ProvisionAttempt,
} from "@/lib/mux/failover";
import type { SubstrateKind } from "@/lib/mux/capabilities";
import { MachineProviderError } from "@/lib/providers/types";

type Created = { machineId: string; state: string };

/** A monotonic fake clock so attempt durations are exact, not "roughly 0". */
function clock(stepMs: number): () => number {
	let value = 0;
	return () => {
		const current = value;
		value += stepMs;
		return current;
	};
}

function lane(overrides: {
	provision: (substrate: SubstrateKind) => Promise<Created>;
	accept?: (substrate: SubstrateKind, created: Created) => void | Promise<void>;
	teardown?: (substrate: SubstrateKind, machineId: string) => Promise<void>;
}) {
	const teardown = vi.fn(overrides.teardown ?? (async () => {}));
	return {
		teardown,
		lane: {
			provision: overrides.provision,
			...(overrides.accept ? { accept: overrides.accept } : {}),
			teardown,
		},
	};
}

describe("provisionWithFailover -- walking the route", () => {
	it("falls over to the backup lane when the primary is transient", async () => {
		const tried: SubstrateKind[] = [];
		const { lane: l, teardown } = lane({
			provision: async (substrate) => {
				tried.push(substrate);
				if (substrate === "e2b") {
					throw new MachineProviderError("e2b", "transient", "e2b 503 upstream");
				}
				return { machineId: "sp-1", state: "ready" };
			},
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b", "sprites"],
			skipped: [],
			lane: l,
			now: clock(10),
		});

		expect(tried).toEqual(["e2b", "sprites"]);
		if (!result.ok) throw new Error(`expected placement, got ${result.error.message}`);
		expect(result.substrate).toBe("sprites");
		expect(result.created.machineId).toBe("sp-1");
		expect(result.attempts).toEqual<ProvisionAttempt[]>([
			{
				substrate: "e2b",
				outcome: "failed",
				reason: "e2b 503 upstream",
				durationMs: 10,
			},
			{ substrate: "sprites", outcome: "ok", durationMs: 10 },
		]);
		// Nothing was provisioned on the failing lane, so nothing to tear down.
		expect(teardown).not.toHaveBeenCalled();
	});

	it("advances on rate_limited and on an unclassified throw", async () => {
		const { lane: l } = lane({
			provision: async (substrate) => {
				if (substrate === "e2b") {
					throw new MachineProviderError("e2b", "rate_limited", "429 slow down");
				}
				if (substrate === "sprites") throw new Error("socket hang up");
				return { machineId: "vc-1", state: "starting" };
			},
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b", "sprites", "vercel"],
			skipped: [],
			lane: l,
		});

		if (!result.ok) throw new Error("expected the third lane to place");
		expect(result.substrate).toBe("vercel");
		expect(result.attempts.map((a) => a.outcome)).toEqual([
			"failed",
			"failed",
			"ok",
		]);
		// An unrecognized throw is classified transient, never dropped silently.
		expect(result.attempts[1].reason).toContain("socket hang up");
	});

	it("does NOT retry missing_credentials on another lane", async () => {
		const provision = vi.fn(async (substrate: SubstrateKind) => {
			if (substrate === "e2b") {
				throw new MachineProviderError(
					"e2b",
					"missing_credentials",
					"No E2B API key on file.",
				);
			}
			return { machineId: "sp-1", state: "ready" };
		});
		const { lane: l } = lane({ provision });

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b", "sprites"],
			skipped: [],
			lane: l,
		});

		expect(provision).toHaveBeenCalledTimes(1);
		if (result.ok) throw new Error("a credential failure must not place a machine");
		expect(result.error.kind).toBe("missing_credentials");
		expect(result.error.message).toBe("No E2B API key on file.");
		expect(result.attempts.map((a) => a.substrate)).toEqual(["e2b"]);
	});

	it("does NOT retry not_supported on another lane", async () => {
		const provision = vi.fn(async () => {
			throw new MachineProviderError(
				"sprites",
				"not_supported",
				"sprites does not support a 200 GiB disk.",
			);
		});
		const { lane: l } = lane({ provision });

		const result = await provisionWithFailover({
			primary: "sprites",
			route: ["sprites", "e2b", "vercel"],
			skipped: [],
			lane: l,
		});

		expect(provision).toHaveBeenCalledTimes(1);
		if (result.ok) throw new Error("not_supported must not place a machine");
		expect(result.error.kind).toBe("not_supported");
	});

	it("reports every failed lane when the whole route fails", async () => {
		const { lane: l } = lane({
			provision: async (substrate) => {
				throw new MachineProviderError(substrate, "transient", `${substrate} down`);
			},
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b", "sprites"],
			skipped: [{ substrate: "vercel", missing: ["VERCEL_TOKEN"] }],
			lane: l,
		});

		if (result.ok) throw new Error("expected the route to fail");
		expect(result.error.kind).toBe("transient");
		expect(result.error.message).toContain("e2b=failed (e2b down)");
		expect(result.error.message).toContain("sprites=failed (sprites down)");
		expect(result.error.message).toContain("vercel=skipped");
		expect(result.attempts.map((a) => a.substrate)).toEqual([
			"vercel",
			"e2b",
			"sprites",
		]);
	});

	it("fails closed with missing_credentials when no lane is credentialed", async () => {
		const provision = vi.fn(async () => ({ machineId: "x", state: "ready" }));
		const { lane: l } = lane({ provision });

		const result = await provisionWithFailover({
			primary: "dedalus",
			route: [],
			skipped: [
				{ substrate: "dedalus", missing: ["DEDALUS_API_KEY"] },
				{ substrate: "e2b", missing: ["E2B_API_KEY"] },
			],
			lane: l,
		});

		expect(provision).not.toHaveBeenCalled();
		if (result.ok) throw new Error("an empty route must not place a machine");
		expect(result.error.kind).toBe("missing_credentials");
		expect(result.error.providerKind).toBe("dedalus");
		expect(result.error.message).toContain("DEDALUS_API_KEY");
		expect(result.attempts).toEqual<ProvisionAttempt[]>([
			{
				substrate: "dedalus",
				outcome: "skipped",
				reason: "missing credentials: DEDALUS_API_KEY",
			},
			{
				substrate: "e2b",
				outcome: "skipped",
				reason: "missing credentials: E2B_API_KEY",
			},
		]);
	});

	it("records the skipped lanes ahead of the lanes it walked", async () => {
		const { lane: l } = lane({
			provision: async () => ({ machineId: "e2b-1", state: "ready" }),
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b"],
			skipped: [
				{ substrate: "sprites", missing: ["SPRITES_TOKEN"] },
				{ substrate: "vercel", missing: ["VERCEL_TOKEN", "VERCEL_TEAM_ID"] },
			],
			lane: l,
		});

		if (!result.ok) throw new Error("expected e2b to place");
		expect(result.attempts[0]).toEqual({
			substrate: "sprites",
			outcome: "skipped",
			reason: "missing credentials: SPRITES_TOKEN",
		});
		expect(result.attempts[1].reason).toBe(
			"missing credentials: VERCEL_TOKEN, VERCEL_TEAM_ID",
		);
		expect(result.attempts[2].outcome).toBe("ok");
	});
});

describe("provisionWithFailover -- a sandbox is never left billing", () => {
	it("tears the sandbox down when a step AFTER provisioning fails", async () => {
		const { lane: l, teardown } = lane({
			provision: async (substrate) => ({
				machineId: `${substrate}-1`,
				state: "ready",
			}),
			accept: (substrate) => {
				if (substrate === "e2b") throw new Error("could not prime the console");
			},
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b", "sprites"],
			skipped: [],
			lane: l,
		});

		expect(teardown).toHaveBeenCalledTimes(1);
		expect(teardown).toHaveBeenCalledWith("e2b", "e2b-1");
		if (!result.ok) throw new Error("expected sprites to place");
		expect(result.substrate).toBe("sprites");
		expect(result.attempts[0].reason).toContain("could not prime the console");
	});

	it("records an orphan rather than hiding a teardown failure", async () => {
		const { lane: l } = lane({
			provision: async (substrate) => ({
				machineId: `${substrate}-1`,
				state: "ready",
			}),
			accept: (substrate) => {
				if (substrate === "e2b") throw new Error("post-provision check failed");
			},
			teardown: async () => {
				throw new Error("vendor 500 on delete");
			},
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b", "sprites"],
			skipped: [],
			lane: l,
		});

		if (!result.ok) throw new Error("expected sprites to place");
		// The orphan record comes first: the teardown failure is its own fact and
		// must not mask the error that rejected the lane.
		expect(result.attempts[0]).toEqual({
			substrate: "e2b",
			outcome: "failed",
			reason:
				"orphaned sandbox e2b-1: teardown failed: vendor 500 on delete",
		});
		expect(result.attempts[1].reason).toContain("post-provision check failed");
	});

	it("does not tear down when the substrate never provisioned", async () => {
		const { lane: l, teardown } = lane({
			provision: async () => {
				throw new MachineProviderError("e2b", "transient", "create timed out");
			},
		});

		const result = await provisionWithFailover({
			primary: "e2b",
			route: ["e2b"],
			skipped: [],
			lane: l,
		});

		expect(teardown).not.toHaveBeenCalled();
		expect(result.ok).toBe(false);
	});

	it("tears down a lane that came up in a dead state, then places elsewhere", async () => {
		const { lane: l, teardown } = lane({
			provision: async (substrate) => ({
				machineId: `${substrate}-1`,
				state: substrate === "dedalus" ? "error" : "ready",
			}),
			accept: (substrate, created) =>
				assertUsableProvisionState(substrate, created.machineId, created.state),
		});

		const result = await provisionWithFailover({
			primary: "dedalus",
			route: ["dedalus", "e2b"],
			skipped: [],
			lane: l,
		});

		expect(teardown).toHaveBeenCalledWith("dedalus", "dedalus-1");
		if (!result.ok) throw new Error("expected e2b to place");
		expect(result.substrate).toBe("e2b");
		expect(result.attempts[0].reason).toContain('reported state "error"');
	});
});

describe("assertUsableProvisionState", () => {
	it("rejects the states a vendor uses to say the machine is dead", () => {
		for (const state of ["error", "destroyed"]) {
			expect(() => assertUsableProvisionState("e2b", "m-1", state)).toThrow(
				/reported state/,
			);
		}
	});

	it("accepts unknown rather than destroying a machine that may be alive", () => {
		// `unknown` means the status read did not answer. The row exists and the
		// operator can see it, so destroying it would throw away a live sandbox.
		for (const state of ["ready", "starting", "sleeping", "unknown"]) {
			expect(() =>
				assertUsableProvisionState("e2b", "m-1", state),
			).not.toThrow();
		}
	});

	it("classifies the rejection as routable so the next lane is tried", () => {
		try {
			assertUsableProvisionState("dedalus", "dm-1", "error");
			throw new Error("expected a rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(MachineProviderError);
			const kind = (error as MachineProviderError).kind;
			expect(isRoutableProviderError(kind)).toBe(true);
		}
	});
});

describe("isRoutableProviderError", () => {
	it("routes transport-class failures and refuses the two that fail everywhere", () => {
		expect(isRoutableProviderError("transient")).toBe(true);
		expect(isRoutableProviderError("rate_limited")).toBe(true);
		// fatal IS routable: a vendor-side 4xx is per-account (a machine-quota
		// wall, postmortem 2026-05-18 item 5) and says nothing about the next lane.
		expect(isRoutableProviderError("fatal")).toBe(true);
		expect(isRoutableProviderError("missing_credentials")).toBe(false);
		expect(isRoutableProviderError("not_supported")).toBe(false);
	});
});
