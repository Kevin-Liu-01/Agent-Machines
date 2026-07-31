/**
 * Codex harness adapter (@openai/codex 0.146.x, Rust binary via npm).
 *
 * Recipes only: this module builds shell command strings that run INSIDE
 * a sandbox and normalizes `codex exec --json` JSONL output into
 * MuxAgentEvents. There is no vendor SDK to import lazily -- the CLI is
 * installed on the sandbox via npm.
 *
 * Auth: CODEX_API_KEY in the process env (honored by `codex exec`); the
 * key is never placed in argv. Codex's own Landlock sandbox fails inside
 * containers, so runs pass --dangerously-bypass-approvals-and-sandbox;
 * the surrounding sandbox is the security boundary.
 *
 * Wire format (0.146 `--json`): thread.started / turn.started /
 * item.{started,updated,completed} / turn.completed / error, with item
 * payloads for agent_message, reasoning and command_execution. Older
 * releases emitted {"id","msg":{...}} envelopes; both shapes are
 * tolerated because the protocol drifted across versions.
 */

import { amNpmInstall, ensureNodeCommand, withAmNode } from "./node-runtime.js";
import { tryParseJson, type MuxAgentEvent } from "../events.js";
import {
	MuxError,
	type HarnessAdapter,
	type HarnessCommand,
	type HarnessRunOptions,
	type UpstreamKeys,
} from "../types.js";

const CODEX_PACKAGE = "@openai/codex";
const CODEX_VERSION = "0.146.0";

/** POSIX single-quote escaping for values interpolated into commands. */
function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
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

function requireOpenAiKey(keys: UpstreamKeys): string {
	const key = keys.openai;
	if (!key) {
		throw new MuxError(
			"missing_credentials",
			"codex requires an OpenAI API key (keys.openai / OPENAI_API_KEY).",
			{ harness: "codex" },
		);
	}
	return key;
}

/**
 * Codex reports the final agent message on the item that completed, not
 * on turn.completed, so the adapter carries a little cross-line state to
 * stamp result events. Reset on thread/turn boundaries. Note: the
 * exported harness is a singleton, so two machines parsing interleaved
 * output would share this; the router independently accumulates text
 * deltas per run, which keeps RunResult.text correct regardless.
 */
type TurnState = { threadId?: string; lastAgentText: string };

function newTurnState(): TurnState {
	return { threadId: undefined, lastAgentText: "" };
}

const turnState: TurnState = newTurnState();

function parseItem(state: TurnState, phase: string, itemRaw: unknown): MuxAgentEvent[] {
	const item = obj(itemRaw);
	if (!item) return [];
	const itemType = str(item.type) ?? str(item.item_type) ?? "";
	const id = str(item.id) ?? "item";
	if (itemType === "agent_message") {
		// Deltas arrive on item.updated; emit once on completion to avoid
		// duplicating text the consumer already concatenated.
		if (phase !== "item.completed") return [];
		const text = str(item.text) ?? str(item.message) ?? "";
		if (!text) return [];
		state.lastAgentText = text;
		return [{ type: "text", delta: text }];
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
		const message = str(item.message) ?? "codex reported an error item";
		return [{ type: "error", message }];
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
			state.lastAgentText = "";
			return [
				{ type: "started", harness: "codex", sessionId, model: str(msg.model) },
			];
		}
		case "task_started":
			return [{ type: "status", label: "turn started" }];
		case "agent_message": {
			const text = str(msg.message) ?? str(msg.text) ?? "";
			if (!text) return [];
			state.lastAgentText = text;
			return [{ type: "text", delta: text }];
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
			return [
				{
					type: "result",
					text: str(msg.last_agent_message) ?? state.lastAgentText,
					sessionId: state.threadId,
				},
			];
		case "error":
			return [{ type: "error", message: str(msg.message) ?? "codex error" }];
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
			state.lastAgentText = "";
			return [{ type: "started", harness: "codex", sessionId }];
		}
		case "turn.started":
			state.lastAgentText = "";
			return [{ type: "status", label: "turn started" }];
		case "item.started":
		case "item.updated":
		case "item.completed":
			return parseItem(state, type, json.item);
		case "turn.completed":
			// Usage tokens are reported here but MuxAgentEvent has no
			// token fields and codex reports no cost -- both omitted.
			return [
				{
					type: "result",
					text: state.lastAgentText,
					sessionId: state.threadId,
				},
			];
		case "turn.failed": {
			const error = obj(json.error);
			const message =
				(error ? str(error.message) : undefined) ??
				str(json.message) ??
				"codex turn failed";
			return [{ type: "error", message }];
		}
		case "error":
			return [{ type: "error", message: str(json.message) ?? line.trim() }];
		default:
			return [];
	}
}

function baseFlags(options: HarnessRunOptions): string[] {
	const flags = [
		"--json",
		"--skip-git-repo-check",
		"--dangerously-bypass-approvals-and-sandbox",
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
	 * "-"). CODEX_API_KEY rides in env, never argv. When sessionId is set
	 * the run resumes via `codex exec resume <id>` with the same flags.
	 */
	runCommand(
		prompt: string,
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const key = requireOpenAiKey(keys);
		const exec = options.sessionId
			? `codex exec resume ${shq(options.sessionId)}`
			: "codex exec";
		const command = withAmNode(
			`echo ${toBase64(prompt)} | base64 -d | ${exec} ${baseFlags(options).join(" ")} -`,
		);
		return { command, env: { CODEX_API_KEY: key } };
	},

	/**
	 * Interactive TUI for PTY sessions. `codex` (unlike `codex exec`) does
	 * not honor CODEX_API_KEY, so the wrapper first performs a one-shot
	 * `codex login --with-api-key` reading the key from stdin via the env
	 * var -- the key still never appears in argv. Login failures are
	 * swallowed so the TUI can fall back to its own auth prompt.
	 */
	interactiveCommand(
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const key = requireOpenAiKey(keys);
		const parts = ["codex", "--dangerously-bypass-approvals-and-sandbox"];
		if (options.model) parts.push("-m", shq(options.model));
		if (options.cwd) parts.push("-C", shq(options.cwd));
		if (options.extraArgs?.length) parts.push(...options.extraArgs);
		const script = withAmNode(
			`printf %s "$CODEX_API_KEY" | codex login --with-api-key >/dev/null 2>&1 || true; exec ${parts.join(" ")}`,
		);
		return {
			command: `bash -lc ${shq(script)}`,
			env: { CODEX_API_KEY: key, OPENAI_API_KEY: key },
		};
	},

	parseLine(line: string): MuxAgentEvent[] {
		return parseLineWith(turnState, line);
	},

	newTurnParser(): (line: string) => MuxAgentEvent[] {
		const state = newTurnState();
		return (line) => parseLineWith(state, line);
	},
};
