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
	/**
	 * Model spend for this turn as the harness itself reported it (Claude
	 * Code's `total_cost_usd` and the equivalents). Sandbox compute is NOT in
	 * here -- the substrate bills that separately, and the two are kept apart
	 * on the trace (RunTrace.modelCostUsd / RunTrace.sandboxCostUsd). Absent
	 * when the harness reported nothing, never 0: a zero would read as free.
	 */
	costUsd?: number;
	durationMs: number;
	/**
	 * Milliseconds from the run() call to the first NORMALIZED agent event.
	 *
	 * Normalized, not first raw byte, deliberately. Raw stdout opens with
	 * harness banners, partial JSON and stderr noise that a caller cannot
	 * render, so a first-byte number would flatter the measurement and would
	 * not compare across harnesses whose CLIs differ in how chatty they are at
	 * startup. The first MuxAgentEvent is the first instant a consumer has
	 * something to show, which is the "time to first output" the route table
	 * reports. Absent when the run produced no event at all (a harness that
	 * exited silently), never 0.
	 */
	timeToFirstEventMs?: number;
	sessionId?: string;
	events: number;
	substrate: SubstrateKind;
	harness: HarnessKind;
	/**
	 * True when the stream ended before the harness finished -- the caller
	 * aborted, broke out of the iteration, or the substrate tore the
	 * connection down. `text` is then partial and `exitCode` is not the
	 * harness's own exit status, so never read a truncated run as success.
	 */
	truncated: boolean;
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
