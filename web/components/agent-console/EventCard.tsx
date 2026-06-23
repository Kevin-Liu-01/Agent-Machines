"use client";

/**
 * Renders a single AgentEvent as a collapsible card in the activity stream.
 *
 * Each event kind gets its own visual treatment:
 *   thinking    → purple accent, expandable reasoning trace
 *   tool_call   → amber while running, green/red on complete, args + result
 *   file_edit   → diff preview with +/- coloring
 *   file_read   → collapsed path with language badge
 *   shell_exec  → terminal-styled stdout/stderr with exit code
 *   browser     → action name + URL + screenshot thumbnail
 *   status      → inline pill
 *   error       → red banner
 */

import { useState } from "react";

import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { AgentEvent, ConversationArtifact } from "@/lib/agents/protocol";

type Props = {
	event: AgentEvent;
	active: boolean;
	forceExpand?: boolean;
	onSelectArtifact?: (a: ConversationArtifact) => void;
};

export function EventCard({ event, active, forceExpand }: Props) {
	switch (event.kind) {
		case "thinking":
			return <ThinkingCard event={event} active={active} forceExpand={forceExpand} />;
		case "tool_call":
			return <ToolCallCard event={event} active={active} forceExpand={forceExpand} />;
		case "file_edit":
			return <FileEditCard event={event} forceExpand={forceExpand} />;
		case "file_read":
			return <FileReadCard event={event} />;
		case "shell_exec":
			return <ShellExecCard event={event} active={active} forceExpand={forceExpand} />;
		case "browser_action":
			return <BrowserActionCard event={event} />;
		case "status":
			return <StatusPill event={event} />;
		case "error":
			return <ErrorBanner event={event} />;
		case "text":
		case "tool_progress":
		case "tool_result":
			return null;
		default:
			return null;
	}
}

function ThinkingCard({
	event,
	active,
	forceExpand,
}: {
	event: AgentEvent & { kind: "thinking" };
	active: boolean;
	forceExpand?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isExpanded = forceExpand ?? expanded;
	const lines = event.content.split("\n").filter(Boolean);
	const preview = lines.slice(0, 3).join("\n");
	const hasMore = lines.length > 3;
	const duration = event.completedAt ? event.completedAt - event.startedAt : null;

	return (
		<div className={cn(
			"group border bg-[var(--ret-bg)] transition-[background-color,border-color,box-shadow] duration-[var(--ret-duration-hover)] [transition-timing-function:var(--ret-ease-out)]",
			active ? "border-[var(--ret-purple)]/40 shadow-[0_0_12px_rgba(var(--ret-purple-rgb),0.08)]" : "border-[var(--ret-border)]",
		)}>
			<button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
				<span className={cn("flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px]", active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]")}>
					{active ? <BrailleSpinner name="breathe" className="text-[11px]" /> : "◆"}
				</span>
				<span className="flex-1 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
					thinking
					{duration ? <span className="ml-2 normal-case tracking-normal">{formatMs(duration)}</span> : null}
				</span>
				<span className={cn("font-mono text-[11px] text-[var(--ret-text-muted)] transition-transform", isExpanded ? "rotate-90" : "rotate-0")}>{">"}</span>
			</button>
			{isExpanded ? (
				<div className="border-t border-[var(--ret-border)] px-3 py-2.5">
					<pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)]">{event.content}</pre>
				</div>
			) : event.content ? (
				<div className="border-t border-[var(--ret-border)]/50 px-3 py-2">
					<p className="line-clamp-2 font-mono text-[11px] text-[var(--ret-text-muted)] opacity-70">
						{preview}{hasMore ? "..." : ""}
					</p>
				</div>
			) : null}
		</div>
	);
}

function ToolCallCard({
	event,
	active,
	forceExpand,
}: {
	event: AgentEvent & { kind: "tool_call" };
	active: boolean;
	forceExpand?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isExpanded = forceExpand ?? expanded;
	const statusColor = event.status === "completed" ? "text-[var(--ret-green)]" : event.status === "error" ? "text-[var(--ret-red)]" : "text-[var(--ret-amber)]";
	const statusIcon = event.status === "completed" ? "✓" : event.status === "error" ? "✗" : null;
	const duration = event.completedAt && event.startedAt ? event.completedAt - event.startedAt : null;

	let parsedArgs = "";
	try { parsedArgs = JSON.stringify(JSON.parse(event.arguments), null, 2); } catch { parsedArgs = event.arguments; }

	return (
		<div className={cn(
			"group border transition-[background-color,border-color,box-shadow] duration-[var(--ret-duration-hover)] [transition-timing-function:var(--ret-ease-out)]",
			active ? "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5" : event.status === "error" ? "border-[var(--ret-red)]/30 bg-[var(--ret-red)]/5" : "border-[var(--ret-border)] bg-[var(--ret-bg)]",
		)}>
			<button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
				<span className={cn("flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px]", statusColor)}>
					{active ? <BrailleSpinner name="cascade" className="text-[11px]" /> : statusIcon ?? "●"}
				</span>
				<span className="flex-1 truncate font-mono text-[12px] text-[var(--ret-text)]">
					{event.name}
					{active ? <span className="ml-2 text-[10px] text-[var(--ret-amber)]">running</span> : null}
				</span>
				{duration ? <span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{formatMs(duration)}</span> : null}
				<span className={cn("font-mono text-[11px] text-[var(--ret-text-muted)] transition-transform", isExpanded ? "rotate-90" : "rotate-0")}>{">"}</span>
			</button>
			{isExpanded ? (
				<div className="flex flex-col gap-2 border-t border-[var(--ret-border)] px-3 py-2.5">
					{parsedArgs && parsedArgs !== "{}" ? (
						<div>
							<p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">arguments</p>
							<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--ret-text-dim)]">{parsedArgs}</pre>
						</div>
					) : null}
					{active ? (
						<div className="flex items-center gap-2 py-1">
							<BrailleSpinner name="scan" className="text-[10px] text-[var(--ret-amber)]" />
							<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">awaiting result...</span>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function FileEditCard({
	event,
	forceExpand,
}: {
	event: AgentEvent & { kind: "file_edit" };
	forceExpand?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isExpanded = forceExpand ?? expanded;

	return (
		<div className="group border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
				<span className="flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px] text-[var(--ret-green)]">✎</span>
				<span className="flex-1 truncate font-mono text-[12px] text-[var(--ret-text)]">{event.path || "file edit"}</span>
				{event.language ? <span className="font-mono text-[9px] uppercase text-[var(--ret-text-muted)]">{event.language}</span> : null}
				<span className={cn("font-mono text-[11px] text-[var(--ret-text-muted)] transition-transform", isExpanded ? "rotate-90" : "rotate-0")}>{">"}</span>
			</button>
			{isExpanded && event.diff ? (
				<div className="border-t border-[var(--ret-border)] px-3 py-2.5">
					<pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
						{event.diff.split("\n").map((line, i) => (
							<span key={i} className={cn(
								"block",
								line.startsWith("+") && !line.startsWith("+++") ? "bg-[var(--ret-green)]/10 text-[var(--ret-green)]" : "",
								line.startsWith("-") && !line.startsWith("---") ? "bg-[var(--ret-red)]/10 text-[var(--ret-red)]" : "",
								line.startsWith("@@") ? "text-[var(--ret-purple)]" : "",
								!line.startsWith("+") && !line.startsWith("-") && !line.startsWith("@@") ? "text-[var(--ret-text-dim)]" : "",
							)}>
								{line}
							</span>
						))}
					</pre>
				</div>
			) : null}
		</div>
	);
}

function FileReadCard({ event }: { event: AgentEvent & { kind: "file_read" } }) {
	return (
		<div className="flex items-center gap-2.5 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2">
			<span className="flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px] text-[var(--ret-text-muted)]">⊡</span>
			<span className="flex-1 truncate font-mono text-[12px] text-[var(--ret-text)]">{event.path || "read"}</span>
			{event.language ? <span className="font-mono text-[9px] uppercase text-[var(--ret-text-muted)]">{event.language}</span> : null}
			{event.lineStart ? <span className="font-mono text-[9px] text-[var(--ret-text-muted)]">L{event.lineStart}{event.lineEnd ? `-${event.lineEnd}` : ""}</span> : null}
		</div>
	);
}

function ShellExecCard({
	event,
	active,
	forceExpand,
}: {
	event: AgentEvent & { kind: "shell_exec" };
	active: boolean;
	forceExpand?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isExpanded = forceExpand ?? expanded;
	const hasOutput = Boolean(event.stdout || event.stderr);
	const statusColor = event.status === "completed" ? "text-[var(--ret-green)]" : event.status === "error" ? "text-[var(--ret-red)]" : "text-[var(--ret-amber)]";
	const duration = event.completedAt && event.startedAt ? event.completedAt - event.startedAt : null;

	return (
		<div className={cn(
			"group border transition-[background-color,border-color,box-shadow] duration-[var(--ret-duration-hover)] [transition-timing-function:var(--ret-ease-out)]",
			active ? "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5" : "border-[var(--ret-border)] bg-[var(--ret-bg)]",
		)}>
			<button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
				<span className={cn("flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px]", statusColor)}>
					{active ? <BrailleSpinner name="cascade" className="text-[11px]" /> : "$"}
				</span>
				<span className="flex-1 truncate font-mono text-[12px] text-[var(--ret-text)]">
					{event.command.length > 60 ? event.command.slice(0, 60) + "..." : event.command}
				</span>
				{event.exitCode !== undefined ? (
					<span className={cn("font-mono text-[10px]", event.exitCode === 0 ? "text-[var(--ret-green)]" : "text-[var(--ret-red)]")}>
						exit {event.exitCode}
					</span>
				) : null}
				{duration ? <span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{formatMs(duration)}</span> : null}
				{hasOutput ? <span className={cn("font-mono text-[11px] text-[var(--ret-text-muted)] transition-transform", isExpanded ? "rotate-90" : "rotate-0")}>{">"}</span> : null}
			</button>
			{isExpanded && hasOutput ? (
				<div className="border-t border-[var(--ret-border)] bg-black/30 px-3 py-2.5">
					{event.stdout ? (
						<pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--ret-green)]/80">{event.stdout}</pre>
					) : null}
					{event.stderr ? (
						<pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--ret-red)]/80">{event.stderr}</pre>
					) : null}
				</div>
			) : active && !hasOutput ? (
				<div className="border-t border-[var(--ret-border)] bg-black/20 px-3 py-2">
					<BrailleSpinner name="scan" className="text-[10px] text-[var(--ret-amber)]" />
				</div>
			) : null}
		</div>
	);
}

function BrowserActionCard({ event }: { event: AgentEvent & { kind: "browser_action" } }) {
	return (
		<div className="flex items-center gap-2.5 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2">
			<span className="flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px] text-[var(--ret-purple)]">◎</span>
			<span className="font-mono text-[12px] text-[var(--ret-text)]">{event.action}</span>
			{event.url ? <span className="truncate font-mono text-[10px] text-[var(--ret-text-muted)]">{event.url}</span> : null}
		</div>
	);
}

function StatusPill({ event }: { event: AgentEvent & { kind: "status" } }) {
	return (
		<div className="flex items-center gap-2 px-1 py-0.5">
			<span className="inline-block h-1 w-1 bg-[var(--ret-text-muted)]" />
			<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{event.label}</span>
			{event.detail ? <span className="font-mono text-[10px] text-[var(--ret-text-dim)]">{event.detail}</span> : null}
		</div>
	);
}

function ErrorBanner({ event }: { event: AgentEvent & { kind: "error" } }) {
	return (
		<div className="border border-[var(--ret-red)]/30 bg-[var(--ret-red)]/10 px-3 py-2 font-mono text-[11px] text-[var(--ret-red)]">
			{event.code ? <span className="mr-2 uppercase">[{event.code}]</span> : null}
			{event.message}
		</div>
	);
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const m = Math.floor(ms / 60000);
	const s = Math.round((ms % 60000) / 1000);
	return `${m}m${s}s`;
}
