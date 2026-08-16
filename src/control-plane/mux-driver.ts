import type { Mux, MuxCreateOptions } from "../mux/router.js";
import type { MachineState, SubstrateKind } from "../mux/types.js";
import type {
	WorkerObservedState,
	WorkerPlacement,
	WorkerResource,
	WorkerRuntimeDriver,
} from "./types.js";

function observed(state: MachineState): WorkerObservedState {
	if (state === "sleeping") return "sleeping";
	if (state === "destroyed" || state === "destroying") return "missing";
	if (state === "ready" || state === "starting") return "running";
	return "unknown";
}

/** Reuses the proven mux providers, harnesses and live-migration protocol. */
export class MuxWorkerRuntimeDriver implements WorkerRuntimeDriver {
	constructor(readonly mux: Mux) {}

	async inspect(placement: WorkerPlacement): Promise<WorkerObservedState> {
		try {
			return observed((await this.mux.describe(placement.workerId)).state);
		} catch (error) {
			if (error instanceof Error && /No remembered machine/.test(error.message)) return "missing";
			// Some substrates cannot inspect without waking. Unknown keeps reads
			// side-effect free; the subsequent connect is the explicit write path.
			return "unknown";
		}
	}

	async provision(worker: WorkerResource): Promise<WorkerPlacement> {
		const remembered = (await this.mux.placements())[worker.id];
		if (remembered) {
			return {
				workerId: worker.id,
				sandboxId: remembered.sandboxId,
				sandbox: remembered.substrate,
				runtime: remembered.agent,
			};
		}
		const options: MuxCreateOptions = {
			name: worker.id,
			agent: worker.spec.runtime,
			sandbox: worker.spec.sandbox,
			model: worker.spec.model,
			env: worker.spec.env,
			install: false,
			resources: worker.spec.resources,
		};
		const machine = await this.mux.create(options);
		return {
			workerId: worker.id,
			sandboxId: machine.sandbox.id,
			sandbox: machine.substrate,
			runtime: machine.agent,
		};
	}

	async bootstrap(
		placement: WorkerPlacement,
		worker: WorkerResource,
	): Promise<WorkerPlacement> {
		if (placement.runtime !== worker.spec.runtime) {
			await this.mux.switchAgent(worker.id, worker.spec.runtime);
		} else {
			const machine = await this.mux.connect(worker.id, worker.spec.runtime);
			await machine.ensureInstalled();
			await machine.probe();
		}
		return { ...placement, runtime: worker.spec.runtime };
	}

	async wake(placement: WorkerPlacement): Promise<void> {
		await this.mux.connect(placement.workerId);
	}

	async sleep(placement: WorkerPlacement): Promise<void> {
		await this.mux.park(placement.workerId);
	}

	async migrate(
		placement: WorkerPlacement,
		to: SubstrateKind,
		worker: WorkerResource,
	): Promise<WorkerPlacement> {
		const remembered = (await this.mux.placements())[worker.id];
		if (remembered?.substrate === to) {
			return {
				workerId: worker.id,
				sandboxId: remembered.sandboxId,
				sandbox: remembered.substrate,
				runtime: remembered.agent,
			};
		}
		const report = await this.mux.migrate(worker.id, {
			to,
			mode: worker.spec.migrationPolicy ?? "live",
			moveState: true,
			source: "destroy",
			env: worker.spec.env,
			resources: worker.spec.resources,
		});
		return {
			workerId: worker.id,
			sandboxId: report.to.sandboxId,
			sandbox: report.to.substrate,
			runtime: report.agent,
		};
	}

	async destroy(placement: WorkerPlacement, worker: WorkerResource): Promise<void> {
		void placement;
		try {
			await this.mux.remove(worker.id);
		} catch (error) {
			if (error instanceof Error && /No remembered machine/.test(error.message)) return;
			throw error;
		}
	}

	async run(
		placement: WorkerPlacement,
		prompt: string,
		options: { runKey: string; model?: string },
	): Promise<unknown> {
		const machine = await this.mux.connect(placement.workerId, placement.runtime);
		return machine.run(prompt, options).result();
	}
}
