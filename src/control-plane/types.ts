import type { HarnessKind, SubstrateKind } from "../mux/types.js";

export type WorkerDesiredState = "running" | "sleeping" | "deleted";

export type WorkerPhase =
	| "pending"
	| "provisioning"
	| "bootstrapping"
	| "waking"
	| "running"
	| "sleeping"
	| "migrating"
	| "deleting"
	| "deleted"
	| "error";

export type WorkerSchedule = {
	id: string;
	/** The scheduler owns parsing. The control plane owns idempotent dispatch. */
	schedule: string;
	prompt: string;
	enabled: boolean;
};

/**
 * The declarative unit operators submit. Runtime and sandbox are deliberately
 * orthogonal: changing one must not force a change to the other.
 */
export type WorkerSpec = {
	name: string;
	runtime: HarnessKind;
	sandbox: SubstrateKind | "auto";
	/** Ordered credentialed failover lanes; omitted means the selected lane only. */
	sandboxRoute?: SubstrateKind[];
	model?: string;
	/** Durable memory/loadout selected by dashboard and hosted adapters. */
	memoryBundleId?: string;
	rolePrompt?: string | null;
	gatewayProfileId?: string | null;
	environmentProfileId?: string | null;
	env?: Record<string, string>;
	resources?: { vcpu?: number; memoryMib?: number; diskGib?: number };
	schedules?: WorkerSchedule[];
	migrationPolicy?: "copy" | "live";
	migrationOptions?: {
		moveState: boolean;
		source: "destroy" | "park" | "keep";
	};
};

export type WorkerPlacement = {
	/** Stable control-plane name used by the mux placement journal. */
	workerId: string;
	sandboxId: string;
	sandbox: SubstrateKind;
	runtime: HarnessKind;
};

export type WorkerCondition = {
	type: "Ready" | "Reconciled";
	status: "true" | "false" | "unknown";
	reason: string;
	message?: string;
	at: string;
};

export type WorkerStatus = {
	phase: WorkerPhase;
	observedGeneration: number;
	placement: WorkerPlacement | null;
	lastOperationId: string | null;
	lastError: string | null;
	conditions: WorkerCondition[];
};

export type WorkerResource = {
	id: string;
	/** Store-level optimistic-concurrency token; increments on every write. */
	version: number;
	/** Desired-spec generation; increments only when intent changes. */
	generation: number;
	spec: WorkerSpec;
	desiredState: WorkerDesiredState;
	status: WorkerStatus;
	createdAt: string;
	updatedAt: string;
};

export type ReconcilePayload = { type: "reconcile"; forceBootstrap?: boolean };
export type RunPayload = {
	type: "run";
	prompt: string;
	runKey: string;
	scheduleId?: string;
	scheduledFor?: string;
};
export type ControlPlaneOperationPayload = ReconcilePayload | RunPayload;

export type ControlPlaneOperationStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed";

/** Durable journal entry. A request submits one; any reconciler may claim it. */
export type ControlPlaneOperation = {
	id: string;
	workerId: string;
	idempotencyKey: string;
	payload: ControlPlaneOperationPayload;
	status: ControlPlaneOperationStatus;
	attempts: number;
	leaseUntil: string | null;
	leaseToken: string | null;
	result: unknown;
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
};

export type ApplyWorkerInput = {
	id?: string;
	spec: WorkerSpec;
	desiredState?: WorkerDesiredState;
};

export type AdoptWorkerInput = Omit<ApplyWorkerInput, "id"> & {
	id: string;
	placement: WorkerPlacement;
};

export type ApplyWorkerOptions = {
	idempotencyKey?: string;
	/** Re-run the idempotent runtime bootstrap even when desired spec is unchanged. */
	forceBootstrap?: boolean;
};

export type ApplyWorkerResult = {
	worker: WorkerResource;
	operation: ControlPlaneOperation;
	reused: boolean;
};

export type WorkerObservedState = "running" | "sleeping" | "missing" | "unknown";

/**
 * The only provider/harness seam the control plane consumes.
 *
 * Implementations MUST make provision, bootstrap, migrate and destroy
 * retry-safe for the same worker id. Reconciliation is at-least-once by
 * design: a serverless request may disappear after the remote side effect but
 * before its journal write lands.
 */
export interface WorkerRuntimeDriver {
	inspect(placement: WorkerPlacement): Promise<WorkerObservedState>;
	provision(worker: WorkerResource): Promise<WorkerPlacement>;
	bootstrap(
		placement: WorkerPlacement,
		worker: WorkerResource,
	): Promise<WorkerPlacement>;
	wake(placement: WorkerPlacement): Promise<void>;
	sleep(placement: WorkerPlacement): Promise<void>;
	migrate(
		placement: WorkerPlacement,
		to: SubstrateKind,
		worker: WorkerResource,
	): Promise<WorkerPlacement>;
	destroy(placement: WorkerPlacement, worker: WorkerResource): Promise<void>;
	run(
		placement: WorkerPlacement,
		prompt: string,
		options: {
			runKey: string;
			model?: string;
			scheduleId?: string;
			scheduledFor?: string;
		},
	): Promise<unknown>;
}

export type ClaimOptions = {
	workerId?: string;
	now: string;
	leaseMs: number;
	leaseToken: string;
};

/** Atomic persistence seam: production adapters and tests share this contract. */
export interface ControlPlaneStore {
	getWorker(id: string): Promise<WorkerResource | null>;
	listWorkers(): Promise<WorkerResource[]>;
	getOperation(id: string): Promise<ControlPlaneOperation | null>;
	listOperations(workerId?: string): Promise<ControlPlaneOperation[]>;
	findOperationByIdempotencyKey(
		key: string,
	): Promise<ControlPlaneOperation | null>;
	commitIntent(
		worker: WorkerResource,
		operation: ControlPlaneOperation,
		expectedVersion: number | null,
	): Promise<{ worker: WorkerResource; operation: ControlPlaneOperation; reused: boolean }>;
	saveWorker(worker: WorkerResource, expectedVersion: number): Promise<void>;
	enqueueOperation(
		operation: ControlPlaneOperation,
	): Promise<{ operation: ControlPlaneOperation; reused: boolean }>;
	claimNextOperation(options: ClaimOptions): Promise<ControlPlaneOperation | null>;
	renewOperationLease(
		id: string,
		leaseToken: string,
		leaseUntil: string,
	): Promise<ControlPlaneOperation>;
	finishOperation(
		id: string,
		status: "succeeded" | "failed",
		input: { result?: unknown; error?: string; finishedAt: string; leaseToken: string },
	): Promise<ControlPlaneOperation>;
}

export type ReconcileOutcome = {
	operation: ControlPlaneOperation;
	worker: WorkerResource | null;
};
