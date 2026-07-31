/**
 * Tests for src/mux/config.ts: resolution defaults, env indirection,
 * bare env fallbacks, provider string shorthand, kind validation, and
 * JSON file loading (explicit path + discovery).
 *
 * Run: tsx --test src/mux/config.test.ts
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadMuxConfig, resolveMuxConfig } from "./config.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";

/** Unique suffix so parallel test runs never collide on env var names. */
const UNIQUE = `${process.pid}_${Date.now()}`;

/**
 * Set (value) or delete (undefined) env vars for the duration of fn,
 * restoring the previous state afterwards. Config resolution reads
 * process.env, so every env-sensitive assertion runs inside this.
 */
function withEnv<T>(
	overrides: Record<string, string | undefined>,
	fn: () => T,
): T {
	const saved = new Map<string, string | undefined>();
	for (const [name, value] of Object.entries(overrides)) {
		saved.set(name, process.env[name]);
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	try {
		return fn();
	} finally {
		for (const [name, value] of saved) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

function inTempDir<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "am-mux-config-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("resolveMuxConfig applies route, agent and timeout defaults", () => {
	const config = resolveMuxConfig({});
	assert.equal(config.sandboxes.primary, "e2b");
	assert.deepEqual(config.sandboxes.backups, ["sprites", "vercel", "dedalus"]);
	assert.equal(config.agents.default, "claude-code");
	assert.equal(config.defaults.timeoutMs, 300_000);
	assert.equal(config.defaults.model, undefined);
});

test("resolveMuxConfig excludes a custom primary from the default backups", () => {
	const config = resolveMuxConfig({ sandboxes: { primary: "vercel" } });
	assert.equal(config.sandboxes.primary, "vercel");
	assert.deepEqual(config.sandboxes.backups, ["e2b", "sprites", "dedalus"]);
});

test("env: indirection resolves through the named variable", () => {
	const name = `AM_TEST_E2B_${UNIQUE}`;
	withEnv({ [name]: "indirect-e2b-key", E2B_API_KEY: "bare-should-lose" }, () => {
		const config = resolveMuxConfig({
			providers: { e2b: { apiKey: `env:${name}` } },
		});
		assert.equal(config.providers.e2b?.apiKey, "indirect-e2b-key");
	});
});

test("env: indirection to an unset variable falls through to the bare env var", () => {
	const name = `AM_TEST_MISSING_${UNIQUE}`;
	withEnv({ [name]: undefined, E2B_API_KEY: "bare-e2b-key" }, () => {
		const config = resolveMuxConfig({
			providers: { e2b: { apiKey: `env:${name}` } },
		});
		assert.equal(config.providers.e2b?.apiKey, "bare-e2b-key");
	});
	withEnv({ [name]: undefined, E2B_API_KEY: undefined }, () => {
		const config = resolveMuxConfig({
			providers: { e2b: { apiKey: `env:${name}` } },
		});
		// Fail closed: nothing resolvable means undefined, never a throw.
		assert.equal(config.providers.e2b?.apiKey, undefined);
	});
});

test("bare environment variables back-fill credentials", () => {
	withEnv(
		{
			E2B_API_KEY: "env-e2b",
			SPRITES_TOKEN: "env-sprites",
			SPRITES_API_KEY: undefined,
			VERCEL_TOKEN: "env-vercel-token",
			VERCEL_TEAM_ID: "env-vercel-team",
			VERCEL_PROJECT_ID: "env-vercel-project",
			VERCEL_OIDC_TOKEN: undefined,
			ANTHROPIC_API_KEY: "env-anthropic",
			OPENAI_API_KEY: "env-openai",
			AI_GATEWAY_API_KEY: undefined,
			AI_GATEWAY_KEY: undefined,
			OPENROUTER_API_KEY: undefined,
			DEDALUS_API_KEY: undefined,
			DEDALUS_BASE_URL: undefined,
		},
		() => {
			const config = resolveMuxConfig({});
			assert.equal(config.keys.anthropic, "env-anthropic");
			assert.equal(config.keys.openai, "env-openai");
			assert.equal(config.keys.aiGateway, undefined);
			assert.equal(config.keys.openrouter, undefined);
			assert.equal(config.providers.e2b?.apiKey, "env-e2b");
			assert.equal(config.providers.sprites?.token, "env-sprites");
			assert.equal(config.providers.vercel?.token, "env-vercel-token");
			assert.equal(config.providers.vercel?.teamId, "env-vercel-team");
			assert.equal(config.providers.vercel?.projectId, "env-vercel-project");
			assert.equal(config.providers.vercel?.oidcToken, undefined);
			assert.equal(config.providers.dedalus?.apiKey, undefined);
			assert.equal(
				config.providers.dedalus?.baseUrl,
				"https://dcs.dedaluslabs.ai",
			);
		},
	);
});

test("SPRITES_API_KEY is accepted as an alternate sprites token variable", () => {
	withEnv({ SPRITES_TOKEN: undefined, SPRITES_API_KEY: "alt-sprites" }, () => {
		const config = resolveMuxConfig({});
		assert.equal(config.providers.sprites?.token, "alt-sprites");
	});
});

test("string shorthand for providers expands to the credential object", () => {
	withEnv(
		{
			E2B_API_KEY: "env-should-lose",
			SPRITES_TOKEN: "env-should-lose",
			DEDALUS_API_KEY: "env-should-lose",
		},
		() => {
			const config = resolveMuxConfig({
				providers: {
					e2b: "raw-key",
					sprites: "raw-token",
					dedalus: "raw-dedalus",
				},
			});
			assert.equal(config.providers.e2b?.apiKey, "raw-key");
			assert.equal(config.providers.sprites?.token, "raw-token");
			assert.equal(config.providers.dedalus?.apiKey, "raw-dedalus");
		},
	);
});

test("invalid sandbox and agent kinds are rejected with MuxError fatal", () => {
	assert.throws(
		() =>
			resolveMuxConfig({
				sandboxes: { primary: "firecracker" as SubstrateKind },
			}),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "fatal" &&
			/firecracker/.test(error.message),
	);
	assert.throws(
		() =>
			resolveMuxConfig({
				sandboxes: { primary: "e2b", backups: ["lambda" as SubstrateKind] },
			}),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "fatal" &&
			/lambda/.test(error.message),
	);
	assert.throws(
		() => resolveMuxConfig({ agents: { default: "autogpt" as HarnessKind } }),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "fatal" &&
			/autogpt/.test(error.message),
	);
});

test("loadMuxConfig reads an explicit path (absolute and cwd-relative)", () => {
	inTempDir((dir) => {
		const file = join(dir, "mux.json");
		writeFileSync(
			file,
			JSON.stringify({
				sandboxes: { primary: "vercel", backups: ["e2b"] },
				agents: { default: "codex" },
				defaults: { timeoutMs: 1234 },
			}),
			"utf8",
		);

		const byAbsolute = loadMuxConfig(file);
		assert.equal(byAbsolute.sandboxes.primary, "vercel");
		assert.deepEqual(byAbsolute.sandboxes.backups, ["e2b"]);
		assert.equal(byAbsolute.agents.default, "codex");
		assert.equal(byAbsolute.defaults.timeoutMs, 1234);

		const byRelative = loadMuxConfig("mux.json", dir);
		assert.equal(byRelative.sandboxes.primary, "vercel");
		assert.equal(byRelative.defaults.timeoutMs, 1234);
	});
});

test("loadMuxConfig discovers agent-machines.json in cwd", () => {
	inTempDir((dir) => {
		writeFileSync(
			join(dir, "agent-machines.json"),
			JSON.stringify({
				sandboxes: { primary: "sprites" },
				defaults: { timeoutMs: 4321 },
			}),
			"utf8",
		);
		const config = loadMuxConfig(undefined, dir);
		assert.equal(config.sandboxes.primary, "sprites");
		assert.equal(config.defaults.timeoutMs, 4321);
	});
});

test("loadMuxConfig falls back to pure defaults when no config file exists", () => {
	inTempDir((dir) => {
		const config = loadMuxConfig(undefined, dir);
		assert.equal(config.sandboxes.primary, "e2b");
		assert.equal(config.agents.default, "claude-code");
		assert.equal(config.defaults.timeoutMs, 300_000);
	});
});

test("invalid JSON in a config file throws MuxError fatal", () => {
	inTempDir((dir) => {
		const file = join(dir, "broken.json");
		writeFileSync(file, "{ this is not json", "utf8");
		assert.throws(
			() => loadMuxConfig(file),
			(error: unknown) =>
				error instanceof MuxError &&
				error.kind === "fatal" &&
				/Invalid JSON/.test(error.message),
		);

		// Discovery must not silently skip a corrupt config file either.
		writeFileSync(join(dir, "agent-machines.json"), "{ nope", "utf8");
		assert.throws(
			() => loadMuxConfig(undefined, dir),
			(error: unknown) => error instanceof MuxError && error.kind === "fatal",
		);
	});
});
