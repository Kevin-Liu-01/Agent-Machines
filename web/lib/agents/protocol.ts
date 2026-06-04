/**
 * Universal agent event protocol.
 *
 * Every agent runtime (Hermes, OpenClaw, Cursor SDK, Claude Code, Codex CLI)
 * emits different SSE/event formats. This module defines the canonical types
 * that all parsers normalize into, so the UI renders one consistent activity
 * stream regardless of which agent is running.
 *
 * The protocol is append-only: new event kinds can be added without breaking
 * existing renderers (they skip unknown types via the `satisfies never` guard).
 */

import type { AgentKind } from "@/lib/user-config/schema";

export type AgentEventKind =
	| "text"
	| "thinking"
	| "tool_call"
	| "tool_progress"
	| "tool_result"
	| "status"
	| "file_edit"
	| "file_read"
	| "shell_exec"
	| "browser_action"
	| "error";

export type ToolCallStatus = "running" | "completed" | "error";

export type AgentTextEvent = {
	kind: "text";
	id: string;
	delta: string;
	accumulated: string;
	timestamp: number;
};

export type AgentThinkingEvent = {
	kind: "thinking";
	id: string;
	content: string;
	startedAt: number;
	completedAt?: number;
};

export type AgentToolCallEvent = {
	kind: "tool_call";
	id: string;
	name: string;
	arguments: string;
	status: ToolCallStatus;
	startedAt: number;
	completedAt?: number;
};

export type AgentToolProgressEvent = {
	kind: "tool_progress";
	toolCallId: string;
	delta: string;
	accumulated: string;
	timestamp: number;
};

export type AgentToolResultEvent = {
	kind: "tool_result";
	toolCallId: string;
	output: string;
	error?: string;
	completedAt: number;
};

export type AgentStatusEvent = {
	kind: "status";
	label: string;
	detail?: string;
	timestamp: number;
};

export type AgentFileEditEvent = {
	kind: "file_edit";
	id: string;
	path: string;
	diff?: string;
	oldContent?: string;
	newContent?: string;
	language?: string;
	timestamp: number;
};

export type AgentFileReadEvent = {
	kind: "file_read";
	id: string;
	path: string;
	content?: string;
	lineStart?: number;
	lineEnd?: number;
	language?: string;
	timestamp: number;
};

export type AgentShellExecEvent = {
	kind: "shell_exec";
	id: string;
	command: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	status: ToolCallStatus;
	startedAt: number;
	completedAt?: number;
};

export type AgentBrowserActionEvent = {
	kind: "browser_action";
	id: string;
	action: string;
	url?: string;
	screenshotUrl?: string;
	result?: string;
	timestamp: number;
};

export type AgentErrorEvent = {
	kind: "error";
	message: string;
	code?: string;
	timestamp: number;
};

export type AgentEvent =
	| AgentTextEvent
	| AgentThinkingEvent
	| AgentToolCallEvent
	| AgentToolProgressEvent
	| AgentToolResultEvent
	| AgentStatusEvent
	| AgentFileEditEvent
	| AgentFileReadEvent
	| AgentShellExecEvent
	| AgentBrowserActionEvent
	| AgentErrorEvent;

/**
 * A single turn in a conversation. Contains the raw content plus
 * the structured event timeline that produced it.
 */
export type ConversationTurn = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	events: AgentEvent[];
	model?: string;
	agentKind?: AgentKind;
	startedAt: number;
	completedAt?: number;
	durationMs?: number;
	tokenUsage?: { prompt?: number; completion?: number; total?: number };
};

/**
 * A full conversation with metadata.
 */
export type Conversation = {
	id: string;
	title: string;
	turns: ConversationTurn[];
	machineId: string | null;
	agentKind: AgentKind | null;
	model: string | null;
	createdAt: string;
	updatedAt: string;
	/** Session attach packages (Add ___ chips) active for this chat. */
	sessionPackageIds?: string[];
	pinned?: boolean;
	archived?: boolean;
	tags?: string[];
};

export type ConversationSummary = Omit<Conversation, "turns"> & {
	turnCount: number;
	lastTurnPreview: string;
};

/**
 * Artifact produced during a conversation -- code file, diff, screenshot, etc.
 */
export type ConversationArtifact = {
	id: string;
	conversationId: string;
	turnId: string;
	kind: "file" | "diff" | "screenshot" | "terminal" | "diagram";
	title: string;
	path?: string;
	content: string;
	language?: string;
	timestamp: number;
};

/**
 * Accumulator state for streaming. Parsers mutate this as events arrive;
 * the UI reads it to render the live activity stream.
 */
export type StreamAccumulator = {
	content: string;
	events: AgentEvent[];
	activeThinking: AgentThinkingEvent | null;
	activeToolCalls: Map<string, AgentToolCallEvent>;
	activeShellExecs: Map<string, AgentShellExecEvent>;
	artifacts: ConversationArtifact[];
};

export function createStreamAccumulator(): StreamAccumulator {
	return {
		content: "",
		events: [],
		activeThinking: null,
		activeToolCalls: new Map(),
		activeShellExecs: new Map(),
		artifacts: [],
	};
}

let _idCounter = 0;
export function makeEventId(): string {
	return `evt_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}

/**
 * Detect file operations from tool call names and extract artifacts.
 */
export function classifyToolCall(name: string): AgentEventKind {
	const n = name.toLowerCase();
	if (n.includes("read") || n === "cat" || n === "head" || n === "tail") return "file_read";
	if (n.includes("write") || n.includes("edit") || n.includes("replace") || n.includes("patch") || n === "str_replace_editor") return "file_edit";
	if (n.includes("shell") || n.includes("bash") || n.includes("exec") || n.includes("terminal") || n.includes("command")) return "shell_exec";
	if (n.includes("browser") || n.includes("screenshot") || n.includes("navigate") || n.includes("click")) return "browser_action";
	return "tool_call";
}

/**
 * Try to extract a unified diff from tool call arguments or results.
 */
export function extractDiffFromToolCall(
	name: string,
	args: string,
	result?: string,
): string | null {
	const n = name.toLowerCase();
	if (!n.includes("edit") && !n.includes("write") && !n.includes("replace") && !n.includes("patch")) return null;

	try {
		const parsed = JSON.parse(args);
		if (parsed.old_string && parsed.new_string) {
			const path = parsed.path ?? parsed.file ?? "unknown";
			return [
				`--- a/${path}`,
				`+++ b/${path}`,
				"@@ @@",
				...parsed.old_string.split("\n").map((l: string) => `- ${l}`),
				...parsed.new_string.split("\n").map((l: string) => `+ ${l}`),
			].join("\n");
		}
		if (parsed.diff) return parsed.diff;
	} catch {
		// not JSON
	}

	if (result?.startsWith("---") || result?.startsWith("diff ")) return result;
	return null;
}

/**
 * Try to detect the language from a file path.
 */
export function languageFromPath(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, string> = {
		ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
		py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
		c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
		swift: "swift", kt: "kotlin", scala: "scala",
		sh: "bash", bash: "bash", zsh: "bash",
		json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
		md: "markdown", mdx: "markdown",
		html: "html", css: "css", scss: "scss",
		sql: "sql", graphql: "graphql",
		dockerfile: "dockerfile", tf: "terraform",
	};
	return map[ext] ?? ext;
}
