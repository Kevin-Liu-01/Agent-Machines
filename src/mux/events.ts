/**
 * Normalized agent event stream.
 *
 * Every harness CLI speaks a different wire format (Claude Code
 * stream-json, Codex exec --json JSONL, OpenClaw --json envelopes,
 * Hermes text/SSE). Harness adapters normalize into this compact union
 * so the router, CLI, SDK consumers and the web activity stream all see
 * one shape. Kinds intentionally map onto the web protocol
 * (web/lib/agents/protocol.ts) so the dashboard can lift these events
 * without loss.
 */

import type { HarnessKind, SubstrateKind } from "./types.js";

export type MuxAgentEvent =
	| { type: "started"; harness: HarnessKind; sessionId?: string; model?: string }
	| { type: "text"; delta: string }
	| { type: "thinking"; delta: string }
	| {
			type: "tool_call";
			id: string;
			name: string;
			input?: string;
	  }
	| {
			type: "tool_result";
			id: string;
			output?: string;
			isError?: boolean;
	  }
	| { type: "status"; label: string }
	| {
			type: "result";
			text: string;
			costUsd?: number;
			durationMs?: number;
			sessionId?: string;
			isError?: boolean;
	  }
	| { type: "error"; message: string }
	| { type: "done"; exitCode: number };

export type RunResult = {
	text: string;
	exitCode: number;
	costUsd?: number;
	durationMs: number;
	sessionId?: string;
	events: number;
	substrate: SubstrateKind;
	harness: HarnessKind;
};

/**
 * Incremental NDJSON line splitter. Feed raw chunks, get whole lines.
 * Carries partial lines across chunk boundaries; call flush() at EOF.
 */
export class LineBuffer {
	private partial = "";

	push(chunk: string): string[] {
		this.partial += chunk;
		const lines = this.partial.split("\n");
		this.partial = lines.pop() ?? "";
		return lines.filter((line) => line.length > 0);
	}

	flush(): string[] {
		const rest = this.partial.trim();
		this.partial = "";
		return rest.length > 0 ? [rest] : [];
	}
}

/** Parse a JSON line defensively; harness output can interleave noise. */
export function tryParseJson(line: string): Record<string, unknown> | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("{")) return null;
	try {
		const value = JSON.parse(trimmed) as unknown;
		return typeof value === "object" && value !== null
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}
