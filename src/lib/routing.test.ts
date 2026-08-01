import assert from "node:assert/strict";
import test from "node:test";

import { HARNESS_KINDS } from "../mux/config.js";
import { MuxError } from "../mux/types.js";
import { usableUpstreams } from "../mux/upstreams.js";
import {
	AGENT_KINDS,
	nativeUpstreamFor,
	normalizeModel,
	resolveAgentRoute,
	type AgentKind,
} from "./routing.js";

test("the hosted agent kinds are exactly the mux harness kinds", () => {
	assert.deepEqual([...AGENT_KINDS].sort(), [...HARNESS_KINDS].sort());
});

/**
 * The defect this module was written to fix: every agent defaulted to an
 * Anthropic model, so a codex route could not run. Assert the default per
 * agent, not just that codex differs, so a future edit cannot fix codex by
 * breaking claude-code.
 */
test("the default model matches each agent's upstream", () => {
	assert.equal(normalizeModel(undefined, "codex"), "openai/gpt-5.2");
	assert.equal(
		normalizeModel(undefined, "claude-code"),
		"anthropic/claude-opus-4-8",
	);
	// Gateway agents are not pinned, so they keep the account-level default.
	assert.equal(normalizeModel(undefined, "hermes"), "anthropic/claude-opus-4-8");
	assert.equal(normalizeModel(undefined, "openclaw"), "anthropic/claude-opus-4-8");
});

test("every agent's default model is in its own upstream namespace", () => {
	for (const agent of AGENT_KINDS) {
		const upstream = nativeUpstreamFor(agent);
		if (!upstream) continue;
		assert.ok(
			normalizeModel(undefined, agent).startsWith(`${upstream}/`),
			`${agent} defaults outside its ${upstream} namespace`,
		);
	}
});

test("the pinned upstream is derived from the mux upstream table", () => {
	// Not a restatement of nativeUpstreamFor: this asserts the property the
	// derivation relies on -- exactly one native option means pinned -- against
	// the mux table itself, so a harness whose wire format changes there shows
	// up here instead of silently changing the SDK default.
	const expected: Record<AgentKind, "anthropic" | "openai" | null> = {
		"claude-code": "anthropic",
		codex: "openai",
		openclaw: null,
		hermes: null,
	};
	for (const agent of AGENT_KINDS) {
		const natives = usableUpstreams(agent).filter(
			(choice) => choice === "anthropic" || choice === "openai",
		);
		assert.equal(
			nativeUpstreamFor(agent),
			expected[agent],
			`${agent} pinning changed; mux natives are ${natives.join(", ")}`,
		);
	}
});

test("a wrong-namespace model is refused, not passed through", () => {
	assert.throws(
		() => normalizeModel("anthropic/claude-sonnet-4-6", "codex"),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			// not_supported and not fatal: isRoutableError() must not fail this
			// over to another substrate, because every lane rejects it the same.
			assert.equal(error.kind, "not_supported");
			assert.equal(error.harness, "codex");
			assert.match(error.message, /namespace "anthropic"/);
			return true;
		},
	);
	assert.throws(
		() => normalizeModel("openai/gpt-5.2", "claude-code"),
		/claude-code is locked to the native anthropic API/,
	);
});

test("gateway agents accept either namespace", () => {
	assert.equal(
		normalizeModel("openai/gpt-5.2", "openclaw"),
		"openai/gpt-5.2",
	);
	assert.equal(
		normalizeModel("anthropic/claude-opus-4-8", "hermes"),
		"anthropic/claude-opus-4-8",
	);
});

test("a bare native id is accepted for a pinned agent", () => {
	// docs/UPSTREAMS.md: a native key takes an unprefixed id. There is no
	// namespace to contradict, so there is nothing to reject.
	assert.equal(normalizeModel("gpt-5.2", "codex"), "gpt-5.2");
	assert.equal(
		normalizeModel("claude-sonnet-4-5", "claude-code"),
		"claude-sonnet-4-5",
	);
});

test("aliases expand, and the single-argument call still works", () => {
	assert.equal(normalizeModel("sonnet-4.6"), "anthropic/claude-sonnet-4-6");
	assert.equal(normalizeModel(undefined), "anthropic/claude-opus-4-8");
	assert.equal(normalizeModel("  claude-opus-4.8  "), "anthropic/claude-opus-4-8");
});

test("resolveAgentRoute carries the upstream and fills spec defaults", () => {
	const route = resolveAgentRoute({ agent: "codex", sandbox: "sprites" });
	assert.equal(route.upstream, "openai");
	assert.equal(route.model, "openai/gpt-5.2");
	assert.equal(route.persistent, true);
	assert.deepEqual(route.spec, { vcpu: 1, memoryMib: 2048, storageGib: 10 });
	assert.equal(route.gatewayProfileId, null);

	const sized = resolveAgentRoute({
		agent: "hermes",
		sandbox: "e2b",
		spec: { memoryMib: 8192 },
		persistent: false,
	});
	assert.equal(sized.upstream, null);
	assert.deepEqual(sized.spec, { vcpu: 1, memoryMib: 8192, storageGib: 10 });
	assert.equal(sized.persistent, false);
});
