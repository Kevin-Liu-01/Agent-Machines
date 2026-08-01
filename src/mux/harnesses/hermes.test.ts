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
