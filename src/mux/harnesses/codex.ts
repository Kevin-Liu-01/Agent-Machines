/**
 * Codex harness adapter (@openai/codex 0.146.x, Rust binary via npm).
 *
 * Recipes only: this module builds shell command strings that run INSIDE
 * a sandbox and normalizes `codex exec --json` JSONL output into
 * MuxAgentEvents. There is no vendor SDK to import lazily -- the CLI is
 * installed on the sandbox via npm.
 *
 * Auth: resolved by ../upstreams.ts. Natively that is CODEX_API_KEY in the
 * process env (honored by `codex exec`); an OpenAI-Responses gateway
 * instead arrives as `-c model_providers.<id>.*` overrides plus that
 * gateway's own credential env var. No credential is ever placed in argv.
 * Codex's own Landlock sandbox fails inside containers, so runs pass
 * --dangerously-bypass-approvals-and-sandbox; the surrounding sandbox is
 * the security boundary.
 *
 * Wire format (0.146 `--json`): thread.started / turn.started /
 * item.{started,updated,completed} / turn.completed / error, with item
 * payloads for agent_message, reasoning and command_execution. Older
 * releases emitted {"id","msg":{...}} envelopes; both shapes are
 * tolerated because the protocol drifted across versions.
 *
 * Both `error` channels -- top-level {"type":"error"} and error-typed
 * items -- are NOTICE channels, not terminal failure; only turn.failed
 * and a nonzero exit code mean the run failed. See parseLineWith for the
 * 2026-08-03 measurements.
 */

import { amNpmInstall, ensureNodeCommand, withAmNode } from "./node-runtime.js";
import { tryParseJson, type MuxAgentEvent } from "../events.js";
import { requireUpstream, type UpstreamSuccess } from "../upstreams.js";
import type {
	HarnessAdapter,
	HarnessCommand,
	HarnessRunOptions,
	UpstreamKeys,
} from "../types.js";

const CODEX_PACKAGE = "@openai/codex";
const CODEX_VERSION = "0.146.0";

/** POSIX single-quote escaping for values interpolated into commands. */
function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Quote only tokens that need it, so a logged command reads as the argv an
 * operator would type -- `-c 'model_provider="x"'` rather than `'-c' '...'`.
 */
function shqIfNeeded(token: string): string {
	return /^[A-Za-z0-9_./-]+$/.test(token) ? token : shq(token);
}

function toBase64(value: string): string {
	return Buffer.from(value, "utf8").toString("base64");
}

function str(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * Upstream resolution (native OpenAI key, else an OpenAI-Responses gateway)
 * lives in ../upstreams.ts. A gateway arrives as `-c` config-override
 * tokens declaring a named model provider, which are shell-quoted here
 * because the whole invocation is a command string.
 */
function upstreamArgs(resolved: UpstreamSuccess): string[] {
	return resolved.args.map(shqIfNeeded);
}

/**
 * Codex reports agent text on the items that complete, not on
 * turn.completed, so the adapter carries a little cross-line state to
 * stamp result events. Reset on thread/turn boundaries.
 *
 * `agentText` ACCUMULATES every agent_message of the turn -- it is not
 * the last message. Measured live 2026-08-03 (codex-cli
 * 0.146.0-alpha.3.1, capture-03): one turn emitted TWO complete
 * agent_message items, "Starting now." then "hello". The previous
 * overwrite (`lastAgentText = text`) put only the last one into the
 * turn.completed result, and the router replaces its accumulated deltas
 * with a non-empty result.text (router.ts absorb()), so RunResult.text
 * silently dropped the preamble. Note: the exported harness is a
 * singleton, so two machines parsing interleaved output would share
 * this; the router builds a fresh parser per run via newTurnParser.
 */
type TurnState = { threadId?: string; agentText: string };

function newTurnState(): TurnState {
	return { threadId: undefined, agentText: "" };
}

const turnState: TurnState = newTurnState();

/**
 * Append one complete agent message and return the delta to emit,
 * separator included. The separator rides INSIDE the delta -- fleet
 * convention: the harness owns separators (hermes embeds "\n" per line)
 * and the router concatenates deltas with nothing -- so the router's
 * accumulation, any onEvent consumer, and the turn.completed result all
 * produce the identical string; the result then CONFIRMS the
 * accumulation instead of replacing it. "\n\n" because agent_message
 * items are complete markdown messages (measured 2026-08-03: text
 * arrives only whole, on item.completed; no item.updated deltas exist in
 * exec --json); "" or "\n" would fuse two messages into one paragraph.
 */
function appendAgentText(state: TurnState, text: string): string {
	const delta = state.agentText ? `\n\n${text}` : text;
	state.agentText += delta;
	return delta;
}

function parseItem(state: TurnState, phase: string, itemRaw: unknown): MuxAgentEvent[] {
	const item = obj(itemRaw);
	if (!item) return [];
	const itemType = str(item.type) ?? str(item.item_type) ?? "";
	const id = str(item.id) ?? "item";
	if (itemType === "agent_message") {
		// agent_message text arrives ONLY as the complete message on
		// item.completed -- across the 2026-08-03 six-run corpus no
		// item.updated ever carried agent_message text, while todo_list
		// proves item.updated is a real channel in this binary. The gate
		// stays anyway: if a lifecycle ever appears, emitting only the
		// completed text cannot duplicate.
		if (phase !== "item.completed") return [];
		const text = str(item.text) ?? str(item.message) ?? "";
		if (!text) return [];
		return [{ type: "text", delta: appendAgentText(state, text) }];
	}
	if (itemType === "command_execution") {
		if (phase === "item.started") {
			return [{ type: "tool_call", id, name: "shell", input: str(item.command) }];
		}
		if (phase === "item.completed") {
			const exitCode = num(item.exit_code);
			return [
				{
					type: "tool_result",
					id,
					output: str(item.aggregated_output) ?? str(item.output),
					isError: exitCode !== undefined && exitCode !== 0,
				},
			];
		}
		return [];
	}
	if (itemType === "reasoning") {
		if (phase !== "item.completed") return [];
		const text = str(item.text) ?? str(item.summary) ?? "";
		return text ? [{ type: "thinking", delta: text }] : [];
	}
	if (itemType === "error") {
		// NOTICE, not failure. Measured live 2026-08-03 (codex-cli
		// 0.146.0-alpha.3.1, capture-01): a run emitted
		//   {"type":"item.completed","item":{...,"type":"error","message":
		//    "Model metadata for `gpt-5.1` not found. Defaulting to
		//    fallback metadata; ..."}}
		// then answered correctly and exited 0. Mapping this to an "error"
		// event set RunResult.error on a successful run, so
		// isSuccessfulTrace() (traces.ts) recorded the run as FAILED and
		// the learned policy skewed its successRate at selection weight
		// 0.7 (selection.ts DEFAULT_SELECTION_TUNING) -- a healthy lane
		// taught as failing. Terminal failure is only turn.failed (below)
		// or a nonzero exit (the router fails the trace on exitCode
		// alone), both present in every failing capture that had one.
		//
		// Phase gate: all 7 error items in the corpus arrived exactly once,
		// via item.completed only -- never item.started/item.updated -- so
		// gating guarantees ONE status per notice even if an error-item
		// lifecycle ever appears.
		if (phase !== "item.completed") return [];
		const message = str(item.message) ?? "codex reported an error item";
		return [{ type: "status", label: message }];
	}
	return [];
}

/** Legacy {"id","msg":{...}} envelopes from pre-0.4x codex releases. */
function parseLegacy(state: TurnState, msg: Record<string, unknown>): MuxAgentEvent[] {
	const type = str(msg.type) ?? "";
	switch (type) {
		case "session_configured": {
			const sessionId = str(msg.session_id);
			state.threadId = sessionId;
			state.agentText = "";
			return [
				{ type: "started", harness: "codex", sessionId, model: str(msg.model) },
			];
		}
		case "task_started":
			return [{ type: "status", label: "turn started" }];
		case "agent_message": {
			// Same accumulation as the item.* path: a turn can carry
			// several complete agent messages, and keeping only the last
			// discards the preamble (measured on the 0.146 stream,
			// capture-03; the legacy envelope shares the overwrite shape).
			const text = str(msg.message) ?? str(msg.text) ?? "";
			if (!text) return [];
			return [{ type: "text", delta: appendAgentText(state, text) }];
		}
		case "agent_reasoning": {
			const text = str(msg.text) ?? "";
			return text ? [{ type: "thinking", delta: text }] : [];
		}
		case "exec_command_begin": {
			const command = Array.isArray(msg.command)
				? (msg.command as unknown[]).filter((part) => typeof part === "string").join(" ")
				: str(msg.command);
			return [
				{
					type: "tool_call",
					id: str(msg.call_id) ?? "exec",
					name: "shell",
					input: command,
				},
			];
		}
		case "exec_command_end": {
			const exitCode = num(msg.exit_code);
			return [
				{
					type: "tool_result",
					id: str(msg.call_id) ?? "exec",
					output: str(msg.aggregated_output) ?? str(msg.stdout),
					isError: exitCode !== undefined && exitCode !== 0,
				},
			];
		}
		case "task_complete":
			// Accumulated stream first: last_agent_message is documented
			// "last" -- the same overwrite semantic as `--output-last-message`
			// -- so preferring it drops every earlier message of a
			// multi-message turn. It remains only as the fallback for a
			// stream that completed without ever emitting agent_message.
			return [
				{
					type: "result",
					text: state.agentText || (str(msg.last_agent_message) ?? ""),
					sessionId: state.threadId,
				},
			];
		case "error":
			// Same contract as the 0.146 stream: error channels are
			// notices and may not set RunResult.error; a genuinely dead
			// legacy run still fails via its nonzero exit code (the legacy
			// envelope has no turn.failed). Unmeasured on a pre-0.4x
			// binary -- none exists on this machine -- but leaving this
			// mapped to "error" would let an unverified channel record
			// successful runs as failed, the exact policy corruption the
			// 2026-08-03 captures proved for the modern notice channels.
			return [{ type: "status", label: str(msg.message) ?? "codex error" }];
		default:
			return [];
	}
}

function parseLineWith(state: TurnState, line: string): MuxAgentEvent[] {
	const json = tryParseJson(line);
	if (!json) return [];

	const legacy = obj(json.msg);
	if (legacy) return parseLegacy(state, legacy);

	const type = str(json.type) ?? "";
	switch (type) {
		case "thread.started":
		case "session.created": {
			const sessionId = str(json.thread_id) ?? str(json.session_id);
			state.threadId = sessionId;
			state.agentText = "";
			return [{ type: "started", harness: "codex", sessionId }];
		}
		case "turn.started":
			state.agentText = "";
			return [{ type: "status", label: "turn started" }];
		case "item.started":
		case "item.updated":
		case "item.completed":
			return parseItem(state, type, json.item);
		case "turn.completed":
			// Usage tokens are reported here but MuxAgentEvent has no
			// token fields and codex reports no cost -- both omitted.
			// text equals the deltas already emitted (appendAgentText puts
			// the separator inside each delta), so the router's replace of
			// its accumulation with result.text is a no-op confirm. The
			// event itself must stay: it is the only carrier of sessionId
			// into RunResult, which `codex exec resume` needs.
			return [
				{
					type: "result",
					text: state.agentText,
					sessionId: state.threadId,
				},
			];
		case "turn.failed": {
			// The ONLY stream-level failure signal. Both failing captures
			// of 2026-08-03 (401 retry exhaustion, 400 bad model) ended in
			// a turn.failed duplicating the final notice message, and the
			// SIGINT capture shows a failure can also arrive with NO
			// terminal event at all -- the router covers that by failing
			// the trace on the nonzero exit code.
			const error = obj(json.error);
			const message =
				(error ? str(error.message) : undefined) ??
				str(json.message) ??
				"codex turn failed";
			return [{ type: "error", message }];
		}
		case "error": {
			// NOTICE channel, not terminal failure. Measured live
			// 2026-08-03 (capture-02): nine
			//   {"type":"error","message":"Reconnecting... N/5 (unexpected
			//    status 401 ...)"}
			// retry notices (plus a tenth top-level error carrying the
			// terminal message itself) preceded the genuine turn.failed, so mapping
			// this to "error" recorded a run as failed the moment it
			// merely RETRIED -- and a retry that then succeeded was logged
			// failed, corrupting successRate in the learned policy
			// (selection weight 0.7). Every terminal message observed was
			// duplicated into turn.failed, so nothing is lost by demoting
			// this channel.
			//
			// Field order: `message` was present on every live line,
			// including the 400 path (capture-04). The binary's string
			// table places an optional `kind` (CodexErrorInfo: bad_request,
			// usage_limit_exceeded, ...) next to `message` -- never
			// observed live, but read it before dumping the raw JSON line
			// as the label. No `text` field exists on this event.
			const label = str(json.message) ?? str(json.kind) ?? line.trim();
			return [{ type: "status", label }];
		}
		default:
			return [];
	}
}

function baseFlags(
	options: HarnessRunOptions,
	configArgs: readonly string[],
): string[] {
	const flags = [
		"--json",
		"--skip-git-repo-check",
		"--dangerously-bypass-approvals-and-sandbox",
		...configArgs,
	];
	if (options.model) flags.push("-m", shq(options.model));
	if (options.cwd) flags.push("-C", shq(options.cwd));
	if (options.extraArgs?.length) flags.push(...options.extraArgs);
	return flags;
}

export const codexHarness: HarnessAdapter = {
	kind: "codex",
	requiredUpstream: "openai",

	isInstalledCommand(): string {
		return withAmNode("command -v codex");
	},

	installCommand(): string {
		// Codex ships a native binary, so Node only has to be new enough to
		// run npm; the shared bootstrap matters because a plain `npm -g`
		// lands off PATH on substrates that route Node through nvm
		// (measured on Sprites: install reported success, binary
		// unfindable).
		return `${ensureNodeCommand(22)} && ${amNpmInstall(`${CODEX_PACKAGE}@${CODEX_VERSION}`)}`;
	},

	versionCommand(): string {
		return withAmNode("codex --version");
	},

	/**
	 * Headless streamed run. The prompt travels base64-encoded through the
	 * shell (no quoting bugs) and is read by codex from stdin (trailing
	 * "-"). Credentials ride in env, never argv. When sessionId is set the
	 * run resumes via `codex exec resume <id>` with the same flags.
	 *
	 * On a gateway upstream, `options.model` must be a gateway slug
	 * (`openai/gpt-5.3-codex`, `anthropic/claude-sonnet-5`); codex's own
	 * bare default model id is not a route either gateway can resolve.
	 *
	 * No output-token cap is set here, and none can be. Codex 0.146 sends
	 * no `max_output_tokens` on the wire at all, so there is nothing for a
	 * config value to shrink -- measured, with the sweep that rules out the
	 * candidate key names, in docs/UPSTREAMS.md "The output-token ceiling is
	 * the gateway's, not a Codex setting". A metered gateway with a small
	 * balance therefore 402s on the model's own maximum, and the fix is
	 * credit or a model with a lower ceiling, not a flag. Do not add
	 * `-c model_max_output_tokens=...`: that name is not a codex config
	 * field, and no config value can add a wire field codex does not send.
	 */
	runCommand(
		prompt: string,
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const resolved = requireUpstream("codex", keys);
		const exec = options.sessionId
			? `codex exec resume ${shq(options.sessionId)}`
			: "codex exec";
		const flags = baseFlags(options, upstreamArgs(resolved)).join(" ");
		const command = withAmNode(
			`echo ${toBase64(prompt)} | base64 -d | ${exec} ${flags} -`,
		);
		return { command, env: resolved.env };
	},

	/**
	 * Interactive TUI for PTY sessions. `codex` (unlike `codex exec`) does
	 * not honor CODEX_API_KEY, so on the native upstream the wrapper first
	 * performs a one-shot `codex login --with-api-key` reading the key from
	 * stdin via the env var -- the key still never appears in argv. Login
	 * failures are swallowed so the TUI can fall back to its own auth
	 * prompt.
	 *
	 * A gateway upstream skips that login entirely: it authenticates from
	 * the provider's env_key, and storing a gateway token as an OpenAI
	 * credential would leave the TUI logged in against the wrong upstream.
	 */
	interactiveCommand(
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const resolved = requireUpstream("codex", keys);
		const parts = [
			"codex",
			"--dangerously-bypass-approvals-and-sandbox",
			...upstreamArgs(resolved),
		];
		if (options.model) parts.push("-m", shq(options.model));
		if (options.cwd) parts.push("-C", shq(options.cwd));
		if (options.extraArgs?.length) parts.push(...options.extraArgs);
		const login =
			resolved.chosen === "openai"
				? `printf %s "$CODEX_API_KEY" | codex login --with-api-key >/dev/null 2>&1 || true; `
				: "";
		const script = withAmNode(`${login}exec ${parts.join(" ")}`);
		return { command: `bash -lc ${shq(script)}`, env: resolved.env };
	},

	parseLine(line: string): MuxAgentEvent[] {
		return parseLineWith(turnState, line);
	},

	newTurnParser(): (line: string) => MuxAgentEvent[] {
		const state = newTurnState();
		return (line) => parseLineWith(state, line);
	},
};
