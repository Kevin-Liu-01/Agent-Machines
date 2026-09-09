import assert from "node:assert/strict";
import { test } from "node:test";

import type { Mux } from "../mux/router.js";
import { MuxWorkerRuntimeDriver } from "./mux-driver.js";
import type { WorkerResource } from "./types.js";

function worker(): WorkerResource {
	return {
		id: "repo-coder",
		version: 1,
		generation: 1,
		spec: {
			name: "Repo coder",
			runtime: "claude-code",
			sandbox: "e2b",
			migrationPolicy: "live",
		},
		desiredState: "running",
		status: {
			phase: "pending",
			observedGeneration: 0,
			placement: null,
			lastOperationId: null,
			lastError: null,
			conditions: [],
		},
		createdAt: "2026-08-13T00:00:00.000Z",
		updatedAt: "2026-08-13T00:00:00.000Z",
	};
}

test("mux driver reuses remembered provision and completed migration on retry", async () => {
	const calls: string[] = [];
	let placement: {
		substrate: "e2b" | "sprites";
		sandboxId: string;
		agent: "claude-code";
	} = {
		substrate: "e2b",
		sandboxId: "sandbox-e2b",
		agent: "claude-code",
	};
	const mux = {
		placements: async () => ({ "repo-coder": placement }),
		create: async () => {
			calls.push("create");
			throw new Error("must not create twice");
		},
		describe: async (name: string) => {
			calls.push(`describe:${name}`);
			return { state: "ready" as const, rawPhase: "running" };
		},
		migrate: async (name: string, options: { to: "sprites"; mode: "live" }) => {
			calls.push(`migrate:${name}:${options.to}:${options.mode}`);
			placement = {
				substrate: "sprites",
				sandboxId: "sandbox-sprites",
				agent: "claude-code",
			};
			return {
				to: { substrate: "sprites" as const, sandboxId: "sandbox-sprites" },
				agent: "claude-code" as const,
			};
		},
	} as unknown as Mux;
	const driver = new MuxWorkerRuntimeDriver(mux);

	const provisioned = await driver.provision(worker());
	assert.equal(provisioned.workerId, "repo-coder");
	assert.equal(provisioned.sandboxId, "sandbox-e2b");
	assert.equal(await driver.inspect(provisioned), "running");

	const spec = worker();
	spec.spec.sandbox = "sprites";
	const migrated = await driver.migrate(provisioned, "sprites", spec);
	assert.equal(migrated.sandbox, "sprites");
	const retried = await driver.migrate(provisioned, "sprites", spec);
	assert.equal(retried.sandboxId, "sandbox-sprites");
	assert.deepEqual(calls, [
		"describe:repo-coder",
		"migrate:repo-coder:sprites:live",
	]);
});

test("mux driver honors the requested migration state and source retention policy", async () => {
	const received: unknown[] = [];
	const mux = {
		placements: async () => ({}),
		migrate: async (_name: string, options: unknown) => {
			received.push(options);
			return {
				to: { substrate: "sprites", sandboxId: "target" },
				agent: "claude-code",
			};
		},
	} as unknown as Mux;
	const driver = new MuxWorkerRuntimeDriver(mux);
	const spec = worker();
	spec.spec.migrationPolicy = "copy";
	spec.spec.migrationOptions = { moveState: false, source: "keep" };
	await driver.migrate(
		{ workerId: spec.id, sandboxId: "source", sandbox: "e2b", runtime: "claude-code" },
		"sprites",
		spec,
	);
	assert.deepEqual(received, [{
		to: "sprites", mode: "copy", moveState: false, source: "keep",
		env: undefined, resources: undefined,
	}]);
});
