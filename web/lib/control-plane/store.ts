import { createHash } from "node:crypto";
import path from "node:path";

import { JsonFileControlPlaneStore } from "agent-machines/control-plane";
import type {
	ClaimOptions,
	ControlPlaneOperation,
	ControlPlaneStore,
	WorkerPlacement,
	WorkerResource,
} from "agent-machines/control-plane";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/client";

type CommitResult = {
	worker: WorkerResource;
	operation: ControlPlaneOperation;
	reused: boolean;
};

type EnqueueResult = {
	operation: ControlPlaneOperation;
	reused: boolean;
};

function failure(operation: string, error: { message: string } | null): Error {
	return new Error(`control-plane store ${operation}: ${error?.message ?? "unknown database error"}`);
}

function asObject<T>(value: unknown, operation: string): T {
	if (!value || typeof value !== "object") {
		throw new Error(`control-plane store ${operation}: database returned no resource`);
	}
	return value as T;
}

/**
 * Tenant-scoped hosted journal. Multi-resource writes and queue claims go
 * through migration 009 RPCs so every PostgREST call is one database
 * transaction, including optimistic versions, idempotency and SKIP LOCKED.
 */
export class SupabaseControlPlaneStore implements ControlPlaneStore {
	constructor(
		readonly tenantId: string,
		private readonly client: SupabaseClient = supabaseAdmin(),
	) {
		if (!tenantId.trim()) throw new Error("control-plane tenant id is required");
	}

	async getWorker(id: string): Promise<WorkerResource | null> {
		const { data, error } = await this.client
			.from("control_plane_workers")
			.select("resource")
			.eq("tenant_id", this.tenantId)
			.eq("id", id)
			.maybeSingle();
		if (error) throw failure("get worker", error);
		return data ? (data.resource as WorkerResource) : null;
	}

	async listWorkers(): Promise<WorkerResource[]> {
		const { data, error } = await this.client
			.from("control_plane_workers")
			.select("resource")
			.eq("tenant_id", this.tenantId)
			.order("created_at", { ascending: true })
			.order("id", { ascending: true });
		if (error) throw failure("list workers", error);
		return (data ?? []).map((row) => row.resource as WorkerResource);
	}

	async getOperation(id: string): Promise<ControlPlaneOperation | null> {
		const { data, error } = await this.client
			.from("control_plane_operations")
			.select("resource")
			.eq("tenant_id", this.tenantId)
			.eq("id", id)
			.maybeSingle();
		if (error) throw failure("get operation", error);
		return data ? (data.resource as ControlPlaneOperation) : null;
	}

	async listOperations(workerId?: string): Promise<ControlPlaneOperation[]> {
		let query = this.client
			.from("control_plane_operations")
			.select("resource")
			.eq("tenant_id", this.tenantId);
		if (workerId) query = query.eq("worker_id", workerId);
		const { data, error } = await query
			.order("created_at", { ascending: true })
			.order("id", { ascending: true });
		if (error) throw failure("list operations", error);
		return (data ?? []).map((row) => row.resource as ControlPlaneOperation);
	}

	async findOperationByIdempotencyKey(
		key: string,
	): Promise<ControlPlaneOperation | null> {
		const { data, error } = await this.client
			.from("control_plane_operations")
			.select("resource")
			.eq("tenant_id", this.tenantId)
			.eq("idempotency_key", key)
			.maybeSingle();
		if (error) throw failure("find idempotency key", error);
		return data ? (data.resource as ControlPlaneOperation) : null;
	}

	async commitIntent(
		worker: WorkerResource,
		operation: ControlPlaneOperation,
		expectedVersion: number | null,
	): Promise<CommitResult> {
		const { data, error } = await this.client.rpc("control_plane_commit_intent", {
			p_tenant_id: this.tenantId,
			p_worker: worker,
			p_operation: operation,
			p_expected_version: expectedVersion,
		});
		if (error) throw failure("commit intent", error);
		return asObject<CommitResult>(data, "commit intent");
	}

	async saveWorker(worker: WorkerResource, expectedVersion: number): Promise<void> {
		const { error } = await this.client.rpc("control_plane_save_worker", {
			p_tenant_id: this.tenantId,
			p_worker: worker,
			p_expected_version: expectedVersion,
		});
		if (error) throw failure("save worker", error);
	}

	async enqueueOperation(operation: ControlPlaneOperation): Promise<EnqueueResult> {
		const { data, error } = await this.client.rpc("control_plane_enqueue_operation", {
			p_tenant_id: this.tenantId,
			p_operation: operation,
		});
		if (error) throw failure("enqueue operation", error);
		return asObject<EnqueueResult>(data, "enqueue operation");
	}

	async claimNextOperation(
		options: ClaimOptions,
	): Promise<ControlPlaneOperation | null> {
		const { data, error } = await this.client.rpc(
			"control_plane_claim_next_operation",
			{
				p_tenant_id: this.tenantId,
				p_worker_id: options.workerId ?? null,
				p_now: options.now,
				p_lease_ms: options.leaseMs,
				p_lease_token: options.leaseToken,
			},
		);
		if (error) throw failure("claim operation", error);
		return data ? asObject<ControlPlaneOperation>(data, "claim operation") : null;
	}

	async renewOperationLease(
		id: string,
		leaseToken: string,
		leaseUntil: string,
	): Promise<ControlPlaneOperation> {
		const { data, error } = await this.client.rpc(
			"control_plane_renew_operation_lease",
			{
				p_tenant_id: this.tenantId,
				p_operation_id: id,
				p_lease_token: leaseToken,
				p_lease_until: leaseUntil,
			},
		);
		if (error) throw failure("renew operation lease", error);
		return asObject<ControlPlaneOperation>(data, "renew operation lease");
	}

	async finishOperation(
		id: string,
		status: "succeeded" | "failed",
		input: { result?: unknown; error?: string; finishedAt: string; leaseToken: string },
	): Promise<ControlPlaneOperation> {
		const { data, error } = await this.client.rpc("control_plane_finish_operation", {
			p_tenant_id: this.tenantId,
			p_operation_id: id,
			p_status: status,
			p_result: input.result ?? null,
			p_error: input.error ?? null,
			p_finished_at: input.finishedAt,
			p_lease_token: input.leaseToken,
		});
		if (error) throw failure("finish operation", error);
		return asObject<ControlPlaneOperation>(data, "finish operation");
	}
}

export function hostedJournalUsesSupabase(): boolean {
	return Boolean(
		process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
			(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
				process.env.SUPABASE_SECRET_KEY?.trim()),
	);
}

/** Durable local equivalent used by the authenticated dev user. */
export function createHostedControlPlaneStore(userId: string): ControlPlaneStore {
	if (hostedJournalUsesSupabase()) return new SupabaseControlPlaneStore(userId);
	const tenantHash = createHash("sha256").update(userId).digest("hex").slice(0, 24);
	return new JsonFileControlPlaneStore(
		path.join(process.cwd(), ".control-plane", `${tenantHash}.json`),
	);
}

export type SyncHostedWorkerPlacementInput = {
	userId: string;
	fromSandboxId: string;
	toSandboxId: string;
	sandbox: WorkerPlacement["sandbox"];
	runtime: WorkerPlacement["runtime"];
	/** Test seam; production always resolves a tenant-scoped hosted store. */
	store?: ControlPlaneStore;
	now?: () => Date;
};

export type SyncHostedWorkerPlacementResult = {
	matched: number;
	updatedWorkerIds: string[];
};

/**
 * Advance every managed Worker that still names a migrated sandbox.
 *
 * Dashboard migrations predate the declarative Worker API, so a machine can
 * be migrated directly while also being the placement of a managed Worker.
 * This bridge keeps those two durable views converged. Optimistic conflicts
 * are re-read and retried; if another writer moved the Worker somewhere else,
 * fail closed rather than overwriting newer intent.
 */
export async function syncHostedWorkerPlacement(
	input: SyncHostedWorkerPlacementInput,
): Promise<SyncHostedWorkerPlacementResult> {
	const store = input.store ?? createHostedControlPlaneStore(input.userId);
	const candidates = (await store.listWorkers()).filter(
		(worker) => worker.status.placement?.sandboxId === input.fromSandboxId,
	);
	const updatedWorkerIds: string[] = [];

	for (const candidate of candidates) {
		let current = candidate;
		let updated = false;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			if (current.status.placement?.sandboxId === input.toSandboxId) {
				updated = true;
				break;
			}
			if (current.status.placement?.sandboxId !== input.fromSandboxId) {
				throw new Error(
					`managed Worker ${current.id} moved concurrently to ${current.status.placement?.sandboxId ?? "no placement"}`,
				);
			}

			const at = (input.now ?? (() => new Date()))().toISOString();
			const generation =
				current.spec.sandbox === input.sandbox
					? current.generation
					: current.generation + 1;
			const next: WorkerResource = {
				...current,
				version: current.version + 1,
				generation,
				spec: { ...current.spec, sandbox: input.sandbox },
				status: {
					...current.status,
					phase: "running",
					observedGeneration: generation,
					placement: {
						workerId: current.id,
						sandboxId: input.toSandboxId,
						sandbox: input.sandbox,
						runtime: input.runtime,
					},
					lastError: null,
					conditions: [
						{ type: "Ready", status: "true", reason: "RuntimeReady", at },
						{
							type: "Reconciled",
							status: "true",
							reason: "MigrationCommitted",
							at,
						},
					],
				},
				updatedAt: at,
			};

			try {
				await store.saveWorker(next, current.version);
				updated = true;
				break;
			} catch (error) {
				if (attempt === 2) throw error;
				const latest = await store.getWorker(current.id);
				if (!latest) {
					throw new Error(`managed Worker ${current.id} disappeared during migration commit`);
				}
				current = latest;
			}
		}
		if (updated) updatedWorkerIds.push(candidate.id);
	}

	return { matched: candidates.length, updatedWorkerIds };
}
