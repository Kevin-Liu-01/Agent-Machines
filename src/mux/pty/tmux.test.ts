/**
 * Tests for the tmux-over-exec PTY fallback.
 *
 * Run: npx tsx --test src/mux/pty/tmux.test.ts
 *
 * The scripted ExecLike stands in for a substrate handle so the session
 * lifecycle can be asserted without a sandbox.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { openTmuxPty } from "./tmux.js";
import type { ExecResult, ExecStreamEvent } from "../types.js";

const SNAPSHOT_MARKER = "__AM_SNAPSHOT__";

type Recorder = {
	exec: (command: string, options?: { timeoutMs?: number }) => Promise<ExecResult>;
	execBackground: (command: string) => Promise<void>;
	execStream: (command: string) => AsyncGenerator<ExecStreamEvent, void, void>;
	execCalls: string[];
	backgroundCalls: string[];
	streamCalls: string[];
};

function recorder(options: { offset?: number; snapshot?: string } = {}): Recorder {
	const execCalls: string[] = [];
	const backgroundCalls: string[] = [];
	const streamCalls: string[] = [];
	const offset = options.offset ?? 0;
	const snapshot = options.snapshot ?? "";
	return {
		execCalls,
		backgroundCalls,
		streamCalls,
		async exec(command) {
			execCalls.push(command);
			// The setup round trip reports "<offset>\n__AM_SNAPSHOT__\n<pane>".
			const stdout = command.includes(SNAPSHOT_MARKER)
				? `${offset}\n${SNAPSHOT_MARKER}\n${snapshot}`
				: "";
			return { stdout, stderr: "", exitCode: 0, durationMs: 1 };
		},
		async execBackground(command) {
			backgroundCalls.push(command);
		},
		async *execStream(command) {
			streamCalls.push(command);
			yield { type: "stdout", data: "delta-after-attach" };
			yield { type: "exit", exitCode: 0 };
		},
	};
}

test("attach replays the pane snapshot before streaming deltas", async () => {
	const target = recorder({ offset: 4096, snapshot: "restored screen\n" });
	const pty = await openTmuxPty(target, { session: "keepme" });

	const decoder = new TextDecoder();
	let received = "";
	for await (const bytes of pty.output) {
		received += decoder.decode(bytes);
	}
	assert.equal(received, "restored screen\ndelta-after-attach");
	// The tail must resume from the reported byte offset, not from zero.
	assert.match(target.streamCalls[0], /tail -c \+4097 -f/);
});

test("named sessions detach on close; unnamed sessions are reaped", async () => {
	const named = recorder();
	const namedPty = await openTmuxPty(named, { session: "keepme" });
	await namedPty.close();
	assert.equal(
		named.execCalls.some((call) => call.includes("kill-session")),
		false,
		"a named session must survive close() so the next open can reattach",
	);

	const anonymous = recorder();
	const anonymousPty = await openTmuxPty(anonymous, {});
	await anonymousPty.close();
	assert.equal(
		anonymous.execCalls.some((call) => call.includes("kill-session")),
		true,
		"an unnamed session has no reattach handle, so close() reaps it",
	);
});

test("input is sent as hex send-keys and resize goes to the session", async () => {
	const target = recorder();
	const pty = await openTmuxPty(target, { session: "keepme", cols: 100, rows: 30 });

	await pty.write("hi\n");
	const send = target.backgroundCalls.find((call) => call.includes("send-keys"));
	assert.ok(send, "write() uses tmux send-keys");
	// "hi\n" -> 68 69 0a
	assert.match(send, /-H -t 'keepme' 68 69 0a/);

	await pty.resize(120, 40);
	const resize = target.backgroundCalls.find((call) => call.includes("resize-window"));
	assert.ok(resize, "resize() uses tmux resize-window");
	assert.match(resize, /-x 120 -y 40/);
});

test("setup creates the session with the requested geometry and log wiring", async () => {
	const target = recorder();
	await openTmuxPty(target, { session: "sized", cols: 133, rows: 42 });
	const setup = target.execCalls[0];
	assert.match(setup, /new-session -d -s 'sized' -x 133 -y 42/);
	assert.match(setup, /pipe-pane -o -t 'sized'/);
	assert.match(setup, /has-session -t 'sized'/);
	assert.ok(!setup.includes("\n"), "setup must stay a single shell line");
});

test("setup failure surfaces the exit code and output", async () => {
	const target = recorder();
	target.exec = async () => ({
		stdout: "",
		stderr: "tmux: not found",
		exitCode: 127,
		durationMs: 1,
	});
	await assert.rejects(
		openTmuxPty(target, { session: "broken" }),
		/exit 127.*tmux: not found/s,
	);
});
