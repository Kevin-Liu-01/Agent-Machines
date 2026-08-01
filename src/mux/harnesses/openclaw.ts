/**
 * OpenClaw harness adapter (npm "openclaw", formerly Clawdbot/Moltbot).
 *
 * Pure command recipe: no vendor SDK is required, so nothing is imported
 * lazily -- the adapter only builds shell strings and parses stdout.
 *
 * Wire format: `openclaw agent --local --json` emits a stable envelope.
 * Depending on the version/flags it is either one final JSON object or
 * NDJSON where intermediate lines are progress noise; parseLine tolerates
 * both and never throws.
 *
 * Auth: OpenClaw has no base-URL env lever -- it resolves models through
 * bundled provider plugins keyed on plain credential env vars, so
 * ../upstreams.ts forwards every key it recognizes (anthropic, openai,
 * openrouter, vercel-ai-gateway) and the model ref names the provider.
 */

import { amNpmInstall, ensureNodeCommand, withAmNode } from "./node-runtime.js";
import { Buffer } from "node:buffer";
import { tryParseJson, type MuxAgentEvent } from "../events.js";
import { requireUpstream } from "../upstreams.js";
import type {
	HarnessAdapter,
	HarnessCommand,
	HarnessRunOptions,
	UpstreamKeys,
} from "../types.js";

const OPENCLAW_VERSION = "2026.7.1-2";

/**
 * Cap on a single accumulated JSON envelope. openclaw's pretty-printed
 * result is a few KB; anything past this is unbalanced output rather
 * than a real object, so the accumulator resyncs instead of wedging.
 */
const MAX_ENVELOPE_CHARS = 2_000_000;

/**
 * OpenClaw ships STRICT node engines: >=22.22.3 <23 || >=24.15.0 <25 ||
 * >=25.9.0. A wrong node produces a cryptic npm EBADENGINE mid-install,
 * so we guard up front with a compact single-line `node -e` check that
 * fails with a message including the version actually found.
 * (Single-line only: multiline if/fi joined with && is a known
 * postmortem bug in this codebase.)
 */
const NODE_ENGINE_GUARD =
	`node -e '` +
	`const v=process.versions.node;` +
	`const [M,m,t]=v.split(".").map(Number);` +
	`const ok=(M===22&&(m>22||(m===22&&t>=3)))||(M===24&&m>=15)||(M===25&&m>=9)||M>25;` +
	`if(!ok){console.error("openclaw requires node >=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0; found "+v);process.exit(1);}` +
	`'`;

function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Credentials come from ../upstreams.ts, which forwards every key OpenClaw
 * has a bundled provider plugin for -- anthropic, openai, openrouter and
 * vercel-ai-gateway -- rather than picking one, because OpenClaw resolves
 * the provider itself from its configured model ref. It fails closed when
 * none of the four is set.
 */
function upstreamEnv(keys: UpstreamKeys): Record<string, string> {
	return requireUpstream("openclaw", keys).env;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** Join `payloads: [{ text }, ...]` into one text block. */
function collectPayloadText(value: unknown): string | undefined {
	if (!Array.isArray(value)) return undefined;
	const parts: string[] = [];
	for (const item of value) {
		const payload = readRecord(item);
		const text = payload ? readString(payload.text) : undefined;
		if (text !== undefined) parts.push(text);
	}
	return parts.length > 0 ? parts.join("\n") : undefined;
}

export const openclawHarness: HarnessAdapter = {
	kind: "openclaw",
	requiredUpstream: "any",

	isInstalledCommand(): string {
		return withAmNode("command -v openclaw >/dev/null 2>&1");
	},

	installCommand(): string {
		// Idempotent: npm install -g of a pinned version is a fast no-op
		// when that exact version is already installed.
		return `${ensureNodeCommand(24, 15, 0)} && ${withAmNode(NODE_ENGINE_GUARD)} && ${amNpmInstall(`openclaw@${OPENCLAW_VERSION}`)}`;
	},

	versionCommand(): string {
		return withAmNode("openclaw --version");
	},

	runCommand(
		prompt: string,
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const b64 = Buffer.from(prompt, "utf8").toString("base64");
		// The prompt travels as base64 expanded through a double-quoted
		// command substitution: --message "$(echo <b64> | base64 -d)".
		// This is safe inside bash -lc because the payload is confined to
		// the base64 alphabet ([A-Za-z0-9+/=]); none of those characters
		// are special inside double quotes (only $, backtick, backslash
		// and " are), so arbitrary prompt bytes round-trip without
		// quoting bugs. We deliberately avoid `... | xargs -0`, which is
		// fragile with embedded newlines and NUL handling.
		// openclaw requires a session target even for --local one-shots
		// (verified live 2026-07-31: "Pass --to <E.164>, --session-key,
		// --session-id, or --agent to choose a session"). sessionId maps
		// to --session-key so runs with the same id share a session;
		// otherwise each run gets an isolated key.
		const sessionKey = options.sessionId ?? "am-mux";
		let invocation = `openclaw agent --local --session-key ${shq(sessionKey)} --message "$(echo ${b64} | base64 -d)"`;
		// `--model <id>` takes a `provider/model` ref or a bare model id. It
		// is the only way a gateway-only config reaches a model: OpenClaw's
		// primary model is config state, not inferred from which credential
		// happens to be present, so a gateway needs its provider named --
		// `openrouter/auto`, `vercel-ai-gateway/anthropic/claude-opus-4.6`.
		if (options.model) invocation += ` --model ${shq(options.model)}`;
		invocation += " --json";
		if (options.extraArgs && options.extraArgs.length > 0) {
			invocation += ` ${options.extraArgs.join(" ")}`;
		}
		let command = withAmNode(invocation);
		if (options.cwd) {
			command = `cd ${shq(options.cwd)} && ${command}`;
		}
		return { command, env: upstreamEnv(keys) };
	},

	interactiveCommand(
		keys: UpstreamKeys,
		_options: HarnessRunOptions = {},
	): HarnessCommand {
		// Plain `openclaw` opens the TUI when attached to a PTY.
		return { command: withAmNode("openclaw"), env: upstreamEnv(keys) };
	},

	parseLine(line: string): MuxAgentEvent[] {
		const obj = tryParseJson(line);
		// Non-JSON lines are human-readable status noise: emit nothing.
		if (!obj) return [];

		if (readString(obj.status) === "error") {
			const errorRecord = readRecord(obj.error);
			const message =
				(errorRecord ? readString(errorRecord.message) : readString(obj.error)) ??
				readString(obj.message) ??
				"openclaw reported an unspecified error";
			return [{ type: "error", message }];
		}

		// Accept all three ok shapes:
		//   {"status":"ok","result":{"payloads":[{"text":...}]}}
		//   {"payloads":[{"text":...}]}
		//   {"text":"..."}
		const envelope = readRecord(obj.result) ?? obj;
		const text =
			collectPayloadText(envelope.payloads) ?? readString(envelope.text);
		if (text === undefined) return [];

		const sessionId =
			readString(envelope.sessionId) ??
			readString(obj.sessionId) ??
			readString(obj.session_id);
		return [
			{ type: "text", delta: text },
			{ type: "result", text, sessionId },
		];
	},

	/**
	 * openclaw --json pretty-prints its envelope across many lines
	 * (verified live 2026-07-31), so line-at-a-time parsing never sees a
	 * complete object. This parser accumulates lines from the first `{`
	 * and parses once brace depth returns to zero, ignoring braces inside
	 * strings. Single-line NDJSON output still works: depth balances on
	 * the first line.
	 */
	newTurnParser(): (line: string) => MuxAgentEvent[] {
		let buffer = "";
		let depth = 0;
		let inString = false;
		let escaped = false;

		const reset = (): void => {
			buffer = "";
			depth = 0;
			inString = false;
			escaped = false;
		};

		return (line: string): MuxAgentEvent[] => {
			if (buffer === "" && !line.trimStart().startsWith("{")) return [];
			// A line that opens a brace but never closes it (interleaved
			// noise, a run aborted mid-envelope) would otherwise wedge the
			// accumulator forever and grow it without bound: every later
			// line would be swallowed and no event emitted again. Give up
			// on the candidate object and resync instead.
			if (buffer.length + line.length > MAX_ENVELOPE_CHARS) {
				reset();
				if (!line.trimStart().startsWith("{")) return [];
			}
			buffer += `${line}\n`;
			for (const char of line) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (inString) {
					if (char === "\\") escaped = true;
					else if (char === '"') inString = false;
					continue;
				}
				if (char === '"') inString = true;
				else if (char === "{") depth += 1;
				else if (char === "}") depth -= 1;
			}
			if (depth > 0) return [];
			const complete = buffer;
			reset();
			return openclawHarness.parseLine(complete.replace(/\n/g, " "));
		};
	},
};
