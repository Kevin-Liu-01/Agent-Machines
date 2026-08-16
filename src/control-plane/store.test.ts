import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AgentMachinesControlPlane } from "./control-plane.js";
import { InMemoryControlPlaneStore, JsonFileControlPlaneStore } from "./store.js";
import type { WorkerRuntimeDriver } from "./types.js";

const unusedDriver = {} as WorkerRuntimeDriver;

test("JSON adapter survives process-shaped re-instantiation with complete state", async () => {
	const directory = await mkdtemp(join(tmpdir(), "agent-machines-control-plane-"));
	const path = join(directory, "journal.json");
	try {
		const firstStore = new JsonFileControlPlaneStore(path);
		const plane = new AgentMachinesControlPlane(firstStore, unusedDriver, {
			id: () => "operation-1",
			now: () => new Date("2026-08-13T12:00:00.000Z"),
		});
		await plane.apply({
			id: "worker-1",
			spec: { name: "Worker one", runtime: "claude-code", sandbox: "e2b" },
		});

		const secondStore = new JsonFileControlPlaneStore(path);
		assert.equal((await secondStore.getWorker("worker-1"))?.spec.name, "Worker one");
		assert.equal((await secondStore.listOperations("worker-1")).length, 1);
		const raw = await readFile(path, "utf8");
		assert.doesNotThrow(() => JSON.parse(raw));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("expired operation leases can be reclaimed after a serverless interruption", async () => {
	const directory = await mkdtemp(join(tmpdir(), "agent-machines-control-plane-"));
	const path = join(directory, "journal.json");
	try {
		const store = new JsonFileControlPlaneStore(path);
		const plane = new AgentMachinesControlPlane(store, unusedDriver, {
			id: () => "operation-1",
			now: () => new Date("2026-08-13T12:00:00.000Z"),
		});
		await plane.apply({
			id: "worker-1",
			spec: { name: "Worker one", runtime: "codex", sandbox: "sprites" },
		});
		const first = await store.claimNextOperation({
			now: "2026-08-13T12:00:00.000Z",
			leaseMs: 1_000,
			leaseToken: "first-owner",
		});
		assert.equal(first?.attempts, 1);
		assert.equal(
			await store.claimNextOperation({
				now: "2026-08-13T12:00:00.500Z",
				leaseMs: 1_000,
				leaseToken: "early-owner",
			}),
			null,
		);
		const reclaimed = await store.claimNextOperation({
			now: "2026-08-13T12:00:01.001Z",
			leaseMs: 1_000,
			leaseToken: "recovery-owner",
		});
		assert.equal(reclaimed?.id, first?.id);
		assert.equal(reclaimed?.attempts, 2);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("lease renewal delays recovery and fences the previous owner", async () => {
	const store = new InMemoryControlPlaneStore();
	const plane = new AgentMachinesControlPlane(store, unusedDriver, {
		id: () => "operation-fenced",
		now: () => new Date("2026-08-13T12:00:00.000Z"),
	});
	await plane.apply({
		id: "worker-fenced",
		spec: { name: "Fenced", runtime: "codex", sandbox: "sprites" },
	});
	const first = await store.claimNextOperation({
		now: "2026-08-13T12:00:00.000Z",
		leaseMs: 1_000,
		leaseToken: "owner-a",
	});
	assert.ok(first);
	await store.renewOperationLease(
		first.id,
		"owner-a",
		"2026-08-13T12:00:02.000Z",
	);
	assert.equal(
		await store.claimNextOperation({
			now: "2026-08-13T12:00:01.500Z",
			leaseMs: 1_000,
			leaseToken: "owner-b-early",
		}),
		null,
	);
	const recovered = await store.claimNextOperation({
		now: "2026-08-13T12:00:02.001Z",
		leaseMs: 1_000,
		leaseToken: "owner-b",
	});
	assert.ok(recovered);
	await assert.rejects(
		store.finishOperation(first.id, "succeeded", {
			finishedAt: "2026-08-13T12:00:02.100Z",
			leaseToken: "owner-a",
		}),
		/lease was lost/,
	);
	assert.equal(
		(
			await store.finishOperation(first.id, "succeeded", {
				finishedAt: "2026-08-13T12:00:02.100Z",
				leaseToken: "owner-b",
			})
		).status,
		"succeeded",
	);
});
