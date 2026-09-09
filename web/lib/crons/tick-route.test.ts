import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type CronEntry, type MachineRef, type UserConfig } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ users: vi.fn(), config: vi.fn(), save: vi.fn(), run: vi.fn(), after: vi.fn(), reconcile: vi.fn(), authorized: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUserList: mocks.users } }) }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/user-config/identity", () => ({ DEV_USER_ID: "dev", isDevBypassEnabled: () => false }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: mocks.config, setUserConfigById: mocks.save }));
vi.mock("@/lib/cron/auth", () => ({ authorizedInternalRequest: mocks.authorized }));
vi.mock("@/lib/cron/cadence", () => ({ isCadenceDue: () => false }));
vi.mock("@/lib/learning/ingest", () => ({ ingestRunTracesForUser: vi.fn() }));
vi.mock("@/lib/metrics/collector", () => ({ collectMetricsForUser: vi.fn() }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: () => ({ reconcileNext: mocks.reconcile }) }));
vi.mock("@/lib/crons/service", async (original) => ({ ...await original<typeof import("@/lib/crons/service")>(), runCronOnMachine: mocks.run }));
import { GET } from "@/app/api/internal/cron/tick/route";

const cron: CronEntry = { id: "schedule", name: "Check", schedule: "*/5 * * * *", prompt: "Check files", machineId: "machine", skills: [], enabled: true, createdAt: "2026-09-09T06:00:00Z", lastRunAt: null, lastStatus: null, lastSummary: null };
function config(crons = [cron]): UserConfig { return { ...structuredClone(DEFAULT_USER_CONFIG), crons, machines: [{ id: "machine", providerKind: "e2b" } as MachineRef] }; }
function request() { return new Request("https://agent-machines.test/api/internal/cron/tick"); }
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("CLERK_SECRET_KEY", "fixture-only");
	vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-09T06:05:11Z"));
	mocks.authorized.mockReturnValue(true);
	mocks.users.mockResolvedValue({ data: [{ id: "tenant" }], totalCount: 1 });
	mocks.config.mockResolvedValue(config());
	mocks.run.mockResolvedValue({ ok: true, status: "running", operationId: "operation" });
	mocks.reconcile.mockResolvedValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("scheduled tick dispatch", () => {
	it("uses the same scheduled minute for overlapping ticks instead of wall-clock milliseconds", async () => {
		await GET(request());
		vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-09T06:05:58Z"));
		await GET(request());
		for (const call of mocks.run.mock.calls) expect(call[2].scheduledFor.toISOString()).toBe("2026-09-09T06:05:00.000Z");
		expect(mocks.run).toHaveBeenCalledTimes(2);
	});
	it("does not restore a schedule deleted while dispatch was in flight", async () => {
		mocks.config.mockResolvedValueOnce(config()).mockResolvedValueOnce(config([]));
		await GET(request());
		expect(mocks.save).toHaveBeenCalledWith("tenant", { crons: [] });
	});
	it("does not advance the due baseline when enqueue failed", async () => {
		mocks.run.mockResolvedValue({ ok: false, status: "failed", message: "store unavailable" });
		await GET(request());
		expect(mocks.save.mock.calls[0][1].crons[0]).toMatchObject({ lastRunAt: null, lastStatus: "failed" });
	});
	it("scans every user page rather than silently skipping users after500", async () => {
		mocks.users.mockImplementation(({ offset }) => ({ data: offset === 0 ? Array.from({ length: 500 }, (_, id) => ({ id: `tenant-${id}` })) : [{ id: "tenant-last" }], totalCount: 501 }));
		mocks.config.mockResolvedValue(config([]));
		const result = await (await GET(request())).json();
		expect(result.users).toBe(501);
		expect(mocks.users).toHaveBeenNthCalledWith(2, { limit: 500, offset: 500 });
	});
	it("rejects unauthenticated scheduler calls before enumeration or dispatch", async () => {
		mocks.authorized.mockReturnValue(false);
		expect((await GET(request())).status).toBe(401);
		expect(mocks.users).not.toHaveBeenCalled();
		expect(mocks.run).not.toHaveBeenCalled();
	});
});
