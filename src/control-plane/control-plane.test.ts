import assert from "node:assert/strict";
import { test } from "node:test";

import { AgentMachinesControlPlane } from "./control-plane.js";
import { InMemoryControlPlaneStore } from "./store.js";
import type {
	WorkerObservedState,
	WorkerPlacement,
	WorkerResource,
	WorkerRuntimeDriver,
} from "./types.js";

class FakeDriver implements WorkerRuntimeDriver {
	readonly calls: string[] = [];
	state: WorkerObservedState = "running";
	runs = 0;
	failMigration = false;
	onMigrate?: (
		placement: WorkerPlacement,
		to: WorkerPlacement["sandbox"],
		worker: WorkerResource,
	) => Promise<WorkerPlacement>;

	async inspect(placement: WorkerPlacement): Promise<WorkerObservedState> {
		this.calls.push(`inspect:${placement.sandbox}`);
		return this.state;
	}

	async provision(worker: WorkerResource): Promise<WorkerPlacement> {
		const sandbox = worker.spec.sandbox === "auto" ? "e2b" : worker.spec.sandbox;
		this.calls.push(`provision:${worker.spec.runtime}:${sandbox}`);
		return {
			workerId: worker.id,
			sandboxId: `sandbox-${worker.id}`,
			sandbox,
			runtime: worker.spec.runtime,
		};
	}

	async bootstrap(
		placement: WorkerPlacement,
		worker: WorkerResource,
	): Promise<WorkerPlacement> {
		this.calls.push(`bootstrap:${worker.spec.runtime}`);
		return { ...placement, runtime: worker.spec.runtime };
	}

	async wake(placement: WorkerPlacement): Promise<void> {
		this.calls.push(`wake:${placement.sandbox}`);
		this.state = "running";
	}

	async sleep(placement: WorkerPlacement): Promise<void> {
		this.calls.push(`sleep:${placement.sandbox}`);
		this.state = "sleeping";
	}

	async migrate(
		placement: WorkerPlacement,
		to: WorkerPlacement["sandbox"],
		worker: WorkerResource,
	): Promise<WorkerPlacement> {
		this.calls.push(`migrate:${placement.sandbox}->${to}:${worker.spec.migrationPolicy}`);
		if (this.failMigration) throw new Error("delta transfer failed");
		if (this.onMigrate) return this.onMigrate(placement, to, worker);
		return { ...placement, sandboxId: `sandbox-${to}`, sandbox: to };
	}

	async destroy(placement: WorkerPlacement): Promise<void> {
		this.calls.push(`destroy:${placement.sandbox}`);
		this.state = "missing";
	}

	async run(
		placement: WorkerPlacement,
		prompt: string,
		options: { runKey: string },
	): Promise<unknown> {
		this.runs += 1;
		this.calls.push(`run:${placement.sandbox}:${options.runKey}:${prompt}`);
		return { text: "done", runKey: options.runKey };
	}
}

function fixture() {
	let id = 0;
	let second = 0;
	const store = new InMemoryControlPlaneStore();
	const driver = new FakeDriver();
	const plane = new AgentMachinesControlPlane(store, driver, {
		id: () => `generated-${++id}`,
		now: () => new Date(Date.UTC(2026, 7, 13, 12, 0, second++)),
	});
	return { plane, store, driver };
}

test("apply is durable and idempotent, then reconcile provisions and bootstraps", async () => {
	const { plane, store, driver } = fixture();
	const input = {
		id: "reviewer",
		spec: {
			name: "Code reviewer",
			runtime: "claude-code" as const,
			sandbox: "e2b" as const,
			migrationPolicy: "live" as const,
		},
	};
	const first = await plane.apply(input, { idempotencyKey: "request-1" });
	const duplicate = await plane.apply(input, { idempotencyKey: "request-1" });

	assert.equal(first.reused, false);
	assert.equal(duplicate.reused, true);
	assert.equal(first.operation.id, duplicate.operation.id);
	assert.equal((await store.listOperations()).length, 1);

	const outcome = await plane.reconcileNext();
	assert.equal(outcome?.operation.status, "succeeded");
	assert.equal(outcome?.worker?.status.phase, "running");
	assert.equal(outcome?.worker?.status.observedGeneration, 1);
	assert.deepEqual(driver.calls, [
		"provision:claude-code:e2b",
		"bootstrap:claude-code",
	]);
});

test("a run cold-starts a sleeping worker before executing exactly once", async () => {
	const { plane, driver } = fixture();
	const running = await plane.apply({
		id: "coder",
		spec: { name: "Coder", runtime: "claude-code", sandbox: "e2b" },
	});
	await plane.reconcileNext();
	await plane.apply(
		{
			id: "coder",
			spec: running.worker.spec,
			desiredState: "sleeping",
		},
		{ idempotencyKey: "sleep-coder" },
	);
	await plane.reconcileNext();
	assert.equal(driver.state, "sleeping");

	const first = await plane.run("coder", "fix the test", "turn-7");
	const duplicate = await plane.run("coder", "fix the test", "turn-7");
	assert.equal(first.id, duplicate.id);
	const outcome = await plane.reconcileNext();

	assert.equal(outcome?.operation.status, "succeeded");
	assert.equal(driver.runs, 1);
	assert.ok(driver.calls.includes("wake:e2b"));
	assert.ok(driver.calls.includes("run:e2b:turn-7:fix the test"));
});

test("changing only the sandbox performs live migration and keeps the runtime", async () => {
	const { plane, driver } = fixture();
	await plane.apply({
		id: "portable",
		spec: { name: "Portable", runtime: "claude-code", sandbox: "e2b" },
	});
	await plane.reconcileNext();
	await plane.apply(
		{
			id: "portable",
			spec: {
				name: "Portable",
				runtime: "claude-code",
				sandbox: "sprites",
				migrationPolicy: "live",
			},
		},
		{ idempotencyKey: "move-portable" },
	);
	const outcome = await plane.reconcileNext();

	assert.equal(outcome?.worker?.status.placement?.sandbox, "sprites");
	assert.equal(outcome?.worker?.status.placement?.runtime, "claude-code");
	assert.ok(driver.calls.includes("migrate:e2b->sprites:live"));
	assert.equal(driver.calls.filter((call) => call.startsWith("provision:")).length, 1);
});

test("a driver-side durable migration commit is reused instead of overwritten", async () => {
	const { plane, store, driver } = fixture();
	await plane.apply({
		id: "portable-hosted",
		spec: { name: "Portable hosted", runtime: "claude-code", sandbox: "e2b" },
	});
	await plane.reconcileNext();
	driver.calls.length = 0;
	driver.onMigrate = async (source, to, migratingWorker) => {
		const current = await store.getWorker(migratingWorker.id);
		assert.ok(current);
		const target = { ...source, sandboxId: `sandbox-${to}`, sandbox: to };
		await store.saveWorker(
			{
				...current,
				version: current.version + 1,
				status: {
					...current.status,
					phase: "running",
					observedGeneration: current.generation,
					placement: target,
					lastError: null,
				},
			},
			current.version,
		);
		return target;
	};
	await plane.apply(
		{
			id: "portable-hosted",
			spec: {
				name: "Portable hosted",
				runtime: "claude-code",
				sandbox: "sprites",
				migrationPolicy: "live",
			},
		},
		{ idempotencyKey: "move-portable-hosted" },
	);

	const outcome = await plane.reconcileNext();

	assert.equal(outcome?.operation.status, "succeeded");
	assert.equal(outcome?.worker?.status.phase, "running");
	assert.equal(outcome?.worker?.status.placement?.sandbox, "sprites");
	assert.deepEqual(driver.calls, ["inspect:e2b", "migrate:e2b->sprites:live"]);
});

test("changing model reboots configuration on the existing sandbox", async () => {
	const { plane, driver } = fixture();
	await plane.apply({
		id: "model-update",
		spec: {
			name: "Model update",
			runtime: "openclaw",
			sandbox: "sprites",
			model: "anthropic/claude-sonnet-4-6",
		},
	});
	await plane.reconcileNext();
	driver.calls.length = 0;
	await plane.apply({
		id: "model-update",
		spec: {
			name: "Model update",
			runtime: "openclaw",
			sandbox: "sprites",
			model: "anthropic/claude-opus-4-8",
		},
	});
	const outcome = await plane.reconcileNext();

	assert.equal(outcome?.worker?.status.observedGeneration, 2);
	assert.deepEqual(driver.calls, ["inspect:sprites", "bootstrap:openclaw"]);
});

test("forceBootstrap repairs an unchanged Worker on its existing sandbox", async () => {
	const { plane, driver } = fixture();
	const initial = await plane.apply({
		id: "repair",
		spec: { name: "Repair", runtime: "openclaw", sandbox: "sprites" },
	});
	await plane.reconcileNext();
	driver.calls.length = 0;
	await plane.apply(
		{ id: "repair", spec: initial.worker.spec },
		{ idempotencyKey: "repair-bootstrap-1", forceBootstrap: true },
	);
	const outcome = await plane.reconcileNext();

	assert.equal(outcome?.operation.status, "succeeded");
	assert.deepEqual(driver.calls, ["inspect:sprites", "bootstrap:openclaw"]);
});

test("forceBootstrap without a request key does not reuse the initial successful reconcile", async () => {
	const { plane, driver } = fixture();
	const initial = await plane.apply({
		id: "repair-default",
		spec: { name: "Repair", runtime: "openclaw", sandbox: "sprites" },
	});
	await plane.reconcileNext();
	driver.calls.length = 0;

	for (let repair = 0; repair < 2; repair += 1) {
		const accepted = await plane.apply(
			{ id: initial.worker.id, spec: initial.worker.spec },
			{ forceBootstrap: true },
		);
		assert.equal(accepted.reused, false);
		assert.equal((await plane.reconcileNext())?.operation.status, "succeeded");
	}
	assert.deepEqual(driver.calls, [
		"inspect:sprites", "bootstrap:openclaw", "inspect:sprites", "bootstrap:openclaw",
	]);
});

test("a migration failure durably leaves the latest Worker in error", async () => {
	const { plane, store, driver } = fixture();
	await plane.apply({
		id: "portable",
		spec: { name: "Portable", runtime: "claude-code", sandbox: "e2b" },
	});
	await plane.reconcileNext();
	driver.failMigration = true;
	await plane.apply(
		{
			id: "portable",
			spec: { name: "Portable", runtime: "claude-code", sandbox: "sprites" },
		},
		{ idempotencyKey: "failed-move" },
	);
	const outcome = await plane.reconcileNext();
	const stored = await store.getWorker("portable");

	assert.equal(outcome?.operation.status, "failed");
	assert.equal(outcome?.worker?.status.phase, "error");
	assert.equal(stored?.status.phase, "error");
	assert.equal(stored?.status.lastError, "delta transfer failed");
	assert.equal(stored?.status.placement?.sandbox, "e2b");
});

test("duplicate scheduler ticks enqueue and execute one run", async () => {
	const { plane, driver } = fixture();
	await plane.apply({
		id: "nightly",
		spec: {
			name: "Nightly",
			runtime: "codex",
			sandbox: "vercel",
			schedules: [
				{ id: "audit", schedule: "0 2 * * *", prompt: "audit the repo", enabled: true },
			],
		},
	});
	await plane.reconcileNext();
	const scheduledFor = new Date("2026-08-14T02:00:00.000Z");
	const first = await plane.dispatchSchedule("nightly", "audit", scheduledFor);
	const duplicate = await plane.dispatchSchedule("nightly", "audit", scheduledFor);

	assert.equal(first.id, duplicate.id);
	await plane.reconcileNext();
	assert.equal(driver.runs, 1);
});

test("queued schedules removed or disabled before execution do not run", async () => {
	for (const enabled of [false, undefined]) {
		const { plane, store, driver } = fixture();
		const spec = { name: "Scheduled", runtime: "claude-code" as const, sandbox: "e2b" as const, schedules: [{ id: "daily", schedule: "0 9 * * *", prompt: "Check updates", enabled: true }] };
		await plane.apply({ id: "scheduled", spec });
		await plane.drain();
		const operation = await plane.dispatchSchedule("scheduled", "daily", new Date("2026-09-09T09:00:00Z"));
		await plane.apply({ id: "scheduled", spec: { ...spec, schedules: enabled === undefined ? [] : [{ ...spec.schedules[0], enabled }] } });
		await plane.drain();
		assert.equal(driver.runs, 0);
		assert.equal((await store.getOperation(operation.id))?.status, "failed");
	}
});

test("a failed default reconcile can be retried without changing intent", async () => {
	const { plane, driver } = fixture();
	await plane.apply({
		id: "retryable",
		spec: { name: "Retryable", runtime: "claude-code", sandbox: "e2b" },
	});
	await plane.reconcileNext();
	driver.failMigration = true;
	await plane.apply({
		id: "retryable",
		spec: { name: "Retryable", runtime: "claude-code", sandbox: "sprites" },
	});
	await plane.reconcileNext();
	driver.failMigration = false;
	const retry = await plane.apply({
		id: "retryable",
		spec: { name: "Retryable", runtime: "claude-code", sandbox: "sprites" },
	});

	assert.match(retry.operation.idempotencyKey, /:retry:1$/);
	assert.equal(retry.reused, false);
	assert.equal((await plane.reconcileNext())?.worker?.status.phase, "running");
});

test("adopt manages an existing placement without provisioning another one", async () => {
	const { plane, driver } = fixture();
	const accepted = await plane.adopt({
		id: "existing",
		spec: { name: "Existing", runtime: "codex", sandbox: "e2b" },
		placement: {
			workerId: "existing",
			sandboxId: "already-there",
			sandbox: "e2b",
			runtime: "codex",
		},
	});
	const outcome = await plane.reconcileNext();

	assert.equal(accepted.worker.status.placement?.sandboxId, "already-there");
	assert.equal(outcome?.worker?.status.phase, "running");
	assert.equal(driver.calls.filter((call) => call.startsWith("provision:")).length, 0);
});

test("deleted Workers reject direct and scheduled runs without allocating compute", async () => {
	const { plane, store, driver } = fixture();
	const initial = await plane.apply({
		id: "retired",
		spec: {
			name: "Retired", runtime: "codex", sandbox: "e2b",
			schedules: [{ id: "daily", schedule: "0 9 * * *", prompt: "check updates", enabled: true }],
		},
	});
	await plane.reconcileNext();
	await plane.apply({ id: "retired", spec: initial.worker.spec, desiredState: "deleted" });
	await plane.reconcileNext();
	driver.calls.length = 0;

	await assert.rejects(plane.run("retired", "run again", "after-delete"), /worker retired is deleted/);
	await assert.rejects(
		plane.dispatchSchedule("retired", "daily", new Date("2026-09-09T09:00:00Z")),
		/worker retired is deleted/,
	);
	assert.equal(await plane.reconcileNext(), null);
	assert.equal((await store.getWorker("retired"))?.status.phase, "deleted");
	assert.deepEqual(driver.calls, []);
});

test("a queued run cannot resurrect a Worker after deletion is requested", async () => {
	const { plane, store, driver } = fixture();
	const initial = await plane.apply({
		id: "retiring",
		spec: { name: "Retiring", runtime: "codex", sandbox: "e2b" },
	});
	await plane.reconcileNext();
	await plane.run("retiring", "queued before deletion", "pending-run");
	await plane.apply({ id: "retiring", spec: initial.worker.spec, desiredState: "deleted" });
	driver.calls.length = 0;

	const cancelledRun = await plane.reconcileNext();
	assert.equal(cancelledRun?.operation.status, "failed");
	assert.match(cancelledRun?.operation.error ?? "", /worker retiring is deleted/);
	assert.deepEqual(driver.calls, []);
	const deleted = await plane.reconcileNext();
	assert.equal(deleted?.operation.status, "succeeded");
	assert.equal((await store.getWorker("retiring"))?.status.phase, "deleted");
	assert.deepEqual(driver.calls, ["destroy:e2b"]);
});
