/**
 * Which model upstream can drive which harness, and what env it needs.
 *
 * MuxConfig has always accepted `keys.aiGateway` and `keys.openrouter`, but
 * every adapter injected only native ANTHROPIC_API_KEY / OPENAI_API_KEY, so
 * a gateway-only config could not drive any agent. Pointing a harness at a
 * gateway is not one rule: each CLI exposes a different lever, and a gateway
 * only qualifies when it serves the wire format that CLI speaks. That
 * decision lives here once instead of in four private `requireXKey` helpers.
 *
 * Precedence is always native key first, then a gateway that genuinely
 * serves the harness's wire format. A key that cannot serve it is a hard
 * rejection with an actionable reason, never a hopeful attempt.
 *
 * What was verified, and where (2026-08-01):
 *
 *   claude-code -- ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN, with
 *     ANTHROPIC_API_KEY set to the empty string. Verified locally against
 *     claude-code 2.1.215: with those three set and the base URL pointed at
 *     a dead port, `claude -p` reported `apiKeySource: "none"` and retried
 *     against the custom host (ConnectionRefused), so the base URL is
 *     honored and the empty key suppresses native auth. Both gateways
 *     document exactly this trio: Vercel
 *     (vercel.com/docs/ai-gateway/coding-agents/claude-code, base
 *     https://ai-gateway.vercel.sh) and OpenRouter
 *     (openrouter.ai/blog/tutorials/claude-code-openrouter, base
 *     https://openrouter.ai/api). OpenRouter's Anthropic-compatible
 *     endpoint ("Anthropic Skin") is native, no proxy -- the older claim
 *     that OpenRouter is OpenAI-shaped only is wrong for this harness.
 *
 *   codex -- a named `model_providers.<id>` entry, not a base-URL env var.
 *     The ids `openai`, `ollama` and `lmstudio` are reserved, so overriding
 *     the built-in provider is not a route to a gateway. `-c key=value`
 *     applies a TOML overlay above every config file and is documented on
 *     both `codex` and `codex exec`. Verified locally against the pinned
 *     codex-cli 0.146.0: `-c model_provider=... -c
 *     model_providers.<id>.base_url="http://127.0.0.1:9/v1"` sent the turn
 *     to `http://127.0.0.1:9/v1/responses`, so the override reaches the
 *     transport and base_url must include `/v1`. `wire_api` has exactly one
 *     supported value, "responses" (chat completions was removed in 0.122);
 *     it is set explicitly so the override is self-describing.
 *     Gateway blocks come from vercel.com/docs/ai-gateway/coding-agents/
 *     openai-codex (https://ai-gateway.vercel.sh/v1, AI_GATEWAY_API_KEY)
 *     and openrouter.ai/blog/tutorials/codex-cli-openrouter
 *     (https://openrouter.ai/api/v1, OPENROUTER_API_KEY).
 *
 *   openclaw -- no base URL needed. Both gateways ship as bundled provider
 *     plugins keyed on the plain credential env var: provider `openrouter`
 *     via OPENROUTER_API_KEY and provider `vercel-ai-gateway` via
 *     AI_GATEWAY_API_KEY (openclaw/openclaw docs/concepts/model-providers.md).
 *     Model refs are `provider/model`, e.g. `openrouter/auto` or
 *     `vercel-ai-gateway/anthropic/claude-opus-4.6`, and `openclaw agent`
 *     takes `--model <id>` (docs.openclaw.ai/cli/agent).
 *
 *   hermes -- deliberately native-only here. Its adapter (not owned by this
 *     module) injects ANTHROPIC_API_KEY / OPENAI_API_KEY and nothing else,
 *     so claiming gateway support would be claiming an unimplemented
 *     capability.
 */

import { MuxError, type HarnessKind, type UpstreamKeys } from "./types.js";

export type UpstreamChoice = "anthropic" | "openai" | "aiGateway" | "openrouter";

export const UPSTREAM_CHOICES: readonly UpstreamChoice[] = [
	"anthropic",
	"openai",
	"aiGateway",
	"openrouter",
];

/** Conventional env var each key is read from, used in failure messages. */
const KEY_ENV_NAME: Record<UpstreamChoice, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	aiGateway: "AI_GATEWAY_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

/**
 * Anthropic-Messages bases. The client appends `/v1/messages`, so these stop
 * short of `/v1` -- OpenRouter's Anthropic endpoint lives under `/api`,
 * which is why its base differs from the OpenAI-shaped one below.
 */
export const AI_GATEWAY_ANTHROPIC_BASE_URL = "https://ai-gateway.vercel.sh";
export const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";

/** OpenAI-Responses bases. Codex appends `/responses`, so `/v1` is included. */
export const AI_GATEWAY_OPENAI_BASE_URL = "https://ai-gateway.vercel.sh/v1";
export const OPENROUTER_OPENAI_BASE_URL = "https://openrouter.ai/api/v1";

export type UpstreamSuccess = {
	readonly ok: true;
	readonly chosen: UpstreamChoice;
	/** Env the harness needs inside the sandbox. */
	readonly env: Record<string, string>;
	/**
	 * Raw argv tokens the harness must pass for this upstream (codex config
	 * overrides). Tokens are unquoted: the adapter splices them into its own
	 * shell command and is responsible for quoting.
	 */
	readonly args: readonly string[];
};

export type UpstreamFailure = {
	readonly ok: false;
	readonly reason: string;
};

export type UpstreamResolution = UpstreamSuccess | UpstreamFailure;

type HarnessUpstreams = {
	/** Preference order: native key first, then gateways that fit the wire. */
	readonly order: readonly UpstreamChoice[];
	/** `key` is the resolved non-empty credential for `chosen`. */
	readonly env: (
		chosen: UpstreamChoice,
		key: string,
		keys: UpstreamKeys,
	) => Record<string, string>;
	readonly args?: (chosen: UpstreamChoice) => string[];
	/** Clause explaining what this harness can consume, for rejections. */
	readonly wire: string;
};

/**
 * A `-c`/`--config` overlay declaring a named codex model provider. Values
 * are parsed as TOML by codex, hence the inner double quotes.
 */
function codexProviderArgs(input: {
	id: string;
	name: string;
	baseUrl: string;
	envKey: string;
}): string[] {
	const { id, name, baseUrl, envKey } = input;
	return [
		"-c",
		`model_provider="${id}"`,
		"-c",
		`model_providers.${id}.name="${name}"`,
		"-c",
		`model_providers.${id}.base_url="${baseUrl}"`,
		"-c",
		`model_providers.${id}.env_key="${envKey}"`,
		"-c",
		`model_providers.${id}.wire_api="responses"`,
	];
}

const UPSTREAMS: Record<HarnessKind, HarnessUpstreams> = {
	"claude-code": {
		order: ["anthropic", "aiGateway", "openrouter"],
		wire: "speaks the Anthropic Messages wire format",
		env(chosen, key) {
			// IS_SANDBOX=1 is unrelated to the upstream but always required:
			// --dangerously-skip-permissions refuses to run as root otherwise.
			const env: Record<string, string> = { IS_SANDBOX: "1" };
			if (chosen === "anthropic") {
				env.ANTHROPIC_API_KEY = key;
				return env;
			}
			env.ANTHROPIC_BASE_URL =
				chosen === "aiGateway"
					? AI_GATEWAY_ANTHROPIC_BASE_URL
					: OPENROUTER_ANTHROPIC_BASE_URL;
			env.ANTHROPIC_AUTH_TOKEN = key;
			// Present and empty, not absent: Claude Code reads
			// ANTHROPIC_API_KEY first, so a non-empty value inherited from the
			// sandbox image would silently win over the gateway token.
			env.ANTHROPIC_API_KEY = "";
			return env;
		},
	},

	codex: {
		order: ["openai", "aiGateway", "openrouter"],
		wire: "speaks the OpenAI Responses wire format",
		env(chosen, key) {
			if (chosen === "openai") {
				// `codex exec` honors CODEX_API_KEY, while the built-in
				// provider's documented env_key is OPENAI_API_KEY. Same value
				// under both names so either resolution path finds it.
				return { CODEX_API_KEY: key, OPENAI_API_KEY: key };
			}
			// A gateway authenticates through the provider's env_key, so the
			// credential is published under its own conventional name only.
			return { [KEY_ENV_NAME[chosen]]: key };
		},
		args(chosen) {
			if (chosen === "aiGateway") {
				return codexProviderArgs({
					id: "am_vercel_gateway",
					name: "Vercel AI Gateway",
					baseUrl: AI_GATEWAY_OPENAI_BASE_URL,
					envKey: KEY_ENV_NAME.aiGateway,
				});
			}
			if (chosen === "openrouter") {
				return codexProviderArgs({
					id: "am_openrouter",
					name: "OpenRouter",
					baseUrl: OPENROUTER_OPENAI_BASE_URL,
					envKey: KEY_ENV_NAME.openrouter,
				});
			}
			return [];
		},
	},

	openclaw: {
		order: ["anthropic", "openai", "aiGateway", "openrouter"],
		wire: "resolves models through its own bundled provider plugins",
		env(_chosen, _key, keys) {
			// OpenClaw picks the provider itself from whatever credentials it
			// can see, so every key we hold is forwarded rather than only the
			// preferred one. Narrowing to one would break a config whose
			// primary model belongs to another provider.
			const env: Record<string, string> = {};
			if (keys.anthropic) env.ANTHROPIC_API_KEY = keys.anthropic;
			if (keys.openai) env.OPENAI_API_KEY = keys.openai;
			if (keys.aiGateway) env.AI_GATEWAY_API_KEY = keys.aiGateway;
			if (keys.openrouter) env.OPENROUTER_API_KEY = keys.openrouter;
			return env;
		},
	},

	hermes: {
		order: ["anthropic", "openai"],
		wire: "reads native provider keys only (no gateway lever is implemented in its adapter)",
		env(_chosen, _key, keys) {
			const env: Record<string, string> = {};
			if (keys.anthropic) env.ANTHROPIC_API_KEY = keys.anthropic;
			if (keys.openai) env.OPENAI_API_KEY = keys.openai;
			return env;
		},
	},
};

/** Upstreams that can actually drive `harness`, in preference order. */
export function usableUpstreams(harness: HarnessKind): readonly UpstreamChoice[] {
	return UPSTREAMS[harness].order;
}

function describe(choices: readonly UpstreamChoice[]): string {
	return choices
		.map((choice) => `keys.${choice} (${KEY_ENV_NAME[choice]})`)
		.join(", ");
}

function explain(
	harness: HarnessKind,
	table: HarnessUpstreams,
	keys: UpstreamKeys,
): string {
	const present = UPSTREAM_CHOICES.filter((choice) => Boolean(keys[choice]));
	const usable = describe(table.order);
	if (present.length === 0) {
		return `${harness} has no model upstream configured. Set one of: ${usable}.`;
	}
	// The keys on hand are real but wrong-shaped, which is a different fix
	// from having none: name both halves so the message is actionable.
	return `${harness} ${table.wire}, so ${describe(present)} cannot drive it. Set one of: ${usable}.`;
}

/**
 * Resolve the upstream for a harness, fail-closed. Never throws: callers
 * that want an error use `requireUpstream`.
 */
export function resolveUpstream(
	harness: HarnessKind,
	keys: UpstreamKeys,
): UpstreamResolution {
	const table = UPSTREAMS[harness];
	for (const choice of table.order) {
		const key = keys[choice];
		if (!key) continue;
		return {
			ok: true,
			chosen: choice,
			env: table.env(choice, key, keys),
			args: table.args?.(choice) ?? [],
		};
	}
	return { ok: false, reason: explain(harness, table, keys) };
}

/** Same resolution, as a MuxError("missing_credentials") on failure. */
export function requireUpstream(
	harness: HarnessKind,
	keys: UpstreamKeys,
): UpstreamSuccess {
	const resolution = resolveUpstream(harness, keys);
	if (!resolution.ok) {
		throw new MuxError("missing_credentials", resolution.reason, { harness });
	}
	return resolution;
}

/**
 * Re-assert empty-valued env vars as shell exports.
 *
 * ANTHROPIC_API_KEY has to be present and empty for Claude Code to fall
 * through to ANTHROPIC_AUTH_TOKEN, but an empty value is exactly what a
 * transport is most likely to drop: substrates hand `env` to a vendor SDK
 * (E2B `envs`, Vercel `env`) whose treatment of "" is not guaranteed. The
 * command carries the assignment itself so the shadow survives regardless.
 * Returns "" when there is nothing to re-assert.
 */
export function shellShadowExports(env: Record<string, string>): string {
	const empty = Object.keys(env).filter((name) => env[name] === "");
	if (empty.length === 0) return "";
	return `${empty.map((name) => `export ${name}=`).join("; ")}; `;
}
