/**
 * Tests for the openclaw harness adapter. (hermes has its own suite in
 * hermes.test.ts -- keeping duplicate hermes assertions here is what let
 * them drift out of date.)
 *
 * Run: npx tsx --test src/mux/harnesses/daemon-agents.test.ts
 */

import { packageNameOf } from "./node-runtime.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";

import { MuxError } from "../types.js";
import { hermesHarness } from "./hermes.js";
import { openclawHarness } from "./openclaw.js";

const B64_IN_COMMAND = /"\$\(echo ([A-Za-z0-9+/=]+) \| base64 -d\)"/;

function decodePromptFromCommand(command: string): string {
	const b64 = command.match(B64_IN_COMMAND)?.[1];
	assert.ok(b64, `no base64 prompt substitution in: ${command}`);
	return Buffer.from(b64, "base64").toString("utf8");
}

test("adapter identity and upstream gating", () => {
	assert.equal(openclawHarness.kind, "openclaw");
	assert.equal(openclawHarness.requiredUpstream, "any");
	assert.equal(hermesHarness.kind, "hermes");
	assert.equal(hermesHarness.requiredUpstream, "any");
});

test("openclaw parses the full ok envelope into text + result", () => {
	const events = openclawHarness.parseLine(
		JSON.stringify({
			status: "ok",
			result: { payloads: [{ text: "hello from openclaw" }] },
		}),
	);
	assert.deepEqual(events, [
		{ type: "text", delta: "hello from openclaw" },
		{ type: "result", text: "hello from openclaw", sessionId: undefined },
	]);
});

test("openclaw parses bare payloads and bare text envelopes", () => {
	const payloads = openclawHarness.parseLine(
		JSON.stringify({ payloads: [{ text: "part one" }, { text: "part two" }] }),
	);
	assert.equal(payloads.length, 2);
	assert.deepEqual(payloads[0], { type: "text", delta: "part one\npart two" });
	assert.equal(payloads[1]?.type, "result");
	assert.equal(
		payloads[1]?.type === "result" ? payloads[1].text : "",
		"part one\npart two",
	);

	const bare = openclawHarness.parseLine(JSON.stringify({ text: "just text" }));
	assert.deepEqual(bare[0], { type: "text", delta: "just text" });
	assert.equal(bare[1]?.type, "result");
});

test("openclaw surfaces sessionId from the envelope when present", () => {
	const events = openclawHarness.parseLine(
		JSON.stringify({
			status: "ok",
			result: { payloads: [{ text: "hi" }], sessionId: "sess-42" },
		}),
	);
	assert.equal(events[1]?.type, "result");
	assert.equal(
		events[1]?.type === "result" ? events[1].sessionId : undefined,
		"sess-42",
	);
});

test("openclaw parses error envelopes", () => {
	assert.deepEqual(
		openclawHarness.parseLine(
			JSON.stringify({ status: "error", error: { message: "boom" } }),
		),
		[{ type: "error", message: "boom" }],
	);
	// Tolerate a string error field and a top-level message fallback.
	assert.deepEqual(
		openclawHarness.parseLine(JSON.stringify({ status: "error", error: "bad" })),
		[{ type: "error", message: "bad" }],
	);
	assert.deepEqual(
		openclawHarness.parseLine(
			JSON.stringify({ status: "error", message: "top-level" }),
		),
		[{ type: "error", message: "top-level" }],
	);
	const fallback = openclawHarness.parseLine(JSON.stringify({ status: "error" }));
	assert.equal(fallback.length, 1);
	assert.equal(fallback[0]?.type, "error");
});

test("openclaw ignores garbage and status noise without throwing", () => {
	const noise = [
		"Booting local agent...",
		"{ not json at all",
		'{"status":"ok"}',
		'{"status":"running","label":"thinking"}',
		"[1,2,3]",
		"null",
		"",
		"   ",
		'{"payloads":"not-an-array"}',
		'{"payloads":[{"notext":true}]}',
	];
	for (const line of noise) {
		assert.deepEqual(openclawHarness.parseLine(line), [], `line: ${line}`);
	}
});

test("openclaw runCommand wires keys and round-trips the prompt via base64", () => {
	const prompt = 'say "hi" $(rm -rf /) `backtick` \'single\'\nsecond line';
	const { command, env } = openclawHarness.runCommand(prompt, {
		anthropic: "sk-ant-test",
		openai: "sk-oai-test",
	});
	assert.equal(env.ANTHROPIC_API_KEY, "sk-ant-test");
	assert.equal(env.OPENAI_API_KEY, "sk-oai-test");
	assert.ok(command.includes("openclaw agent --local"));
	// A session target is mandatory even for --local one-shots.
	assert.ok(command.includes("--session-key 'am-mux'"));
	assert.ok(command.includes("--message"));
	assert.ok(command.includes("--json"));
	assert.equal(decodePromptFromCommand(command), prompt);
});

test("openclaw runCommand honors cwd/extraArgs", () => {
	const { command } = openclawHarness.runCommand("hi", { anthropic: "sk-ant" }, {
		cwd: "/work dir",
		extraArgs: ["--verbose", "--max-turns", "3"],
	});
	assert.ok(command.startsWith("cd '/work dir' && "));
	assert.ok(command.includes("--verbose --max-turns 3"));
});

test("openclaw runCommand fails closed with no upstream key at all", () => {
	// Previously this produced an empty env and deferred the failure to the
	// sandbox, after create and install had already been paid for.
	assert.throws(
		() => openclawHarness.runCommand("hi", {}),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "missing_credentials",
	);
	assert.throws(
		() => openclawHarness.interactiveCommand({}),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "missing_credentials",
	);
});

test("openclaw runs on a gateway-only config, no base URL involved", () => {
	// Both gateways are bundled provider plugins keyed on the plain
	// credential var, so the model ref is what names the provider.
	const gateway = openclawHarness.runCommand("hi", { aiGateway: "vck_test" }, {
		model: "vercel-ai-gateway/anthropic/claude-opus-4.6",
	});
	assert.deepEqual(gateway.env, { AI_GATEWAY_API_KEY: "vck_test" });
	assert.ok(
		gateway.command.includes("--model 'vercel-ai-gateway/anthropic/claude-opus-4.6'"),
	);
	assert.ok(!gateway.command.includes("BASE_URL"));

	const router = openclawHarness.runCommand("hi", { openrouter: "sk-or-test" }, {
		model: "openrouter/auto",
	});
	assert.deepEqual(router.env, { OPENROUTER_API_KEY: "sk-or-test" });
	assert.ok(router.command.includes("--model 'openrouter/auto'"));
});

test("openclaw omits --model when none is requested, and --json stays last", () => {
	const { command } = openclawHarness.runCommand("hi", { anthropic: "sk-ant" });
	assert.ok(!command.includes("--model"));
	// The verified-green shape from the live matrix must not drift.
	assert.ok(/--json;? \}$/.test(command), `--json must close the invocation: ${command}`);
});

test("openclaw installCommand guards node engines before npm install", () => {
	const install = openclawHarness.installCommand();
	assert.ok(!install.includes("\n"), "install must be a single line");
	assert.ok(install.includes("node -e"));
	assert.ok(install.includes("npm install --prefix"));
	assert.ok(install.includes("openclaw@2026.7.1-2"));
	for (const floor of ["22.22.3", "24.15.0", "25.9.0"]) {
		assert.ok(install.includes(floor), `guard message mentions ${floor}`);
	}

	// Execute the embedded guard script against fake node versions to
	// verify the strict engine ranges:
	//   >=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0
	const script = install.match(/node -e '([^']+)'/)?.[1];
	assert.ok(script, "guard script is single-quoted for extraction");
	const runGuard = (version: string) => {
		let exitCode: number | undefined;
		let stderr = "";
		const fakeProcess = {
			versions: { node: version },
			exit: (code: number) => {
				exitCode = code;
				throw new Error("exit");
			},
		};
		const fakeConsole = {
			error: (message: string) => {
				stderr += message;
			},
		};
		try {
			new Function("process", "console", script)(fakeProcess, fakeConsole);
		} catch {
			// process.exit throws to stop the script, mirroring node.
		}
		return { passed: exitCode === undefined, stderr };
	};

	for (const good of ["22.22.3", "22.23.0", "24.15.0", "24.16.1", "25.9.0", "25.10.2", "26.0.0"]) {
		assert.equal(runGuard(good).passed, true, `node ${good} should pass`);
	}
	for (const bad of ["18.20.4", "22.21.9", "22.22.2", "23.5.0", "24.14.9", "25.8.1"]) {
		assert.equal(runGuard(bad).passed, false, `node ${bad} should fail`);
	}
	assert.ok(
		runGuard("23.5.0").stderr.includes("23.5.0"),
		"failure message includes the found version",
	);
});

test("parseLine never throws on adversarial input", () => {
	const lines = [
		"{",
		"}",
		'{"status":',
		'{"error":{"message":123}}',
		'{"status":"error","error":[]}',
		'{"result":[]}',
		'{"result":{"payloads":[null,1,"x"]}}',
		" binary",
		"a".repeat(10_000),
	];
	for (const line of lines) {
		assert.doesNotThrow(() => openclawHarness.parseLine(line));
		assert.doesNotThrow(() => hermesHarness.parseLine(line));
	}
});

test("openclaw newTurnParser reassembles pretty-printed multi-line JSON", () => {
	const parse = openclawHarness.newTurnParser?.();
	assert.ok(parse, "openclaw exposes a per-run parser");
	// Shape recorded live from `openclaw agent --local --json` (2026-07-31):
	// the envelope is pretty-printed, so no single line is valid JSON.
	const lines = [
		"{",
		'  "payloads": [',
		"    {",
		'      "text": "MUX-OK",',
		'      "mediaUrl": null',
		"    }",
		"  ],",
		'  "meta": {',
		'    "agentMeta": { "sessionId": "sess-live-1" }',
		"  }",
		"}",
	];
	const events = lines.flatMap((line) => parse(line));
	assert.deepEqual(events, [
		{ type: "text", delta: "MUX-OK" },
		{ type: "result", text: "MUX-OK", sessionId: undefined },
	]);
});

test("openclaw newTurnParser ignores leading status noise and handles NDJSON", () => {
	const parse = openclawHarness.newTurnParser?.();
	assert.ok(parse);
	assert.deepEqual(parse("Booting local agent..."), []);
	const single = parse(
		JSON.stringify({ status: "ok", result: { payloads: [{ text: "hi" }] } }),
	);
	assert.equal(single.length, 2);
	assert.deepEqual(single[0], { type: "text", delta: "hi" });
});

test("openclaw newTurnParser survives braces inside strings", () => {
	const parse = openclawHarness.newTurnParser?.();
	assert.ok(parse);
	const events = [
		"{",
		'  "payloads": [{ "text": "brace } inside \\" string {" }]',
		"}",
	].flatMap((line) => parse(line));
	assert.equal(events.length, 2);
	assert.deepEqual(events[0], {
		type: "text",
		delta: 'brace } inside " string {',
	});
});

test("openclaw newTurnParser resyncs instead of wedging on unbalanced output", () => {
	const parse = openclawHarness.newTurnParser?.();
	assert.ok(parse);
	// An unterminated object must not swallow everything that follows.
	assert.deepEqual(parse('{"payloads": [{"text": "never closed"'), []);
	const filler = "x".repeat(100_000);
	for (let i = 0; i < 25; i += 1) parse(filler);
	// After resyncing, a well-formed envelope still parses.
	const events = parse(
		JSON.stringify({ status: "ok", result: { payloads: [{ text: "back" }] } }),
	);
	assert.equal(events.length, 2, "parser recovered after the wedge guard");
	assert.deepEqual(events[0], { type: "text", delta: "back" });
});

test("npm installs clear a partial tree for that package only", () => {
	const install = openclawHarness.installCommand();
	// A killed or hung earlier attempt leaves a tree npm cannot always
	// replace (ENOTEMPTY on rmdir), and sprites keep their filesystem, so
	// the failure would persist forever without this.
	assert.match(install, /rm -rf "\$HOME\/\.agent-machines\/pkgs\/node_modules\/openclaw"/);
	// Sibling harnesses on the same sandbox must survive.
	assert.ok(
		!/rm -rf "\$HOME\/\.agent-machines\/pkgs\/node_modules"/.test(install),
		"must not wipe the whole package tree",
	);
});

test("packageNameOf keeps scopes and strips versions", () => {
	assert.equal(packageNameOf("openclaw@2026.7.1-2"), "openclaw");
	assert.equal(packageNameOf("@anthropic-ai/claude-code@2.1.220"), "@anthropic-ai/claude-code");
	assert.equal(packageNameOf("openclaw"), "openclaw");
	assert.equal(packageNameOf("@scope/pkg"), "@scope/pkg");
});

test("openclaw interactive command carries env and the bootstrapped PATH", () => {
	// hermes coverage lives in hermes.test.ts; keeping a second copy here is
	// what let these assertions drift out of date once already.
	const claw = openclawHarness.interactiveCommand({ anthropic: "sk-ant" });
	assert.match(
		claw.command,
		/PATH="\$HOME\/\.agent-machines\/node\/bin/,
		"the TUI must see the bootstrapped node, not the image's",
	);
	assert.match(claw.command, /openclaw/);
	assert.equal(claw.env.ANTHROPIC_API_KEY, "sk-ant");
});
