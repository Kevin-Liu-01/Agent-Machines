/**
 * Route resolution for the hosted control-plane client (./sdk.ts).
 *
 * The only real decision this module makes is the model, and it used to make
 * it wrong: every agent defaulted to `anthropic/claude-opus-4-8`, so
 * `create({ agent: "codex" })` produced a route that cannot run. Codex speaks
 * the OpenAI Responses wire format (src/mux/harnesses/codex.ts,
 * src/mux/upstreams.ts) and the hosted bootstrap pins it to the native OpenAI
 * API (web/lib/bootstrap/runner.ts `resolveUpstream`, mirrored client-side by
 * `requiredNativeUpstream` in web/lib/agents/upstreams.ts).
 *
 * Which credential can drive which CLI is already decided once, in
 * src/mux/upstreams.ts. That table is the source here rather than a second
 * hand-written copy, so adding a harness or changing its wire format cannot
 * leave this module silently stale.
 *
 * Model ids are namespaced per upstream (docs/UPSTREAMS.md): a gateway needs
 * the provider prefix, a native key does not take one. This module therefore
 * refuses a prefix its agent's pinned upstream cannot serve instead of
 * passing it on -- an unservable id is otherwise a 404 at request time, long
 * after the route "succeeded", which is the failure docs/UPSTREAMS.md calls
 * out explicitly.
 */

import { MuxError } from "../mux/types.js";
import { usableUpstreams, type UpstreamChoice } from "../mux/upstreams.js";

export type AgentKind = "hermes" | "openclaw" | "claude-code" | "codex";
export type SandboxKind = "dedalus" | "e2b" | "sprites" | "vercel";

/**
 * Same set as the mux's `HARNESS_KINDS`, in this module's own order. Exported
 * so a test can assert the two never diverge -- `nativeUpstreamFor` reads the
 * mux table by key, and a kind the mux does not know would fail at runtime,
 * not at build time.
 */
export const AGENT_KINDS: readonly AgentKind[] = [
	"hermes",
	"openclaw",
	"claude-code",
	"codex",
];

/** A first-party model API, as opposed to a gateway in front of several. */
export type NativeUpstream = "anthropic" | "openai";

export type MachineSpec = {
	vcpu: number;
	memoryMib: number;
	storageGib: number;
};

export type AgentRoute = {
	agent: AgentKind;
	sandbox: SandboxKind;
	model: string;
	/**
	 * The native API this agent is locked to, or null when it can be pointed
	 * at any gateway. Carried on the route so the model default is explainable
	 * without re-deriving it, the same reason the mux carries
	 * `machine.attempts`.
	 */
	upstream: NativeUpstream | null;
	persistent: boolean;
	spec: MachineSpec;
	name?: string;
	gatewayProfileId?: string | null;
	environmentProfileId?: string | null;
};

export type AgentCreateInput = {
	agent: AgentKind;
	sandbox: SandboxKind;
	model?: string;
	persistent?: boolean;
	spec?: Partial<MachineSpec>;
	name?: string;
	gatewayProfileId?: string | null;
	environmentProfileId?: string | null;
};

const DEFAULT_SPEC: MachineSpec = {
	vcpu: 1,
	memoryMib: 2048,
	storageGib: 10,
};

/**
 * Shorthand the dashboard model picker accepts, expanded to the ids the
 * control plane stores. Anthropic-only because these are the only shorthands
 * the product ever published; an unknown value is passed through untouched
 * rather than prefixed on a guess.
 */
const MODEL_ALIASES: Record<string, string> = {
	"claude-opus-4.8": "anthropic/claude-opus-4-8",
	"claude-opus-4.7": "anthropic/claude-opus-4-7",
	"claude-opus-4-8": "anthropic/claude-opus-4-8",
	"claude-opus-4-7": "anthropic/claude-opus-4-7",
	"claude-sonnet-4.6": "anthropic/claude-sonnet-4-6",
	"claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
	"sonnet-4.6": "anthropic/claude-sonnet-4-6",
};

/**
 * Default model per upstream namespace.
 *
 * Neither id is chosen here: `anthropic/claude-opus-4-8` is the control
 * plane's own `DEFAULT_MODEL` (web/lib/user-config/schema.ts) and
 * `openai/gpt-5.2` is the first OpenAI entry the dashboard picker offers
 * (web/lib/dashboard/model-catalog.ts). The SDK default is therefore whatever
 * the dashboard already defaults to, per upstream, and never a new id.
 */
const DEFAULT_MODEL: Record<NativeUpstream, string> = {
	anthropic: "anthropic/claude-opus-4-8",
	openai: "openai/gpt-5.2",
};

function isNativeUpstream(choice: UpstreamChoice): choice is NativeUpstream {
	return choice === "anthropic" || choice === "openai";
}

/**
 * The native API `agent` is locked to, or null when a gateway can stand in.
 *
 * Derived, not declared: a harness whose usable-upstream order admits exactly
 * one native provider cannot be served by the other one, which is precisely
 * the distinction the hosted bootstrap encodes when it sends codex to
 * api.openai.com and claude-code to api.anthropic.com. Hermes and OpenClaw
 * accept either native key, so nothing is pinned and any gateway is legal.
 */
export function nativeUpstreamFor(agent: AgentKind): NativeUpstream | null {
	const natives = usableUpstreams(agent).filter(isNativeUpstream);
	return natives.length === 1 ? natives[0] : null;
}

/** Provider segment of a namespaced id, or null for a bare native id. */
function modelNamespace(model: string): string | null {
	const slash = model.indexOf("/");
	return slash > 0 ? model.slice(0, slash) : null;
}

/**
 * Expand shorthand, apply the agent's default, and refuse an id the agent's
 * pinned upstream cannot serve.
 *
 * This throws rather than warning because the alternative is worse than
 * useless: a wrong-namespace id provisions a machine, bootstraps it, and only
 * then 404s on the first turn, having already spent sandbox time. `agent` is
 * optional so the historic single-argument call still expands aliases; with
 * no agent there is no upstream to be aware of, so the Anthropic default
 * stands in as it always did.
 */
export function normalizeModel(model: string | undefined, agent?: AgentKind): string {
	const upstream = agent ? nativeUpstreamFor(agent) : null;
	const trimmed = model?.trim();
	// Gateway agents (hermes, openclaw) have no pinned namespace, so they take
	// the account-level default the dashboard shows.
	if (!trimmed) return DEFAULT_MODEL[upstream ?? "anthropic"];
	const resolved = MODEL_ALIASES[trimmed] ?? trimmed;
	if (!agent || !upstream) return resolved;
	const namespace = modelNamespace(resolved);
	if (namespace && namespace !== upstream) {
		throw new MuxError(
			"not_supported",
			`${agent} is locked to the native ${upstream} API, so it cannot serve model "${resolved}" (namespace "${namespace}"). Pass a ${upstream} model id, or an id with no provider prefix.`,
			{ harness: agent },
		);
	}
	return resolved;
}

export function resolveAgentRoute(input: AgentCreateInput): AgentRoute {
	return {
		agent: input.agent,
		sandbox: input.sandbox,
		model: normalizeModel(input.model, input.agent),
		upstream: nativeUpstreamFor(input.agent),
		persistent: input.persistent ?? true,
		spec: {
			vcpu: input.spec?.vcpu ?? DEFAULT_SPEC.vcpu,
			memoryMib: input.spec?.memoryMib ?? DEFAULT_SPEC.memoryMib,
			storageGib: input.spec?.storageGib ?? DEFAULT_SPEC.storageGib,
		},
		name: input.name,
		gatewayProfileId: input.gatewayProfileId ?? null,
		environmentProfileId: input.environmentProfileId ?? null,
	};
}
