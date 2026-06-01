"use client";

/**
 * The middle panel: chronological activity stream of an agent conversation.
 *
 * Renders interleaved:
 *   - User messages (right-aligned bubbles)
 *   - Thinking blocks (collapsible, purple accent when live)
 *   - Tool call cards (collapsible, with args/result/timing)
 *   - File edit cards (with inline diff preview)
 *   - File read cards (collapsed path + language badge)
 *   - Shell exec cards (with stdout/stderr, exit code)
 *   - Browser action cards
 *   - Status badges
 *   - Assistant text (markdown-rendered)
 *   - Error banners
 *
 * The prompt input lives at the bottom of this panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type {
	AgentEvent,
	ConversationArtifact,
	ConversationTurn,
} from "@/lib/agents/protocol";

import { EventCard } from "./EventCard";

type HealthInfo = {
	ok: boolean;
	model?: string;
	apiHost?: string;
	error?: string;
};

export type ActivityStreamProps = {
	turns: ConversationTurn[];
	streaming: boolean;
	health: HealthInfo | null;
	error: string | null;
	disabled: boolean;
	model: string | null;
	agentKind: string | null;
	activeMachineId: string | null;
	artifactCount: number;
	rightPanelOpen: boolean;
	onToggleRightPanel: () => void;
	onSend: (text: string) => void;
	onStop: () => void;
	onSelectArtifact: (artifact: ConversationArtifact) => void;
};

export function ActivityStream({
	turns,
	streaming,
	health,
	error,
	disabled,
	model,
	agentKind,
	activeMachineId,
	artifactCount,
	rightPanelOpen,
	onToggleRightPanel,
	onSend,
	onStop,
	onSelectArtifact,
}: ActivityStreamProps) {
	const [input, setInput] = useState("");
	const [streamDuration, setStreamDuration] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const streamStartRef = useRef(0);

	useEffect(() => {
		const node = scrollRef.current;
		if (!node) return;
		node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
	}, [turns, streaming]);

	useEffect(() => {
		if (!streaming) {
			setStreamDuration(0);
			return;
		}
		streamStartRef.current = Date.now();
		const id = setInterval(() => setStreamDuration(Date.now() - streamStartRef.current), 100);
		return () => clearInterval(id);
	}, [streaming]);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const text = input.trim();
			if (text) {
				onSend(text);
				setInput("");
			}
		},
		[input, onSend],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				const text = input.trim();
				if (text) {
					onSend(text);
					setInput("");
				}
			}
		},
		[input, onSend],
	);

	return (
		<div className="flex h-full flex-col">
			{/* Header bar */}
			<header className="flex shrink-0 items-center justify-between border-b border-[var(--ret-border)] px-4 py-2">
				<div className="flex items-center gap-3">
					{health?.ok ? (
						<ReticleBadge variant="success">
							<span className="inline-block h-1.5 w-1.5 bg-[var(--ret-green)]" />
							online
						</ReticleBadge>
					) : health ? (
						<ReticleBadge variant="warning">offline</ReticleBadge>
					) : (
						<ReticleBadge>
							<BrailleSpinner name="orbit" className="text-[10px]" />
						</ReticleBadge>
					)}
					{model ? (
						<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{model}</span>
					) : null}
					{agentKind ? (
						<span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
							{agentKind}
						</span>
					) : null}
					{streaming ? (
						<ReticleBadge variant="accent">
							<BrailleSpinner name="braille" className="text-[10px]" />
							<span className="tabular-nums">{formatMs(streamDuration)}</span>
						</ReticleBadge>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{artifactCount > 0 ? (
						<ReticleButton
							variant="secondary"
							size="sm"
							onClick={onToggleRightPanel}
						>
							{rightPanelOpen ? "Hide" : "Show"} artifacts ({artifactCount})
						</ReticleButton>
					) : null}
					{streaming ? (
						<ReticleButton variant="secondary" size="sm" onClick={onStop}>
							Stop
						</ReticleButton>
					) : null}
				</div>
			</header>

			{/* Scrollable turn feed */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
				{turns.length === 0 && !disabled ? (
					<EmptyState onPick={onSend} />
				) : null}

				{disabled && !streaming ? (
					<div className="border border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-4 font-mono text-[12px] text-[var(--ret-amber)]">
						{!activeMachineId
							? "No active machine. Pick or provision one in /dashboard/machines."
							: "Agent gateway is offline. Wake the machine or bootstrap the agent."}
					</div>
				) : null}

				{turns.map((turn, i) => {
					const isLast = i === turns.length - 1;
					const isStreaming = streaming && isLast && turn.role === "assistant";

					return (
						<TurnBlock
							key={turn.id}
							turn={turn}
							streaming={isStreaming}
							onSelectArtifact={onSelectArtifact}
						/>
					);
				})}

				{error ? (
					<div className="mt-4 border border-[var(--ret-red)]/30 bg-[var(--ret-red)]/10 px-4 py-3 font-mono text-xs text-[var(--ret-red)]">
						{error}
					</div>
				) : null}
			</div>

			{/* Prompt input */}
			<form
				onSubmit={handleSubmit}
				className="flex shrink-0 items-end gap-3 border-t border-[var(--ret-border)] p-4"
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
						disabled
							? "Bootstrap or wake the agent gateway first."
							: "Message the agent. Shift+Enter for newline."
					}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					rows={1}
					disabled={streaming || disabled}
				/>
				<ReticleButton
					type="submit"
					variant="primary"
					size="md"
					disabled={streaming || disabled || !input.trim()}
				>
					Send
				</ReticleButton>
			</form>
		</div>
	);
}

function TurnBlock({
	turn,
	streaming,
	onSelectArtifact,
}: {
	turn: ConversationTurn;
	streaming: boolean;
	onSelectArtifact: (a: ConversationArtifact) => void;
}) {
	const isUser = turn.role === "user";
	const hasEvents = turn.events.length > 0;
	const contentEvents = turn.events.filter((e) => e.kind !== "text");

	return (
		<div className={cn("mb-6 flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
			{/* Role + metadata */}
			<div className={cn("flex items-center gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
				<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					{isUser ? "you" : "agent"}
				</span>
				{turn.durationMs && !streaming ? (
					<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{formatMs(turn.durationMs)}
					</span>
				) : null}
				{turn.model ? (
					<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
						{turn.model}
					</span>
				) : null}
				{streaming && !turn.content && !hasEvents ? (
					<BrailleSpinner name="braille" label="thinking" className="text-[10px] text-[var(--ret-purple)]" />
				) : null}
			</div>

			{/* Event timeline (non-text events only) */}
			{!isUser && contentEvents.length > 0 ? (
				<EventTimeline
					events={contentEvents}
					streaming={streaming}
					onSelectArtifact={onSelectArtifact}
				/>
			) : null}

			{/* Main content */}
			{turn.content ? (
				<div
					className={cn(
						"prose-msg max-w-[90%] px-4 py-3 text-sm leading-relaxed",
						isUser
							? "border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)]"
							: "border border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] text-[var(--ret-text)]",
					)}
				>
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{turn.content}
					</ReactMarkdown>
					{streaming ? <span className="ret-caret inline-block" aria-hidden="true" /> : null}
				</div>
			) : streaming && !hasEvents ? (
				<div className="border border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] px-4 py-3">
					<span className="ret-caret" aria-label="thinking" />
				</div>
			) : null}
		</div>
	);
}

function EventTimeline({
	events,
	streaming,
	onSelectArtifact,
}: {
	events: AgentEvent[];
	streaming: boolean;
	onSelectArtifact: (a: ConversationArtifact) => void;
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
				return (
					<div
						key={eventKey(event, i)}
						style={{
							animation: "ret-event-enter 0.2s ease-out both",
							animationDelay: `${Math.min(i * 30, 300)}ms`,
						}}
					>
						<EventCard
							event={event}
							active={streaming && isLast}
							forceExpand={expandAll}
							onSelectArtifact={onSelectArtifact}
						/>
					</div>
				);
			})}
		</div>
	);
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
	const starters = [
		{ label: "Introduce yourself", prompt: "Introduce yourself. What skills, tools, and MCP servers do you have loaded?" },
		{ label: "Show skills", prompt: "List every skill installed in ~/.agent-machines/skills/. One-line description each." },
		{ label: "Spawn a Cursor agent", prompt: "In /home/machine/work, scaffold a TypeScript project. Use cursor_agent with load_skills=['taste-output']." },
		{ label: "Schedule a briefing", prompt: "Schedule a daily 8am cron that summarizes overnight repo changes into ~/briefing.md." },
	];

	return (
		<div className="space-y-5">
			<div className="flex flex-col items-center gap-3 py-2 text-center">
				<SchematicPanel slug="console" className="w-full max-w-md" />
				<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					Talk to your machine
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
			{starters.map((s) => (
				<button
					key={s.label}
					type="button"
					onClick={() => onPick(s.prompt)}
					className={cn(
						"group border border-[var(--ret-border)] bg-[var(--ret-bg)]",
						"p-4 text-left transition-colors duration-200",
						"hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]",
					)}
				>
					<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] transition-colors group-hover:text-[var(--ret-purple)]">
						{s.label}
					</p>
					<p className="mt-2 text-sm text-[var(--ret-text-dim)]">{s.prompt}</p>
				</button>
			))}
			</div>
		</div>
	);
}

function eventKey(event: AgentEvent, index: number): string {
	if ("id" in event) return event.id;
	if (event.kind === "tool_progress") return `prog_${event.toolCallId}_${index}`;
	if (event.kind === "tool_result") return `res_${event.toolCallId}`;
	if (event.kind === "status") return `status_${event.timestamp}`;
	if (event.kind === "error") return `err_${event.timestamp}`;
	return `evt_${index}`;
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const m = Math.floor(ms / 60000);
	const s = Math.round((ms % 60000) / 1000);
	return `${m}m${s}s`;
}
