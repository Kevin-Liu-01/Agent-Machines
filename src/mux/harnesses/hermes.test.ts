/**
 * Hermes harness adapter tests. Run with: tsx --test
 *
 * The install shape carries most of the risk here: hermes is the one
 * harness whose vendor installer could not finish inside a sandbox
 * budget, so these assert that the recipe stays a pinned, wheel-only,
 * apt-free, single-line, idempotent command -- and that a machine which
 * cannot run it is told to bake an image instead of being billed for the
 * whole budget.
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import type { MuxAgentEvent } from "../events.js";
import type { UpstreamKeys } from "../types.js";
import { hermesHarness } from "./hermes.js";

const KEYS: UpstreamKeys = {
	anthropic: "sk-ant-test",
	openai: "sk-openai-test",
};

/** Recover the prompt from the base64 command substitution. */
function decodePrompt(command: string): string {
	const match = command.match(/echo ([A-Za-z0-9+/=]+) \| base64 -d/);
	assert.ok(match, `command does not embed a base64 prompt: ${command}`);
	return Buffer.from(match[1], "base64").toString("utf8");
}

test("adapter identity and static commands", () => {
	assert.equal(hermesHarness.kind, "hermes");
	assert.equal(hermesHarness.requiredUpstream, "any");
	assert.match(hermesHarness.versionCommand(), /hermes --version$/);
	assert.match(
		hermesHarness.versionCommand(),
		/^PATH="\$HOME\/\.local\/bin:/,
		"the version probe must find the launcher before PATH is set up",
	);
});

test("probe accepts a pre-baked hermes wherever an image can put it", () => {
	const probe = hermesHarness.isInstalledCommand();
	assert.match(probe, /command -v hermes/, "an on-PATH hermes counts");
	assert.match(
		probe,
		/test -x "\$HOME\/\.local\/bin\/hermes"/,
		"the uv-tool launcher counts",
	);
	assert.match(
		probe,
		/test -x "\/opt\/hermes\/bin\/hermes"/,
		"the published container's exec shim counts",
	);
	assert.ok(!probe.includes("\n"), "probe must stay a single shell line");
});

test("every directory the probe accepts is on the run command's PATH", () => {
	// Otherwise a pre-baked image passes the probe, the router skips the
	// install, and the run dies with exit 127.
	const probe = hermesHarness.isInstalledCommand();
	const dirs = [...probe.matchAll(/test -x "([^"]+)\/hermes"/g)].map(
		(match) => match[1],
	);
	assert.ok(dirs.length > 0, "probe should test explicit paths");
	const { command } = hermesHarness.runCommand("hi", KEYS);
	const prefix = command.match(/^PATH="([^"]+)"/);
	assert.ok(prefix, `run command must carry a PATH prefix: ${command}`);
	const onPath = prefix[1].split(":");
	for (const dir of dirs) {
		assert.ok(
			onPath.includes(dir),
			`${dir} passes the probe but is not on the run PATH (${prefix[1]})`,
		);
	}
});

test("install pins the wheel, the extra and the installer version", () => {
	const install = hermesHarness.installCommand();
	assert.match(
		install,
		/'hermes-agent\[anthropic\]==0\.19\.0'/,
		"the wheel spec must be pinned and quoted (brackets are shell globs)",
	);
	assert.match(
		install,
		/astral\.sh\/uv\/0\.11\.30\/install\.sh/,
		"uv itself must be pinned, not 'latest'",
	);
	assert.match(install, /--python 3\.13/, "hermes requires >=3.11,<3.14");
});

test("install is a single line and idempotent", () => {
	const install = hermesHarness.installCommand();
	assert.ok(!install.includes("\n"), "install must stay a single shell line");
	assert.ok(
		install.startsWith(hermesHarness.isInstalledCommand()),
		"install must short-circuit on the same probe the router uses",
	);
	assert.match(
		install,
		/tool install --force/,
		"a partial tool env from a killed attempt must be replaced, not reused",
	);
	assert.match(
		install,
		/test -x "\$HOME\/\.agent-machines\/uv\/uv" \|\|/,
		"uv must be fetched only when our private copy is missing",
	);
});

test("install never reaches for apt or the vendor curl installer", () => {
	const install = hermesHarness.installCommand();
	for (const forbidden of [
		"apt",
		"sudo",
		"npm",
		"playwright",
		"ffmpeg",
		"hermes-agent.nousresearch.com/install.sh",
		"git clone",
	]) {
		assert.ok(
			!install.includes(forbidden),
			`install must not use ${forbidden}: that path exhausted E2B and outran the budget on Sprites`,
		);
	}
});

test("install pipes are guarded so a failed download cannot look like success", () => {
	const install = hermesHarness.installCommand();
	assert.match(install, /set -o pipefail; curl -fsSL/);
	assert.match(
		install,
		/UV_TOOL_BIN_DIR="\$HOME\/\.local\/bin"/,
		"the launcher must land where the probe looks",
	);
	assert.match(
		install,
		/UV_INSTALL_DIR="\$HOME\/\.agent-machines\/uv"/,
		"uv must not overwrite a shared or user-owned uv",
	);
	assert.match(install, /UV_NO_MODIFY_PATH=1/);
});

test("an image that cannot install is told what to bake, and exits nonzero", () => {
	const install = hermesHarness.installCommand();
	assert.match(install, /command -v curl >\/dev\/null 2>&1 \|\| \{ echo /);
	assert.match(install, /exit 1/, "the guard must fail, not warn and continue");
	assert.match(
		install,
		/nousresearch\/hermes-agent:v2026\.7\.30/,
		"name the pre-baked image",
	);
	assert.match(
		install,
		/install: false/,
		"say how to use a pre-baked image from the router",
	);
	assert.match(
		install,
		/uv tool install --python 3\.13/,
		"say what to bake for a custom template",
	);
	// The router only echoes the last 800 bytes of the install log, so a
	// hint longer than that would be truncated out of the error.
	const hint = install.match(/echo (.*) >&2/);
	assert.ok(hint, "the hint must be one echo argument redirected to stderr");
	assert.ok(
		hint[1].startsWith("'") && hint[1].endsWith("'"),
		`the hint must stay quoted as one word: ${hint[1]}`,
	);
	assert.ok(
		hint[1].length < 800,
		`hint is ${hint[1].length} bytes; the router's log tail is 800`,
	);
});

test("install budget is bounded well below the vendor installer's", () => {
	// 40 minutes was the apt-era budget; a wheel-only install that hangs
	// must not hold a sandbox open that long.
	const budget = hermesHarness.installBudgetMs;
	assert.equal(typeof budget, "number");
	assert.ok(
		budget !== undefined && budget <= 900_000,
		"budget must not exceed 15 minutes",
	);
	assert.ok(
		budget !== undefined && budget > 328_000,
		"budget must still cover the 328s measured on a cold sprite",
	);
});

/** A fresh per-turn parser, as the router builds one for every run. */
function turnParser(): (line: string) => MuxAgentEvent[] {
	const make = hermesHarness.newTurnParser;
	assert.ok(
		make,
		"the diagnostic filter is per-turn state, so newTurnParser is required",
	);
	return make.call(hermesHarness);
}

/** The router's own accumulation rule: RunResult.text is the text deltas. */
function accumulate(events: readonly MuxAgentEvent[]): string {
	return events
		.filter((event) => event.type === "text")
		.map((event) => event.delta)
		.join("");
}

test("parseLine passes plain text through as deltas", () => {
	const parse = turnParser();
	assert.deepEqual(parse("MUX-OK"), [{ type: "text", delta: "MUX-OK\n" }]);
	assert.deepEqual(parse("  indented  "), [
		{ type: "text", delta: "  indented  \n" },
	]);
	// JSON-looking output is still just text: hermes has no NDJSON mode,
	// so nothing here may try to interpret it.
	assert.deepEqual(parse('{"type":"result"}'), [
		{ type: "text", delta: '{"type":"result"}\n' },
	]);
});

test("parseLine drops blank lines and emits no result event", () => {
	const parse = turnParser();
	assert.deepEqual(parse(""), []);
	assert.deepEqual(parse("   "), []);
	assert.deepEqual(parse("\t"), []);
	const events = ["one", "", "two"].flatMap((line) => parse(line));
	assert.deepEqual(events, [
		{ type: "text", delta: "one\n" },
		{ type: "text", delta: "two\n" },
	]);
	assert.ok(
		events.every((event) => event.type === "text"),
		"the router synthesizes done/result; the adapter must not",
	);
});

test("the tirith warning is kept out of the answer but not thrown away", () => {
	// The exact leak in docs/MUX-RESULTS.md "Known cosmetic issue": hermes
	// prints this before the answer and the plain-text parser used to hand
	// it to the router as a text delta, so RunResult.text opened with it.
	const warning =
		"tirith security scanner enabled but not available - command scanning will use pattern matching only";
	const parse = turnParser();
	const events = [warning, "MUX-OK"].flatMap((line) => parse(line));

	assert.equal(
		accumulate(events),
		"MUX-OK\n",
		"the vendor warning must not reach RunResult.text",
	);
	const statuses = events.filter((event) => event.type === "status");
	assert.equal(statuses.length, 1, "the warning must still be reported");
	assert.deepEqual(statuses[0], { type: "status", label: warning });
	assert.ok(
		!events.some((event) => event.type === "error"),
		"a degraded scanner is not a failed run",
	);
});

test("the diagnostic is recognized whatever punctuation follows the head", () => {
	// The tail was recorded through an ASCII-only doc, so its dash could be
	// a hyphen, an em dash (written here as an escape so this source stays
	// ASCII), or absent. Matching the head keeps all three working; matching
	// the whole line would silently stop filtering.
	for (const tail of [
		"",
		" -- command scanning will use pattern matching only",
		" \u2014 command scanning will use pattern matching only",
		": falling back to pattern matching",
	]) {
		const parse = turnParser();
		const events = parse(
			`tirith security scanner enabled but not available${tail}`,
		);
		assert.deepEqual(
			events.map((event) => event.type),
			["status"],
			`tail ${JSON.stringify(tail)} should still be a diagnostic`,
		);
	}
});

test("a real answer that looks like a warning is preserved", () => {
	// The case that makes a tone-based filter unusable: the user asked what
	// the warning means, so the agent's FIRST line is the warning text plus
	// an explanation. Two separate guards have to hold for this to survive.
	const parse = turnParser();
	const answer =
		'The line "tirith security scanner enabled but not available" means hermes could not load its command scanner.';
	const events = parse(answer);
	assert.deepEqual(events, [{ type: "text", delta: `${answer}\n` }]);
	assert.equal(accumulate(events), `${answer}\n`);
});

test("a diagnostic quoted inside an answer is preserved", () => {
	// Guard 2 on its own: once the turn has produced answer text, a later
	// line is the answer even when it reproduces the banner verbatim -- an
	// agent asked to echo hermes's startup output must not lose it.
	const warning = "tirith security scanner enabled but not available";
	const parse = turnParser();
	const events = ["Hermes printed:", warning].flatMap((line) => parse(line));
	assert.equal(accumulate(events), `Hermes printed:\n${warning}\n`);
	assert.ok(
		!events.some((event) => event.type === "status"),
		"nothing after the first answer line may be reclassified",
	);
});

test("only recorded vendor phrases are filtered, not warnings in general", () => {
	// Anything that merely reads like noise stays in the answer. If a new
	// hermes diagnostic shows up, it gets measured and added by hand.
	for (const line of [
		"WARNING: this is not a recorded hermes diagnostic",
		"warning: deprecated flag",
		"tirith security scanner enabled",
		"[warn] security scanner enabled but not available",
		"Error: something went wrong",
	]) {
		const parse = turnParser();
		assert.deepEqual(
			parse(line),
			[{ type: "text", delta: `${line}\n` }],
			`${line} must not be filtered`,
		);
	}
});

test("each turn gets its own filter state", () => {
	const warning = "tirith security scanner enabled but not available";
	const first = turnParser();
	first("MUX-OK");
	assert.deepEqual(
		first(warning).map((event) => event.type),
		["text"],
		"the first turn already saw text",
	);
	const second = turnParser();
	assert.deepEqual(
		second(warning).map((event) => event.type),
		["status"],
		"a fresh turn starts before any answer text again",
	);
});

test("runCommand round-trips arbitrary prompt bytes", () => {
	// Non-ASCII is written as escapes so this source stays ASCII while the
	// prompt under test does not: base64 must survive both.
	const prompt = `line one\n'single' "double" $(whoami) \`id\` \\ backslash \u2014 \u4e2d`;
	const { command } = hermesHarness.runCommand(prompt, KEYS);
	assert.equal(decodePrompt(command), prompt);
	assert.ok(
		command.includes(`--quiet -q "$(echo `),
		`unexpected invocation: ${command}`,
	);
	assert.ok(!command.includes("whoami\n"), "prompt must not be inlined raw");
});

test("runCommand honors cwd and extraArgs", () => {
	const { command } = hermesHarness.runCommand("hi", KEYS, {
		cwd: "/workspace/my repo",
		extraArgs: ["--model", "anthropic/claude-sonnet-4.6"],
	});
	assert.ok(command.startsWith("cd '/workspace/my repo' && PATH="));
	assert.ok(command.endsWith(" --model anthropic/claude-sonnet-4.6"));
});

test("keys are wired through env, never argv", () => {
	const both = hermesHarness.runCommand("hi", KEYS);
	assert.deepEqual(both.env, {
		OPENAI_API_KEY: "sk-openai-test",
		ANTHROPIC_API_KEY: "sk-ant-test",
	});
	assert.ok(!both.command.includes("sk-ant-test"));
	assert.ok(!both.command.includes("sk-openai-test"));

	assert.deepEqual(
		hermesHarness.runCommand("hi", { anthropic: "a" }).env,
		{ ANTHROPIC_API_KEY: "a" },
		"an anthropic-only config must not invent an OpenAI key",
	);
	assert.deepEqual(hermesHarness.runCommand("hi", { openai: "o" }).env, {
		OPENAI_API_KEY: "o",
	});
	// Gateway keys have no hermes env mapping, so they must not leak in as
	// something else: the router's "any" gate is what rejects this config.
	assert.deepEqual(
		hermesHarness.runCommand("hi", { aiGateway: "g", openrouter: "r" }).env,
		{},
	);
});

test("the provider is pinned to the key that is actually injected", () => {
	// Measured live: with no --provider, hermes resolves an unauthenticated
	// provider and prints "HTTP 401: Missing Authentication header" while
	// still exiting 0, so the router would return the 401 as the answer.
	assert.match(
		hermesHarness.runCommand("hi", KEYS).command,
		/hermes chat --provider anthropic --quiet/,
		"anthropic wins when both keys are present",
	);
	assert.match(
		hermesHarness.runCommand("hi", { anthropic: "a" }).command,
		/--provider anthropic /,
	);
	assert.match(
		hermesHarness.runCommand("hi", { openai: "o" }).command,
		/--provider openai-api /,
		"the OpenAI provider id is openai-api; hermes rejects 'openai'",
	);
	// No key means no claim about which provider is authenticated; the
	// router's upstream gate is what rejects that config.
	assert.ok(
		!hermesHarness.runCommand("hi", {}).command.includes("--provider"),
	);
	// extraArgs land after the pinned flag so a caller can override it.
	const overridden = hermesHarness.runCommand("hi", KEYS, {
		extraArgs: ["--provider", "openrouter"],
	});
	assert.ok(
		overridden.command.indexOf("--provider anthropic") <
			overridden.command.lastIndexOf("--provider openrouter"),
	);
});

test("interactiveCommand starts the TUI with the same PATH, provider and env", () => {
	const { command, env } = hermesHarness.interactiveCommand(KEYS);
	assert.match(command, /^PATH="[^"]+" hermes --provider anthropic$/);
	assert.deepEqual(env, {
		OPENAI_API_KEY: "sk-openai-test",
		ANTHROPIC_API_KEY: "sk-ant-test",
	});
	assert.ok(!command.includes("sk-ant-test"));
});

test("the tirith diagnostic is filtered as it actually arrives on the wire", () => {
	const parse = hermesHarness.newTurnParser?.();
	assert.ok(parse);
	// EXACT bytes captured from live hermes runs on e2b and sprites
	// (2026-08-01), not the ASCII-normalized form in docs/MUX-RESULTS.md.
	// The leading "\u26a0\ufe0f " is what made the first version of this filter
	// fail open in production while passing its unit tests.
	const wire =
		"\u26a0\ufe0f tirith security scanner enabled but not available \u2014 command scanning will use pattern matching only";
	const events = parse(wire);
	assert.equal(events.length, 1);
	assert.equal(events[0]?.type, "status", "a vendor diagnostic is not answer text");

	// And the answer that follows is still answer text.
	const answer = parse("MUX-OK");
	assert.deepEqual(answer, [{ type: "text", delta: "MUX-OK\n" }]);
});

test("a carriage return from the wire does not defeat the filter", () => {
	// The live capture showed CRLF line endings ("...only\r\nMUX-OK").
	const parse = hermesHarness.newTurnParser?.();
	assert.ok(parse);
	const events = parse(
		"\u26a0\ufe0f tirith security scanner enabled but not available \u2014 command scanning will use pattern matching only\r",
	);
	assert.equal(events[0]?.type, "status");
});

test("undecorating cannot swallow a real answer", () => {
	const parse = hermesHarness.newTurnParser?.();
	assert.ok(parse);
	// An answer that opens with punctuation or a glyph is still an answer: the
	// full distinctive phrase must match, not merely the decoration.
	for (const line of [
		"\u26a0\ufe0f This is the agent's own warning to you.",
		"- tirith is a security scanner; here is what it does.",
		"> tirith security scanner enabled",
	]) {
		const events = parse(line);
		assert.equal(events[0]?.type, "text", `must stay answer text: ${line}`);
	}
});

/**
 * The auxiliary-failure family, reported 2026-08-03.
 *
 * Every fixture below is the real bytes, either captured from a live
 * mux-driven run or taken from the vendor f-string in the pinned 0.19.0
 * wheel. A fixture retyped from a rendered transcript is how the tirith
 * matcher shipped broken, so nothing here is normalized.
 */

/** Bare U+26A0 plus ONE space -- run_agent.py:1197, no variation selector. */
const AUX_SIGIL = "\u26a0 ";

test("the auxiliary warning is filtered as it actually arrives on the wire", () => {
	// EXACT bytes captured 2026-08-03 from a PTY run driven through this
	// adapter's own interactiveCommand() on e2b. Note the sigil: a BARE U+26A0,
	// with NO U+FE0F, unlike the tirith line above. A fixture written as
	// "\u26a0\ufe0f Auxiliary" would pass while the wire form failed.
	const wire = `${AUX_SIGIL}Auxiliary title generation failed: Connection error.`;
	assert.equal(
		wire.codePointAt(0),
		0x26a0,
		"the fixture must start with the warning sign",
	);
	assert.notEqual(
		wire.codePointAt(1),
		0xfe0f,
		"the wire form carries no variation selector -- do not add one",
	);

	const parse = turnParser();
	const events = [wire, "Hi. What do you need?"].flatMap((line) => parse(line));
	assert.equal(
		accumulate(events),
		"Hi. What do you need?\n",
		"the vendor's warning must not reach RunResult.text as the model's words",
	);
	assert.deepEqual(events.filter((event) => event.type === "status"), [
		{ type: "status", label: wire },
	]);
	assert.ok(
		!events.some((event) => event.type === "error"),
		"a failed auxiliary task is not a failed run",
	);
});

test("the reported 400 line is filtered whole, truncation and all", () => {
	// The line the user actually saw. hermes truncates the vendor detail at 217
	// chars and appends its own "..." (run_agent.py:1195-1196), so there is no
	// closing brace to anchor on -- the head is all a matcher gets.
	const reported =
		`${AUX_SIGIL}Auxiliary title generation failed: HTTP 400: Error code: 400 - ` +
		`{'detail': {'error': {'message': 'This request requires streaming. Set "stream": true and retry.', ` +
		`'type': 'invalid_request_error', 'code': 'streaming_required', 'request_id': '019fc8a413df...`;
	const parse = turnParser();
	const events = parse(reported);
	assert.deepEqual(
		events.map((event) => event.type),
		["status"],
		"the upstream's 400 is a vendor diagnostic, not the agent's answer",
	);
	assert.equal(accumulate(events), "");
});

test("one head covers every auxiliary task hermes can run", () => {
	// The warning is built from a single f-string with the task interpolated
	// (run_agent.py:1197), and none of hermes's 34 auxiliary call sites asks for
	// streaming -- so any task can fail this way against an SSE-only endpoint.
	// Matching the family is what makes that a fixed list of one entry instead
	// of a list that grows once per incident report.
	const tasks = [
		// The two labels that reach the emitter in 0.19.0.
		"title generation",
		"background review",
		// hermes_cli/main.py's _AUX_TASKS, any of which can route the same way.
		"vision",
		"compression",
		"web_extract",
		"approval",
		"mcp",
		"title_generation",
		"memory_query_rewrite",
		"tts_audio_tags",
		"skills_hub",
		"triage_specifier",
		"kanban_decomposer",
		"profile_describer",
		"curator",
	];
	for (const task of tasks) {
		const parse = turnParser();
		const events = parse(`${AUX_SIGIL}Auxiliary ${task} failed: Connection error.`);
		assert.deepEqual(
			events.map((event) => event.type),
			["status"],
			`task ${JSON.stringify(task)} must be recognized`,
		);
	}
});

test("the decorated sigil variant is recognized too", () => {
	// The vendor is inconsistent: run_agent.py:1197 emits a bare U+26A0,
	// cli_agent_setup_mixin.py:73 emits U+26A0 U+FE0F. Matching must not depend
	// on which one a given call site chose.
	for (const sigil of ["\u26a0 ", "\u26a0\ufe0f ", "\u26a0\ufe0f  "]) {
		const parse = turnParser();
		const events = parse(`${sigil}Auxiliary title generation failed: x`);
		assert.deepEqual(
			events.map((event) => event.type),
			["status"],
			`sigil ${JSON.stringify(sigil)} must not hide the phrase`,
		);
	}
});

test("an answer about a failed auxiliary task is still the answer", () => {
	// The case a family matcher has to survive: the user asked what the warning
	// meant, so the agent's first line is about it. The head is anchored, so an
	// answer that opens with any other word is untouched.
	const parse = turnParser();
	for (const line of [
		'The warning "Auxiliary title generation failed" means hermes could not title the session.',
		"Auxiliary tasks are optional in hermes.",
		"Auxiliary failed: that is not the vendor's format.",
		"Auxiliary title generation failed silently, with no colon.",
	]) {
		const events = parse(line);
		assert.deepEqual(
			events,
			[{ type: "text", delta: `${line}\n` }],
			`must stay answer text: ${line}`,
		);
	}
});

test("hermes's other ungated stdout writers are not answer text either", () => {
	// These four are the set that can actually reach a `chat --quiet -q` run:
	// they print through _safe_print / _cprint, which have no
	// suppress_status_output gate (unlike _vprint, run_agent.py:854). Verified
	// 2026-08-03 against the pinned wheel; each carries its vendor site.
	const cases: ReadonlyArray<readonly [string, string]> = [
		[
			"agent/conversation_loop.py:2270",
			"\u{1F4BE} Cached context length: 200,000 tokens for claude-fable-5",
		],
		["agent/conversation_loop.py:5143", "  \u27f3 compacting context\u2026"],
		[
			"agent/chat_completion_helpers.py:3529",
			"\u26a0  Streaming is not supported for this model/provider. Switching to non-streaming.",
		],
		[
			"agent/chat_completion_helpers.py:3531 (continuation line)",
			"   To avoid this delay, set display.streaming: false in config.yaml",
		],
		[
			"hermes_cli/cli_agent_setup_mixin.py:73",
			"\u26a0\ufe0f  Primary auth failed \u2014 switching to fallback: openai-api / gpt-5.1",
		],
	];
	for (const [site, wire] of cases) {
		const parse = turnParser();
		const events = [wire, "MUX-OK"].flatMap((line) => parse(line));
		assert.equal(
			accumulate(events),
			"MUX-OK\n",
			`${site} leaked into RunResult.text`,
		);
		assert.equal(
			events.filter((event) => event.type === "status").length,
			1,
			`${site} must still be reported`,
		);
	}
});

test("the streaming notice keeps both of its physical lines out of the answer", () => {
	// chat_completion_helpers.py:3529-3532 is ONE print containing newlines, so
	// the hint arrives as a separate line with no sigil. Without its own head it
	// becomes the first line of the answer -- and it would flip the
	// already-saw-text latch, so every later diagnostic would leak too.
	const parse = turnParser();
	const events = [
		"",
		"\u26a0  Streaming is not supported for this model/provider. Switching to non-streaming.",
		"   To avoid this delay, set display.streaming: false in config.yaml",
		"",
		"MUX-OK",
	].flatMap((line) => parse(line));
	assert.equal(accumulate(events), "MUX-OK\n");
	assert.equal(
		events.filter((event) => event.type === "status").length,
		2,
		"both lines of the notice must be classified",
	);
});

test("ANSI styling cannot hide a diagnostic", () => {
	// The second layer of the same trap. hermes wraps these lines in styling
	// (_DIM = "\\x1b[2;3m", cli.py:2452; the tirith print at cli.py:6217), and a
	// CSI body contains DIGITS, so undecorate() alone stops at the first one and
	// the phrase never matches. The filter only ever worked because the headless
	// lane's stdout is a pipe. First fixture below is the vendor's own wrap;
	// second is the exact prefix captured from a live PTY run 2026-08-03.
	const cases = [
		`  \u001b[2;3m\u26a0 tirith security scanner enabled but not available \u2014 command scanning will use pattern matching only\u001b[0m`,
		`\u001b[0m${AUX_SIGIL}Auxiliary title generation failed: Connection error.\r`,
		// OSC 8 is NOT something hermes was observed to emit -- the claim that
		// agent/display.py builds a clickable hyperlink was false (that file has no
		// escape bytes at all, and cli.py:3473/3505 strips OSC before printing).
		// Kept as a guard on stripAnsi's OSC arm, which is defensive by choice.
		`\u001b]8;;https://example.com\u0007\u26a0 tirith security scanner enabled but not available\u001b]8;;\u0007`,
	];
	for (const wire of cases) {
		const parse = turnParser();
		const events = [wire, "MUX-OK"].flatMap((line) => parse(line));
		assert.equal(
			accumulate(events),
			"MUX-OK\n",
			`styling defeated the filter: ${JSON.stringify(wire)}`,
		);
		const statuses = events.filter((event) => event.type === "status");
		assert.equal(statuses.length, 1);
		assert.ok(
			!statuses[0]?.label.includes("\u001b"),
			`the status label must be de-styled: ${JSON.stringify(statuses[0]?.label)}`,
		);
	}
});

test("the styling stripper holds no state between lines or turns", () => {
	// The strip regexes are module-level and carry the /g flag, which is
	// stateful under .test()/.exec(). If one ever leaked a lastIndex, the
	// SECOND styled diagnostic of a session would slip through -- an
	// intermittent leak that a single-line test could never catch.
	const styled = `  \u001b[2;3m\u26a0 tirith security scanner enabled but not available \u2014 x\u001b[0m`;
	for (let turn = 0; turn < 3; turn += 1) {
		const parse = turnParser();
		for (let line = 0; line < 5; line += 1) {
			assert.deepEqual(
				parse(styled).map((event) => event.type),
				["status"],
				`turn ${turn}, line ${line} was misclassified`,
			);
		}
		assert.equal(accumulate([...parse("MUX-OK")]), "MUX-OK\n");
	}
});

test("an answer keeps its own escape sequences byte for byte", () => {
	// Stripping is for MATCHING and for the status label only. An agent that
	// prints colored output, or explains an escape sequence, must get its bytes
	// back unchanged -- including on the first line of the turn.
	const parse = turnParser();
	const colored = "\u001b[1mBold answer\u001b[0m and \u001b]8;;https://x\u0007link\u001b]8;;\u0007";
	assert.deepEqual(parse(colored), [{ type: "text", delta: `${colored}\n` }]);
	const second = "\u001b[2;3mstill the answer\u001b[0m";
	assert.deepEqual(parse(second), [{ type: "text", delta: `${second}\n` }]);
});

test("a wrapped diagnostic tail is a known limitation, not a silent one", () => {
	// If a terminal hard-wraps the warning, the continuation fragment has no
	// head to match and becomes answer text. That is confined to the PTY lane
	// -- the router never runs parseLine over pty() output -- so it cannot
	// affect RunResult.text today. Asserted rather than assumed, so that if
	// anyone starts parsing the PTY stream this test says what breaks.
	const parse = turnParser();
	const events = [
		`${AUX_SIGIL}Auxiliary title generation failed: HTTP 400: Error code: 400 - {'detail': {'error':`,
		`{'message': 'This request requires streaming. Set "stream": true and retry.', 'type':`,
	].flatMap((line) => parse(line));
	assert.equal(events[0]?.type, "status", "the head line is still classified");
	assert.equal(
		events[1]?.type,
		"text",
		"a wrapped tail has no head to match; only the PTY lane can produce one",
	);
});

// ---------------------------------------------------------------------------
// The bare-print channel
// ---------------------------------------------------------------------------

/**
 * Diagnostics hermes writes with Python's BUILTIN print().
 *
 * This channel is why the first version of VENDOR_DIAGNOSTIC_HEADS was
 * incomplete: it modeled _vprint (gated by --quiet) and _safe_print/_cprint
 * (ungated) and stopped there. print() is ungated by anything this adapter
 * sets, does not route through agent._print_fn, and is used in ~132 places on
 * the `chat -q` turn path. Seven of those reached this parser as text deltas.
 *
 * Every string below is the literal from the pinned wheel (sha256
 * bd0bac01...3bef327f), read out of the source on 2026-08-03 with the
 * `{agent.log_prefix}` prefix removed because agent_init.py:297 defaults it to
 * "". The sigils are deliberately varied and are NOT all U+26A0: three
 * different emoji appear, two of them with a U+FE0F variation selector and one
 * without. A test written from the prose in a report would have normalized all
 * of that away -- which is exactly how this class of bug shipped twice.
 */
const BARE_PRINT_DIAGNOSTICS: ReadonlyArray<{
	readonly where: string;
	readonly line: string;
	/** True when the run still exits 0, so the leak corrupts a SUCCESS. */
	readonly onPassingRun: boolean;
}> = [
	{
		where: "agent/chat_completion_helpers.py:1905",
		line: "⚠️  Reached maximum iterations (90). Requesting summary...",
		onPassingRun: true,
	},
	{
		where: "agent/conversation_loop.py:2961",
		line: "\u{1f510} Anthropic credentials refreshed after 401. Retrying request...",
		onPassingRun: true,
	},
	{
		where: "agent/conversation_loop.py:2965",
		line: "\u{1f510} Anthropic 401 — authentication failed.",
		onPassingRun: false,
	},
	{
		where: "agent/conversation_loop.py:4440",
		line: "❌ All API retries exhausted with no successful response.",
		onPassingRun: false,
	},
	{
		where: "agent/tool_executor.py:346",
		line: "⚡ Interrupt: skipping 3 tool call(s)",
		onPassingRun: false,
	},
	{
		where: "hermes_cli/cli_agent_setup_mixin.py:114",
		line: "⚠️  Provider resolver returned an empty API key. Set OPENROUTER_API_KEY or run: hermes setup",
		onPassingRun: false,
	},
	{
		where: "hermes_cli/cli_agent_setup_mixin.py:118",
		line: "⚠️  Provider resolver returned an empty base URL. Check your provider config or run: hermes setup",
		onPassingRun: false,
	},
];

test("bare print() diagnostics are status, not the model's words", () => {
	for (const { where, line, onPassingRun } of BARE_PRINT_DIAGNOSTICS) {
		const parse = turnParser();
		const events = [line, "MUX-OK"].flatMap((wire) => parse(wire));
		assert.equal(
			accumulate(events),
			"MUX-OK\n",
			`${where} leaked into RunResult.text${
				onPassingRun ? " ON A RUN THAT EXITS 0" : ""
			}: ${JSON.stringify(line)}`,
		);
		assert.ok(
			events.some((event) => event.type === "status"),
			`${where} was dropped instead of reported as status: ${JSON.stringify(line)}`,
		);
	}
});

test("the two diagnostics that leak on a PASSING run are covered", () => {
	// Called out separately because these are the severe ones. The others
	// accompany a run that fails anyway, where a polluted text field is untidy;
	// these two land in the text of a run the router reports as a success, so
	// the caller cannot tell the vendor's line from the model's answer.
	const passing = BARE_PRINT_DIAGNOSTICS.filter((entry) => entry.onPassingRun);
	assert.equal(passing.length, 2, "expected exactly the two known exit-0 leaks");
	for (const { where, line } of passing) {
		const parse = turnParser();
		const events = [line, "The answer is 42."].flatMap((wire) => parse(wire));
		assert.equal(accumulate(events), "The answer is 42.\n", where);
	}
});

test("a bare-print diagnostic does not flip the saw-text latch", () => {
	// The latch matters: once a turn has emitted text, later diagnostics are
	// treated as part of the answer. A vendor line arriving FIRST must not open
	// that gate, or one leak becomes every subsequent leak.
	const parse = turnParser();
	const events = [
		"⚠️  Reached maximum iterations (90). Requesting summary...",
		"⚠ tirith security scanner enabled but not available",
		"MUX-OK",
	].flatMap((wire) => parse(wire));
	assert.equal(accumulate(events), "MUX-OK\n");
});
