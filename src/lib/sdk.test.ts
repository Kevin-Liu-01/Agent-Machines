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
		agent: "claude-code",
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
	assert.equal(provision.model, "anthropic/claude-sonnet-4-6");
	const run = JSON.parse(String(calls[2]?.init?.body)) as Record<string, unknown>;
	assert.deepEqual(run, {
		machineId: "machine-1",
		prompt: "ship it",
		timeoutMs: 12_000,
	});
});

/**
 * The published README paired `agent: "codex"` with an Anthropic model and
 * this suite paired it with an Anthropic alias, so neither caught that the
 * route could not run. The wire format is what makes it unrunnable, so assert
 * on the model the provision request actually carries.
 */
test("a codex route provisions with an OpenAI model, not an Anthropic one", async () => {
	const { calls, fetcher } = mockFetch([
		{ body: { ok: true, machineId: "machine-3" } },
	]);
	const client = new AgentMachines({ fetch: fetcher, bootstrap: false });
	const agent = await client.create({ agent: "codex", sandbox: "e2b" });

	assert.equal(agent.route.upstream, "openai");
	const provision = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
	assert.equal(provision.model, "openai/gpt-5.2");
});

test("create rejects a model the agent's upstream cannot serve", async () => {
	const { calls, fetcher } = mockFetch([]);
	const client = new AgentMachines({ fetch: fetcher, bootstrap: false });
	await assert.rejects(
		client.create({
			agent: "codex",
			sandbox: "e2b",
			model: "anthropic/claude-sonnet-4-6",
		}),
		/codex is locked to the native openai API/,
	);
	// Rejected before any HTTP call, so no sandbox time is spent on a route
	// that would 404 on its first turn.
	assert.equal(calls.length, 0);
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
		/Settings -> Developer API/,
	);
});
