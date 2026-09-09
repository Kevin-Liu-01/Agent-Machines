/**
 * Universal SSE parser that normalizes any agent's streaming format
 * into the canonical AgentEvent protocol.
 *
 * Handles:
 *   - Hermes custom events (hermes.thinking, hermes.tool.*)
 *   - OpenAI-compatible chat.completion.chunk (covers Hermes, OpenClaw, any proxy)
 *   - Status/error events
 *   - Tool call classification (file_edit, file_read, shell_exec, browser_action)
 *   - Diff extraction from edit tool calls
 */

import {
	type AgentEvent,
	type AgentToolCallEvent,
	type ConversationArtifact,
	type StreamAccumulator,
	classifyToolCall,
	extractDiffFromToolCall,
	languageFromPath,
	makeEventId,
} from "./protocol";

type SseEvent = {
	event?: string;
	data: string;
};

export function parseSseBuffer(buffer: string): { events: SseEvent[]; remainder: string } {
	const blocks = buffer.split("\n\n");
	const remainder = blocks.pop() ?? "";
	const events: SseEvent[] = [];

	for (const block of blocks) {
		if (!block.trim()) continue;
		let eventType: string | undefined;
		const dataLines: string[] = [];

		for (const line of block.split("\n")) {
			if (line.startsWith("event:")) {
				eventType = line.slice(6).trim();
			} else if (line.startsWith("data:")) {
				dataLines.push(line.slice(5).trimStart());
			}
		}

		if (dataLines.length > 0) {
			events.push({ event: eventType, data: dataLines.join("\n") });
		}
	}

	return { events, remainder };
}

export async function* readSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const { events, remainder } = parseSseBuffer(buffer);
		buffer = remainder;
		for (const event of events) {
			yield event;
		}
	}
	if (buffer.trim()) {
		const { events } = parseSseBuffer(buffer + "\n\n");
		for (const event of events) {
			yield event;
		}
	}
}

/**
 * Process a single SSE event and return the updated accumulator.
 * Pure function -- does not mutate the input.
 */
export function processAgentEvent(
	sseEvent: SseEvent,
	acc: StreamAccumulator,
): StreamAccumulator {
	const next = { ...acc };

	if (sseEvent.data === "[DONE]") return next;

	const eventType = sseEvent.event ?? "";
	if (eventType === "error") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			next.events = [...next.events, { kind: "error", message: parsed.message ?? parsed.error ?? "Agent run failed.", timestamp: Date.now() }];
		} catch {
			next.events = [...next.events, { kind: "error", message: sseEvent.data || "Agent run failed.", timestamp: Date.now() }];
		}
		return next;
	}

	// ── Thinking ──────────────────────────────────────────────────
	if (eventType === "hermes.thinking" || eventType === "thinking") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const text = parsed.thinking ?? parsed.content ?? parsed.delta ?? "";
			if (next.activeThinking) {
				next.activeThinking = {
					...next.activeThinking,
					content: next.activeThinking.content + text,
				};
			} else {
				next.activeThinking = {
					kind: "thinking",
					id: makeEventId(),
					content: text,
					startedAt: Date.now(),
				};
			}
			upsertEvent(next, next.activeThinking);
		} catch { /* malformed */ }
		return next;
	}

	if (eventType === "hermes.thinking.done" || eventType === "thinking.done") {
		if (next.activeThinking) {
			next.activeThinking = { ...next.activeThinking, completedAt: Date.now() };
			upsertEvent(next, next.activeThinking);
			next.activeThinking = null;
		}
		return next;
	}

	// ── Tool start ────────────────────────────────────────────────
	if (
		eventType === "hermes.tool.start" ||
		eventType === "hermes.tool.call" ||
		eventType === "tool.start"
	) {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const name = parsed.name ?? parsed.function?.name ?? "unknown";
			const id = parsed.id ?? parsed.tool_call_id ?? makeEventId();
			const args = parsed.arguments ?? parsed.function?.arguments ?? "{}";
			const classified = classifyToolCall(name);

			if (classified === "shell_exec") {
				let command = name;
				try { command = JSON.parse(args).command ?? name; } catch { /* ok */ }
				const shellEvt: AgentEvent = {
					kind: "shell_exec",
					id,
					command,
					status: "running",
					startedAt: Date.now(),
				};
				next.activeShellExecs = new Map(next.activeShellExecs);
				next.activeShellExecs.set(id, shellEvt as AgentEvent & { kind: "shell_exec" });
				next.events = [...next.events, shellEvt];
			} else if (classified === "file_read") {
				let path = "";
				try { path = JSON.parse(args).path ?? JSON.parse(args).file ?? ""; } catch { /* ok */ }
				const readEvt: AgentEvent = {
					kind: "file_read",
					id,
					path,
					language: path ? languageFromPath(path) : undefined,
					timestamp: Date.now(),
				};
				next.events = [...next.events, readEvt];
			} else if (classified === "file_edit") {
				let path = "";
				try { path = JSON.parse(args).path ?? JSON.parse(args).file ?? ""; } catch { /* ok */ }
				const diff = extractDiffFromToolCall(name, args);
				const editEvt: AgentEvent = {
					kind: "file_edit",
					id,
					path,
					diff: diff ?? undefined,
					language: path ? languageFromPath(path) : undefined,
					timestamp: Date.now(),
				};
				next.events = [...next.events, editEvt];

				if (diff) {
					next.artifacts = [...next.artifacts, {
						id: makeEventId(),
						conversationId: "",
						turnId: "",
						kind: "diff",
						title: path || name,
						path,
						content: diff,
						language: path ? languageFromPath(path) : undefined,
						timestamp: Date.now(),
					}];
				}
			} else if (classified === "browser_action") {
				let url: string | undefined;
				try { url = JSON.parse(args).url; } catch { /* ok */ }
				const browserEvt: AgentEvent = {
					kind: "browser_action",
					id,
					action: name,
					url,
					timestamp: Date.now(),
				};
				next.events = [...next.events, browserEvt];
			} else {
				const toolCall: AgentToolCallEvent = {
					kind: "tool_call",
					id,
					name,
					arguments: args,
					status: "running",
					startedAt: Date.now(),
				};
				next.activeToolCalls = new Map(next.activeToolCalls);
				next.activeToolCalls.set(id, toolCall);
				next.events = [...next.events, toolCall];
			}
		} catch { /* malformed */ }
		return next;
	}

	// ── Tool progress ─────────────────────────────────────────────
	if (eventType === "hermes.tool.progress" || eventType === "tool.progress") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const id = parsed.id ?? parsed.tool_call_id;
			const delta = parsed.output ?? parsed.delta ?? "";

			if (id && next.activeToolCalls.has(id)) {
				const existing = next.activeToolCalls.get(id)!;
				const progressEvt: AgentEvent = {
					kind: "tool_progress",
					toolCallId: id,
					delta,
					accumulated: (findLastProgress(next.events, id) ?? "") + delta,
					timestamp: Date.now(),
				};
				next.events = [...next.events, progressEvt];
				void existing;
			}

			if (id && next.activeShellExecs.has(id)) {
				const existing = next.activeShellExecs.get(id)!;
				const updated = {
					...existing,
					stdout: (existing.stdout ?? "") + delta,
				};
				next.activeShellExecs = new Map(next.activeShellExecs);
				next.activeShellExecs.set(id, updated);
				replaceEvent(next, id, updated);
			}
		} catch { /* malformed */ }
		return next;
	}

	// ── Tool done ─────────────────────────────────────────────────
	if (
		eventType === "hermes.tool.done" ||
		eventType === "hermes.tool.result" ||
		eventType === "tool.done"
	) {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const id = parsed.id ?? parsed.tool_call_id;
			const output = parsed.output ?? parsed.result ?? "";
			const isError = Boolean(parsed.error);

			if (id && next.activeToolCalls.has(id)) {
				const existing = next.activeToolCalls.get(id)!;
				const resultEvt: AgentEvent = {
					kind: "tool_result",
					toolCallId: id,
					output,
					error: isError ? (parsed.error ?? output) : undefined,
					completedAt: Date.now(),
				};
				next.events = [...next.events, resultEvt];

				const diff = extractDiffFromToolCall(existing.name, existing.arguments, output);
				if (diff) {
					let path = "";
					try { path = JSON.parse(existing.arguments).path ?? ""; } catch { /* ok */ }
					next.artifacts = [...next.artifacts, {
						id: makeEventId(),
						conversationId: "",
						turnId: "",
						kind: "diff",
						title: path || existing.name,
						path,
						content: diff,
						language: path ? languageFromPath(path) : undefined,
						timestamp: Date.now(),
					}];
				}

				next.activeToolCalls = new Map(next.activeToolCalls);
				next.activeToolCalls.delete(id);
			}

			if (id && next.activeShellExecs.has(id)) {
				const existing = next.activeShellExecs.get(id)!;
				const updated = {
					...existing,
					stdout: output || existing.stdout,
					stderr: parsed.stderr,
					exitCode: parsed.exit_code ?? (isError ? 1 : 0),
					status: isError ? "error" as const : "completed" as const,
					completedAt: Date.now(),
				};
				next.activeShellExecs = new Map(next.activeShellExecs);
				next.activeShellExecs.delete(id);
				replaceEvent(next, id, updated);
			}
		} catch { /* malformed */ }
		return next;
	}

	// ── Status ────────────────────────────────────────────────────
	if (eventType === "hermes.status" || eventType === "status") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const statusEvt: AgentEvent = {
				kind: "status",
				label: parsed.label ?? parsed.status ?? "status",
				detail: parsed.detail ?? parsed.message,
				timestamp: Date.now(),
			};
			next.events = [...next.events, statusEvt];
		} catch { /* malformed */ }
		return next;
	}

	// ── Standard OpenAI chat.completion.chunk ─────────────────────
	if (!eventType || eventType === "message" || eventType === "chat.completion.chunk") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const choice = parsed.choices?.[0];
			if (!choice) return next;
			const delta = choice.delta;
			if (!delta) return next;

			if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
				for (const tc of delta.tool_calls) {
					const fnCall = tc.function;
					const tcId = tc.id ?? `tc_${tc.index ?? 0}`;

					if (fnCall?.name || !next.activeToolCalls.has(tcId)) {
						const name = fnCall?.name ?? "unknown";
						const toolCall: AgentToolCallEvent = {
							kind: "tool_call",
							id: tcId,
							name,
							arguments: fnCall?.arguments ?? "",
							status: "running",
							startedAt: Date.now(),
						};
						next.activeToolCalls = new Map(next.activeToolCalls);
						next.activeToolCalls.set(tcId, toolCall);
						next.events = [...next.events, toolCall];
					} else if (fnCall?.arguments) {
						const existing = next.activeToolCalls.get(tcId)!;
						const updated: AgentToolCallEvent = {
							...existing,
							arguments: existing.arguments + fnCall.arguments,
						};
						next.activeToolCalls = new Map(next.activeToolCalls);
						next.activeToolCalls.set(tcId, updated);
						replaceEvent(next, tcId, updated);
					}
				}
			}

			const content = delta.content ?? "";
			if (content) {
				if (next.activeThinking) {
					next.activeThinking = { ...next.activeThinking, completedAt: Date.now() };
					upsertEvent(next, next.activeThinking);
					next.activeThinking = null;
				}
				next.content += content;
				const textEvt: AgentEvent = {
					kind: "text",
					id: makeEventId(),
					delta: content,
					accumulated: next.content,
					timestamp: Date.now(),
				};
				next.events = [...next.events, textEvt];
			}

			const reasoning = delta.reasoning_content ?? delta.thinking ?? "";
			if (reasoning) {
				if (next.activeThinking) {
					next.activeThinking = {
						...next.activeThinking,
						content: next.activeThinking.content + reasoning,
					};
				} else {
					next.activeThinking = {
						kind: "thinking",
						id: makeEventId(),
						content: reasoning,
						startedAt: Date.now(),
					};
				}
				upsertEvent(next, next.activeThinking);
			}
		} catch { /* not JSON */ }
		return next;
	}

	return next;
}

// ── Helpers ───────────────────────────────────────────────────────

function upsertEvent(acc: StreamAccumulator, event: AgentEvent & { id: string }): void {
	const idx = acc.events.findIndex((e) => "id" in e && e.id === event.id);
	if (idx >= 0) {
		acc.events = [...acc.events];
		acc.events[idx] = event;
	} else {
		acc.events = [...acc.events, event];
	}
}

function replaceEvent(acc: StreamAccumulator, id: string, event: AgentEvent): void {
	acc.events = acc.events.map((e) => ("id" in e && e.id === id ? event : e));
}

function findLastProgress(events: AgentEvent[], toolCallId: string): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.kind === "tool_progress" && e.toolCallId === toolCallId) return e.accumulated;
	}
	return null;
}
