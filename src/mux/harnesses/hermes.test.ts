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

test("parseLine passes plain text through as deltas", () => {
	assert.deepEqual(hermesHarness.parseLine("MUX-OK"), [
		{ type: "text", delta: "MUX-OK\n" },
	]);
	assert.deepEqual(hermesHarness.parseLine("  indented  "), [
		{ type: "text", delta: "  indented  \n" },
	]);
	// JSON-looking output is still just text: hermes has no NDJSON mode,
	// so nothing here may try to interpret it.
	assert.deepEqual(hermesHarness.parseLine('{"type":"result"}'), [
		{ type: "text", delta: '{"type":"result"}\n' },
	]);
});

test("parseLine drops blank lines and emits no result event", () => {
	assert.deepEqual(hermesHarness.parseLine(""), []);
	assert.deepEqual(hermesHarness.parseLine("   "), []);
	assert.deepEqual(hermesHarness.parseLine("\t"), []);
	const events = ["one", "", "two"].flatMap((line) =>
		hermesHarness.parseLine(line),
	);
	assert.deepEqual(events, [
		{ type: "text", delta: "one\n" },
		{ type: "text", delta: "two\n" },
	]);
	assert.ok(
		events.every((event) => event.type === "text"),
		"the router synthesizes done/result; the adapter must not",
	);
	assert.equal(
		hermesHarness.newTurnParser,
		undefined,
		"plain text needs no per-turn state",
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
