/**
 * Codex harness adapter tests. Run with: tsx --test
 *
 * parseLine keeps small cross-line turn state (accumulated agent text,
 * thread id), so tests that assert on result/session data start their
 * stream with a thread.started line to reset it.
 *
 * Stream-shape tests use VERBATIM lines from live captures of codex-cli
 * 0.146.0-alpha.3.1 (darwin-arm64, 2026-08-03) -- see CAPTURE_* below.
 * Paraphrased wire lines are banned for the reason in the header of
 * hermes.test.ts: a test written from retyped lines is how the hermes
 * classifier shipped broken twice.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { MuxAgentEvent } from "../events.js";
import { MuxError, type UpstreamKeys } from "../types.js";
import { codexHarness } from "./codex.js";

const KEYS: UpstreamKeys = { openai: "sk-test-openai" };

function parse(value: unknown): MuxAgentEvent[] {
	return codexHarness.parseLine(JSON.stringify(value));
}

/** A fresh per-turn parser, as the router builds one for every run. */
function turnParser(): (line: string) => MuxAgentEvent[] {
	const make = codexHarness.newTurnParser;
	assert.ok(make, "the adapter carries per-turn state, so newTurnParser is required");
	return make.call(codexHarness);
}

/** The router's own accumulation rule: RunResult.text is the text deltas. */
function accumulate(events: readonly MuxAgentEvent[]): string {
	return events
		.filter((event) => event.type === "text")
		.map((event) => event.delta)
		.join("");
}

// ---------------------------------------------------------------------------
// Live captures -- codex-cli 0.146.0-alpha.3.1, darwin-arm64, 2026-08-03.
//
// Every line below is VERBATIM stdout of
//   codex exec --json --skip-git-repo-check --sandbox read-only \
//     -c approval_policy=never -c model_provider=openai -c model=gpt-5.1 "<prompt>"
// (capture-04 substitutes -c model=gpt-nonexistent-model-xyz). The literals
// were machine-generated from the captured JSONL files, not retyped.
// ---------------------------------------------------------------------------

/** Prompt "Reply with exactly: ok". Process exited 0 and answered correctly. */
const CAPTURE_GPT51_METADATA_NOTICE = [
	"{\"type\":\"thread.started\",\"thread_id\":\"019fc99e-a719-76a0-8e0d-95ded055521c\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"error\",\"message\":\"Model metadata for `gpt-5.1` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.\"}}",
	"{\"type\":\"turn.started\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"agent_message\",\"text\":\"ok\"}}",
	"{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":13504,\"cached_input_tokens\":0,\"cache_write_input_tokens\":0,\"output_tokens\":11,\"reasoning_output_tokens\":0}}",
];

/** Same command against a 401 upstream. Process exited 1. */
const CAPTURE_RECONNECT_401_TURN_FAILED = [
	"{\"type\":\"thread.started\",\"thread_id\":\"019fc99d-94f0-7271-8d20-e7510036c222\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"error\",\"message\":\"Model metadata for `gpt-5.1` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.\"}}",
	"{\"type\":\"turn.started\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses, cf-ray: a2588d62ffac2953-SJC)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 3/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses, cf-ray: a2588d67c825148e-SJC)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 4/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses, cf-ray: a2588d6f7c3841ce-SJC)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 5/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses, cf-ray: a2588d7b1def15cc-SJC)\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"error\",\"message\":\"Falling back from WebSockets to HTTPS transport. unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses, cf-ray: a2588d929fd2086b-SJC\"}}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 1/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588d940c8ef56e-SJC, request id: req_2baf783e4ba44e64b94040361378f92a)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588d967dfceb20-SJC, request id: req_b685260cd5f346dc9cfa14b008ccbb77)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 3/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588d99f837fa6a-SJC, request id: req_b41fb488011d49e99be8dc24b897d5c1)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 4/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588d9f9bfeeb2c-SJC, request id: req_94aa1a9737974bdc8f30b3c71f175034)\"}",
	"{\"type\":\"error\",\"message\":\"Reconnecting... 5/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588dab0a32da5a-SJC, request id: req_da1d221caedc453bb9ef53c05c98b82d)\"}",
	"{\"type\":\"error\",\"message\":\"unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588dc17e90d045-SJC, request id: req_6bcea996a2b8446587872680a56ce6a7\"}",
	"{\"type\":\"turn.failed\",\"error\":{\"message\":\"unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588dc17e90d045-SJC, request id: req_6bcea996a2b8446587872680a56ce6a7\"}}",
];

/**
 * Prompt asked for a preamble message, an `echo hello`, then a final
 * message. Process exited 0 with TWO complete agent_message items.
 */
const CAPTURE_TWO_AGENT_MESSAGES = [
	"{\"type\":\"thread.started\",\"thread_id\":\"019fc99f-0f82-7722-b64e-59c8d31de332\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"error\",\"message\":\"Model metadata for `gpt-5.1` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.\"}}",
	"{\"type\":\"turn.started\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"agent_message\",\"text\":\"Starting now.\"}}",
	"{\"type\":\"item.started\",\"item\":{\"id\":\"item_2\",\"type\":\"command_execution\",\"command\":\"/bin/zsh -lc 'cd /private/tmp/claude-501/-Users-kevinliu-repos-Agent-Machines/02a88534-9ae4-4a65-995c-c151e59eb709/scratchpad/workdir && echo hello'\",\"aggregated_output\":\"\",\"exit_code\":null,\"status\":\"in_progress\"}}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_2\",\"type\":\"command_execution\",\"command\":\"/bin/zsh -lc 'cd /private/tmp/claude-501/-Users-kevinliu-repos-Agent-Machines/02a88534-9ae4-4a65-995c-c151e59eb709/scratchpad/workdir && echo hello'\",\"aggregated_output\":\"hello\\n\",\"exit_code\":0,\"status\":\"completed\"}}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_3\",\"type\":\"agent_message\",\"text\":\"hello\"}}",
	"{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":27198,\"cached_input_tokens\":13440,\"cache_write_input_tokens\":0,\"output_tokens\":101,\"reasoning_output_tokens\":0}}",
];

/** -c model=gpt-nonexistent-model-xyz: the fatal 400 path. Process exited 1. */
const CAPTURE_BOGUS_MODEL_TURN_FAILED = [
	"{\"type\":\"thread.started\",\"thread_id\":\"019fc9a1-2772-7e61-a183-1aac2c532a4e\"}",
	"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"error\",\"message\":\"Model metadata for `gpt-nonexistent-model-xyz` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.\"}}",
	"{\"type\":\"turn.started\"}",
	"{\"type\":\"error\",\"message\":\"{\\n  \\\"type\\\": \\\"error\\\",\\n  \\\"error\\\": {\\n    \\\"type\\\": \\\"invalid_request_error\\\",\\n    \\\"code\\\": \\\"model_not_found\\\",\\n    \\\"message\\\": \\\"The requested model 'gpt-nonexistent-model-xyz' does not exist.\\\",\\n    \\\"param\\\": \\\"model\\\"\\n  },\\n  \\\"status\\\": 400\\n}\"}",
	"{\"type\":\"turn.failed\",\"error\":{\"message\":\"{\\n  \\\"type\\\": \\\"error\\\",\\n  \\\"error\\\": {\\n    \\\"type\\\": \\\"invalid_request_error\\\",\\n    \\\"code\\\": \\\"model_not_found\\\",\\n    \\\"message\\\": \\\"The requested model 'gpt-nonexistent-model-xyz' does not exist.\\\",\\n    \\\"param\\\": \\\"model\\\"\\n  },\\n  \\\"status\\\": 400\\n}\"}}",
];

function decodePrompt(command: string): { prompt: string; rest: string } {
	// The pipeline is wrapped in the shared node-runtime brace group, so
	// match the pipe anywhere rather than anchoring at the start.
	const match = command.match(/echo ([A-Za-z0-9+/=]+) \| base64 -d \| (.+?);? \}?$/);
	assert.ok(match, `command does not embed a base64 prompt pipe: ${command}`);
	return {
		prompt: Buffer.from(match[1], "base64").toString("utf8"),
		rest: match[2],
	};
}

test("adapter identity and static commands", () => {
	assert.equal(codexHarness.kind, "codex");
	assert.equal(codexHarness.requiredUpstream, "openai");
	assert.match(codexHarness.isInstalledCommand(), /command -v codex/);
	assert.match(
		codexHarness.isInstalledCommand(),
		/agent-machines\/pkgs\/node_modules\/\.bin/,
		"the probe must look where amNpmInstall puts the binary",
	);
	const install = codexHarness.installCommand();
	assert.match(install, /@openai\/codex@0\.146\.0/);
	assert.match(install, /npm install --prefix/, "install must not use npm -g");
	assert.ok(!install.includes("\n"), "install must stay a single shell line");
	assert.match(codexHarness.versionCommand(), /codex --version/);
});

test("thread.started maps to started with the thread id as sessionId", () => {
	const events = parse({ type: "thread.started", thread_id: "thr_123" });
	assert.deepEqual(events, [
		{ type: "started", harness: "codex", sessionId: "thr_123" },
	]);
});

test("turn.started maps to a status event", () => {
	const events = parse({ type: "turn.started" });
	assert.deepEqual(events, [{ type: "status", label: "turn started" }]);
});

test("agent_message emits a text delta only on item.completed", () => {
	const item = { id: "item_0", type: "agent_message", text: "Hello there" };
	assert.deepEqual(parse({ type: "item.started", item }), []);
	assert.deepEqual(parse({ type: "item.updated", item }), []);
	assert.deepEqual(parse({ type: "item.completed", item }), [
		{ type: "text", delta: "Hello there" },
	]);
});

test("command_execution lifecycle maps to tool_call then tool_result", () => {
	const started = parse({
		type: "item.started",
		item: { id: "item_1", type: "command_execution", command: "ls -la" },
	});
	assert.deepEqual(started, [
		{ type: "tool_call", id: "item_1", name: "shell", input: "ls -la" },
	]);

	assert.deepEqual(
		parse({
			type: "item.updated",
			item: { id: "item_1", type: "command_execution", status: "running" },
		}),
		[],
	);

	const completed = parse({
		type: "item.completed",
		item: {
			id: "item_1",
			type: "command_execution",
			command: "ls -la",
			aggregated_output: "total 0\n",
			exit_code: 0,
		},
	});
	assert.deepEqual(completed, [
		{ type: "tool_result", id: "item_1", output: "total 0\n", isError: false },
	]);
});

test("command_execution with nonzero exit_code marks tool_result as error", () => {
	const events = parse({
		type: "item.completed",
		item: {
			id: "item_2",
			type: "command_execution",
			command: "false",
			aggregated_output: "boom",
			exit_code: 1,
		},
	});
	assert.deepEqual(events, [
		{ type: "tool_result", id: "item_2", output: "boom", isError: true },
	]);
});

test("reasoning item maps to thinking on completion", () => {
	assert.deepEqual(
		parse({
			type: "item.started",
			item: { id: "item_3", type: "reasoning", text: "partial" },
		}),
		[],
	);
	assert.deepEqual(
		parse({
			type: "item.completed",
			item: { id: "item_3", type: "reasoning", text: "Considered the repo layout." },
		}),
		[{ type: "thinking", delta: "Considered the repo layout." }],
	);
});

test("turn.completed confirms the accumulated agent text, not the last message", () => {
	// Two complete messages per turn are a real live shape (see
	// CAPTURE_TWO_AGENT_MESSAGES); the result must carry both, joined the
	// same way the deltas were emitted, because the router replaces its
	// accumulation with a non-empty result.text.
	parse({ type: "thread.started", thread_id: "thr_result" });
	parse({ type: "turn.started" });
	const first = parse({
		type: "item.completed",
		item: { id: "item_0", type: "agent_message", text: "First draft" },
	});
	assert.deepEqual(first, [{ type: "text", delta: "First draft" }]);
	const second = parse({
		type: "item.completed",
		item: { id: "item_1", type: "agent_message", text: "Final answer" },
	});
	assert.deepEqual(second, [{ type: "text", delta: "\n\nFinal answer" }]);
	const events = parse({
		type: "turn.completed",
		usage: { input_tokens: 10, output_tokens: 20 },
	});
	assert.deepEqual(events, [
		{ type: "result", text: "First draft\n\nFinal answer", sessionId: "thr_result" },
	]);
	const result = events[0];
	assert.ok(result.type === "result");
	assert.equal(result.costUsd, undefined);
});

test("turn.started resets the last agent message between turns", () => {
	parse({ type: "thread.started", thread_id: "thr_reset" });
	parse({
		type: "item.completed",
		item: { id: "item_0", type: "agent_message", text: "old turn text" },
	});
	parse({ type: "turn.started" });
	const events = parse({ type: "turn.completed", usage: {} });
	assert.deepEqual(events, [
		{ type: "result", text: "", sessionId: "thr_reset" },
	]);
});

test("turn.failed is the only stream-level error; top-level error is a notice", () => {
	// Codex reserves top-level {"type":"error"} for retry/diagnostic
	// notices (measured 2026-08-03: ten "Reconnecting... N/5" lines before
	// the genuine turn.failed). Mapping it to "error" recorded runs that
	// merely retried as failed.
	assert.deepEqual(parse({ type: "error", message: "stream disconnected" }), [
		{ type: "status", label: "stream disconnected" },
	]);
	assert.deepEqual(
		parse({ type: "turn.failed", error: { message: "quota exceeded" } }),
		[{ type: "error", message: "quota exceeded" }],
	);
});

test("legacy msg envelopes map to text and result", () => {
	parse({ type: "thread.started", thread_id: "thr_legacy" });
	assert.deepEqual(
		parse({ id: "0", msg: { type: "agent_message", message: "legacy hello" } }),
		[{ type: "text", delta: "legacy hello" }],
	);
	assert.deepEqual(parse({ id: "1", msg: { type: "task_complete" } }), [
		{ type: "result", text: "legacy hello", sessionId: "thr_legacy" },
	]);
	// last_agent_message is "last" -- the overwrite semantic that dropped
	// preambles -- so the accumulated stream wins when both exist.
	assert.deepEqual(
		parse({
			id: "2",
			msg: { type: "task_complete", last_agent_message: "explicit final" },
		}),
		[{ type: "result", text: "legacy hello", sessionId: "thr_legacy" }],
	);
	// Same notice contract as the 0.146 stream: a legacy error may not
	// fail the run; only a nonzero exit can (the envelope has no
	// turn.failed).
	assert.deepEqual(
		parse({ id: "3", msg: { type: "error", message: "legacy boom" } }),
		[{ type: "status", label: "legacy boom" }],
	);
});

test("legacy multi-message turns keep every message in the result", () => {
	const parseTurn = turnParser();
	const events = [
		{ id: "0", msg: { type: "session_configured", session_id: "sess_legacy" } },
		{ id: "1", msg: { type: "agent_message", message: "Starting now." } },
		{ id: "2", msg: { type: "agent_message", message: "hello" } },
		{ id: "3", msg: { type: "task_complete", last_agent_message: "hello" } },
	].flatMap((value) => parseTurn(JSON.stringify(value)));
	assert.equal(accumulate(events), "Starting now.\n\nhello");
	const result = events.find((event) => event.type === "result");
	assert.deepEqual(result, {
		type: "result",
		text: "Starting now.\n\nhello",
		sessionId: "sess_legacy",
	});
});

test("legacy task_complete falls back to last_agent_message when nothing streamed", () => {
	const parseTurn = turnParser();
	parseTurn(JSON.stringify({ id: "0", msg: { type: "session_configured", session_id: "s1" } }));
	assert.deepEqual(
		parseTurn(
			JSON.stringify({
				id: "1",
				msg: { type: "task_complete", last_agent_message: "only the vendor knew" },
			}),
		),
		[{ type: "result", text: "only the vendor knew", sessionId: "s1" }],
	);
});

// ---------------------------------------------------------------------------
// Full captured streams. The corruption these prevent: an "error" event sets
// RunResult.error in the router, traces.ts copies it, isSuccessfulTrace()
// goes false, and selection.ts weights successRate at 0.7 -- a SUCCESSFUL
// run recorded as failed skews every future routing decision for the lane.
// ---------------------------------------------------------------------------

test("capture: gpt-5.1 metadata notice is a status, never an error (exit 0)", () => {
	const parseTurn = turnParser();
	const events = CAPTURE_GPT51_METADATA_NOTICE.flatMap((line) => parseTurn(line));

	assert.ok(
		!events.some((event) => event.type === "error"),
		"a run that answered correctly and exited 0 must produce no error event",
	);
	const notice = events.filter(
		(event) => event.type === "status" && event.label.startsWith("Model metadata"),
	);
	assert.equal(notice.length, 1, "the notice must surface exactly once, as status");
	assert.deepEqual(notice[0], {
		type: "status",
		label:
			"Model metadata for `gpt-5.1` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.",
	});
	const result = events.find((event) => event.type === "result");
	assert.deepEqual(result, {
		type: "result",
		text: "ok",
		sessionId: "019fc99e-a719-76a0-8e0d-95ded055521c",
	});
	assert.equal(accumulate(events), "ok");
});

test("capture: Reconnecting notices then turn.failed yield exactly one error", () => {
	const parseTurn = turnParser();
	const events = CAPTURE_RECONNECT_401_TURN_FAILED.flatMap((line) => parseTurn(line));

	const errors = events.filter((event) => event.type === "error");
	assert.equal(errors.length, 1, "only turn.failed may produce an error event");
	assert.deepEqual(errors[0], {
		type: "error",
		message:
			"unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a2588dc17e90d045-SJC, request id: req_6bcea996a2b8446587872680a56ce6a7",
	});
	// All nine retry notices surface as statuses -- visible, not failing.
	// (Nine, not ten: the capture opens at "Reconnecting... 2/5" on wss.)
	const reconnects = events.filter(
		(event) => event.type === "status" && event.label.startsWith("Reconnecting..."),
	);
	assert.equal(reconnects.length, 9);
	// The final top-level error duplicates the turn.failed message; it too
	// is a notice, so the run fails exactly once.
	const duplicated = events.filter(
		(event) =>
			event.type === "status" && event.label.startsWith("unexpected status 401"),
	);
	assert.equal(duplicated.length, 1);
	// The transport-fallback ERROR ITEM is a notice too.
	const fallback = events.filter(
		(event) =>
			event.type === "status" &&
			event.label.startsWith("Falling back from WebSockets to HTTPS transport."),
	);
	assert.equal(fallback.length, 1);
});

test("capture: two agent messages both reach the deltas and the result", () => {
	const parseTurn = turnParser();
	const events = CAPTURE_TWO_AGENT_MESSAGES.flatMap((line) => parseTurn(line));

	const deltas = events.filter((event) => event.type === "text");
	assert.deepEqual(deltas, [
		{ type: "text", delta: "Starting now." },
		{ type: "text", delta: "\n\nhello" },
	]);
	const result = events.find((event) => event.type === "result");
	assert.deepEqual(result, {
		type: "result",
		text: "Starting now.\n\nhello",
		sessionId: "019fc99f-0f82-7722-b64e-59c8d31de332",
	});
	// Confirm semantics: the router replaces its accumulated deltas with a
	// non-empty result.text, so the two strings must be identical or one
	// consumer sees different text than another.
	assert.ok(result.type === "result");
	assert.equal(accumulate(events), result.text);
	assert.ok(
		!events.some((event) => event.type === "error"),
		"the metadata notice in this healthy run must not become an error",
	);
});

test("capture: the fatal 400 path errors once, from turn.failed, message intact", () => {
	const parseTurn = turnParser();
	const events = CAPTURE_BOGUS_MODEL_TURN_FAILED.flatMap((line) => parseTurn(line));

	const errors = events.filter((event) => event.type === "error");
	assert.equal(errors.length, 1);
	assert.ok(errors[0].type === "error");
	// The vendor duplicated the terminal message into turn.failed (both
	// failing captures did), so demoting the top-level error loses nothing.
	assert.match(errors[0].message, /model_not_found/);
	const preceding = events.filter(
		(event) => event.type === "status" && event.label.includes("model_not_found"),
	);
	assert.equal(
		preceding.length,
		1,
		"the top-level error preceding turn.failed is a notice",
	);
});

test("error items are gated to item.completed, one status per notice", () => {
	// Phase answer measured 2026-08-03: all 7 error items across the
	// six-run corpus arrived via item.completed only -- never item.started
	// or item.updated -- while todo_list items prove item.updated is a
	// live channel in this binary. The gate means that if an error-item
	// lifecycle ever appears, the notice still surfaces exactly once
	// instead of three times. The item payload is verbatim from
	// CAPTURE_GPT51_METADATA_NOTICE; the started/updated envelopes are the
	// hypothetical lifecycle being guarded against.
	const item = {
		id: "item_0",
		type: "error",
		message:
			"Model metadata for `gpt-5.1` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.",
	};
	assert.deepEqual(parse({ type: "item.started", item }), []);
	assert.deepEqual(parse({ type: "item.updated", item }), []);
	assert.deepEqual(parse({ type: "item.completed", item }), [
		{ type: "status", label: item.message },
	]);
});

test("a ThreadError never surfaces the raw JSON line when a field exists", () => {
	// Field inventory measured 2026-08-03: every live top-level error
	// carried `message` (even the 400 path). The binary's string table
	// declares an optional `kind` (CodexErrorInfo: bad_request,
	// usage_limit_exceeded, ...) next to `message`; it was never observed
	// live, so these shapes are the string-table-inferred fallbacks, not
	// captures. No `text` field exists on this event.
	assert.deepEqual(parse({ type: "error", kind: "usage_limit_exceeded" }), [
		{ type: "status", label: "usage_limit_exceeded" },
	]);
	// Message wins when both are present.
	assert.deepEqual(
		parse({ type: "error", kind: "bad_request", message: "upstream said no" }),
		[{ type: "status", label: "upstream said no" }],
	);
	// Only a field-less error may fall back to the raw line.
	assert.deepEqual(parse({ type: "error" }), [
		{ type: "status", label: '{"type":"error"}' },
	]);
});

test("garbage and unknown lines produce no events", () => {
	assert.deepEqual(codexHarness.parseLine("not json at all"), []);
	assert.deepEqual(codexHarness.parseLine(""), []);
	assert.deepEqual(codexHarness.parseLine("[1,2,3]"), []);
	assert.deepEqual(codexHarness.parseLine("42"), []);
	assert.deepEqual(codexHarness.parseLine('{"broken":'), []);
	assert.deepEqual(parse({ type: "somefuture.event", payload: {} }), []);
	assert.deepEqual(parse({ noType: true }), []);
	assert.deepEqual(parse({ type: "item.completed" }), []);
	assert.deepEqual(
		parse({ type: "item.completed", item: { type: "web_search", query: "x" } }),
		[],
	);
});

test("runCommand embeds the prompt as base64 and reads it from stdin", () => {
	const prompt = "fix the failing test\nuse 'single quotes' and \"doubles\"";
	const { command, env } = codexHarness.runCommand(prompt, KEYS);
	const { prompt: decoded, rest } = decodePrompt(command);
	assert.equal(decoded, prompt);
	assert.ok(rest.startsWith("codex exec --json"));
	assert.ok(command.includes("--skip-git-repo-check"));
	assert.ok(command.includes("--dangerously-bypass-approvals-and-sandbox"));
	assert.ok(
		/ -;? \}?$/.test(command),
		"prompt must be read from stdin via trailing -",
	);
	assert.equal(env.CODEX_API_KEY, "sk-test-openai");
});

test("runCommand keeps the API key out of argv", () => {
	const { command, env } = codexHarness.runCommand("hello", KEYS);
	assert.ok(!command.includes("sk-test-openai"));
	// Published under both names: `codex exec` honors CODEX_API_KEY, while
	// the built-in provider's documented env_key is OPENAI_API_KEY.
	assert.deepEqual(env, {
		CODEX_API_KEY: "sk-test-openai",
		OPENAI_API_KEY: "sk-test-openai",
	});
});

test("runCommand on a gateway declares a model provider instead of a base-URL env", () => {
	// Codex reaches a non-OpenAI endpoint only through a named provider: the
	// ids openai/ollama/lmstudio are reserved, so there is no base-URL knob
	// on the built-in one. `-c key=value` is the only lever available to an
	// adapter that ships no config file.
	const { command, env } = codexHarness.runCommand("hello", {
		openrouter: "sk-or-test",
	});
	assert.deepEqual(env, { OPENROUTER_API_KEY: "sk-or-test" });
	assert.ok(!command.includes("sk-or-test"), "gateway key must stay out of argv");
	assert.ok(command.includes(`'model_provider="am_openrouter"'`));
	assert.ok(
		command.includes(
			`'model_providers.am_openrouter.base_url="https://openrouter.ai/api/v1"'`,
		),
	);
	assert.ok(
		command.includes(`'model_providers.am_openrouter.env_key="OPENROUTER_API_KEY"'`),
	);
	assert.ok(command.includes(`'model_providers.am_openrouter.wire_api="responses"'`));
	// The exec shape the live matrix verified must not drift.
	const { rest } = decodePrompt(command);
	assert.ok(rest.startsWith("codex exec --json"));
	assert.ok(/ -;? \}?$/.test(command));
});

test("runCommand on the Vercel gateway keeps /v1 in the base URL", () => {
	// Verified against codex-cli 0.146.0: the turn is POSTed to
	// <base_url>/responses, so dropping /v1 would 404.
	const { command } = codexHarness.runCommand("hello", { aiGateway: "vck_test" });
	assert.ok(
		command.includes(
			`'model_providers.am_vercel_gateway.base_url="https://ai-gateway.vercel.sh/v1"'`,
		),
	);
});

test("no output-token cap is fabricated for any upstream", () => {
	// Guard against re-adding a knob that does not exist. Measured against
	// the 0.146 binary on 2026-08-01 (docs/UPSTREAMS.md): `exec
	// --strict-config` rejects model_max_output_tokens, max_output_tokens,
	// model_output_token_limit, output_token_limit, max_tokens,
	// model_max_tokens and max_completion_tokens as unknown configuration
	// fields, and a captured Responses request carries no output-token field
	// at all. An override for one of these names would be silently ignored
	// at best and would fail config load under --strict-config at worst,
	// while reading as if the 402 on a metered gateway had been handled.
	const upstreams: UpstreamKeys[] = [
		{ openai: "sk-test-openai" },
		{ openrouter: "sk-or-test" },
		{ aiGateway: "vck_test" },
	];
	for (const keys of upstreams) {
		const commands = [
			codexHarness.runCommand("hello", keys).command,
			codexHarness.interactiveCommand(keys).command,
		];
		for (const command of commands) {
			for (const invented of [
				"model_max_output_tokens",
				"max_output_tokens",
				"model_output_token_limit",
				"output_token_limit",
				"max_tokens",
				"model_max_tokens",
				"max_completion_tokens",
			]) {
				assert.ok(
					!command.includes(invented),
					`${invented} is not a codex 0.146 config field: ${command}`,
				);
			}
		}
	}
});

/** assert.throws returns void, so capture the error to inspect its message. */
function muxErrorFrom(fn: () => unknown): MuxError {
	try {
		fn();
	} catch (error) {
		assert.ok(error instanceof MuxError, `expected a MuxError, got ${String(error)}`);
		return error;
	}
	assert.fail("expected a throw");
}

test("runCommand rejects an Anthropic-only config: wrong wire format", () => {
	const error = muxErrorFrom(() =>
		codexHarness.runCommand("hello", { anthropic: "sk-ant-test" }),
	);
	assert.equal(error.kind, "missing_credentials");
	assert.match(error.message, /OpenAI Responses wire format/);
	assert.match(error.message, /keys\.openai/);
});

test("runCommand honors model, cwd and extraArgs", () => {
	const { command } = codexHarness.runCommand("hello", KEYS, {
		model: "gpt-5.3-codex",
		cwd: "/workspace/my repo",
		extraArgs: ["--foo", "bar"],
	});
	assert.ok(command.includes(" -m 'gpt-5.3-codex'"));
	assert.ok(command.includes(" -C '/workspace/my repo'"));
	assert.ok(command.includes(" --foo bar "));
});

test("runCommand with sessionId resumes via codex exec resume", () => {
	const { command } = codexHarness.runCommand("continue please", KEYS, {
		sessionId: "thr_abc123",
	});
	const { rest } = decodePrompt(command);
	assert.ok(rest.startsWith("codex exec resume 'thr_abc123' --json"));
	assert.ok(/ -;? \}?$/.test(command));
});

test("runCommand without an OpenAI key fails closed", () => {
	assert.throws(
		() => codexHarness.runCommand("hello", {}),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "missing_credentials",
	);
});

test("interactiveCommand logs in from env and keeps the key out of argv", () => {
	const { command, env } = codexHarness.interactiveCommand(KEYS, {
		model: "gpt-5.3-codex",
	});
	assert.ok(command.startsWith("bash -lc '"));
	assert.ok(command.includes("codex login --with-api-key"));
	assert.ok(command.includes("$CODEX_API_KEY"));
	assert.ok(command.includes("--dangerously-bypass-approvals-and-sandbox"));
	// The script is single-quote wrapped, so the inner -m quoting appears
	// in its POSIX-escaped form; assert on the unescaped script instead.
	const script = command
		.slice("bash -lc '".length, -1)
		.replace(/'\\''/g, "'");
	assert.ok(script.includes("-m 'gpt-5.3-codex'"));
	assert.ok(script.includes("exec codex "));
	assert.ok(!command.includes("sk-test-openai"));
	assert.equal(env.CODEX_API_KEY, "sk-test-openai");
	assert.equal(env.OPENAI_API_KEY, "sk-test-openai");
	assert.throws(
		() => codexHarness.interactiveCommand({}),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "missing_credentials",
	);
});

test("interactiveCommand on a gateway skips the OpenAI login step", () => {
	// `codex login --with-api-key` would store the gateway token as an
	// OpenAI credential and leave the TUI authenticated against the wrong
	// upstream; the provider's env_key is what authenticates here.
	const { command, env } = codexHarness.interactiveCommand({
		aiGateway: "vck_test",
	});
	assert.ok(!command.includes("codex login"));
	assert.ok(!command.includes("CODEX_API_KEY"));
	assert.deepEqual(env, { AI_GATEWAY_API_KEY: "vck_test" });
	const script = command.slice("bash -lc '".length, -1).replace(/'\\''/g, "'");
	assert.ok(script.includes("exec codex "));
	assert.ok(script.includes(`-c 'model_provider="am_vercel_gateway"'`));
});
