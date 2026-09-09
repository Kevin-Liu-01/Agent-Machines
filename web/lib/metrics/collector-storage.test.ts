import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn(), writes: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>, failMetrics: false }));
vi.mock("@/lib/supabase/client", () => ({ supabaseAdmin: () => ({ from: db.from }) }));
import { collectAndStore } from "./collector";

describe("metrics persistence boundary", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-09T10:00:30Z"));
		db.writes.length = 0;
		db.failMetrics = false;
		db.from.mockImplementation((table: string) => {
			const result = { data: [], error: null };
			const chain = {
				select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
				maybeSingle: vi.fn(async () => ({ data: { recorded_at: "2026-09-09T10:00:15Z", phase: "ready", vcpu: 2, spec_memory_mib: 4096 }, error: null })),
				insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
					db.writes.push({ table, rows });
					return { error: table === "machine_metrics" && db.failMetrics ? { message: "unavailable" } : null };
				}),
				upsert: vi.fn(async (rows: Array<Record<string, unknown>>) => { db.writes.push({ table, rows }); return { error: null }; }),
				then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
			};
			return chain;
		});
	});
	afterEach(() => vi.useRealTimers());
	const sample = { machineId: "m", machineName: "m", phase: "ready", vcpu: 2, specMemoryMib: 4096, specStorageGib: 20, snapshot: null };
	it("invariant_failed_optional_probe_keeps_phase_evidence_without_manufacturing_a_bill", async () => {
		await collectAndStore("tenant-a", [sample, { ...sample, machineId: "sleeping", phase: "sleeping" }], new Map(), 30);
		expect(db.writes.find((w) => w.table === "machine_metrics")?.rows).toEqual([
			expect.objectContaining({ user_id: "tenant-a", machine_id: "m", phase: "ready", cpu_percent: null }),
			expect.objectContaining({ user_id: "tenant-a", machine_id: "sleeping", phase: "sleeping" }),
		]);
		expect(db.writes.find((w) => w.table === "machine_usage_daily")?.rows[0]).toMatchObject({ awake_seconds: 15, cpu_vcpu_seconds: 30, memory_gib_seconds: 60 });
		expect(db.from.mock.calls.map(([table]) => table)).not.toContain("machine_cost_estimates");
	});
	it("invariant_unpersisted_observation_cannot_advance_a_daily_rollup", async () => {
		db.failMetrics = true;
		await collectAndStore("tenant-a", [sample], new Map(), 30);
		expect(db.writes.some((w) => w.table === "machine_usage_daily")).toBe(false);
	});
});
