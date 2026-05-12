"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleCard } from "@/components/reticle/ReticleCard";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { Message, MessageEvent, ThinkingBlock, ToolCall } from "@/lib/types";

const STARTER_PROMPTS: ReadonlyArray<{ label: string; prompt: string }> = [
	{
		label: "Introduce yourself",
		prompt:
			"Introduce yourself in three sentences. Mention which skills you have loaded, which tools you can call (including any MCP servers), and which scheduled crons are running.",
	},
	{
		label: "Spawn a Cursor agent",
		prompt:
			"In /home/machine/work, scaffold a tiny TypeScript project that prints fibonacci(20). Use the cursor_agent tool with load_skills=['agent-ethos','taste-output']. Report what files it created and the final stdout.",
	},
	{
		label: "Show your skills",
		prompt:
			"List the skills installed in ~/.agent-machines/skills. For each, give a one-line description of what it does and when it would activate.",
	},
	{
		label: "Schedule a daily briefing",
		prompt:
			"Schedule a cron job to run every weekday at 8am that summarizes overnight changes in any active repos and writes the digest to ~/briefing.md.",
	},
];

function makeId(): string {
	return Math.random().toString(36).slice(2, 12);
}

type StreamState = "idle" | "streaming" | "error";

type HealthInfo = {
	ok: boolean;
	model?: string;
	apiHost?: string;
	error?: string;
	message?: string;
};

type SseEvent = {
	event?: string;
	data: string;
};

function parseSseBuffer(buffer: string): { events: SseEvent[]; remainder: string } {
	const blocks = buffer.split("\n\n");
	const remainder = blocks.pop() ?? "";
	const events: SseEvent[] = [];

	for (const block of blocks) {
		if (!block.trim()) continue;
		let eventType: string | undefined;
		let dataLines: string[] = [];

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

type StreamAccumulator = {
	content: string;
	events: MessageEvent[];
	activeThinking: ThinkingBlock | null;
	activeToolCalls: Map<string, ToolCall>;
};

function processEvent(
	sseEvent: SseEvent,
	acc: StreamAccumulator,
): StreamAccumulator {
	const next = { ...acc };

	if (sseEvent.data === "[DONE]") return next;

	const eventType = sseEvent.event ?? "";

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
					id: makeId(),
					content: text,
					startedAt: Date.now(),
				};
			}
			const existing = next.events.findIndex(
				(e) => e.type === "thinking" && e.thinking.id === next.activeThinking!.id,
			);
			const thinkingEvent: MessageEvent = {
				type: "thinking",
				thinking: next.activeThinking,
			};
			if (existing >= 0) {
				next.events = [...next.events];
				next.events[existing] = thinkingEvent;
			} else {
				next.events = [...next.events, thinkingEvent];
			}
		} catch {
			// malformed thinking event
		}
		return next;
	}

	if (eventType === "hermes.thinking.done" || eventType === "thinking.done") {
		if (next.activeThinking) {
			next.activeThinking = { ...next.activeThinking, completedAt: Date.now() };
			const idx = next.events.findIndex(
				(e) => e.type === "thinking" && e.thinking.id === next.activeThinking!.id,
			);
			if (idx >= 0) {
				next.events = [...next.events];
				next.events[idx] = { type: "thinking", thinking: next.activeThinking };
			}
			next.activeThinking = null;
		}
		return next;
	}

	if (
		eventType === "hermes.tool.start" ||
		eventType === "hermes.tool.call" ||
		eventType === "tool.start"
	) {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const toolCall: ToolCall = {
				id: parsed.id ?? parsed.tool_call_id ?? makeId(),
				name: parsed.name ?? parsed.function?.name ?? "unknown",
				arguments: parsed.arguments ?? parsed.function?.arguments ?? "{}",
				status: "running",
				startedAt: Date.now(),
			};
			next.activeToolCalls = new Map(next.activeToolCalls);
			next.activeToolCalls.set(toolCall.id, toolCall);
			next.events = [
				...next.events,
				{ type: "tool_call", toolCall },
			];
		} catch {
			// malformed tool event
		}
		return next;
	}

	if (eventType === "hermes.tool.progress" || eventType === "tool.progress") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const id = parsed.id ?? parsed.tool_call_id;
			if (id && next.activeToolCalls.has(id)) {
				const existing = next.activeToolCalls.get(id)!;
				const updated: ToolCall = {
					...existing,
					result: (existing.result ?? "") + (parsed.output ?? parsed.delta ?? ""),
				};
				next.activeToolCalls = new Map(next.activeToolCalls);
				next.activeToolCalls.set(id, updated);
				next.events = next.events.map((e) =>
					e.type === "tool_call" && e.toolCall.id === id
						? { ...e, toolCall: updated }
						: e,
				);
			}
		} catch {
			// malformed progress event
		}
		return next;
	}

	if (
		eventType === "hermes.tool.done" ||
		eventType === "hermes.tool.result" ||
		eventType === "tool.done"
	) {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const id = parsed.id ?? parsed.tool_call_id;
			if (id && next.activeToolCalls.has(id)) {
				const existing = next.activeToolCalls.get(id)!;
				const updated: ToolCall = {
					...existing,
					status: parsed.error ? "error" : "completed",
					result: parsed.output ?? parsed.result ?? existing.result ?? "",
					completedAt: Date.now(),
				};
				next.activeToolCalls = new Map(next.activeToolCalls);
				next.activeToolCalls.set(id, updated);
				next.events = next.events.map((e) =>
					e.type === "tool_call" && e.toolCall.id === id
						? { ...e, toolCall: updated }
						: e,
				);
			}
		} catch {
			// malformed done event
		}
		return next;
	}

	if (eventType === "hermes.status" || eventType === "status") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			next.events = [
				...next.events,
				{
					type: "status",
					label: parsed.label ?? parsed.status ?? "status",
					detail: parsed.detail ?? parsed.message,
					timestamp: Date.now(),
				},
			];
		} catch {
			// malformed status event
		}
		return next;
	}

	// Standard OpenAI chat completion chunk
	if (!eventType || eventType === "message" || eventType === "chat.completion.chunk") {
		try {
			const parsed = JSON.parse(sseEvent.data);
			const choice = parsed.choices?.[0];
			if (!choice) return next;

			const delta = choice.delta;
			if (!delta) return next;

			// Handle tool_calls in delta (OpenAI format)
			if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
				for (const tc of delta.tool_calls) {
					const fnCall = tc.function;
					const tcId = tc.id ?? `tc_${tc.index ?? 0}`;
					if (fnCall?.name || !next.activeToolCalls.has(tcId)) {
						const toolCall: ToolCall = {
							id: tcId,
							name: fnCall?.name ?? "unknown",
							arguments: fnCall?.arguments ?? "",
							status: "running",
							startedAt: Date.now(),
						};
						next.activeToolCalls = new Map(next.activeToolCalls);
						next.activeToolCalls.set(tcId, toolCall);
						next.events = [...next.events, { type: "tool_call", toolCall }];
					} else if (fnCall?.arguments) {
						const existing = next.activeToolCalls.get(tcId)!;
						const updated: ToolCall = {
							...existing,
							arguments: existing.arguments + fnCall.arguments,
						};
						next.activeToolCalls = new Map(next.activeToolCalls);
						next.activeToolCalls.set(tcId, updated);
						next.events = next.events.map((e) =>
							e.type === "tool_call" && e.toolCall.id === tcId
								? { ...e, toolCall: updated }
								: e,
						);
					}
				}
			}

			// Content delta
			const content = delta.content ?? "";
			if (content) {
				// If we had active thinking, finalize it
				if (next.activeThinking) {
					next.activeThinking = { ...next.activeThinking, completedAt: Date.now() };
					const idx = next.events.findIndex(
						(e) => e.type === "thinking" && e.thinking.id === next.activeThinking!.id,
					);
					if (idx >= 0) {
						next.events = [...next.events];
						next.events[idx] = { type: "thinking", thinking: next.activeThinking };
					}
					next.activeThinking = null;
				}
				next.content = next.content + content;
			}

			// Some APIs send reasoning_content for thinking
			const reasoning = delta.reasoning_content ?? delta.thinking ?? "";
			if (reasoning) {
				if (next.activeThinking) {
					next.activeThinking = {
						...next.activeThinking,
						content: next.activeThinking.content + reasoning,
					};
				} else {
					next.activeThinking = {
						id: makeId(),
						content: reasoning,
						startedAt: Date.now(),
					};
				}
				const thinkingEvent: MessageEvent = {
					type: "thinking",
					thinking: next.activeThinking,
				};
				const existing = next.events.findIndex(
					(e) => e.type === "thinking" && e.thinking.id === next.activeThinking!.id,
				);
				if (existing >= 0) {
					next.events = [...next.events];
					next.events[existing] = thinkingEvent;
				} else {
					next.events = [...next.events, thinkingEvent];
				}
			}
		} catch {
			// not JSON or unrecognized format
		}
		return next;
	}

	return next;
}

async function* readSseEvents(
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
	// flush remainder
	if (buffer.trim()) {
		const { events } = parseSseBuffer(buffer + "\n\n");
		for (const event of events) {
			yield event;
		}
	}
}

export type ChatProps = {
	messages: Message[];
	onMessagesChange: (next: Message[]) => void;
	onTurnComplete?: (final: Message[]) => void;
	disabled?: boolean;
	disabledReason?: string;
};

export function Chat({
	messages,
	onMessagesChange,
	onTurnComplete,
	disabled,
	disabledReason,
}: ChatProps) {
	const [input, setInput] = useState("");
	const [state, setState] = useState<StreamState>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [health, setHealth] = useState<HealthInfo | null>(null);
	const [streamDuration, setStreamDuration] = useState(0);
	const transcriptRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const messagesRef = useRef(messages);
	const streamStartRef = useRef(0);
	messagesRef.current = messages;

	useEffect(() => {
		fetch("/api/dashboard/gateway")
			.then((r) => r.json())
			.then((info: HealthInfo) => setHealth(info))
			.catch(() => setHealth({ ok: false, error: "unreachable" }));
	}, []);

	useEffect(() => {
		const node = transcriptRef.current;
		if (!node) return;
		node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
	}, [messages, state]);

	// Tick the duration counter while streaming
	useEffect(() => {
		if (state !== "streaming") {
			setStreamDuration(0);
			return;
		}
		const id = setInterval(() => {
			setStreamDuration(Date.now() - streamStartRef.current);
		}, 100);
		return () => clearInterval(id);
	}, [state]);

	const send = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed || state === "streaming" || disabled) return;

			setErrorMessage(null);
			streamStartRef.current = Date.now();
			const userMsg: Message = {
				id: makeId(),
				role: "user",
				content: trimmed,
				createdAt: Date.now(),
			};
			const assistantMsg: Message = {
				id: makeId(),
				role: "assistant",
				content: "",
				createdAt: Date.now(),
				events: [],
			};
			const next = [...messagesRef.current, userMsg, assistantMsg];
			onMessagesChange(next);
			messagesRef.current = next;
			setInput("");
			setState("streaming");

			const ctrl = new AbortController();
			abortRef.current = ctrl;

			try {
				const upstream = next.slice(0, -1).map((m) => ({
					role: m.role,
					content: m.content,
				}));
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ messages: upstream }),
					signal: ctrl.signal,
				});

				if (!response.ok || !response.body) {
					const detail = await response.json().catch(() => ({}));
					throw new Error(
						detail?.message || detail?.error || `HTTP ${response.status}`,
					);
				}

				let acc: StreamAccumulator = {
					content: "",
					events: [],
					activeThinking: null,
					activeToolCalls: new Map(),
				};

				for await (const sseEvent of readSseEvents(response.body)) {
					acc = processEvent(sseEvent, acc);
					const updated = messagesRef.current.map((m) =>
						m.id === assistantMsg.id
							? {
									...m,
									content: acc.content,
									events: acc.events.length > 0 ? acc.events : undefined,
									durationMs: Date.now() - streamStartRef.current,
								}
							: m,
					);
					messagesRef.current = updated;
					onMessagesChange(updated);
				}

				// Finalize any active tool calls as completed
				for (const [, tc] of acc.activeToolCalls) {
					if (tc.status === "running") {
						const updated: ToolCall = { ...tc, status: "completed", completedAt: Date.now() };
						acc.events = acc.events.map((e) =>
							e.type === "tool_call" && e.toolCall.id === tc.id
								? { ...e, toolCall: updated }
								: e,
						);
					}
				}

				const finalMessages = messagesRef.current.map((m) =>
					m.id === assistantMsg.id
						? {
								...m,
								content: acc.content,
								events: acc.events.length > 0 ? acc.events : undefined,
								durationMs: Date.now() - streamStartRef.current,
							}
						: m,
				);
				messagesRef.current = finalMessages;
				onMessagesChange(finalMessages);
				setState("idle");
				onTurnComplete?.(finalMessages);
			} catch (err) {
				if (ctrl.signal.aborted) {
					setState("idle");
					return;
				}
				const message = err instanceof Error ? err.message : "unknown_error";
				setErrorMessage(message);
				setState("error");
				const trimmedMessages = messagesRef.current.filter(
					(m) => !(m.id === assistantMsg.id && m.content === ""),
				);
				messagesRef.current = trimmedMessages;
				onMessagesChange(trimmedMessages);
			} finally {
				abortRef.current = null;
			}
		},
		[disabled, onMessagesChange, onTurnComplete, state],
	);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setState("idle");
	}, []);

	const onSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			send(input);
		},
		[input, send],
	);

	const onTextareaKey = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				send(input);
			}
		},
		[input, send],
	);

	const showStarters = messages.length === 0 && !disabled;
	const gatewayUnavailable = health?.ok === false;
	const effectiveDisabled = disabled || gatewayUnavailable;
	const effectiveDisabledReason =
		disabledReason ??
		(gatewayUnavailable
			? health?.message ?? health?.error ?? "Agent gateway is offline."
			: undefined);

	const statusBadge = useMemo(() => {
		if (!health) {
			return (
				<ReticleBadge>
					<BrailleSpinner name="orbit" label="probing" className="text-[10px]" />
				</ReticleBadge>
			);
		}
		if (health.ok) {
			return (
				<ReticleBadge variant="success">
					<span className="inline-block h-1.5 w-1.5 bg-[var(--ret-green)]" />
					online
				</ReticleBadge>
			);
		}
		return <ReticleBadge variant="warning">offline</ReticleBadge>;
	}, [health]);

	const streamingBadge = state === "streaming" ? (
		<ReticleBadge variant="accent">
			<BrailleSpinner name="braille" className="text-[10px]" />
			<span className="tabular-nums">{formatMs(streamDuration)}</span>
		</ReticleBadge>
	) : null;

	return (
		<div className="flex flex-col gap-4">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<ReticleLabel>SESSION</ReticleLabel>
					{statusBadge}
					{streamingBadge}
					{health?.apiHost ? (
						<span className="font-mono text-[11px] text-[var(--ret-text-dim)]">
							{health.apiHost}
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{state === "streaming" ? (
						<ReticleButton variant="secondary" size="sm" onClick={stop}>
							Stop
						</ReticleButton>
					) : null}
				</div>
			</header>

			<ReticleCard hoverable={false} className="flex flex-col">
				<div
					ref={transcriptRef}
					className="flex max-h-[70vh] min-h-[480px] flex-col gap-6 overflow-y-auto p-5 md:p-7"
				>
					{effectiveDisabled && effectiveDisabledReason ? (
						<div className="border border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-4 font-mono text-[12px] text-[var(--ret-amber)]">
							{effectiveDisabledReason}
						</div>
					) : null}
					{showStarters ? <StarterGrid onPick={send} /> : null}
					{messages.map((m, i) => (
						<MessageRow
							key={m.id}
							message={m}
							streaming={state === "streaming" && i === messages.length - 1}
						/>
					))}
					{errorMessage ? (
						<div className="border border-[var(--ret-red)]/30 bg-[var(--ret-red)]/10 px-4 py-3 font-mono text-xs text-[var(--ret-red)]">
							error: {errorMessage}
						</div>
					) : null}
				</div>

				<form
					onSubmit={onSubmit}
					className="flex items-end gap-3 border-t border-[var(--ret-border)] p-4"
				>
					<textarea
						className={cn(
							"min-h-[44px] max-h-[200px] flex-1 resize-none",
							"border border-[var(--ret-border)] bg-[var(--ret-bg)]",
							"px-3 py-2.5 text-sm text-[var(--ret-text)]",
							"placeholder:text-[var(--ret-text-muted)]",
							"focus:border-[var(--ret-purple)] focus:outline-none",
							"font-mono",
						)}
						placeholder={
							effectiveDisabled
								? "Bootstrap or wake the agent gateway first."
								: "Ask the agent something. Shift+Enter for newline."
						}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={onTextareaKey}
						rows={1}
						disabled={state === "streaming" || effectiveDisabled}
					/>
					<ReticleButton
						type="submit"
						variant="primary"
						size="md"
						disabled={state === "streaming" || effectiveDisabled || !input.trim()}
					>
						Send
					</ReticleButton>
				</form>
			</ReticleCard>
		</div>
	);
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function StarterGrid({ onPick }: { onPick: (prompt: string) => void }) {
	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
			{STARTER_PROMPTS.map((s) => (
				<button
					key={s.label}
					onClick={() => onPick(s.prompt)}
					className={cn(
						"group border border-[var(--ret-border)] bg-[var(--ret-bg)]",
						"p-4 text-left transition-colors duration-200",
						"hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]",
					)}
					type="button"
				>
					<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] transition-colors group-hover:text-[var(--ret-purple)]">
						{s.label}
					</p>
					<p className="mt-2 text-sm text-[var(--ret-text-dim)]">{s.prompt}</p>
				</button>
			))}
		</div>
	);
}

function MessageRow({
	message,
	streaming,
}: {
	message: Message;
	streaming: boolean;
}) {
	const isUser = message.role === "user";
	const isStreaming = streaming && !isUser;
	const hasEvents = message.events && message.events.length > 0;
	const isEmpty = !message.content && !hasEvents;

	return (
		<div
			className={cn(
				"flex flex-col gap-2",
				isUser ? "items-end" : "items-start",
			)}
		>
			{/* Role label + metadata */}
			<div className={cn(
				"flex items-center gap-2",
				isUser ? "flex-row-reverse" : "flex-row",
			)}>
				<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					{isUser ? "you" : "agent"}
				</span>
				{message.durationMs && !isStreaming ? (
					<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{formatMs(message.durationMs)}
					</span>
				) : null}
				{isStreaming && isEmpty ? (
					<BrailleSpinner name="braille" label="thinking" className="text-[10px] text-[var(--ret-purple)]" />
				) : null}
			</div>

			{/* Events timeline (thinking, tool calls, status) */}
			{hasEvents && !isUser ? (
				<EventsTimeline events={message.events!} streaming={isStreaming} />
			) : null}

			{/* Main content bubble */}
			{message.content ? (
				<div
					className={cn(
						"prose-msg max-w-[90%] px-4 py-3 text-sm leading-relaxed",
						isUser
							? "border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)]"
							: "border border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] text-[var(--ret-text)]",
					)}
				>
					{isStreaming && message.content ? (
						<>
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{message.content}
							</ReactMarkdown>
							<span className="ret-caret inline-block" aria-hidden="true" />
						</>
					) : (
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{message.content}
						</ReactMarkdown>
					)}
				</div>
			) : isStreaming && !hasEvents ? (
				<div className="border border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] px-4 py-3">
					<span className="ret-caret" aria-label="thinking" />
				</div>
			) : null}
		</div>
	);
}

function EventsTimeline({
	events,
	streaming,
}: {
	events: MessageEvent[];
	streaming: boolean;
}) {
	const [expandAll, setExpandAll] = useState(false);

	return (
		<div className="flex w-full max-w-[90%] flex-col gap-1.5">
			{events.length > 2 ? (
				<button
					type="button"
					onClick={() => setExpandAll((v) => !v)}
					className="mb-1 self-start font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-purple)]"
				>
					{expandAll ? "collapse all" : `${events.length} events · expand all`}
				</button>
			) : null}
			{events.map((event, i) => {
				const isLast = i === events.length - 1;
				const style = {
					animation: "ret-event-enter 0.2s ease-out both",
					animationDelay: `${Math.min(i * 30, 300)}ms`,
				} as React.CSSProperties;

				switch (event.type) {
					case "thinking":
						return (
							<div key={event.thinking.id} style={style}>
								<ThinkingCard
									thinking={event.thinking}
									active={isLast && streaming && !event.thinking.completedAt}
									forceExpand={expandAll}
								/>
							</div>
						);
					case "tool_call":
						return (
							<div key={event.toolCall.id} style={style}>
								<ToolCallCard
									toolCall={event.toolCall}
									active={isLast && streaming && event.toolCall.status === "running"}
									forceExpand={expandAll}
								/>
							</div>
						);
					case "status":
						return (
							<div key={`${event.label}-${event.timestamp}`} style={style}>
								<StatusPill
									label={event.label}
									detail={event.detail}
								/>
							</div>
						);
					default:
						return null;
				}
			})}
		</div>
	);
}

function ThinkingCard({
	thinking,
	active,
	forceExpand,
}: {
	thinking: ThinkingBlock;
	active: boolean;
	forceExpand?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isExpanded = forceExpand ?? expanded;
	const lines = thinking.content.split("\n").filter(Boolean);
	const preview = lines.slice(0, 3).join("\n");
	const hasMore = lines.length > 3;

	return (
		<div
			className={cn(
				"group border bg-[var(--ret-bg)] transition-all duration-200",
				active
					? "border-[var(--ret-purple)]/40 shadow-[0_0_12px_rgba(var(--ret-purple-rgb),0.08)]"
					: "border-[var(--ret-border)]",
			)}
		>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
			>
				<span className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px]",
					active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]",
				)}>
					{active ? (
						<BrailleSpinner name="breathe" className="text-[11px]" />
					) : (
						"◆"
					)}
				</span>
				<span className="flex-1 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
					thinking
					{thinking.completedAt ? (
						<span className="ml-2 normal-case tracking-normal text-[var(--ret-text-muted)]">
							{formatMs(thinking.completedAt - thinking.startedAt)}
						</span>
					) : null}
				</span>
				<span
					className={cn(
						"font-mono text-[11px] text-[var(--ret-text-muted)] transition-transform",
						isExpanded ? "rotate-90" : "rotate-0",
					)}
				>
					{">"}
				</span>
			</button>
			{isExpanded ? (
				<div className="border-t border-[var(--ret-border)] px-3 py-2.5">
					<pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
						{thinking.content}
					</pre>
				</div>
			) : thinking.content ? (
				<div className="border-t border-[var(--ret-border)]/50 px-3 py-2">
					<p className="line-clamp-2 font-mono text-[11px] text-[var(--ret-text-muted)] opacity-70">
						{preview}
						{hasMore && !isExpanded ? "..." : ""}
					</p>
				</div>
			) : null}
		</div>
	);
}

function ToolCallCard({
	toolCall,
	active,
	forceExpand,
}: {
	toolCall: ToolCall;
	active: boolean;
	forceExpand?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isExpanded = forceExpand ?? expanded;
	const statusColor =
		toolCall.status === "completed"
			? "text-[var(--ret-green)]"
			: toolCall.status === "error"
				? "text-[var(--ret-red)]"
				: "text-[var(--ret-amber)]";

	const statusIcon =
		toolCall.status === "completed"
			? "✓"
			: toolCall.status === "error"
				? "✗"
				: null;

	let parsedArgs: string = "";
	try {
		const obj = JSON.parse(toolCall.arguments);
		parsedArgs = JSON.stringify(obj, null, 2);
	} catch {
		parsedArgs = toolCall.arguments;
	}

	const duration =
		toolCall.completedAt && toolCall.startedAt
			? toolCall.completedAt - toolCall.startedAt
			: null;

	return (
		<div
			className={cn(
				"group border transition-all duration-200",
				active
					? "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5"
					: toolCall.status === "error"
						? "border-[var(--ret-red)]/30 bg-[var(--ret-red)]/5"
						: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
			)}
		>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
			>
				<span className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px]",
					statusColor,
				)}>
					{active ? (
						<BrailleSpinner name="cascade" className="text-[11px]" />
					) : (
						statusIcon ?? "●"
					)}
				</span>
				<span className="flex-1 truncate font-mono text-[12px] text-[var(--ret-text)]">
					{toolCall.name}
					{active ? (
						<span className="ml-2 text-[10px] text-[var(--ret-amber)]">running</span>
					) : null}
				</span>
				{duration ? (
					<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{formatMs(duration)}
					</span>
				) : null}
				<span
					className={cn(
						"font-mono text-[11px] text-[var(--ret-text-muted)] transition-transform",
						isExpanded ? "rotate-90" : "rotate-0",
					)}
				>
					{">"}
				</span>
			</button>
			{isExpanded ? (
				<div className="flex flex-col gap-2 border-t border-[var(--ret-border)] px-3 py-2.5">
					{parsedArgs && parsedArgs !== "{}" ? (
						<div>
							<p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
								arguments
							</p>
							<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--ret-text-dim)]">
								{parsedArgs}
							</pre>
						</div>
					) : null}
					{toolCall.result ? (
						<div>
							<p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
								result
							</p>
							<pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--ret-text-dim)]">
								{toolCall.result}
							</pre>
						</div>
					) : active ? (
						<div className="flex items-center gap-2 py-1">
							<BrailleSpinner name="scan" className="text-[10px] text-[var(--ret-amber)]" />
							<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
								awaiting result...
							</span>
						</div>
					) : null}
				</div>
			) : toolCall.result ? (
				<div className="border-t border-[var(--ret-border)]/50 px-3 py-1.5">
					<p className="line-clamp-1 font-mono text-[10px] text-[var(--ret-text-muted)] opacity-70">
						→ {toolCall.result.slice(0, 120)}
						{toolCall.result.length > 120 ? "..." : ""}
					</p>
				</div>
			) : null}
		</div>
	);
}

function StatusPill({
	label,
	detail,
}: {
	label: string;
	detail?: string;
}) {
	return (
		<div className="flex items-center gap-2 px-1 py-0.5">
			<span className="inline-block h-1 w-1 bg-[var(--ret-text-muted)]" />
			<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
				{label}
			</span>
			{detail ? (
				<span className="font-mono text-[10px] text-[var(--ret-text-dim)]">
					{detail}
				</span>
			) : null}
		</div>
	);
}

/* ─── Utilities ──────────────────────────────────────────────────────── */

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const m = Math.floor(ms / 60000);
	const s = Math.round((ms % 60000) / 1000);
	return `${m}m${s}s`;
}
