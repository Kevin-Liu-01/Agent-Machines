/**
 * Tests for upstream resolution across the harness plane.
 *
 * Run: npx tsx --test src/mux/upstreams.test.ts
 *
 * The cases encode the researched wire formats, not preferences: a gateway
 * appears in a harness's route only where that gateway actually serves the
 * protocol the CLI speaks, and anything else is a rejection with a message
 * naming both what was found and what would work.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { MuxError, type UpstreamKeys } from "./types.js";
import {
	AI_GATEWAY_ANTHROPIC_BASE_URL,
	AI_GATEWAY_OPENAI_BASE_URL,
	OPENROUTER_ANTHROPIC_BASE_URL,
	OPENROUTER_OPENAI_BASE_URL,
	requireUpstream,
	resolveUpstream,
	shellShadowExports,
	usableUpstreams,
} from "./upstreams.js";

const ANTHROPIC = "sk-ant-test-anthropic";
const OPENAI = "sk-test-openai";
const GATEWAY = "vck_test-ai-gateway";
const OPENROUTER = "sk-or-v1-test-openrouter";

const ALL: UpstreamKeys = {
	anthropic: ANTHROPIC,
	openai: OPENAI,
	aiGateway: GATEWAY,
	openrouter: OPENROUTER,
};

/** Narrow to the success arm with a readable failure when it is not. */
function ok(harness: Parameters<typeof resolveUpstream>[0], keys: UpstreamKeys) {
	const resolution = resolveUpstream(harness, keys);
	assert.ok(
		resolution.ok,
		`expected ${harness} to resolve, got: ${
			resolution.ok ? "" : resolution.reason
		}`,
	);
	return resolution;
}

function failure(
	harness: Parameters<typeof resolveUpstream>[0],
	keys: UpstreamKeys,
): string {
	const resolution = resolveUpstream(harness, keys);
	assert.equal(resolution.ok, false, `expected ${harness} to be rejected`);
	return resolution.ok ? "" : resolution.reason;
}

// --- native key wins ------------------------------------------------------

test("native key wins over both gateways, per harness", () => {
	assert.equal(ok("claude-code", ALL).chosen, "anthropic");
	assert.equal(ok("codex", ALL).chosen, "openai");
	assert.equal(ok("openclaw", ALL).chosen, "anthropic");
	assert.equal(ok("hermes", ALL).chosen, "anthropic");
});

test("claude-code native: api key only, no base URL redirect", () => {
	const { env } = ok("claude-code", { anthropic: ANTHROPIC, aiGateway: GATEWAY });
	assert.equal(env.ANTHROPIC_API_KEY, ANTHROPIC);
	assert.equal(env.IS_SANDBOX, "1");
	assert.ok(!("ANTHROPIC_BASE_URL" in env), "native run must not be redirected");
	assert.ok(!("ANTHROPIC_AUTH_TOKEN" in env));
});

test("codex native: no config overrides, key under both env names", () => {
	const resolved = ok("codex", { openai: OPENAI, openrouter: OPENROUTER });
	assert.deepEqual(resolved.args, []);
	assert.equal(resolved.env.CODEX_API_KEY, OPENAI);
	assert.equal(resolved.env.OPENAI_API_KEY, OPENAI);
});

// --- gateway-only configs -------------------------------------------------

test("claude-code on the Vercel AI Gateway: base URL, auth token, emptied key", () => {
	const { chosen, env, args } = ok("claude-code", { aiGateway: GATEWAY });
	assert.equal(chosen, "aiGateway");
	assert.equal(env.ANTHROPIC_BASE_URL, AI_GATEWAY_ANTHROPIC_BASE_URL);
	assert.equal(env.ANTHROPIC_AUTH_TOKEN, GATEWAY);
	// Present and empty, not absent: a non-empty inherited value would win.
	assert.ok("ANTHROPIC_API_KEY" in env);
	assert.equal(env.ANTHROPIC_API_KEY, "");
	assert.equal(env.IS_SANDBOX, "1");
	assert.deepEqual(args, [], "claude-code needs no CLI flags for a gateway");
});

test("claude-code on OpenRouter: its Anthropic-compatible base, not /api/v1", () => {
	// OpenRouter is OpenAI-shaped for chat completions but also serves a
	// native Anthropic Messages endpoint, so it does drive claude-code.
	const { chosen, env } = ok("claude-code", { openrouter: OPENROUTER });
	assert.equal(chosen, "openrouter");
	assert.equal(env.ANTHROPIC_BASE_URL, OPENROUTER_ANTHROPIC_BASE_URL);
	assert.equal(env.ANTHROPIC_BASE_URL, "https://openrouter.ai/api");
	assert.equal(env.ANTHROPIC_AUTH_TOKEN, OPENROUTER);
	assert.equal(env.ANTHROPIC_API_KEY, "");
});

test("claude-code prefers the Vercel gateway over OpenRouter when both are set", () => {
	assert.equal(ok("claude-code", { aiGateway: GATEWAY, openrouter: OPENROUTER }).chosen, "aiGateway");
});

test("codex on a gateway: named model provider via -c, base URL keeps /v1", () => {
	const gateway = ok("codex", { aiGateway: GATEWAY });
	assert.equal(gateway.chosen, "aiGateway");
	assert.equal(gateway.env.AI_GATEWAY_API_KEY, GATEWAY);
	assert.ok(
		!("CODEX_API_KEY" in gateway.env),
		"a gateway token must not masquerade as an OpenAI credential",
	);
	const args = gateway.args.join(" ");
	assert.ok(args.includes('model_provider="am_vercel_gateway"'));
	assert.ok(
		args.includes(`model_providers.am_vercel_gateway.base_url="${AI_GATEWAY_OPENAI_BASE_URL}"`),
	);
	// codex POSTs <base_url>/responses, so the /v1 segment is load-bearing.
	assert.ok(gateway.args.some((arg) => arg.includes("https://ai-gateway.vercel.sh/v1")));
	assert.ok(args.includes('model_providers.am_vercel_gateway.env_key="AI_GATEWAY_API_KEY"'));
	assert.ok(args.includes('model_providers.am_vercel_gateway.wire_api="responses"'));

	const router = ok("codex", { openrouter: OPENROUTER });
	assert.equal(router.chosen, "openrouter");
	assert.equal(router.env.OPENROUTER_API_KEY, OPENROUTER);
	const routerArgs = router.args.join(" ");
	assert.ok(routerArgs.includes('model_provider="am_openrouter"'));
	assert.ok(
		routerArgs.includes(`model_providers.am_openrouter.base_url="${OPENROUTER_OPENAI_BASE_URL}"`),
	);
	assert.ok(routerArgs.includes('model_providers.am_openrouter.env_key="OPENROUTER_API_KEY"'));
});

test("codex never overrides a reserved provider id", () => {
	// The ids openai/ollama/lmstudio are reserved, so pointing the built-in
	// provider at a gateway silently does nothing.
	for (const keys of [{ aiGateway: GATEWAY }, { openrouter: OPENROUTER }]) {
		const args = ok("codex", keys).args.join(" ");
		assert.ok(!args.includes('model_provider="openai"'));
		assert.ok(!args.includes("model_providers.openai."));
	}
});

test("openclaw takes gateway credentials with no base URL and no flags", () => {
	const gateway = ok("openclaw", { aiGateway: GATEWAY });
	assert.equal(gateway.chosen, "aiGateway");
	assert.deepEqual(gateway.env, { AI_GATEWAY_API_KEY: GATEWAY });
	assert.deepEqual(gateway.args, []);

	const router = ok("openclaw", { openrouter: OPENROUTER });
	assert.equal(router.chosen, "openrouter");
	assert.deepEqual(router.env, { OPENROUTER_API_KEY: OPENROUTER });
});

test("openclaw forwards every credential it can use, not just the preferred one", () => {
	// Its provider is chosen by the model ref, so dropping the other keys
	// would break a config whose primary model is on another provider.
	const { env } = ok("openclaw", ALL);
	assert.deepEqual(env, {
		ANTHROPIC_API_KEY: ANTHROPIC,
		OPENAI_API_KEY: OPENAI,
		AI_GATEWAY_API_KEY: GATEWAY,
		OPENROUTER_API_KEY: OPENROUTER,
	});
});

// --- wrong wire format is rejected, actionably -----------------------------

test("claude-code rejects an OpenAI-only config with an actionable message", () => {
	const reason = failure("claude-code", { openai: OPENAI });
	assert.match(reason, /claude-code/);
	assert.match(reason, /Anthropic Messages wire format/);
	assert.match(reason, /keys\.openai \(OPENAI_API_KEY\)/, "names what was found");
	assert.match(reason, /keys\.anthropic \(ANTHROPIC_API_KEY\)/, "names the fix");
	assert.match(reason, /keys\.aiGateway/);
	assert.match(reason, /keys\.openrouter/);
});

test("codex rejects an Anthropic-only config with an actionable message", () => {
	const reason = failure("codex", { anthropic: ANTHROPIC });
	assert.match(reason, /OpenAI Responses wire format/);
	assert.match(reason, /keys\.anthropic \(ANTHROPIC_API_KEY\)/);
	assert.match(reason, /keys\.openai \(OPENAI_API_KEY\)/);
	assert.match(reason, /keys\.aiGateway \(AI_GATEWAY_API_KEY\)/);
});

test("hermes rejects gateway keys: its adapter implements no gateway lever", () => {
	const reason = failure("hermes", { aiGateway: GATEWAY, openrouter: OPENROUTER });
	assert.match(reason, /native provider keys only/);
	const [found, fix] = reason.split("Set one of:");
	assert.ok(fix, `message must offer a fix: ${reason}`);
	assert.match(found, /keys\.aiGateway \(AI_GATEWAY_API_KEY\)/);
	assert.match(found, /keys\.openrouter \(OPENROUTER_API_KEY\)/);
	assert.equal(
		fix.trim(),
		"keys.anthropic (ANTHROPIC_API_KEY), keys.openai (OPENAI_API_KEY).",
		"a gateway must never be offered as the fix for hermes",
	);
});

// --- no key at all fails closed -------------------------------------------

test("no key at all fails closed for every harness", () => {
	for (const harness of ["claude-code", "codex", "openclaw", "hermes"] as const) {
		const reason = failure(harness, {});
		assert.match(reason, /no model upstream configured/);
		assert.match(reason, new RegExp(`^${harness} `));
	}
});

test("empty-string keys count as absent", () => {
	// config.ts normalizes missing env to undefined, but a hand-written JSON
	// config can carry "" -- treating it as present would ship a broken run.
	const reason = failure("claude-code", { anthropic: "", aiGateway: "" });
	assert.match(reason, /no model upstream configured/);
});

test("requireUpstream throws MuxError missing_credentials scoped to the harness", () => {
	assert.throws(
		() => requireUpstream("codex", { anthropic: ANTHROPIC }),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "missing_credentials" &&
			error.harness === "codex",
	);
	assert.equal(requireUpstream("codex", { openai: OPENAI }).chosen, "openai");
});

// --- route table + helpers -------------------------------------------------

test("usableUpstreams reports the researched routes in precedence order", () => {
	assert.deepEqual(usableUpstreams("claude-code"), [
		"anthropic",
		"aiGateway",
		"openrouter",
	]);
	assert.deepEqual(usableUpstreams("codex"), ["openai", "aiGateway", "openrouter"]);
	assert.deepEqual(usableUpstreams("openclaw"), [
		"anthropic",
		"openai",
		"aiGateway",
		"openrouter",
	]);
	assert.deepEqual(usableUpstreams("hermes"), ["anthropic", "openai"]);
});

test("no credential value ever leaks into the CLI args", () => {
	for (const harness of ["claude-code", "codex", "openclaw", "hermes"] as const) {
		const args = ok(harness, ALL).args.join(" ");
		for (const secret of [ANTHROPIC, OPENAI, GATEWAY, OPENROUTER]) {
			assert.ok(!args.includes(secret), `${harness} leaked a key into argv`);
		}
	}
});

test("shellShadowExports re-asserts only empty values", () => {
	assert.equal(shellShadowExports({}), "");
	assert.equal(shellShadowExports({ A: "1" }), "");
	assert.equal(shellShadowExports({ A: "" }), "export A=; ");
	assert.equal(shellShadowExports({ A: "", B: "1", C: "" }), "export A=; export C=; ");
	// The claude-code gateway env is the real caller.
	const { env } = ok("claude-code", { openrouter: OPENROUTER });
	assert.equal(shellShadowExports(env), "export ANTHROPIC_API_KEY=; ");
});
