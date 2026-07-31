/**
 * Tests for the Claude Code harness adapter.
 *
 * Run: tsx --test src/mux/harnesses/claude-code.test.ts
 *
 * parseLine cases feed recorded stream-json lines (claude 2.1.x,
 * --output-format stream-json --verbose --include-partial-messages) and
 * assert the normalized MuxAgentEvents.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { MuxError, type UpstreamKeys } from "../types.js";
import { claudeCodeHarness } from "./claude-code.js";

const KEYS: UpstreamKeys = { anthropic: "sk-ant-test-key-123" };
const SESSION = "5c1f6a3e-1c9c-4a3e-9a51-2f9d3f9d2b1a";

// --- recorded lines -------------------------------------------------------

const LINE_SYSTEM_INIT = JSON.stringify({
	type: "system",
	subtype: "init",
	cwd: "/home/user",
	session_id: SESSION,
	tools: ["Task", "Bash", "Read", "Edit", "Write"],
	mcp_servers: [],
	model: "claude-sonnet-4-20250514",
	permissionMode: "bypassPermissions",
	slash_commands: [],
	apiKeySource: "ANTHROPIC_API_KEY",
	output_style: "default",
	uuid: "0b6a1a44-93a4-4e7a-a8a1-6f6a9f1b2c3d",
});

const LINE_TEXT_DELTA = JSON.stringify({
	type: "stream_event",
	event: {
		type: "content_block_delta",
		index: 0,
		delta: { type: "text_delta", text: "Hello from the sandbox" },
	},
	parent_tool_use_id: null,
	session_id: SESSION,
	uuid: "0f0e0d0c-0b0a-4a4a-8b8b-1c1c1c1c1c1c",
});

const LINE_THINKING_DELTA = JSON.stringify({
	type: "stream_event",
	event: {
		type: "content_block_delta",
		index: 0,
		delta: { type: "thinking_delta", thinking: "The user wants a file listed. " },
	},
	parent_tool_use_id: null,
	session_id: SESSION,
	uuid: "1f1e1d1c-1b1a-4a4a-8b8b-2c2c2c2c2c2c",
});

const LINE_ASSISTANT_TOOL_USE = JSON.stringify({
	type: "assistant",
	message: {
		id: "msg_01Xk2mNp3qRs4tUv",
		type: "message",
		role: "assistant",
		model: "claude-sonnet-4-20250514",
		content: [
			{ type: "text", text: "I will list the directory." },
			{
				type: "tool_use",
				id: "toolu_01A2b3C4d5E6f7G8",
				name: "Bash",
				input: { command: "ls -la", description: "List directory" },
			},
			{
				type: "tool_use",
				id: "toolu_02H9i8J7k6L5m4N3",
				name: "Read",
				input: { file_path: "/etc/hostname" },
			},
		],
		stop_reason: "tool_use",
		usage: { input_tokens: 4, output_tokens: 120 },
	},
	parent_tool_use_id: null,
	session_id: SESSION,
	uuid: "2f2e2d2c-2b2a-4a4a-8b8b-3c3c3c3c3c3c",
});

const LINE_TOOL_RESULT_STRING = JSON.stringify({
	type: "user",
	message: {
		role: "user",
		content: [
			{
				type: "tool_result",
				tool_use_id: "toolu_01A2b3C4d5E6f7G8",
				content: "total 8\n-rw-r--r-- 1 user user 12 index.ts",
				is_error: false,
			},
		],
	},
	parent_tool_use_id: null,
	session_id: SESSION,
	uuid: "3f3e3d3c-3b3a-4a4a-8b8b-4c4c4c4c4c4c",
});

const LINE_TOOL_RESULT_BLOCKS = JSON.stringify({
	type: "user",
	message: {
		role: "user",
		content: [
			{
				type: "tool_result",
				tool_use_id: "toolu_02H9i8J7k6L5m4N3",
				content: [
					{ type: "text", text: "sandbox-host" },
					{ type: "text", text: "second line" },
				],
				is_error: true,
			},
		],
	},
	parent_tool_use_id: null,
	session_id: SESSION,
	uuid: "4f4e4d4c-4b4a-4a4a-8b8b-5c5c5c5c5c5c",
});

const LINE_RESULT_SUCCESS = JSON.stringify({
	type: "result",
	subtype: "success",
	is_error: false,
	duration_ms: 4523,
	duration_api_ms: 3911,
	num_turns: 3,
	result: "Done. The directory contains one file.",
	session_id: SESSION,
	total_cost_usd: 0.0234,
	usage: { input_tokens: 8, output_tokens: 210 },
	uuid: "5f5e5d5c-5b5a-4a4a-8b8b-6c6c6c6c6c6c",
});

const LINE_RESULT_ERROR = JSON.stringify({
	type: "result",
	subtype: "error_during_execution",
	is_error: true,
	duration_ms: 812,
	duration_api_ms: 640,
	num_turns: 1,
	session_id: SESSION,
	total_cost_usd: 0.0011,
	uuid: "6f6e6d6c-6b6a-4a4a-8b8b-7c7c7c7c7c7c",
});

// --- parseLine ------------------------------------------------------------

test("parseLine: system init -> started with sessionId and model", () => {
	const events = claudeCodeHarness.parseLine(LINE_SYSTEM_INIT);
	assert.deepEqual(events, [
		{
			type: "started",
			harness: "claude-code",
			sessionId: SESSION,
			model: "claude-sonnet-4-20250514",
		},
	]);
});

test("parseLine: stream_event text_delta -> text delta", () => {
	const events = claudeCodeHarness.parseLine(LINE_TEXT_DELTA);
	assert.deepEqual(events, [
		{ type: "text", delta: "Hello from the sandbox" },
	]);
});

test("parseLine: stream_event thinking_delta -> thinking delta", () => {
	const events = claudeCodeHarness.parseLine(LINE_THINKING_DELTA);
	assert.deepEqual(events, [
		{ type: "thinking", delta: "The user wants a file listed. " },
	]);
});

test("parseLine: assistant message -> tool_calls, text kept when no deltas preceded", () => {
	// Stateless parseLine saw no stream_event deltas, so the text block is
	// the only copy of the message text and must surface.
	const events = claudeCodeHarness.parseLine(LINE_ASSISTANT_TOOL_USE);
	assert.equal(events.length, 3);
	assert.deepEqual(events[0], {
		type: "text",
		delta: "I will list the directory.",
	});
	assert.deepEqual(events[1], {
		type: "tool_call",
		id: "toolu_01A2b3C4d5E6f7G8",
		name: "Bash",
		input: JSON.stringify({ command: "ls -la", description: "List directory" }),
	});
	assert.deepEqual(events[2], {
		type: "tool_call",
		id: "toolu_02H9i8J7k6L5m4N3",
		name: "Read",
		input: JSON.stringify({ file_path: "/etc/hostname" }),
	});
});

test("newTurnParser: assistant text suppressed after stream deltas, re-earned per message", () => {
	const parse = claudeCodeHarness.newTurnParser?.();
	assert.ok(parse, "claude-code exposes a per-run parser");
	// Deltas stream first; the assistant text block is then a duplicate.
	const deltas = parse(LINE_TEXT_DELTA);
	assert.equal(deltas.length, 1);
	const afterDeltas = parse(LINE_ASSISTANT_TOOL_USE);
	assert.ok(
		afterDeltas.every((event) => event.type === "tool_call"),
		"text block after stream deltas must be suppressed",
	);
	// The next assistant message had no deltas of its own -> text kept.
	const secondMessage = parse(LINE_ASSISTANT_TOOL_USE);
	assert.equal(
		secondMessage.filter((event) => event.type === "text").length,
		1,
		"dedup state must reset at message boundaries",
	);
});

test("parseLine: user tool_result with string content", () => {
	const events = claudeCodeHarness.parseLine(LINE_TOOL_RESULT_STRING);
	assert.deepEqual(events, [
		{
			type: "tool_result",
			id: "toolu_01A2b3C4d5E6f7G8",
			output: "total 8\n-rw-r--r-- 1 user user 12 index.ts",
			isError: false,
		},
	]);
});

test("parseLine: user tool_result with block-array content is flattened", () => {
	const events = claudeCodeHarness.parseLine(LINE_TOOL_RESULT_BLOCKS);
	assert.deepEqual(events, [
		{
			type: "tool_result",
			id: "toolu_02H9i8J7k6L5m4N3",
			output: "sandbox-host\nsecond line",
			isError: true,
		},
	]);
});

test("parseLine: result success -> result event with cost, duration, session", () => {
	const events = claudeCodeHarness.parseLine(LINE_RESULT_SUCCESS);
	assert.deepEqual(events, [
		{
			type: "result",
			text: "Done. The directory contains one file.",
			costUsd: 0.0234,
			durationMs: 4523,
			sessionId: SESSION,
			isError: false,
		},
	]);
});

test("parseLine: result error subtype -> isError true, empty text", () => {
	const events = claudeCodeHarness.parseLine(LINE_RESULT_ERROR);
	assert.equal(events.length, 1);
	const event = events[0];
	assert.equal(event.type, "result");
	if (event.type === "result") {
		assert.equal(event.text, "");
		assert.equal(event.isError, true);
		assert.equal(event.durationMs, 812);
	}
});

test("parseLine: garbage and unknown lines return []", () => {
	const garbage = [
		"",
		"   ",
		"npm WARN deprecated something",
		"not json at all { nope",
		"[1,2,3]",
		'"just a string"',
		"12345",
		"{broken json",
		'{"type":"rate_limit_status","status":{"remaining":100}}',
		'{"type":"stream_event","event":{"type":"content_block_start","index":0}}',
		'{"type":"system","subtype":"compact_boundary"}',
		'{"no_type_field":true}',
		'{"type":42}',
		'{"type":"assistant","message":{"content":"not-an-array"}}',
		'{"type":"user","message":{}}',
	];
	for (const line of garbage) {
		assert.deepEqual(
			claudeCodeHarness.parseLine(line),
			[],
			`expected [] for line: ${line}`,
		);
	}
});

// --- commands ---------------------------------------------------------------

test("runCommand: embeds base64 prompt, pipes through base64 -d into claude", () => {
	const prompt = "Say 'hello' && echo $(rm -rf /) `stuff`\nmultiline";
	const { command } = claudeCodeHarness.runCommand(prompt, KEYS);
	const b64 = Buffer.from(prompt, "utf8").toString("base64");
	assert.ok(command.includes(`echo ${b64} | base64 -d | claude`));
	assert.ok(
		!command.includes("$(rm -rf /)"),
		"raw prompt text must never appear in the shell command",
	);
	assert.ok(command.includes("--bare"));
	assert.ok(command.includes("-p"));
	assert.ok(command.includes("--output-format stream-json"));
	assert.ok(command.includes("--verbose"));
	assert.ok(command.includes("--include-partial-messages"));
	assert.ok(command.includes("--dangerously-skip-permissions"));
});

test("runCommand: sets IS_SANDBOX=1 and ANTHROPIC_API_KEY from keys", () => {
	const { env } = claudeCodeHarness.runCommand("hi", KEYS);
	assert.equal(env.IS_SANDBOX, "1");
	assert.equal(env.ANTHROPIC_API_KEY, "sk-ant-test-key-123");
});

test("runCommand: omits --model when no model given", () => {
	const { command } = claudeCodeHarness.runCommand("hi", KEYS);
	assert.ok(!command.includes("--model"));
});

test("runCommand: includes --model when a model is given", () => {
	const { command } = claudeCodeHarness.runCommand("hi", KEYS, {
		model: "claude-opus-4-1",
	});
	assert.ok(command.includes("--model 'claude-opus-4-1'"));
});

test("runCommand: sessionId maps to --resume", () => {
	const { command } = claudeCodeHarness.runCommand("hi", KEYS, {
		sessionId: SESSION,
	});
	assert.ok(command.includes(`--resume '${SESSION}'`));
});

test("runCommand: omits --resume without sessionId", () => {
	const { command } = claudeCodeHarness.runCommand("hi", KEYS);
	assert.ok(!command.includes("--resume"));
});

test("runCommand: cwd is prefixed as a quoted cd", () => {
	const { command } = claudeCodeHarness.runCommand("hi", KEYS, {
		cwd: "/work/my project",
	});
	assert.ok(command.startsWith("cd '/work/my project' && "));
});

test("runCommand: extraArgs are appended verbatim", () => {
	const { command } = claudeCodeHarness.runCommand("hi", KEYS, {
		extraArgs: ["--max-turns", "5"],
	});
	assert.ok(command.includes("--max-turns 5"));
});

test("runCommand: missing anthropic key throws MuxError missing_credentials", () => {
	assert.throws(
		() => claudeCodeHarness.runCommand("hi", {}),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "missing_credentials",
	);
});

test("interactiveCommand: plain claude with sandbox env", () => {
	const { command, env } = claudeCodeHarness.interactiveCommand(KEYS);
	assert.equal(
		command,
		'{ export PATH="$HOME/.agent-machines/node/bin:$HOME/.agent-machines/pkgs/node_modules/.bin:$PATH"; claude; }',
	);
	assert.equal(env.IS_SANDBOX, "1");
	assert.equal(env.ANTHROPIC_API_KEY, "sk-ant-test-key-123");
});

test("interactiveCommand: model flag when given, missing key throws", () => {
	const { command } = claudeCodeHarness.interactiveCommand(KEYS, {
		model: "claude-sonnet-4-5",
	});
	assert.ok(command.includes("--model 'claude-sonnet-4-5'"));
	assert.throws(
		() => claudeCodeHarness.interactiveCommand({}),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "missing_credentials",
	);
});

test("install/probe/version commands", () => {
	assert.equal(
		claudeCodeHarness.isInstalledCommand(),
		'{ export PATH="$HOME/.agent-machines/node/bin:$HOME/.agent-machines/pkgs/node_modules/.bin:$PATH"; command -v claude; }',
	);
	assert.equal(
		claudeCodeHarness.versionCommand(),
		'{ export PATH="$HOME/.agent-machines/node/bin:$HOME/.agent-machines/pkgs/node_modules/.bin:$PATH"; claude --version; }',
	);
	const install = claudeCodeHarness.installCommand();
	assert.ok(install.includes("npm install --prefix"));
	assert.ok(install.includes("@anthropic-ai/claude-code@2.1.220"));
	// The bootstrap probe compares the full version (major.minor.patch),
	// so a harness with a minor-precision engine range is handled too.
	assert.match(
		install,
		/M>22\|\|\(M===22&&/,
		"install must ensure Node >= 22 via the user-space bootstrap",
	);
	assert.ok(
		install.includes("nodejs.org/dist/"),
		"install must be able to bootstrap Node when the image is too old",
	);
	assert.ok(!install.includes("\n"), "install command must be a single line");
	assert.equal(claudeCodeHarness.kind, "claude-code");
	assert.equal(claudeCodeHarness.requiredUpstream, "anthropic");
});
