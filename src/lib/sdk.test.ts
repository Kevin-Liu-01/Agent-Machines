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

const agentInput = { agent: "codex", sandbox: "e2b" } as const;
const operationPath = "/api/dashboard/control-plane/operations/bootstrap-1";

function journal(status: string, result: unknown = null, id = "bootstrap-1") {
	return {
		ok: true,
		operation: { id, workerId: "worker-1", status, result, error: null as string | null },
		worker: { spec: { runtime: "codex", model: "openai/gpt-current" }, status: { phase: "running" } },
		machineId: "machine-1",
	};
}

function clientFor(fetcher: typeof fetch, extra = {}) {
	return new AgentMachines({
		baseUrl: "https://machines.example",
		apiKey: "am_live_test.secret",
		fetch: fetcher,
		pollIntervalMs: 1,
		timeoutMs: 1_000,
		...extra,
	});
}

test("invariant_create_waits_for_bootstrap_success_before_any_run", async () => {
	const { calls, fetcher } = mockFetch([
		{ body: { ok: true, machineId: "machine-1" } },
		{ status: 202, body: { ...journal("queued"), statusUrl: "https://attacker.example/steal-key" } },
		{ body: journal("queued") },
		{ body: journal("running") },
		{ body: journal("succeeded", { phase: "running" }) },
		{ body: { ok: true, text: "real response" } },
	]);
	const agent = await clientFor(fetcher).create(agentInput);
	assert.equal(calls.length, 5, "create must observe terminal success, not just acceptance");
	assert.equal((await agent.run("do the job")).text, "real response");
	assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.init?.method]), [
		["/api/dashboard/admin/provision-machine", "POST"],
		["/api/dashboard/admin/bootstrap", "POST"],
		[operationPath, "GET"], [operationPath, "GET"], [operationPath, "GET"],
		["/api/agents/run", "POST"],
	]);
	assert.ok(calls.every((call) => new URL(call.url).origin === "https://machines.example"));
	assert.ok(calls.every((call) => call.init?.redirect === "error"), "authenticated fetches must not follow redirects");
});

test("invariant_bootstrap_failure_rejects_without_replaying_provision_or_bootstrap", async () => {
	const failed = journal("failed");
	failed.operation.error = "install failed";
	const { calls, fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ status: 202, body: journal("queued") },
		{ body: failed },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /install failed/);
	assert.equal(calls.filter((call) => call.init?.method === "POST").length, 2);
});

test("invariant_pending_run_returns_the_journal_result_not_an_empty_placeholder", async () => {
	const runJournal = (status: string, result: unknown = null) => journal(status, result, "run-1");
	const { calls, fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ status: 202, body: { ...runJournal("queued"), agent: "codex", model: "openai/gpt-current", text: "not finished", statusUrl: "//attacker.example/run" } },
		{ body: runJournal("running") },
		{ body: runJournal("succeeded", { text: "actual completed work", exitCode: 0, events: [] }) },
	]);
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	const result = await agent.run("do the job");
	assert.equal(result.text, "actual completed work");
	assert.equal(result.machineId, "machine-1");
	assert.equal(result.model, "openai/gpt-current");
	assert.equal(calls.filter((call) => call.init?.method === "POST").length, 2);
	assert.ok(calls.slice(2).every((call) => call.url === "https://machines.example/api/dashboard/control-plane/operations/run-1"));
});

for (const body of [
	{ ok: true },
	{ ...journal("queued"), operation: { status: "queued" } },
	journal("unrecognized"),
	journal("queued", null, "../outside"),
	{ ...journal("queued"), operation: { id: "bootstrap-1", status: ["queued"] } },
]) {
	test(`invariant_malformed_pending_acceptance_never_means_ready_${JSON.stringify("operation" in body ? body.operation : {})}`, async () => {
		const { calls, fetcher } = mockFetch([
			{ body: { machineId: "machine-1" } },
			{ status: 202, body },
		]);
		await assert.rejects(clientFor(fetcher).create(agentInput), /operation|journal/i);
		assert.equal(calls.length, 2);
	});
}

for (const body of [
	{ ok: true },
	journal("succeeded", null, "different-operation"),
	journal("unrecognized"),
]) {
	test(`invariant_journal_reads_must_identify_the_requested_operation_${JSON.stringify("operation" in body ? body.operation : {})}`, async () => {
		const { calls, fetcher } = mockFetch([
			{ body: { machineId: "machine-1" } },
			{ status: 202, body: journal("queued") },
			{ body },
		]);
		await assert.rejects(clientFor(fetcher).create(agentInput), /operation|journal/i);
		assert.equal(calls.length, 3);
	});
}

for (const result of [
	null,
	{},
	{ text: 3, exitCode: 0 },
	{ text: "partial", exitCode: 1 },
	{ text: "partial", exitCode: 0, events: [{ type: "error", message: "model rejected" }] },
	{ text: "partial", exitCode: 0, events: [{ type: "result", isError: true, text: "model rejected" }] },
]) {
	test(`invariant_journal_success_requires_a_valid_successful_runtime_result_${JSON.stringify(result)}`, async () => {
		const { calls, fetcher } = mockFetch([
			{ body: { machineId: "machine-1" } },
			{ status: 202, body: journal("queued", null, "run-1") },
			{ body: journal("succeeded", result, "run-1") },
		]);
		const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
		await assert.rejects(agent.run("do the job"), /result|exit|model rejected/i);
		assert.equal(calls.length, 3);
	});
}

test("invariant_an_explicit_empty_completed_result_is_not_mistaken_for_missing_data", async () => {
	const { fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ body: journal("succeeded", { text: "", exitCode: 0, events: [] }, "run-1") },
	]);
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	assert.equal((await agent.run("do the job")).text, "");
});

test("invariant_synchronous_run_cannot_succeed_without_result_text", async () => {
	const { fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ body: { ok: true } },
	]);
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	await assert.rejects(agent.run("do the job"), /result|text/i);
});

test("invariant_journal_timeout_stops_waiting_without_replaying_paid_posts", async () => {
	const calls: RequestInit[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		calls.push(init!);
		if (String(input).endsWith("provision-machine")) return Response.json({ machineId: "machine-1" });
		return Response.json(journal("queued"), { status: init?.method === "POST" ? 202 : 200 });
	};
	await assert.rejects(clientFor(fetcher, { timeoutMs: 25 }).create(agentInput), /timed out.*may still/i);
	assert.equal(calls.filter((call) => call.method === "POST").length, 2);
	assert.ok(calls.some((call) => call.method === "GET"));
});

for (const stalledPhase of ["request", "response-body"] as const) {
	test(`invariant_deadline_bounds_a_stalled_${stalledPhase}`, { timeout: 1_000 }, async () => {
		let requestSignal: AbortSignal | null | undefined;
		let calls = 0;
		const fetcher: typeof fetch = async (_input, init) => {
			calls += 1;
			requestSignal = init?.signal;
			if (stalledPhase === "request") return await new Promise<Response>(() => {});
			return new Response(new ReadableStream({ start() {} }));
		};
		await assert.rejects(clientFor(fetcher, { timeoutMs: 20 }).create(agentInput), /timed out/i);
		assert.equal(calls, 1);
		assert.equal(requestSignal?.aborted, true);
	});
}

test("invariant_aborted_create_sends_no_paid_request", async () => {
	const { calls, fetcher } = mockFetch([]);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(clientFor(fetcher).create(agentInput, { signal: controller.signal }), { name: "AbortError" });
	assert.equal(calls.length, 0);
});

test("invariant_abort_interrupts_journal_polling_without_remote_replay", async () => {
	const controller = new AbortController();
	const calls: RequestInit[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		calls.push(init!);
		if (String(input).endsWith("provision-machine")) return Response.json({ machineId: "machine-1" });
		if (init?.method === "GET") {
			controller.abort();
			return await new Promise<Response>(() => {});
		}
		return Response.json(journal("queued"), { status: 202 });
	};
	await assert.rejects(clientFor(fetcher).create(agentInput, { signal: controller.signal }), { name: "AbortError" });
	assert.equal(calls.filter((call) => call.method === "POST").length, 2);
});

test("invariant_run_deadline_override_bounds_waiting_and_is_forwarded_once", async () => {
	const { fetcher: provision } = mockFetch([{ body: { machineId: "machine-1" } }]);
	let runBody: Record<string, unknown> | undefined;
	const fetcher: typeof fetch = async (input, init) => {
		if (String(input).endsWith("provision-machine")) return provision(input, init);
		if (init?.method === "POST") runBody = JSON.parse(String(init.body));
		return Response.json(journal("queued", null, "run-1"), { status: init?.method === "POST" ? 202 : 200 });
	};
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	await assert.rejects(agent.run("do the job", { timeoutMs: 20 }), /timed out/i);
	assert.equal(runBody?.timeoutMs, 20);
});

test("invariant_failed_run_journal_rejects_without_resubmitting_the_prompt", async () => {
	const failed = journal("failed", null, "run-1");
	failed.operation.error = "model credentials rejected";
	const { calls, fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ status: 202, body: journal("running", null, "run-1") },
		{ body: failed },
	]);
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	await assert.rejects(agent.run("do the job"), /model credentials rejected/);
	assert.equal(calls.filter((call) => call.url.endsWith("/api/agents/run")).length, 1);
});

test("invariant_failed_journal_read_never_triggers_a_mutation_retry", async () => {
	const { calls, fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ status: 202, body: journal("queued") },
		{ status: 503, body: { message: "journal temporarily unavailable" } },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /journal temporarily unavailable/);
	assert.equal(calls.length, 3);
	assert.equal(calls.at(-1)?.init?.method, "GET");
});

test("invariant_concurrent_machine_move_does_not_return_a_stale_ready_handle", async () => {
	const { fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ status: 202, body: journal("queued") },
		{ body: { ...journal("succeeded"), machineId: "machine-2" } },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /different machine/);
});

test("invariant_concurrent_pause_does_not_return_a_ready_handle", async () => {
	const completed = journal("succeeded", { phase: "sleeping" });
	completed.worker.status.phase = "sleeping";
	const { fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ status: 202, body: journal("queued") },
		{ body: completed },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /sleeping, not running/);
});

test("invariant_run_abort_stops_a_hanging_submission_without_replay", async () => {
	const controller = new AbortController();
	let requests = 0;
	let receivedSignal: AbortSignal | null | undefined;
	const fetcher: typeof fetch = async (input, init) => {
		requests += 1;
		if (String(input).endsWith("provision-machine")) return Response.json({ machineId: "machine-1" });
		receivedSignal = init?.signal;
		controller.abort();
		return await new Promise<Response>(() => {});
	};
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	await assert.rejects(agent.run("do the job", { signal: controller.signal }), { name: "AbortError" });
	assert.equal(receivedSignal?.aborted, true);
	assert.equal(requests, 2);
});

test("invariant_a_late_response_after_timeout_cannot_start_bootstrap", async () => {
	let respond!: (response: Response) => void;
	let requests = 0;
	const fetcher: typeof fetch = async () => {
		requests += 1;
		return await new Promise<Response>((resolve) => { respond = resolve; });
	};
	await assert.rejects(clientFor(fetcher).create(agentInput, { timeoutMs: 20 }), /timed out/i);
	respond(Response.json({ machineId: "machine-1" }));
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(requests, 1);
});

test("invariant_pending_status_cannot_be_disguised_as_synchronous_success", async () => {
	const { fetcher } = mockFetch([
		{ body: { machineId: "machine-1" } },
		{ body: { ok: true, status: "queued", text: "not done" } },
	]);
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	await assert.rejects(agent.run("do the job"), /operation journal/i);
});

function pendingLaunch() {
	return {
		ok: true, workerId: "worker-1", machineId: null,
		phase: "pending", operation: journal("queued").operation,
		statusUrl: operationPath, bootstrapScheduled: true,
		message: "Worker intent accepted. Placement and runtime bootstrap are journaled.",
	};
}

test("invariant_async_launch_waits_for_placement_and_bootstrap_without_duplicate_posts", async () => {
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: pendingLaunch() },
		{ body: { ...journal("running"), machineId: null } },
		{ body: journal("running") },
		{ body: journal("succeeded", { phase: "running" }) },
		{ body: { ok: true, text: "completed task", agent: "codex", model: "gpt-current" } },
	]);
	const agent = await clientFor(fetcher).create(agentInput);
	assert.equal(agent.machineId, "machine-1");
	assert.equal(calls.length, 4, "placement alone must not complete a running bootstrap journal");
	assert.equal((await agent.run("do the job")).text, "completed task");
	assert.deepEqual(calls.map((call) => call.init?.method), ["POST", "GET", "GET", "GET", "POST"]);
	assert.ok(calls.every((call) => !call.url.endsWith("/admin/bootstrap")), "combined launch already bootstrapped");
});

test("invariant_async_provision_false_does_not_schedule_an_additional_bootstrap", async () => {
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: pendingLaunch() },
		{ body: journal("succeeded", { phase: "running" }) },
	]);
	const agent = await clientFor(fetcher, { bootstrap: false }).create(agentInput);
	assert.equal(agent.machineId, "machine-1");
	assert.deepEqual(calls.map((call) => call.init?.method), ["POST", "GET"]);
});

test("invariant_async_launch_failure_is_not_replayed_and_never_bootstraps_an_unknown_machine", async () => {
	const failed = journal("failed");
	failed.operation.error = "provider capacity unavailable";
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: pendingLaunch() },
		{ body: failed },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /provider capacity unavailable/);
	assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
});

test("invariant_async_launch_cannot_resolve_without_a_confirmed_final_placement", async () => {
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: pendingLaunch() },
		{ body: { ...journal("succeeded"), machineId: null } },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /placement|machine ID/i);
	assert.equal(calls.length, 2);
});

test("invariant_async_launch_pins_the_logical_worker_across_journal_reads", async () => {
	const completed = journal("succeeded", { phase: "running" });
	completed.operation.workerId = "different-worker";
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: pendingLaunch() },
		{ body: completed },
	]);
	await assert.rejects(clientFor(fetcher).create(agentInput), /worker|journal/i);
	assert.equal(calls.length, 2);
});

test("invariant_async_launch_uses_the_final_placement_after_failover", async () => {
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: { ...pendingLaunch(), machineId: "failed-placement" } },
		{ body: { ...journal("running"), machineId: "replacement-placement" } },
		{ body: { ...journal("succeeded", { phase: "running" }), machineId: "replacement-placement" } },
	]);
	assert.equal((await clientFor(fetcher).create(agentInput)).machineId, "replacement-placement");
	assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
});

test("invariant_async_launch_aborts_waiting_without_a_second_creation", async () => {
	const controller = new AbortController();
	const calls: RequestInit[] = [];
	const fetcher: typeof fetch = async (_input, init) => {
		calls.push(init!);
		if (init?.method === "GET") controller.abort();
		return Response.json(pendingLaunch(), { status: 202 });
	};
	await assert.rejects(clientFor(fetcher).create(agentInput, { signal: controller.signal }), { name: "AbortError" });
	assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

for (const bootstrap of [true, false]) {
	test(`invariant_concurrent_migration_does_not_resolve_ready_or_bootstrap_again_${bootstrap}`, async () => {
		const completed = journal("succeeded", { phase: "running" });
		completed.worker.status.phase = "migrating";
		const { calls, fetcher } = mockFetch([
			{ status: 202, body: pendingLaunch() },
			{ body: completed },
		]);
		await assert.rejects(clientFor(fetcher, { bootstrap }).create(agentInput), /migrating, not running/);
		assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
	});
}

test("invariant_phase_absent_legacy_provision_can_still_bootstrap_once", async () => {
	const { calls, fetcher } = mockFetch([
		{ status: 202, body: pendingLaunch() },
		{ body: { ok: true, operation: journal("succeeded").operation, machineId: "machine-1" } },
		{ body: { ok: true } },
	]);
	assert.equal((await clientFor(fetcher).create(agentInput)).machineId, "machine-1");
	assert.equal(calls.filter((call) => call.url.endsWith("/admin/bootstrap")).length, 1);
});
