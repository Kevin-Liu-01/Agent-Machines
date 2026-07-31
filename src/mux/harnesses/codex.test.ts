/**
 * Codex harness adapter tests. Run with: tsx --test
 *
 * parseLine keeps small cross-line turn state (last agent message,
 * thread id), so tests that assert on result/session data start their
 * stream with a thread.started line to reset it.
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

function decodePrompt(command: string): { prompt: string; rest: string } {
	const match = command.match(/^echo ([A-Za-z0-9+/=]+) \| base64 -d \| (.+)$/);
	assert.ok(match, `command does not embed a base64 prompt pipe: ${command}`);
	return {
		prompt: Buffer.from(match[1], "base64").toString("utf8"),
		rest: match[2],
	};
}

test("adapter identity and static commands", () => {
	assert.equal(codexHarness.kind, "codex");
	assert.equal(codexHarness.requiredUpstream, "openai");
	assert.equal(codexHarness.isInstalledCommand(), "command -v codex");
	assert.equal(
		codexHarness.installCommand(),
		"npm install -g @openai/codex@0.146.0",
	);
	assert.equal(codexHarness.versionCommand(), "codex --version");
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

test("turn.completed produces a result carrying the last agent message", () => {
	parse({ type: "thread.started", thread_id: "thr_result" });
	parse({ type: "turn.started" });
	parse({
		type: "item.completed",
		item: { id: "item_0", type: "agent_message", text: "First draft" },
	});
	parse({
		type: "item.completed",
		item: { id: "item_1", type: "agent_message", text: "Final answer" },
	});
	const events = parse({
		type: "turn.completed",
		usage: { input_tokens: 10, output_tokens: 20 },
	});
	assert.deepEqual(events, [
		{ type: "result", text: "Final answer", sessionId: "thr_result" },
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

test("error events map to error", () => {
	assert.deepEqual(parse({ type: "error", message: "stream disconnected" }), [
		{ type: "error", message: "stream disconnected" },
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
	assert.deepEqual(
		parse({
			id: "2",
			msg: { type: "task_complete", last_agent_message: "explicit final" },
		}),
		[{ type: "result", text: "explicit final", sessionId: "thr_legacy" }],
	);
	assert.deepEqual(
		parse({ id: "3", msg: { type: "error", message: "legacy boom" } }),
		[{ type: "error", message: "legacy boom" }],
	);
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
	assert.ok(command.endsWith(" -"), "prompt must be read from stdin via trailing -");
	assert.equal(env.CODEX_API_KEY, "sk-test-openai");
});

test("runCommand keeps the API key out of argv", () => {
	const { command, env } = codexHarness.runCommand("hello", KEYS);
	assert.ok(!command.includes("sk-test-openai"));
	assert.deepEqual(env, { CODEX_API_KEY: "sk-test-openai" });
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
	assert.ok(command.endsWith(" -"));
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
