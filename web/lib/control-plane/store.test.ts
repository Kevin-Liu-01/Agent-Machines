import { readFileSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	ControlPlaneOperation,
	ControlPlaneStore,
	WorkerResource,
} from "agent-machines/control-plane";
import { describe, expect, it, vi } from "vitest";

import { SupabaseControlPlaneStore, syncHostedWorkerPlacement } from "./store";

const worker: WorkerResource = {
	id: "worker-1",
	version: 1,
	generation: 1,
	spec: {
		name: "Worker",
		runtime: "codex",
		sandbox: "e2b",
		schedules: [],
		migrationPolicy: "live",
		migrationOptions: { moveState: true, source: "destroy" },
	},
	desiredState: "running",
	status: {
		phase: "pending",
		observedGeneration: 0,
		placement: null,
		lastOperationId: "operation-1",
		lastError: null,
		conditions: [],
	},
	createdAt: "2026-08-14T00:00:00.000Z",
	updatedAt: "2026-08-14T00:00:00.000Z",
};

const operation: ControlPlaneOperation = {
	id: "operation-1",
	workerId: worker.id,
	idempotencyKey: "worker:worker-1:generation:1",
	payload: { type: "reconcile" },
	status: "queued",
	attempts: 0,
	leaseUntil: null,
	leaseToken: null,
	result: null,
	error: null,
	createdAt: worker.createdAt,
	startedAt: null,
	finishedAt: null,
};

describe("SupabaseControlPlaneStore RPC contract", () => {
	it("sends tenant, optimistic version, lease token, and terminal payload to the v2 RPCs", async () => {
		const rpc = vi.fn(async (name: string) => {
			if (name === "control_plane_commit_intent") {
				return { data: { worker, operation, reused: false }, error: null };
			}
			if (name === "control_plane_enqueue_operation") {
				return { data: { operation, reused: false }, error: null };
			}
			if (name === "control_plane_save_worker") return { data: true, error: null };
			return { data: operation, error: null };
		});
		const store = new SupabaseControlPlaneStore(
			"tenant-1",
			{ rpc } as unknown as SupabaseClient,
		);

		await store.commitIntent(worker, operation, null);
		await store.saveWorker({ ...worker, version: 2 }, 1);
		await store.enqueueOperation(operation);
		await store.claimNextOperation({
			workerId: worker.id,
			now: "2026-08-14T00:01:00.000Z",
			leaseMs: 120_000,
			leaseToken: "lease-1",
		});
		await store.renewOperationLease(
			operation.id,
			"lease-1",
			"2026-08-14T00:03:00.000Z",
		);
		await store.finishOperation(operation.id, "succeeded", {
			result: { phase: "running" },
			finishedAt: "2026-08-14T00:02:00.000Z",
			leaseToken: "lease-1",
		});

		expect(rpc.mock.calls).toEqual([
			[
				"control_plane_commit_intent",
				{
					p_tenant_id: "tenant-1",
					p_worker: worker,
					p_operation: operation,
					p_expected_version: null,
				},
			],
			[
				"control_plane_save_worker",
				{
					p_tenant_id: "tenant-1",
					p_worker: { ...worker, version: 2 },
					p_expected_version: 1,
				},
			],
			[
				"control_plane_enqueue_operation",
				{ p_tenant_id: "tenant-1", p_operation: operation },
			],
			[
				"control_plane_claim_next_operation",
				{
					p_tenant_id: "tenant-1",
					p_worker_id: worker.id,
					p_now: "2026-08-14T00:01:00.000Z",
					p_lease_ms: 120_000,
					p_lease_token: "lease-1",
				},
			],
			[
				"control_plane_renew_operation_lease",
				{
					p_tenant_id: "tenant-1",
					p_operation_id: operation.id,
					p_lease_token: "lease-1",
					p_lease_until: "2026-08-14T00:03:00.000Z",
				},
			],
			[
				"control_plane_finish_operation",
				{
					p_tenant_id: "tenant-1",
					p_operation_id: operation.id,
					p_status: "succeeded",
					p_result: { phase: "running" },
					p_error: null,
					p_finished_at: "2026-08-14T00:02:00.000Z",
					p_lease_token: "lease-1",
				},
			],
		]);
	});

	it("keeps the SQL deployment aligned with the fenced store contract", () => {
		const sql = readFileSync(
			path.join(process.cwd(), "supabase/migrations/009_control_plane_v2.sql"),
			"utf8",
		);
		expect(sql).toContain(
			"'startedAt', to_jsonb(coalesce(v_row.resource ->> 'startedAt', p_now::text))",
		);
		expect(sql.match(/grant execute on function control_plane_/g)).toHaveLength(6);
		expect(sql).toContain("to service_role;");
		expect(sql).toContain("and lease_token = p_lease_token");
	});
});

describe("syncHostedWorkerPlacement", () => {
	it("atomically advances desired spec, observed generation, and placement", async () => {
		const saveWorker = vi.fn<ControlPlaneStore["saveWorker"]>(async () => undefined);
		const store = {
			listWorkers: vi.fn(async () => [
				{
					...worker,
					status: {
						...worker.status,
						phase: "running" as const,
						placement: {
							workerId: worker.id,
							sandboxId: "source-1",
							sandbox: "e2b" as const,
							runtime: "codex" as const,
						},
					},
				},
			]),
			getWorker: vi.fn(),
			saveWorker,
		} as unknown as ControlPlaneStore;

		const result = await syncHostedWorkerPlacement({
			userId: "tenant-1",
			fromSandboxId: "source-1",
			toSandboxId: "target-1",
			sandbox: "sprites",
			runtime: "codex",
			store,
			now: () => new Date("2026-08-14T01:00:00.000Z"),
		});

		expect(result).toEqual({ matched: 1, updatedWorkerIds: ["worker-1"] });
		expect(saveWorker).toHaveBeenCalledTimes(1);
		const [saved, expectedVersion] = saveWorker.mock.calls[0]!;
		expect(expectedVersion).toBe(1);
		expect(saved).toMatchObject({
			version: 2,
			generation: 2,
			spec: { sandbox: "sprites" },
			status: {
				phase: "running",
				observedGeneration: 2,
				placement: {
					workerId: "worker-1",
					sandboxId: "target-1",
					sandbox: "sprites",
					runtime: "codex",
				},
				lastError: null,
			},
		});
		expect(saved.status.conditions).toContainEqual(
			expect.objectContaining({
				type: "Reconciled",
				status: "true",
				reason: "MigrationCommitted",
			}),
		);
	});

	it("re-reads and retries an optimistic conflict without overwriting a newer placement", async () => {
		const placed: WorkerResource = {
			...worker,
			status: {
				...worker.status,
				phase: "running",
				placement: {
					workerId: worker.id,
					sandboxId: "source-1",
					sandbox: "e2b",
					runtime: "codex",
				},
			},
		};
		const refreshed = { ...placed, version: 2 };
		const saveWorker = vi
			.fn<ControlPlaneStore["saveWorker"]>()
			.mockRejectedValueOnce(new Error("optimistic conflict"))
			.mockResolvedValueOnce(undefined);
		const store = {
			listWorkers: vi.fn(async () => [placed]),
			getWorker: vi.fn(async () => refreshed),
			saveWorker,
		} as unknown as ControlPlaneStore;

		await syncHostedWorkerPlacement({
			userId: "tenant-1",
			fromSandboxId: "source-1",
			toSandboxId: "target-1",
			sandbox: "sprites",
			runtime: "codex",
			store,
		});

		expect(saveWorker).toHaveBeenCalledTimes(2);
		expect(saveWorker.mock.calls[0]?.[1]).toBe(1);
		expect(saveWorker.mock.calls[1]?.[1]).toBe(2);
		expect(saveWorker.mock.calls[1]?.[0].version).toBe(3);
	});
});
