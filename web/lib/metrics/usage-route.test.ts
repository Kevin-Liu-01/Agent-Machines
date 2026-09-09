import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: vi.fn(), from: vi.fn(), queries: [] as Array<{ table: string; filters: unknown[][] }> }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.userId }));
vi.mock("@/lib/supabase/client", () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
import { GET } from "@/app/api/dashboard/metrics/usage/route";
import { GET as getMachineUsage } from "@/app/api/dashboard/metrics/machines/[id]/usage/route";
import { normalizeMachineUsagePayload } from "@/lib/dashboard/usage-metrics";

describe("usage route evidence boundary", () => {
	beforeEach(() => {
		mocks.userId.mockResolvedValue("tenant-a");
		mocks.queries.length = 0;
		mocks.from.mockImplementation((table: string) => {
			const query = { table, filters: [] as unknown[][] };
			mocks.queries.push(query);
			const result = table === "machine_usage_daily"
				? { data: [{ bucket_date: "2026-09-09", machine_id: "m", awake_seconds: 60, cpu_vcpu_seconds: "120", memory_gib_seconds: "240" }], error: null }
				: table === "machines" ? { data: [{ id: "m", provider_kind: "e2b" }], error: null }
				: { data: [0, 60].map((s) => ({ machine_id: "m", recorded_at: new Date(Date.parse("2026-09-09T00:00:00Z") + s * 1000).toISOString(), phase: "ready", vcpu: 2, spec_memory_mib: 4096 })), count: 2, error: null };
			const chain = {
				select: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
				eq: vi.fn((...args: unknown[]) => { query.filters.push(args); return chain; }),
				gte: vi.fn(() => chain), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
			};
			return chain;
		});
	});
	it("invariant_every_cost_read_is_tenant_scoped_and_legacy_amounts_are_not_loaded", async () => {
		const response = await GET(new NextRequest("https://example.test/api/dashboard/metrics/usage?days=invalid"));
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body).toMatchObject({ days: 7, costStatus: "estimated", totalCostMillicents: 276, totalCostFormatted: "<$0.01" });
		expect(body.resources.cpu.totalVcpuSeconds).toBe(120);
		expect(mocks.queries.map((q) => q.table)).not.toContain("machine_cost_estimates");
		for (const query of mocks.queries) expect(query.filters).toContainEqual(["user_id", "tenant-a"]);
	});
	it("invariant_unauthenticated_usage_never_reads_the_database", async () => {
		mocks.userId.mockResolvedValue(null);
		expect((await GET(new NextRequest("https://example.test/api/dashboard/metrics/usage"))).status).toBe(401);
		expect(mocks.queries).toHaveLength(0);
	});
	it.each(["fleet", "machine"])("invariant_%s_usage_exposes_unknown_storage_without_altering_sampled_cpu_or_cost", async (scope) => {
		const response = scope === "fleet"
			? await GET(new NextRequest("https://example.test/api/dashboard/metrics/usage"))
			: await getMachineUsage(new NextRequest("https://example.test/api/dashboard/metrics/machines/m/usage"), { params: Promise.resolve({ id: "m" }) });
		const body = await response.json();
		expect(body.resources.cpu).toMatchObject({ totalVcpuSeconds: 120, evidence: "sampled" });
		expect(body.resources.storage).toEqual({ totalGibHours: null, evidence: "unknown", buckets: [] });
		const normalized = normalizeMachineUsagePayload(body, 7)!;
		expect(normalized.resources.storage.total).toBeNull();
		for (const query of mocks.queries) expect(query.filters).toContainEqual(["user_id", "tenant-a"]);
		if (scope === "machine") for (const query of mocks.queries) expect(query.filters).toContainEqual(["machine_id", "m"]);
		else expect(body).toMatchObject({ costStatus: "estimated", totalCostMillicents: 276 });
	});
	it.each([{ rows: [] }, { rows: [{ bucket_date: "2026-09-09", awake_seconds: 0, cpu_vcpu_seconds: 0, memory_gib_seconds: 0, storage_gib_hours: 0 }] }])("invariant_first_machine_sample_is_not_a_zero_measurement (%j)", async ({ rows }) => {
		mocks.from.mockImplementation((table: string) => {
			const chain = {
				select: () => chain, order: () => chain, limit: () => chain, eq: () => chain, gte: () => chain,
				then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "machine_usage_daily" ? rows : [], error: null }).then(resolve),
			};
			return chain;
		});
		const response = await getMachineUsage(new NextRequest("https://example.test/api/dashboard/metrics/machines/m/usage"), { params: Promise.resolve({ id: "m" }) });
		const body = await response.json();
		expect(body.resources.cpu).toEqual({ totalVcpuSeconds: null, evidence: "no_intervals", buckets: [] });
		expect(normalizeMachineUsagePayload(body, 7)?.resources.cpu.evidence).toBe("no_intervals");
	});
});
