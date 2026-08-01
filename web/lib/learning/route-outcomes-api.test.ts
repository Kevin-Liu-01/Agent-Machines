/**
 * Auth + scoping tests for GET /api/dashboard/route-outcomes.
 *
 * The handler is imported through the `@/` alias rather than tested next to the
 * route file because vitest.config.ts only collects `lib/**` -- see the return
 * notes for the config widening a human may want.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { DEFAULT_USER_CONFIG, type MachineRef, type UserConfig } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	getEffectiveUserId: vi.fn(),
	getUserConfig: vi.fn(),
	supabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/user-config/identity", () => ({
	getEffectiveUserId: mocks.getEffectiveUserId,
}));

vi.mock("@/lib/user-config/clerk", () => ({
	getUserConfig: mocks.getUserConfig,
}));

vi.mock("@/lib/supabase/client", () => ({
	supabaseAdmin: mocks.supabaseAdmin,
}));

import { GET, parseDays } from "@/app/api/dashboard/route-outcomes/route";

const MACHINE: MachineRef = {
	id: "am-1",
	providerKind: "e2b",
	agentKind: "claude-code",
	name: "box",
	spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
	model: "claude-opus-4-8",
	agentProfileId: null,
	gatewayProfileId: null,
	environmentProfileId: null,
	bootstrapPresetId: null,
	createdAt: "2026-07-01T00:00:00.000Z",
	apiUrl: null,
	apiKey: null,
	bootstrapState: {
		phase: "succeeded",
		current: null,
		completed: [],
		startedAt: "2026-07-01T00:00:00.000Z",
		finishedAt: "2026-07-01T00:00:00.000Z",
		lastError: null,
	},
};

const CONFIG: UserConfig = {
	...DEFAULT_USER_CONFIG,
	machines: [MACHINE],
	// A stale active machine: the route must never widen or redirect scope to it.
	activeMachineId: MACHINE.id,
};

type Call = [string, ...unknown[]];

/** Chainable, thenable stand-in for the Supabase query builder. */
function fakeSupabase(result: { data: unknown; error: { message: string } | null }) {
	const calls: Call[] = [];
	const query: Record<string, unknown> = {
		then: (resolve: (value: unknown) => unknown) => resolve(result),
	};
	for (const method of ["select", "eq", "gte", "order", "limit", "in", "not"]) {
		query[method] = (...args: unknown[]) => {
			calls.push([method, ...args]);
			return query;
		};
	}
	mocks.supabaseAdmin.mockReturnValue({
		from: (table: string) => {
			calls.push(["from", table]);
			return query;
		},
	});
	return calls;
}

function req(search = ""): NextRequest {
	return { url: `https://am.test/api/dashboard/route-outcomes${search}` } as NextRequest;
}

describe("GET /api/dashboard/route-outcomes -- auth fails closed", () => {
	beforeEach(() => {
		mocks.getEffectiveUserId.mockReset();
		mocks.getUserConfig.mockReset();
		mocks.supabaseAdmin.mockReset();
	});

	it("401s an unauthenticated caller without touching the trace table", async () => {
		mocks.getEffectiveUserId.mockResolvedValue(null);
		const res = await GET(req());
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
		expect(mocks.supabaseAdmin).not.toHaveBeenCalled();
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
	});

	it("401s on an empty user id, not just null", async () => {
		mocks.getEffectiveUserId.mockResolvedValue("");
		const res = await GET(req("?machineId=am-1"));
		expect(res.status).toBe(401);
		expect(mocks.supabaseAdmin).not.toHaveBeenCalled();
	});

	it("500s instead of leaking rows when identity resolution throws", async () => {
		mocks.getEffectiveUserId.mockRejectedValue(new Error("clerk down"));
		const res = await GET(req());
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ ok: false, error: "clerk down" });
		expect(mocks.supabaseAdmin).not.toHaveBeenCalled();
	});
});

describe("GET /api/dashboard/route-outcomes -- scoping", () => {
	beforeEach(() => {
		mocks.getEffectiveUserId.mockReset();
		mocks.getUserConfig.mockReset();
		mocks.supabaseAdmin.mockReset();
		mocks.getEffectiveUserId.mockResolvedValue("user-1");
		mocks.getUserConfig.mockResolvedValue(CONFIG);
	});

	it("404s a machine the caller does not own, and never reads traces for it", async () => {
		const calls = fakeSupabase({ data: [], error: null });
		const res = await GET(req("?machineId=am-someone-else"));
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "unknown_machine" });
		expect(calls).toEqual([]);
	});

	it("scopes to the requested machine and the caller's user id", async () => {
		const calls = fakeSupabase({
			data: [
				{
					runtime: "claude-code",
					substrate: "e2b",
					source: "cron",
					success: true,
					exit_code: 0,
					cost_millicents: 40,
					latency_ms: 1000,
					extra: null,
				},
			],
			error: null,
		});
		const res = await GET(req("?machineId=am-1&days=7"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			scope: { machineId: string | null; days: number };
			report: { totalRuns: number; routes: Array<{ runtime: string }> };
		};
		expect(body.ok).toBe(true);
		expect(body.scope).toEqual({ machineId: "am-1", days: 7 });
		expect(body.report.totalRuns).toBe(1);
		expect(body.report.routes[0].runtime).toBe("claude-code");
		expect(calls).toContainEqual(["from", "run_traces"]);
		expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
		expect(calls).toContainEqual(["eq", "machine_id", "am-1"]);
	});

	it("reports the whole fleet without consulting the active machine", async () => {
		const calls = fakeSupabase({ data: [], error: null });
		const res = await GET(req());
		expect(res.status).toBe(200);
		expect((await res.json()).scope).toEqual({ machineId: null, days: 30 });
		expect(mocks.getUserConfig).not.toHaveBeenCalled();
		expect(calls.some(([m, col]) => m === "eq" && col === "machine_id")).toBe(false);
	});

	it("500s on a trace read error rather than reporting an empty rollup", async () => {
		fakeSupabase({ data: null, error: { message: "relation missing" } });
		const res = await GET(req());
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ ok: false, error: "relation missing" });
	});

	it("500s when the config read throws", async () => {
		fakeSupabase({ data: [], error: null });
		mocks.getUserConfig.mockRejectedValue(new Error("config unavailable"));
		const res = await GET(req("?machineId=am-1"));
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ ok: false, error: "config unavailable" });
	});
});

describe("parseDays", () => {
	it("defaults, clamps, and refuses junk", () => {
		expect(parseDays(null)).toBe(30);
		expect(parseDays("7")).toBe(7);
		expect(parseDays("0")).toBe(30);
		expect(parseDays("-5")).toBe(30);
		expect(parseDays("banana")).toBe(30);
		expect(parseDays("100000")).toBe(365);
	});
});
