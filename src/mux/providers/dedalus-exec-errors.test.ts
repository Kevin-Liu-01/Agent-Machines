/**
 * What the mux reports when Dedalus REFUSES an execution.
 *
 * Every document in this file is a verbatim capture from live Dedalus on
 * 2026-08-05 (9 create-then-exec sequences against fresh machines; 4 were
 * refused, 44%). The refusals arrive as a terminal execution document with
 * `error_code`/`error_message` and NO `exit_code`, while
 * GET /v1/machines/<id> reports `phase: "running"` for the same machine at the
 * same moment -- which is why the failure looked like nothing at all: the
 * provider used to collapse the document to `exitCode: 1` and throw the
 * vendor's own words away. Two red cells in the live matrix could not be
 * explained from our own output, and `ensureInstalled` read a refusal of its
 * `command -v` probe as "the harness is not installed".
 *
 * The discriminator this file pins is `exit_code`, NOT `status`: a command
 * that really ran always carries one (`exit 7` -> exit_code 7,
 * `command -v <missing>` -> exit_code 1, both `status: "failed"`, neither with
 * an error_code), so a legitimate nonzero exit must still return an
 * ExecResult. A test that only checked the refusals would pass a provider
 * that threw on every failing command.
 *
 * Run: npx tsx --test src/mux/providers/dedalus-exec-errors.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createDedalusProvider } from "./dedalus.js";
import { MuxError, type ExecResult } from "../types.js";

const MACHINE_ID = "dm-019fd32e-40e9-72f4-9cb4-007ed53735ba";
const EXECUTION_ID = "wexec-0cd90dc308cbe6785973f81a39c74241373e3172";

/** GET /v1/machines/<id>, verbatim, WHILE the execution above was refused. */
const RUNNING_MACHINE = {
	machine_id: MACHINE_ID,
	vcpu: 1,
	memory_mib: 2048,
	storage_gib: 10,
	autosleep_seconds: 300,
	desired_state: "running",
	status: {
		phase: "running",
		reason: "DesiredStateReached",
		retryable: false,
		revision: "1",
		last_transition_at: "2026-08-05T18:27:33Z",
		last_progress_at: "2026-08-05T18:27:33Z",
	},
};

type Attempt = { result?: ExecResult; error?: unknown; paths: string[] };

/**
 * Run one exec against a stubbed Dedalus whose execution poll answers with
 * `terminal`. Records every path requested, because "did the provider fetch
 * the output document of an execution that produced no output" is part of the
 * contract, and the request log is the only place that shows it.
 */
async function execWith(
	terminal: Record<string, unknown>,
	output: Record<string, unknown> = { execution_id: EXECUTION_ID },
	command = "echo hello-mux",
): Promise<Attempt> {
	const original = globalThis.fetch;
	const paths: string[] = [];
	globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = (init?.method ?? "GET").toUpperCase();
		paths.push(`${method} ${url.pathname}`);
		const json = (body: unknown) =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		if (url.pathname === `/v1/machines/${MACHINE_ID}`) return json(RUNNING_MACHINE);
		if (url.pathname === `/v1/machines/${MACHINE_ID}/executions` && method === "POST") {
			return json({
				execution_id: EXECUTION_ID,
				machine_id: MACHINE_ID,
				status: "queued",
				command: ["/bin/bash", "-lc", "..."],
				created_at: "2026-08-05T18:27:34.091276598Z",
			});
		}
		if (url.pathname === `/v1/machines/${MACHINE_ID}/executions/${EXECUTION_ID}`) {
			return json(terminal);
		}
		if (url.pathname === `/v1/machines/${MACHINE_ID}/executions/${EXECUTION_ID}/output`) {
			return json(output);
		}
		return new Response(null, { status: 500 });
	}) as typeof globalThis.fetch;
	try {
		const provider = createDedalusProvider({ apiKey: "test-key" });
		const handle = await provider.connect(MACHINE_ID);
		try {
			return { result: await handle.exec(command), paths };
		} catch (error) {
			return { error, paths };
		}
	} finally {
		globalThis.fetch = original;
	}
}

/** The four refusals captured live, verbatim. */
const REFUSALS = [
	{
		label: "machine_not_found",
		doc: {
			execution_id: EXECUTION_ID,
			machine_id: MACHINE_ID,
			status: "failed",
			command: ["/bin/bash", "-lc", "echo hello-mux"],
			created_at: "2026-08-05T18:27:34Z",
			completed_at: "2026-08-05T18:27:34Z",
			error_code: "machine_not_found",
			error_message: "machine no longer exists",
		},
		expect: /machine_not_found: machine no longer exists/,
	},
	{
		label: "machine_not_routable",
		doc: {
			execution_id: EXECUTION_ID,
			machine_id: MACHINE_ID,
			status: "failed",
			created_at: "2026-08-05T18:27:45Z",
			completed_at: "2026-08-05T18:27:46Z",
			error_code: "machine_not_routable",
			error_message: "machine is not routable for execution",
		},
		expect: /machine_not_routable: machine is not routable for execution/,
	},
	{
		label: "execution_timed_out (status expired, not failed)",
		doc: {
			execution_id: EXECUTION_ID,
			machine_id: MACHINE_ID,
			status: "expired",
			created_at: "2026-08-05T18:29:14Z",
			started_at: "2026-08-05T18:29:14Z",
			completed_at: "2026-08-05T18:29:16Z",
			error_code: "execution_timed_out",
			error_message: "execution exceeded timeout_ms",
		},
		expect: /execution_timed_out: execution exceeded timeout_ms/,
	},
	{
		label: "host_agent_execute_failed",
		doc: {
			execution_id: EXECUTION_ID,
			machine_id: MACHINE_ID,
			status: "failed",
			created_at: "2026-08-05T18:29:17Z",
			started_at: "2026-08-05T18:29:17Z",
			completed_at: "2026-08-05T18:29:17Z",
			error_code: "host_agent_execute_failed",
			error_message:
				"host-agent execute command dm-019fd32f-bf67-7280-88f8-c4e741604838 on 10.1.195.21: read stream: failed_precondition: exec_init_rejected: guest exec init rejected at",
		},
		expect: /host_agent_execute_failed: host-agent execute command .* exec_init_rejected/,
	},
] as const;

for (const refusal of REFUSALS) {
	test(`a refused execution reports the vendor's ${refusal.label}, not a bare exit code`, async () => {
		const attempt = await execWith(refusal.doc);
		assert.equal(
			attempt.result,
			undefined,
			"a refused execution has no exit code, so it must not resolve as one",
		);
		assert.ok(attempt.error instanceof MuxError, `threw ${String(attempt.error)}`);
		// transient: a substrate-side fault says nothing about the caller's
		// command, and transient keeps the error routable so another lane runs.
		assert.equal(attempt.error.kind, "transient");
		assert.equal(attempt.error.substrate, "dedalus");
		assert.match(attempt.error.message, refusal.expect);
		// The machine id belongs in the text: the whole point is that an
		// operator can tell WHICH machine the substrate refused.
		assert.match(attempt.error.message, new RegExp(MACHINE_ID));
		// The command that was refused, so the failure is locatable in a run.
		assert.match(attempt.error.message, /command: echo hello-mux/);
	});
}

test("a refused execution does not fetch the output document it has none of", async () => {
	// Measured 2026-08-05: the output document of a refused execution is
	// exactly {"execution_id":"wexec-..."} -- a round trip that buys nothing.
	const attempt = await execWith(REFUSALS[0].doc);
	assert.ok(attempt.error instanceof MuxError);
	assert.deepEqual(attempt.paths, [
		`GET /v1/machines/${MACHINE_ID}`,
		`POST /v1/machines/${MACHINE_ID}/executions`,
		`GET /v1/machines/${MACHINE_ID}/executions/${EXECUTION_ID}`,
	]);
});

test("a REAL nonzero exit still returns its exit code -- status:failed is not a refusal", async () => {
	// `/bin/bash -lc 'exit 7'`, verbatim 2026-08-05: status "failed", a real
	// exit_code, no error_code. Throwing here would break every caller that
	// reads an exit status, starting with the `command -v` install probe.
	const attempt = await execWith({
		execution_id: EXECUTION_ID,
		machine_id: MACHINE_ID,
		status: "failed",
		command: ["/bin/bash", "-lc", "exit 7"],
		created_at: "2026-08-05T18:29:12Z",
		started_at: "2026-08-05T18:29:12Z",
		completed_at: "2026-08-05T18:29:12Z",
		exit_code: 7,
	});
	assert.equal(attempt.error, undefined, `threw instead of reporting exit 7: ${String(attempt.error)}`);
	assert.equal(attempt.result?.exitCode, 7);
});

test("the install probe's own miss (command -v, exit 1) stays a miss", async () => {
	// `command -v definitely-not-installed`, verbatim 2026-08-05. This is the
	// document ensureInstalled MUST keep reading as "the harness is absent".
	const attempt = await execWith(
		{
			execution_id: EXECUTION_ID,
			machine_id: MACHINE_ID,
			status: "failed",
			command: ["/bin/bash", "-lc", "command -v definitely-not-installed"],
			created_at: "2026-08-05T18:29:13Z",
			started_at: "2026-08-05T18:29:13Z",
			completed_at: "2026-08-05T18:29:13Z",
			exit_code: 1,
		},
		{ execution_id: EXECUTION_ID },
		"command -v claude",
	);
	assert.equal(attempt.error, undefined, `threw instead of reporting exit 1: ${String(attempt.error)}`);
	assert.equal(attempt.result?.exitCode, 1);
});

test("a succeeding execution is unchanged: exit 0 with its output", async () => {
	const attempt = await execWith(
		{
			execution_id: EXECUTION_ID,
			machine_id: MACHINE_ID,
			status: "succeeded",
			created_at: "2026-08-05T18:27:38Z",
			started_at: "2026-08-05T18:27:38Z",
			completed_at: "2026-08-05T18:27:38Z",
			exit_code: 0,
			stdout_bytes: 10,
		},
		{ execution_id: EXECUTION_ID, stdout: "hello-mux\n", stdout_bytes: 10 },
	);
	assert.equal(attempt.error, undefined);
	assert.equal(attempt.result?.exitCode, 0);
	assert.equal(attempt.result?.stdout, "hello-mux");
});

test("a terminal document with neither exit code nor error_code reports the ambiguity", async () => {
	// Never captured -- every terminal document seen 2026-08-05 carried one or
	// the other. Pinned because the alternative is the defect: inventing exit 1
	// for an execution whose outcome the vendor did not state.
	const attempt = await execWith({
		execution_id: EXECUTION_ID,
		machine_id: MACHINE_ID,
		status: "cancelled",
		created_at: "2026-08-05T18:27:34Z",
		completed_at: "2026-08-05T18:27:34Z",
	});
	assert.equal(attempt.result, undefined, "an unstated outcome must not resolve as exit 1");
	assert.ok(attempt.error instanceof MuxError);
	assert.match(
		attempt.error.message,
		/ended 'cancelled' with neither an exit code nor an error_code/,
	);
});
