import assert from "node:assert/strict";
import test from "node:test";

import { AgentMachines } from "./sdk.js";

function mockFetch(
	responses: Array<{ status?: number; body: Record<string, unknown> }>,
) {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetcher: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		const response = responses.shift();
		assert.ok(response, `unexpected request to ${String(input)}`);
		return Response.json(response.body, { status: response.status ?? 200 });
	};
	return { calls, fetcher };
}

test("create then run performs one ordered provision/bootstrap/run flow", async () => {
	const { calls, fetcher } = mockFetch([
		{ body: { ok: true, machineId: "machine-1" } },
		{ body: { ok: true } },
		{ body: { ok: true, text: "done" } },
	]);
	const client = new AgentMachines({
		baseUrl: "https://machines.example/",
		apiKey: "am_live_test.secret",
		fetch: fetcher,
	});

	const agent = await client.create({
		agent: "codex",
		sandbox: "e2b",
		model: "claude-sonnet-4.6",
	});
	const result = await agent.run("ship it", { timeoutMs: 12_000 });

	assert.equal(result.text, "done");
	assert.deepEqual(
		calls.map((call) => new URL(call.url).pathname),
		[
			"/api/dashboard/admin/provision-machine",
			"/api/dashboard/admin/bootstrap",
			"/api/agents/run",
		],
	);
	for (const call of calls) {
		assert.equal(
			(call.init?.headers as Record<string, string>).Authorization,
			"Bearer am_live_test.secret",
		);
	}
	const provision = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
	assert.equal(provision.startBootstrap, false);
	assert.equal(provision.providerKind, "e2b");
	const run = JSON.parse(String(calls[2]?.init?.body)) as Record<string, unknown>;
	assert.deepEqual(run, {
		machineId: "machine-1",
		prompt: "ship it",
		timeoutMs: 12_000,
	});
});

test("bootstrap false provisions without calling bootstrap", async () => {
	const { calls, fetcher } = mockFetch([
		{ body: { ok: true, machineId: "machine-2" } },
	]);
	const client = new AgentMachines({ fetch: fetcher, bootstrap: false });
	await client.create({ agent: "hermes", sandbox: "dedalus" });
	assert.equal(calls.length, 1);
});

test("missing key gets an actionable authentication error", async () => {
	const { fetcher } = mockFetch([
		{ status: 401, body: { error: "unauthorized" } },
	]);
	const client = new AgentMachines({ fetch: fetcher });
	await assert.rejects(
		client.create({ agent: "codex", sandbox: "e2b" }),
		/Settings → Developer API/,
	);
});
