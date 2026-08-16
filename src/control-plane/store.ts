import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
	ClaimOptions,
	ControlPlaneOperation,
	ControlPlaneStore,
	WorkerResource,
} from "./types.js";

type StoreState = {
	workers: Record<string, WorkerResource>;
	operations: Record<string, ControlPlaneOperation>;
};

const EMPTY_STATE: StoreState = { workers: {}, operations: {} };

function clone<T>(value: T): T {
	return structuredClone(value);
}

function orderedOperations(
	state: StoreState,
	workerId?: string,
): ControlPlaneOperation[] {
	return Object.values(state.operations)
		.filter((operation) => !workerId || operation.workerId === workerId)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function findByKey(
	state: StoreState,
	key: string,
): ControlPlaneOperation | null {
	return (
		Object.values(state.operations).find(
			(operation) => operation.idempotencyKey === key,
		) ?? null
	);
}

function assertVersion(
	existing: WorkerResource | undefined,
	expectedVersion: number | null,
): void {
	const actual = existing?.version ?? null;
	if (actual !== expectedVersion) {
		throw new Error(
			`worker version conflict: expected ${String(expectedVersion)}, found ${String(actual)}`,
		);
	}
}

function claimFromState(
	state: StoreState,
	options: ClaimOptions,
): ControlPlaneOperation | null {
	const nowMs = Date.parse(options.now);
	const candidate = orderedOperations(state, options.workerId).find((operation) => {
		if (operation.status === "queued") return true;
		if (operation.status !== "running" || !operation.leaseUntil) return false;
		return Date.parse(operation.leaseUntil) <= nowMs;
	});
	if (!candidate) return null;
	const claimed: ControlPlaneOperation = {
		...candidate,
		status: "running",
		attempts: candidate.attempts + 1,
		startedAt: candidate.startedAt ?? options.now,
		leaseUntil: new Date(nowMs + options.leaseMs).toISOString(),
		leaseToken: options.leaseToken,
	};
	state.operations[claimed.id] = claimed;
	return claimed;
}

abstract class StateControlPlaneStore implements ControlPlaneStore {
	protected abstract readState(): Promise<StoreState>;
	protected abstract mutate<T>(fn: (state: StoreState) => T): Promise<T>;

	async getWorker(id: string): Promise<WorkerResource | null> {
		const worker = (await this.readState()).workers[id];
		return worker ? clone(worker) : null;
	}

	async listWorkers(): Promise<WorkerResource[]> {
		return Object.values((await this.readState()).workers)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
			.map(clone);
	}

	async getOperation(id: string): Promise<ControlPlaneOperation | null> {
		const operation = (await this.readState()).operations[id];
		return operation ? clone(operation) : null;
	}

	async listOperations(workerId?: string): Promise<ControlPlaneOperation[]> {
		return orderedOperations(await this.readState(), workerId).map(clone);
	}

	async findOperationByIdempotencyKey(
		key: string,
	): Promise<ControlPlaneOperation | null> {
		const operation = findByKey(await this.readState(), key);
		return operation ? clone(operation) : null;
	}

	async commitIntent(
		worker: WorkerResource,
		operation: ControlPlaneOperation,
		expectedVersion: number | null,
	): Promise<{ worker: WorkerResource; operation: ControlPlaneOperation; reused: boolean }> {
		return this.mutate((state) => {
			const existingOperation = findByKey(state, operation.idempotencyKey);
			if (existingOperation) {
				const existingWorker = state.workers[existingOperation.workerId];
				if (!existingWorker) {
					throw new Error(
						`operation ${existingOperation.id} references missing worker ${existingOperation.workerId}`,
					);
				}
				return {
					worker: clone(existingWorker),
					operation: clone(existingOperation),
					reused: true,
				};
			}
			assertVersion(state.workers[worker.id], expectedVersion);
			state.workers[worker.id] = clone(worker);
			state.operations[operation.id] = clone(operation);
			return { worker: clone(worker), operation: clone(operation), reused: false };
		});
	}

	async saveWorker(worker: WorkerResource, expectedVersion: number): Promise<void> {
		await this.mutate((state) => {
			assertVersion(state.workers[worker.id], expectedVersion);
			state.workers[worker.id] = clone(worker);
		});
	}

	async enqueueOperation(
		operation: ControlPlaneOperation,
	): Promise<{ operation: ControlPlaneOperation; reused: boolean }> {
		return this.mutate((state) => {
			const existing = findByKey(state, operation.idempotencyKey);
			if (existing) return { operation: clone(existing), reused: true };
			if (!state.workers[operation.workerId]) {
				throw new Error(`worker ${operation.workerId} does not exist`);
			}
			state.operations[operation.id] = clone(operation);
			return { operation: clone(operation), reused: false };
		});
	}

	async claimNextOperation(
		options: ClaimOptions,
	): Promise<ControlPlaneOperation | null> {
		return this.mutate((state) => {
			const claimed = claimFromState(state, options);
			return claimed ? clone(claimed) : null;
		});
	}

	async finishOperation(
		id: string,
		status: "succeeded" | "failed",
		input: { result?: unknown; error?: string; finishedAt: string; leaseToken: string },
	): Promise<ControlPlaneOperation> {
		return this.mutate((state) => {
			const existing = state.operations[id];
			if (!existing) throw new Error(`operation ${id} does not exist`);
			if (existing.status !== "running" || existing.leaseToken !== input.leaseToken) {
				throw new Error(`operation ${id} lease was lost`);
			}
			const operation: ControlPlaneOperation = {
				...existing,
				status,
				leaseUntil: null,
				leaseToken: null,
				result: input.result ?? null,
				error: input.error ?? null,
				finishedAt: input.finishedAt,
			};
			state.operations[id] = operation;
			return clone(operation);
		});
	}

	async renewOperationLease(
		id: string,
		leaseToken: string,
		leaseUntil: string,
	): Promise<ControlPlaneOperation> {
		return this.mutate((state) => {
			const existing = state.operations[id];
			if (!existing) throw new Error(`operation ${id} does not exist`);
			if (existing.status !== "running" || existing.leaseToken !== leaseToken) {
				throw new Error(`operation ${id} lease was lost`);
			}
			const operation = { ...existing, leaseUntil };
			state.operations[id] = operation;
			return clone(operation);
		});
	}
}

/** Fast deterministic adapter for tests and embedded single-process use. */
export class InMemoryControlPlaneStore extends StateControlPlaneStore {
	private state: StoreState = clone(EMPTY_STATE);
	private tail: Promise<void> = Promise.resolve();

	protected async readState(): Promise<StoreState> {
		await this.tail;
		return clone(this.state);
	}

	protected async mutate<T>(fn: (state: StoreState) => T): Promise<T> {
		let resolve!: (value: T) => void;
		let reject!: (reason: unknown) => void;
		const result = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		this.tail = this.tail.then(() => {
			try {
				resolve(fn(this.state));
			} catch (error) {
				reject(error);
			}
		});
		await this.tail;
		return result;
	}
}

/**
 * Atomic local journal. Writes replace one JSON file with rename(2), so a
 * crash leaves the previous complete state or the next complete state, never
 * half JSON. It is intentionally a local/single-process adapter; hosted
 * deployments should implement the same contract with a transactional DB.
 */
export class JsonFileControlPlaneStore extends StateControlPlaneStore {
	private tail: Promise<void> = Promise.resolve();

	constructor(readonly path: string) {
		super();
	}

	private async readFileState(): Promise<StoreState> {
		try {
			const value = JSON.parse(await readFile(this.path, "utf8")) as Partial<StoreState>;
			return {
				workers: value.workers ?? {},
				operations: value.operations ?? {},
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return clone(EMPTY_STATE);
			throw error;
		}
	}

	protected async readState(): Promise<StoreState> {
		await this.tail;
		return clone(await this.readFileState());
	}

	protected async mutate<T>(fn: (state: StoreState) => T): Promise<T> {
		let output!: T;
		const work = this.tail.then(async () => {
			const state = await this.readFileState();
			output = fn(state);
			await mkdir(dirname(this.path), { recursive: true });
			const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
			await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
			await rename(temporary, this.path);
		});
		this.tail = work.catch(() => {});
		await work;
		return output;
	}
}
