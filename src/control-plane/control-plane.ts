import { randomUUID } from "node:crypto";

import type { SubstrateKind } from "../mux/types.js";
import type {
	ApplyWorkerInput,
	ApplyWorkerOptions,
	ApplyWorkerResult,
	AdoptWorkerInput,
	ControlPlaneOperation,
	ControlPlaneStore,
	ReconcileOutcome,
	WorkerCondition,
	WorkerDesiredState,
	WorkerPhase,
	WorkerResource,
	WorkerRuntimeDriver,
	WorkerSpec,
} from "./types.js";

export type AgentMachinesControlPlaneOptions = {
	now?: () => Date;
	id?: () => string;
	leaseMs?: number;
};

function normalizeSpec(spec: WorkerSpec): WorkerSpec {
	const name = spec.name.trim();
	if (!name) throw new Error("worker name is required");
	return {
		...spec,
		name,
		model: spec.model?.trim() || undefined,
		sandboxRoute: spec.sandboxRoute ? [...spec.sandboxRoute] : undefined,
		env: spec.env ? { ...spec.env } : undefined,
		resources: spec.resources ? { ...spec.resources } : undefined,
		schedules: spec.schedules?.map((schedule) => ({ ...schedule })) ?? [],
		migrationPolicy: spec.migrationPolicy ?? "live",
		migrationOptions: spec.migrationOptions
			? { ...spec.migrationOptions }
			: { moveState: true, source: "destroy" },
	};
}

function sameIntent(
	worker: WorkerResource,
	spec: WorkerSpec,
	desiredState: WorkerDesiredState,
): boolean {
	return worker.desiredState === desiredState && JSON.stringify(worker.spec) === JSON.stringify(spec);
}

function initialCondition(at: string): WorkerCondition[] {
	return [
		{
			type: "Reconciled",
			status: "unknown",
			reason: "IntentQueued",
			at,
		},
	];
}

export class AgentMachinesControlPlane {
	private readonly now: () => Date;
	private readonly id: () => string;
	private readonly leaseMs: number;

	constructor(
		readonly store: ControlPlaneStore,
		readonly driver: WorkerRuntimeDriver,
		options: AgentMachinesControlPlaneOptions = {},
	) {
		this.now = options.now ?? (() => new Date());
		this.id = options.id ?? randomUUID;
		this.leaseMs = options.leaseMs ?? 60_000;
	}

	/** Submit desired state and return immediately with a durable operation. */
	async apply(
		input: ApplyWorkerInput,
		options: ApplyWorkerOptions = {},
	): Promise<ApplyWorkerResult> {
		const spec = normalizeSpec(input.spec);
		const desiredState = input.desiredState ?? "running";
		const workerId = input.id ?? this.id();
		const existing = await this.store.getWorker(workerId);
		const generation = existing
			? existing.generation + (sameIntent(existing, spec, desiredState) ? 0 : 1)
			: 1;
		const at = this.now().toISOString();
		const idempotencyKey =
			options.idempotencyKey ?? (options.forceBootstrap
				? `bootstrap:${workerId}:${this.id()}`
				: await this.defaultApplyKey(workerId, generation));

		const duplicate = await this.store.findOperationByIdempotencyKey(idempotencyKey);
		if (duplicate) {
			const worker = await this.store.getWorker(duplicate.workerId);
			if (!worker) throw new Error(`operation ${duplicate.id} references a missing worker`);
			return { worker, operation: duplicate, reused: true };
		}

		const operationId = this.id();
		const worker: WorkerResource = existing
			? {
					...existing,
					version: existing.version + 1,
					generation,
					spec,
					desiredState,
					status: {
						...existing.status,
						phase:
							desiredState === "deleted" ? existing.status.phase : "pending",
						lastOperationId: operationId,
						lastError: null,
						conditions: initialCondition(at),
					},
					updatedAt: at,
				}
			: {
					id: workerId,
					version: 1,
					generation,
					spec,
					desiredState,
					status: {
						phase: "pending",
						observedGeneration: 0,
						placement: null,
						lastOperationId: operationId,
						lastError: null,
						conditions: initialCondition(at),
					},
					createdAt: at,
					updatedAt: at,
				};
		const operation = this.operation(
			workerId,
			idempotencyKey,
			{ type: "reconcile", ...(options.forceBootstrap ? { forceBootstrap: true } : {}) },
			operationId,
			at,
		);
		return this.store.commitIntent(worker, operation, existing?.version ?? null);
	}

	/**
	 * Bring an already-running sandbox under declarative management without
	 * provisioning a replacement. The first reconcile observes the placement
	 * and drives it toward the requested state/spec.
	 */
	async adopt(
		input: AdoptWorkerInput,
		options: ApplyWorkerOptions = {},
	): Promise<ApplyWorkerResult> {
		if (input.placement.workerId !== input.id) {
			throw new Error("adopted placement workerId must match the Worker id");
		}
		const existing = await this.store.getWorker(input.id);
		if (existing?.status.placement) {
			if (
				existing.status.placement.sandboxId !== input.placement.sandboxId ||
				existing.status.placement.sandbox !== input.placement.sandbox
			) {
				throw new Error(`worker ${input.id} already manages another placement`);
			}
			return this.apply(input, options);
		}

		const spec = normalizeSpec(input.spec);
		const desiredState = input.desiredState ?? "running";
		const generation = existing
			? existing.generation + (sameIntent(existing, spec, desiredState) ? 0 : 1)
			: 1;
		const at = this.now().toISOString();
		const idempotencyKey =
			options.idempotencyKey ??
			`adopt:${input.id}:${input.placement.sandbox}:${input.placement.sandboxId}:${generation}`;
		const duplicate = await this.store.findOperationByIdempotencyKey(idempotencyKey);
		if (duplicate) {
			const worker = await this.store.getWorker(input.id);
			if (!worker) throw new Error(`operation ${duplicate.id} references a missing worker`);
			return { worker, operation: duplicate, reused: true };
		}

		const operationId = this.id();
		const worker: WorkerResource = existing
			? {
					...existing,
					version: existing.version + 1,
					generation,
					spec,
					desiredState,
					status: {
						...existing.status,
						phase: "pending",
						placement: input.placement,
						lastOperationId: operationId,
						lastError: null,
						conditions: initialCondition(at),
					},
					updatedAt: at,
				}
			: {
					id: input.id,
					version: 1,
					generation,
					spec,
					desiredState,
					status: {
						phase: "pending",
						observedGeneration: 0,
						placement: input.placement,
						lastOperationId: operationId,
						lastError: null,
						conditions: initialCondition(at),
					},
					createdAt: at,
					updatedAt: at,
				};
		const operation = this.operation(
			input.id,
			idempotencyKey,
			{ type: "reconcile", ...(options.forceBootstrap ? { forceBootstrap: true } : {}) },
			operationId,
			at,
		);
		return this.store.commitIntent(worker, operation, existing?.version ?? null);
	}

	private async defaultApplyKey(workerId: string, generation: number): Promise<string> {
		const base = `worker:${workerId}:generation:${generation}`;
		const operations = await this.store.listOperations(workerId);
		const failures = operations.filter(
			(operation) =>
				(operation.idempotencyKey === base ||
					operation.idempotencyKey.startsWith(`${base}:retry:`)) &&
				operation.status === "failed",
		).length;
		return failures === 0 ? base : `${base}:retry:${failures}`;
	}

	/** Queue an idempotent run. Reconciliation wakes cold workers before exec. */
	async run(
		workerId: string,
		prompt: string,
		runKey: string,
		metadata: { scheduleId?: string; scheduledFor?: string } = {},
	): Promise<ControlPlaneOperation> {
		const worker = await this.store.getWorker(workerId);
		if (!worker) throw new Error(`worker ${workerId} does not exist`);
		if (worker.desiredState === "deleted") throw new Error(`worker ${workerId} is deleted`);
		if (!prompt.trim()) throw new Error("run prompt is required");
		if (!runKey.trim()) throw new Error("run key is required");
		const at = this.now().toISOString();
		const queued = await this.store.enqueueOperation(
			this.operation(workerId, `run:${workerId}:${runKey}`, {
				type: "run",
				prompt,
				runKey,
				...(metadata.scheduleId ? { scheduleId: metadata.scheduleId } : {}),
				...(metadata.scheduledFor ? { scheduledFor: metadata.scheduledFor } : {}),
			}, this.id(), at),
		);
		return queued.operation;
	}

	/**
	 * Cron adapters call this after evaluating their own schedule syntax. The
	 * scheduled timestamp becomes the idempotency key, so duplicate ticks do
	 * not execute the same turn twice.
	 */
	async dispatchSchedule(
		workerId: string,
		scheduleId: string,
		scheduledFor: Date,
	): Promise<ControlPlaneOperation> {
		const worker = await this.store.getWorker(workerId);
		if (!worker) throw new Error(`worker ${workerId} does not exist`);
		if (worker.desiredState === "deleted") throw new Error(`worker ${workerId} is deleted`);
		const schedule = worker.spec.schedules?.find((entry) => entry.id === scheduleId);
		if (!schedule || !schedule.enabled) {
			throw new Error(`schedule ${scheduleId} is not enabled on worker ${workerId}`);
		}
		const instant = scheduledFor.toISOString();
		const runKey = `schedule:${scheduleId}:${instant}`;
		const at = this.now().toISOString();
		const queued = await this.store.enqueueOperation(
			this.operation(workerId, `run:${workerId}:${runKey}`, {
				type: "run",
				prompt: schedule.prompt,
				runKey,
				scheduleId,
				scheduledFor: instant,
			}, this.id(), at),
		);
		return queued.operation;
	}

	/** Claim and execute one journal entry. Safe to call from requests or cron. */
	async reconcileNext(workerId?: string): Promise<ReconcileOutcome | null> {
		const leaseToken = this.id();
		const operation = await this.store.claimNextOperation({
			workerId,
			now: this.now().toISOString(),
			leaseMs: this.leaseMs,
			leaseToken,
		});
		if (!operation) return null;

		let worker = await this.store.getWorker(operation.workerId);
		if (!worker) {
			const failed = await this.store.finishOperation(operation.id, "failed", {
				error: `worker ${operation.workerId} does not exist`,
				finishedAt: this.now().toISOString(),
				leaseToken,
			});
			return { operation: failed, worker: null };
		}

		const heartbeat = setInterval(() => {
			void this.store
				.renewOperationLease(
					operation.id,
					leaseToken,
					new Date(this.now().getTime() + this.leaseMs).toISOString(),
				)
				.catch(() => undefined);
		}, Math.max(1_000, Math.floor(this.leaseMs / 3)));
		heartbeat.unref?.();
		try {
			try {
				if (operation.payload.type === "reconcile") {
					worker = await this.reconcileWorker(
						worker,
						operation.payload.forceBootstrap === true,
					);
					const succeeded = await this.store.finishOperation(operation.id, "succeeded", {
						result: { phase: worker.status.phase, generation: worker.generation },
						finishedAt: this.now().toISOString(),
						leaseToken,
					});
					return { operation: succeeded, worker };
				}

				worker = await this.ensureRunning(worker);
				if (!worker.status.placement) throw new Error("worker has no placement after wake");
				const result = await this.driver.run(
					worker.status.placement,
					operation.payload.prompt,
					{
						runKey: operation.payload.runKey,
						model: worker.spec.model,
						scheduleId: operation.payload.scheduleId,
						scheduledFor: operation.payload.scheduledFor,
					},
				);
				const succeeded = await this.store.finishOperation(operation.id, "succeeded", {
					result,
					finishedAt: this.now().toISOString(),
					leaseToken,
				});
				return { operation: succeeded, worker };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				worker = await this.recordOperationFailure(operation, worker, message);
				const failed = await this.store.finishOperation(operation.id, "failed", {
					error: message,
					finishedAt: this.now().toISOString(),
					leaseToken,
				});
				return { operation: failed, worker };
			}
		} finally {
			clearInterval(heartbeat);
		}
	}

	private async recordOperationFailure(
		operation: ControlPlaneOperation,
		fallback: WorkerResource,
		message: string,
	): Promise<WorkerResource> {
		let current = (await this.store.getWorker(operation.workerId)) ?? fallback;
		// Runs queued before deletion must fail without changing the deletion intent
		// or turning an already-deleted Worker into a repairable error placement.
		if (operation.payload.type === "run" && current.desiredState === "deleted") return current;
		// An older reconcile must never overwrite intent submitted while its
		// provider call was in flight. The operation still records its failure.
		if (
			operation.payload.type === "reconcile" &&
			current.status.lastOperationId !== operation.id
		) {
			return current;
		}
		// A harness/process failure is run history, not a broken placement. Only
		// lifecycle failures that stopped in an intermediate phase poison Worker health.
		if (
			operation.payload.type === "run" &&
			(current.status.phase === "running" || current.status.phase === "sleeping")
		) {
			return current;
		}

		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				return await this.transition(current, "error", {
					lastError: message,
					conditions: [
						{
							type: "Reconciled",
							status: "false",
							reason: "OperationFailed",
							message,
							at: this.now().toISOString(),
						},
					],
				});
			} catch {
				const latest = await this.store.getWorker(operation.workerId);
				if (!latest) return current;
				if (
					operation.payload.type === "reconcile" &&
					latest.status.lastOperationId !== operation.id
				) {
					return latest;
				}
				current = latest;
			}
		}
		return current;
	}

	async drain(limit = 100): Promise<ReconcileOutcome[]> {
		const outcomes: ReconcileOutcome[] = [];
		while (outcomes.length < limit) {
			const outcome = await this.reconcileNext();
			if (!outcome) break;
			outcomes.push(outcome);
		}
		return outcomes;
	}

	private operation(
		workerId: string,
		idempotencyKey: string,
		payload: ControlPlaneOperation["payload"],
		id: string,
		at: string,
	): ControlPlaneOperation {
		return {
			id,
			workerId,
			idempotencyKey,
			payload,
			status: "queued",
			attempts: 0,
			leaseUntil: null,
			leaseToken: null,
			result: null,
			error: null,
			createdAt: at,
			startedAt: null,
			finishedAt: null,
		};
	}

	private async reconcileWorker(
		worker: WorkerResource,
		forceBootstrap = false,
	): Promise<WorkerResource> {
		if (worker.desiredState === "deleted") return this.ensureDeleted(worker);
		if (worker.desiredState === "sleeping") return this.ensureSleeping(worker);
		return this.ensureRunning(worker, forceBootstrap);
	}

	private async ensureRunning(
		worker: WorkerResource,
		forceBootstrap = false,
	): Promise<WorkerResource> {
		if (worker.desiredState === "deleted") throw new Error(`worker ${worker.id} is deleted`);
		let current = worker;
		let placement = current.status.placement;
		if (placement) {
			const observed = await this.driver.inspect(placement);
			if (observed === "missing") {
				current = await this.transition(current, "pending", { placement: null });
				placement = null;
			} else if (observed === "sleeping") {
				current = await this.transition(current, "waking");
				await this.driver.wake(placement);
			}
		}

		if (!placement) {
			current = await this.transition(current, "provisioning");
			placement = await this.driver.provision(current);
			current = await this.transition(current, "bootstrapping", { placement });
			placement = await this.driver.bootstrap(placement, current);
			return this.ready(current, placement);
		}

		if (current.spec.sandbox !== "auto" && placement.sandbox !== current.spec.sandbox) {
			current = await this.transition(current, "migrating");
			placement = await this.driver.migrate(
				placement,
				current.spec.sandbox as SubstrateKind,
				current,
			);
			// Hosted migrations commit their machine record and managed Worker
			// placement as one completion gate before the source is destroyed. A
			// driver is therefore allowed to return after that Worker write already
			// landed. Re-read here so this reconciler does not overwrite the durable
			// target with the optimistic version it held before the provider call.
			const committed = await this.store.getWorker(current.id);
			if (
				committed?.status.lastOperationId === current.status.lastOperationId &&
				committed.status.phase === "running" &&
				committed.status.observedGeneration >= current.generation &&
				committed.status.placement?.sandboxId === placement.sandboxId &&
				committed.status.placement.sandbox === placement.sandbox &&
				committed.status.placement.runtime === placement.runtime
			) {
				return committed;
			}
			current = await this.transition(current, "bootstrapping", { placement });
		}

		// A runtime mismatch is not the only bootstrap-worthy drift. Model,
		// gateway, memory and environment changes advance the Worker generation
		// too, and the runtime driver must get a chance to converge them on the
		// existing sandbox before we mark that generation observed.
		if (
			forceBootstrap ||
			placement.runtime !== current.spec.runtime ||
			current.status.observedGeneration < current.generation
		) {
			current = await this.transition(current, "bootstrapping", { placement });
			placement = await this.driver.bootstrap(placement, current);
		}
		return this.ready(current, placement);
	}

	private async ensureSleeping(worker: WorkerResource): Promise<WorkerResource> {
		const placement = worker.status.placement;
		if (placement) {
			const observed = await this.driver.inspect(placement);
			if (observed !== "sleeping" && observed !== "missing") {
				await this.driver.sleep(placement);
			}
		}
		return this.transition(worker, "sleeping", {
			observedGeneration: worker.generation,
			lastError: null,
			conditions: [
				{
					type: "Reconciled",
					status: "true",
					reason: "DesiredStateReached",
					at: this.now().toISOString(),
				},
			],
		});
	}

	private async ensureDeleted(worker: WorkerResource): Promise<WorkerResource> {
		let current = await this.transition(worker, "deleting");
		if (current.status.placement) {
			await this.driver.destroy(current.status.placement, current);
		}
		current = await this.transition(current, "deleted", {
			placement: null,
			observedGeneration: current.generation,
			lastError: null,
			conditions: [
				{
					type: "Reconciled",
					status: "true",
					reason: "DesiredStateReached",
					at: this.now().toISOString(),
				},
			],
		});
		return current;
	}

	private ready(
		worker: WorkerResource,
		placement: NonNullable<WorkerResource["status"]["placement"]>,
	): Promise<WorkerResource> {
		const at = this.now().toISOString();
		return this.transition(worker, "running", {
			placement,
			observedGeneration: worker.generation,
			lastError: null,
			conditions: [
				{ type: "Ready", status: "true", reason: "RuntimeReady", at },
				{
					type: "Reconciled",
					status: "true",
					reason: "DesiredStateReached",
					at,
				},
			],
		});
	}

	private async transition(
		worker: WorkerResource,
		phase: WorkerPhase,
		status: Partial<WorkerResource["status"]> = {},
	): Promise<WorkerResource> {
		const next: WorkerResource = {
			...worker,
			version: worker.version + 1,
			status: { ...worker.status, ...status, phase },
			updatedAt: this.now().toISOString(),
		};
		await this.store.saveWorker(next, worker.version);
		return next;
	}
}
