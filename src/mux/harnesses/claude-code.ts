/**
 * Claude Code harness adapter.
 *
 * Normalizes @anthropic-ai/claude-code (pinned 2.1.220) behind the
 * HarnessAdapter contract:
 *
 *   install     -- global npm install, gated on Node >= 22 (single-line
 *                  shell guard; the CLI hard-requires Node 22).
 *   run         -- headless `claude -p --output-format stream-json`,
 *                  prompt delivered via stdin as base64 to sidestep
 *                  shell quoting entirely (same pattern as
 *                  web/lib/providers/e2b.ts bashViaBase64).
 *   interactive -- plain `claude` for PTY sessions.
 *   parseLine   -- stream-json NDJSON -> MuxAgentEvent. Text/thinking
 *                  deltas come from stream_event partials; assistant
 *                  messages only contribute tool_use blocks (their text
 *                  blocks duplicate the deltas); user messages carry
 *                  tool_result blocks; the trailing result envelope maps
 *                  to a result event. Unknown or non-JSON lines are
 *                  ignored, never thrown on.
 */

import { amNpmInstall, ensureNodeCommand, withAmNode } from "./node-runtime.js";
import { Buffer } from "node:buffer";
import { tryParseJson, type MuxAgentEvent } from "../events.js";
import {
	MuxError,
	type HarnessAdapter,
	type HarnessCommand,
	type HarnessRunOptions,
	type UpstreamKeys,
} from "../types.js";

const CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
const CLAUDE_CODE_VERSION = "2.1.220";

/**
 * Node >= 22 guard, kept to a single shell line (postmortem rule: no
 * multiline if/fi blocks). `A || (msg && exit 1) && B` is left
 * associative, so the install only runs when the guard passes and the
 * whole command fails with a readable message otherwise. A missing
 * `node` binary also fails the guard, which is correct: the CLI cannot
 * run without it.
 */
const NODE_22_GUARD = `node -e "process.exit(+process.versions.node.split('.')[0] >= 22 ? 0 : 1)" || (echo "claude-code requires Node >= 22 on the sandbox (found: $(node -v 2>/dev/null || echo none)); upgrade Node before installing" >&2 && exit 1)`;

/** POSIX single-quote escaping for values interpolated into commands. */
function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function requireAnthropicEnv(keys: UpstreamKeys): Record<string, string> {
	if (!keys.anthropic) {
		throw new MuxError(
			"missing_credentials",
			"claude-code requires an Anthropic API key (keys.anthropic / ANTHROPIC_API_KEY).",
			{ harness: "claude-code" },
		);
	}
	return {
		ANTHROPIC_API_KEY: keys.anthropic,
		// Required: --dangerously-skip-permissions refuses to run as root
		// inside sandboxes unless IS_SANDBOX=1 is set.
		IS_SANDBOX: "1",
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function safeStringify(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * tool_result content arrives as a plain string, an array of content
 * blocks, or occasionally structured JSON. Flatten defensively to a
 * string; never throw.
 */
function stringifyToolResultContent(content: unknown): string | undefined {
	if (content === undefined || content === null) return undefined;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const item of content) {
			const block = asRecord(item);
			const text = block ? asString(block.text) : undefined;
			if (text !== undefined) {
				parts.push(text);
			} else {
				const fallback = safeStringify(item);
				if (fallback !== undefined) parts.push(fallback);
			}
		}
		return parts.join("\n");
	}
	return safeStringify(content);
}

function parseSystemLine(json: Record<string, unknown>): MuxAgentEvent[] {
	if (asString(json.subtype) !== "init") return [];
	return [
		{
			type: "started",
			harness: "claude-code",
			sessionId: asString(json.session_id),
			model: asString(json.model),
		},
	];
}

function parseStreamEventLine(json: Record<string, unknown>): MuxAgentEvent[] {
	const event = asRecord(json.event);
	if (!event || asString(event.type) !== "content_block_delta") return [];
	const delta = asRecord(event.delta);
	if (!delta) return [];
	const deltaType = asString(delta.type);
	if (deltaType === "text_delta") {
		const text = asString(delta.text);
		return text ? [{ type: "text", delta: text }] : [];
	}
	if (deltaType === "thinking_delta") {
		const thinking = asString(delta.thinking) ?? asString(delta.text);
		return thinking ? [{ type: "thinking", delta: thinking }] : [];
	}
	return [];
}

function parseAssistantLine(
	json: Record<string, unknown>,
	sawStreamText: boolean,
): MuxAgentEvent[] {
	// Text blocks are skipped when --include-partial-messages stream_event
	// deltas already carried that text this message; when no deltas were
	// seen (older CLI, flag dropped, buffered output) the block is the
	// only copy and must be emitted.
	const message = asRecord(json.message);
	const content = message?.content;
	if (!Array.isArray(content)) return [];
	const events: MuxAgentEvent[] = [];
	for (const item of content) {
		const block = asRecord(item);
		if (!block) continue;
		const blockType = asString(block.type);
		if (blockType === "text" && !sawStreamText) {
			const text = asString(block.text);
			if (text) events.push({ type: "text", delta: text });
			continue;
		}
		if (blockType !== "tool_use") continue;
		const id = asString(block.id);
		const name = asString(block.name);
		if (!id || !name) continue;
		events.push({
			type: "tool_call",
			id,
			name,
			input: safeStringify(block.input),
		});
	}
	return events;
}

function parseUserLine(json: Record<string, unknown>): MuxAgentEvent[] {
	const message = asRecord(json.message);
	const content = message?.content;
	if (!Array.isArray(content)) return [];
	const events: MuxAgentEvent[] = [];
	for (const item of content) {
		const block = asRecord(item);
		if (!block || asString(block.type) !== "tool_result") continue;
		const id = asString(block.tool_use_id);
		if (!id) continue;
		events.push({
			type: "tool_result",
			id,
			output: stringifyToolResultContent(block.content),
			isError:
				typeof block.is_error === "boolean" ? block.is_error : undefined,
		});
	}
	return events;
}

function parseResultLine(json: Record<string, unknown>): MuxAgentEvent[] {
	const subtype = asString(json.subtype);
	return [
		{
			type: "result",
			text: asString(json.result) ?? "",
			costUsd: asNumber(json.total_cost_usd),
			durationMs: asNumber(json.duration_ms),
			sessionId: asString(json.session_id),
			isError:
				typeof json.is_error === "boolean"
					? json.is_error
					: subtype !== undefined && subtype !== "success",
		},
	];
}

function buildRunArgs(options: HarnessRunOptions): string[] {
	const args = [
		"--bare",
		"-p",
		"--output-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--dangerously-skip-permissions",
	];
	if (options.model) args.push("--model", shq(options.model));
	if (options.sessionId) args.push("--resume", shq(options.sessionId));
	if (options.extraArgs && options.extraArgs.length > 0) {
		args.push(...options.extraArgs);
	}
	return args;
}

export const claudeCodeHarness: HarnessAdapter = {
	kind: "claude-code",
	requiredUpstream: "anthropic",

	isInstalledCommand(): string {
		return withAmNode("command -v claude");
	},

	installCommand(): string {
		return `${ensureNodeCommand(22)} && ${amNpmInstall(`${CLAUDE_CODE_PACKAGE}@${CLAUDE_CODE_VERSION}`)}`;
	},

	versionCommand(): string {
		return withAmNode("claude --version");
	},

	runCommand(
		prompt: string,
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const env = requireAnthropicEnv(keys);
		// Prompt travels on stdin as base64 so no prompt content ever
		// touches shell parsing (quotes, backticks, $(), newlines).
		const b64 = Buffer.from(prompt, "utf8").toString("base64");
		const pipeline = withAmNode(`echo ${b64} | base64 -d | claude ${buildRunArgs(options).join(" ")}`);
		const command = options.cwd
			? `cd ${shq(options.cwd)} && ${pipeline}`
			: pipeline;
		return { command, env };
	},

	interactiveCommand(
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const env = requireAnthropicEnv(keys);
		const args: string[] = [];
		if (options.model) args.push("--model", shq(options.model));
		if (options.sessionId) args.push("--resume", shq(options.sessionId));
		if (options.extraArgs && options.extraArgs.length > 0) {
			args.push(...options.extraArgs);
		}
		const invocation = withAmNode(args.length > 0 ? `claude ${args.join(" ")}` : "claude");
		const command = options.cwd
			? `cd ${shq(options.cwd)} && ${invocation}`
			: invocation;
		return { command, env };
	},

	parseLine(line: string): MuxAgentEvent[] {
		return parseWithState(line, { sawStreamText: false });
	},

	newTurnParser(): (line: string) => MuxAgentEvent[] {
		const state = { sawStreamText: false };
		return (line) => parseWithState(line, state);
	},
};

function parseWithState(
	line: string,
	state: { sawStreamText: boolean },
): MuxAgentEvent[] {
	const json = tryParseJson(line);
	if (!json) return [];
	switch (asString(json.type)) {
		case "system":
			return parseSystemLine(json);
		case "stream_event": {
			const events = parseStreamEventLine(json);
			if (events.some((event) => event.type === "text")) {
				state.sawStreamText = true;
			}
			return events;
		}
		case "assistant": {
			const events = parseAssistantLine(json, state.sawStreamText);
			// Dedup scope is one message: the next assistant message
			// re-earns its deltas before its block text is suppressed.
			state.sawStreamText = false;
			return events;
		}
		case "user":
			return parseUserLine(json);
		case "result":
			return parseResultLine(json);
		default:
			return [];
	}
}
