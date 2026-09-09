import assert from "node:assert/strict";
import test from "node:test";
import { createVercelProvider } from "./vercel.js";

type Params = Record<string, unknown>;
function fixture(failure?: unknown) {
	const calls: Array<{ operation: string; params: Params }> = [];
	const sandbox = { name: "durable-worker", vcpus: 2, memory: 4096 };
	const statics = {
		async get(params: Params) { calls.push({ operation: "get", params }); if (failure) throw failure; return sandbox; },
		async create(params: Params) { calls.push({ operation: "create", params }); return sandbox; },
		async getOrCreate(params: Params) { calls.push({ operation: "unsafe-getOrCreate", params }); return sandbox; },
	};
	const provider = createVercelProvider({ token: "fixture", teamId: "team_fixture", projectId: "prj_fixture" }, statics as never);
	return { provider, calls };
}
function apiError(status: number, code: string, message = code) {
	return Object.assign(new Error(message), { response: { status }, json: { error: { code } } });
}
test("a new durable Vercel Worker has no automatic snapshot expiration or pruning", async () => {
	const { provider, calls } = fixture(apiError(404, "not_found"));
	await provider.create({ name: "durable-worker" });
	assert.deepEqual(calls.map((call) => call.operation), ["get", "create"]);
	assert.equal(calls[0]?.params.resume, false);
	assert.equal(calls[1]?.params.persistent, true);
	assert.equal(calls[1]?.params.snapshotExpiration, 0);
	assert.equal(calls[1]?.params.keepLastSnapshots, undefined);
});
test("an existing named Worker is reattached without mutation or recreation", async () => {
	const { provider, calls } = fixture();
	const handle = await provider.create({ name: "durable-worker" });
	assert.equal(handle.id, "durable-worker");
	assert.deepEqual(calls.map((call) => call.operation), ["get"]);
	assert.equal(calls[0]?.params.resume, false);
});
for (const error of [
	apiError(410, "snapshot_not_found"), apiError(404, "snapshot_not_found"),
	apiError(404, "project_not_found"), apiError(403, "forbidden"), apiError(500, "internal_error"),
	new Error("snapshot not found"), new Error("network request failed"),
]) test(`create fails without replacing state on ${error.message}`, async () => {
	const { provider, calls } = fixture(error);
	await assert.rejects(provider.create({ name: "durable-worker" }));
	assert.deepEqual(calls.map((call) => call.operation), ["get"]);
});
test("snapshot errors retain their vendor code and cause instead of reporting destruction", async () => {
	const error = apiError(410, "snapshot_not_found", "Unable to resume sandbox");
	const { provider, calls } = fixture(error);
	await assert.rejects(provider.create({ name: "durable-worker" }), (failure: unknown) =>
		failure instanceof Error && failure.cause === error && failure.message.includes("snapshot_not_found"));
	await assert.rejects(provider.describe!("durable-worker"), (failure: unknown) =>
		failure instanceof Error && failure.cause === error);
	assert.deepEqual(calls.map((call) => call.operation), ["get", "get"]);
});
test("an ambiguous 404 is not permission to create a replacement", async () => {
	const { provider, calls } = fixture(Object.assign(new Error("Not found"), { response: { status: 404 } }));
	await assert.rejects(provider.create({ name: "durable-worker" }));
	assert.deepEqual(calls.map((call) => call.operation), ["get"]);
});
