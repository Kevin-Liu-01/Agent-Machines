"use client";

/**
 * 3-panel agent console.
 *
 *   Left (260px)   : ConversationList -- history, pinned, automations
 *   Middle (flex-1) : ActivityStream -- the live agent interaction feed
 *   Right (380px)   : ArtifactPanel -- code diffs, terminal, files, browser
 *
 * The right panel is collapsible and only renders when there are artifacts
 * to show. On mobile the layout stacks vertically.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
	type AgentEvent,
	type Conversation,
	type ConversationArtifact,
	type ConversationSummary,
	type ConversationTurn,
	type StreamAccumulator,
	createStreamAccumulator,
	makeEventId,
} from "@/lib/agents/protocol";
import { processAgentEvent, readSseStream } from "@/lib/agents/parser";
import {
	activeAgentConsoleKey,
	readStoredId,
	writeStoredId,
} from "@/lib/dashboard/persistent-ui-state";
import type { PackageSuggestion } from "@/lib/packages/types";

import { ActivityStream } from "./ActivityStream";
import { ArtifactPanel } from "./ArtifactPanel";
import { ConversationList } from "./ConversationList";

type StreamState = "idle" | "streaming" | "error";

type HealthInfo = {
	ok: boolean;
	model?: string;
	apiHost?: string;
	error?: string;
	message?: string;
};

export type AgentConsoleProps = {
	activeMachineId: string | null;
	model: string | null;
	agentKind: string | null;
};

export function AgentConsole({ activeMachineId, model, agentKind }: AgentConsoleProps) {
	const activeConversationStorageKey = activeMachineId
		? activeAgentConsoleKey(activeMachineId)
		: null;
	const [conversations, setConversations] = useState<ConversationSummary[]>([]);
	const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
	const [turns, setTurns] = useState<ConversationTurn[]>([]);
	const [artifacts, setArtifacts] = useState<ConversationArtifact[]>([]);
	const [selectedArtifact, setSelectedArtifact] = useState<ConversationArtifact | null>(null);
	const [streamState, setStreamState] = useState<StreamState>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [health, setHealth] = useState<HealthInfo | null>(null);
	const [rightPanelOpen, setRightPanelOpen] = useState(false);
	const [machineOk, setMachineOk] = useState(false);
	const [sessionPackageIds, setSessionPackageIds] = useState<string[]>([]);

	const abortRef = useRef<AbortController | null>(null);
	const turnsRef = useRef(turns);
	turnsRef.current = turns;
	const sessionPackageIdsRef = useRef(sessionPackageIds);
	sessionPackageIdsRef.current = sessionPackageIds;

	useEffect(() => {
		const params = activeMachineId
			? `?machineId=${encodeURIComponent(activeMachineId)}`
			: "";
		fetch(`/api/dashboard/gateway${params}`)
			.then((r) => {
				if (!r.ok) return { ok: false, error: `HTTP ${r.status}` } as HealthInfo;
				return r.json() as Promise<HealthInfo>;
			})
			.then((info) => setHealth(info))
			.catch(() => setHealth({ ok: false, error: "unreachable" }));
	}, [activeMachineId]);

	const refreshList = useCallback(async () => {
		try {
			const params = activeMachineId
				? `?machineId=${encodeURIComponent(activeMachineId)}`
				: "";
			const response = await fetch(`/api/dashboard/chats${params}`, { cache: "no-store" });
			const body = await response.json();
			if (body.ok) {
				const summaries: ConversationSummary[] = (body.chats ?? []).map(
					(c: Record<string, unknown>) => ({
						id: c.id as string,
						title: c.title as string,
						turns: [],
						machineId: (c.machineId as string) ?? null,
						agentKind: null,
						model: (c.model as string) ?? null,
						createdAt: c.createdAt as string,
						updatedAt: c.updatedAt as string,
						turnCount: (c.messageCount as number) ?? 0,
						lastTurnPreview: (c.title as string) ?? "",
					}),
				);
				setConversations(summaries);
				setMachineOk(true);
			} else {
				setMachineOk(false);
			}
		} catch {
			setMachineOk(false);
		}
	}, [activeMachineId]);

	useEffect(() => { void refreshList(); }, [refreshList]);

	useEffect(() => {
		setActiveConvoId(null);
		setTurns([]);
		setArtifacts([]);
		setSelectedArtifact(null);
		setSessionPackageIds([]);
	}, [activeMachineId]);

	const loadConversation = useCallback(async (convoId: string) => {
		try {
			const params = activeMachineId
				? `?machineId=${encodeURIComponent(activeMachineId)}`
				: "";
			const response = await fetch(`/api/dashboard/chats/${convoId}${params}`, {
				cache: "no-store",
			});
			const body = await response.json();
			if (body.ok && body.chat) {
				setActiveConvoId(body.chat.id);
				writeStoredId(activeConversationStorageKey, body.chat.id);
				const loadedTurns: ConversationTurn[] = (body.chat.messages ?? []).map(
					(m: Record<string, unknown>) => ({
						id: m.id as string,
						role: m.role as "user" | "assistant",
						content: m.content as string,
						events: legacyEventsToAgentEvents(m.events as unknown[]),
						startedAt: (m.createdAt as number) ?? Date.now(),
						durationMs: m.durationMs as number | undefined,
						model: m.model as string | undefined,
					}),
				);
				setTurns(loadedTurns);
				setArtifacts([]);
				setSelectedArtifact(null);
				const loadedSession = (body.chat as { sessionPackageIds?: string[] }).sessionPackageIds;
				setSessionPackageIds(Array.isArray(loadedSession) ? loadedSession : []);
			}
		} catch { /* load failed */ }
	}, [activeConversationStorageKey, activeMachineId]);

	const newConversation = useCallback(() => {
		const id = makeEventId();
		setActiveConvoId(id);
		writeStoredId(activeConversationStorageKey, id);
		setTurns([]);
		setArtifacts([]);
		setSelectedArtifact(null);
		setSessionPackageIds([]);
	}, [activeConversationStorageKey]);

	const deleteConversation = useCallback(async (convoId: string) => {
		try {
			const params = activeMachineId
				? `?machineId=${encodeURIComponent(activeMachineId)}`
				: "";
			await fetch(`/api/dashboard/chats/${convoId}${params}`, { method: "DELETE" });
			if (convoId === activeConvoId) {
				setActiveConvoId(null);
				setTurns([]);
				writeStoredId(activeConversationStorageKey, null);
			}
			await refreshList();
		} catch { /* delete failed */ }
	}, [
		activeConvoId,
		activeConversationStorageKey,
		activeMachineId,
		refreshList,
	]);

	useEffect(() => {
		if (activeConvoId !== null) return;
		if (conversations.length > 0) {
			const stored = readStoredId(activeConversationStorageKey);
			const target = conversations.find((conversation) => conversation.id === stored) ?? conversations[0];
			void loadConversation(target.id);
		} else if (machineOk) {
			newConversation();
		}
	}, [
		activeConvoId,
		activeConversationStorageKey,
		conversations,
		loadConversation,
		newConversation,
		machineOk,
	]);

	const send = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (!trimmed || streamState === "streaming") return;

		setErrorMessage(null);

		const userTurn: ConversationTurn = {
			id: makeEventId(),
			role: "user",
			content: trimmed,
			events: [],
			startedAt: Date.now(),
		};

		const assistantTurn: ConversationTurn = {
			id: makeEventId(),
			role: "assistant",
			content: "",
			events: [],
			startedAt: Date.now(),
			model: model ?? undefined,
			agentKind: (agentKind as ConversationTurn["agentKind"]) ?? undefined,
		};

		const nextTurns = [...turnsRef.current, userTurn, assistantTurn];
		setTurns(nextTurns);
		turnsRef.current = nextTurns;
		setStreamState("streaming");

		const ctrl = new AbortController();
		abortRef.current = ctrl;

		try {
			const upstream = nextTurns.slice(0, -1).map((t) => ({
				role: t.role,
				content: t.content,
			}));

			const response = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: upstream,
					...(activeMachineId ? { machineId: activeMachineId } : {}),
					...(sessionPackageIdsRef.current.length > 0
						? { sessionPackageIds: sessionPackageIdsRef.current }
						: {}),
				}),
				signal: ctrl.signal,
			});

			if (!response.ok || !response.body) {
				const detail = await response.json().catch(() => ({}));
				throw new Error(detail?.message || detail?.error || `HTTP ${response.status}`);
			}

			let acc: StreamAccumulator = createStreamAccumulator();

			for await (const sseEvent of readSseStream(response.body)) {
				acc = processAgentEvent(sseEvent, acc);

				const updated = turnsRef.current.map((t) =>
					t.id === assistantTurn.id
						? {
								...t,
								content: acc.content,
								events: acc.events,
								durationMs: Date.now() - assistantTurn.startedAt,
							}
						: t,
				);
				turnsRef.current = updated;
				setTurns(updated);

				if (acc.artifacts.length > 0) {
					setArtifacts(acc.artifacts);
					if (!rightPanelOpen) setRightPanelOpen(true);
				}
			}

			// Finalize
			const finalTurns = turnsRef.current.map((t) =>
				t.id === assistantTurn.id
					? {
							...t,
							content: acc.content,
							events: acc.events,
							completedAt: Date.now(),
							durationMs: Date.now() - assistantTurn.startedAt,
						}
					: t,
			);
			turnsRef.current = finalTurns;
			setTurns(finalTurns);
			setStreamState("idle");

			// Persist
			void persistConversation(finalTurns);
		} catch (err) {
			if (ctrl.signal.aborted) {
				setStreamState("idle");
				return;
			}
			setErrorMessage(err instanceof Error ? err.message : "unknown_error");
			setStreamState("error");
		} finally {
			abortRef.current = null;
		}
	}, [streamState, model, agentKind, rightPanelOpen, activeMachineId]);

	const acceptSuggestion = useCallback(async (suggestion: PackageSuggestion) => {
		const response = await fetch("/api/dashboard/packages/attach", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ packageId: suggestion.packageId }),
		});
		const body = await response.json();
		if (!response.ok || !body.ok) {
			throw new Error(body.message || body.error || "attach_failed");
		}
		setSessionPackageIds((prev) =>
			prev.includes(suggestion.packageId) ? prev : [...prev, suggestion.packageId],
		);
	}, []);

	const removeSessionPackage = useCallback((packageId: string) => {
		setSessionPackageIds((prev) => prev.filter((id) => id !== packageId));
	}, []);

	const persistConversation = useCallback(async (allTurns: ConversationTurn[]) => {
		if (!activeConvoId || !machineOk) return;
		const firstUser = allTurns.find((t) => t.role === "user");
		const title = firstUser
			? firstUser.content.trim().replace(/\s+/g, " ").slice(0, 80)
			: "untitled";

		const messages = allTurns.map((t) => ({
			id: t.id,
			role: t.role,
			content: t.content,
			createdAt: t.startedAt,
			durationMs: t.durationMs,
			model: t.model,
			events: t.events.length > 0 ? agentEventsToLegacy(t.events) : undefined,
		}));

		const record = {
			id: activeConvoId,
			title,
			machineId: activeMachineId,
			model,
			createdAt: allTurns[0]?.startedAt
				? new Date(allTurns[0].startedAt).toISOString()
				: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			messageCount: allTurns.length,
			messages,
			sessionPackageIds: sessionPackageIdsRef.current,
		};

		try {
			const response = await fetch("/api/dashboard/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(record),
			});
			if (response.ok) await refreshList();
		} catch { /* persist failed */ }
	}, [activeConvoId, activeMachineId, machineOk, model, refreshList]);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		setStreamState("idle");
	}, []);

	const disabled = !activeMachineId || !machineOk || health?.ok === false;

	return (
		<div className="flex h-[calc(100dvh-48px)] overflow-hidden">
			{/* Left: Conversation list */}
			<aside className="hidden w-[260px] shrink-0 flex-col border-r border-[var(--ret-border)] bg-[var(--ret-bg)] lg:flex">
				<ConversationList
					conversations={conversations}
					activeId={activeConvoId}
					onSelect={loadConversation}
					onNew={newConversation}
					onDelete={deleteConversation}
					machineOk={machineOk}
					machineId={activeMachineId}
					streaming={streamState === "streaming"}
					loadoutItems={DEFAULT_LOADOUT}
				/>
			</aside>

			{/* Middle: Activity stream */}
			<main className="flex min-w-0 flex-1 flex-col bg-[var(--ret-bg)]">
				<TranscriptActions turns={turns} onSave={() => void persistConversation(turnsRef.current)} canSave={machineOk && Boolean(activeConvoId)} />
				<ActivityStream
					turns={turns}
					streaming={streamState === "streaming"}
					health={health}
					error={errorMessage}
					disabled={disabled}
					model={model}
					agentKind={agentKind}
					activeMachineId={activeMachineId}
					artifactCount={artifacts.length}
					rightPanelOpen={rightPanelOpen}
					onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
					onSend={send}
					onStop={stop}
					onSelectArtifact={(a) => {
						setSelectedArtifact(a);
						setRightPanelOpen(true);
					}}
					sessionPackageIds={sessionPackageIds}
					onAcceptSuggestion={acceptSuggestion}
					onRemoveSessionPackage={removeSessionPackage}
				/>
			</main>

			{/* Right: Artifact panel */}
			{rightPanelOpen ? (
				<aside className="hidden w-[380px] shrink-0 flex-col border-l border-[var(--ret-border)] bg-[var(--ret-bg)] xl:flex">
					<ArtifactPanel
						artifacts={artifacts}
						selected={selectedArtifact}
						onSelect={setSelectedArtifact}
						onClose={() => setRightPanelOpen(false)}
					/>
				</aside>
			) : null}
		</div>
	);
}

/**
 * Convert legacy MessageEvent[] (from persisted chats) into AgentEvent[].
 */
function legacyEventsToAgentEvents(events: unknown[] | undefined): AgentEvent[] {
	if (!events || !Array.isArray(events)) return [];
	const result: AgentEvent[] = [];
	for (const e of events) {
		const ev = e as Record<string, unknown>;
		if (ev.type === "thinking") {
			const t = ev.thinking as Record<string, unknown>;
			result.push({
				kind: "thinking",
				id: (t.id as string) ?? makeEventId(),
				content: (t.content as string) ?? "",
				startedAt: (t.startedAt as number) ?? Date.now(),
				completedAt: t.completedAt as number | undefined,
			});
		} else if (ev.type === "tool_call") {
			const tc = ev.toolCall as Record<string, unknown>;
			result.push({
				kind: "tool_call",
				id: (tc.id as string) ?? makeEventId(),
				name: (tc.name as string) ?? "unknown",
				arguments: (tc.arguments as string) ?? "{}",
				status: (tc.status as "running" | "completed" | "error") ?? "completed",
				startedAt: (tc.startedAt as number) ?? Date.now(),
				completedAt: tc.completedAt as number | undefined,
			});
		} else if (ev.type === "status") {
			result.push({
				kind: "status",
				label: (ev.label as string) ?? "",
				detail: ev.detail as string | undefined,
				timestamp: (ev.timestamp as number) ?? Date.now(),
			});
		}
	}
	return result;
}

/**
 * Convert AgentEvent[] back to legacy format for persistence compatibility.
 */
function agentEventsToLegacy(events: AgentEvent[]): unknown[] {
	return events
		.filter((e) => e.kind === "thinking" || e.kind === "tool_call" || e.kind === "status")
		.map((e) => {
			if (e.kind === "thinking") {
				return {
					type: "thinking",
					thinking: { id: e.id, content: e.content, startedAt: e.startedAt, completedAt: e.completedAt },
				};
			}
			if (e.kind === "tool_call") {
				return {
					type: "tool_call",
					toolCall: { id: e.id, name: e.name, arguments: e.arguments, status: e.status, startedAt: e.startedAt, completedAt: e.completedAt },
				};
			}
			if (e.kind === "status") {
				return { type: "status", label: e.label, detail: e.detail, timestamp: e.timestamp };
			}
			return null;
		})
		.filter(Boolean);
}

function transcriptToMarkdown(turns: ConversationTurn[]): string {
	if (turns.length === 0) return "";
	return turns
		.map((t) => {
			const who = t.role === "user" ? "## You" : "## Agent";
			const meta = t.model ? ` _(model: ${t.model})_` : "";
			return `${who}${meta}\n\n${t.content.trim()}`;
		})
		.join("\n\n---\n\n");
}

function downloadText(filename: string, text: string, type: string): void {
	const blob = new Blob([text], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function timestampSlug(): string {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Copy / export / save controls for the live transcript. */
function TranscriptActions({
	turns,
	onSave,
	canSave,
}: {
	turns: ConversationTurn[];
	onSave: () => void;
	canSave: boolean;
}) {
	const [copied, setCopied] = useState(false);
	const empty = turns.length === 0;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(transcriptToMarkdown(turns));
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	};

	return (
		<div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--ret-border)] px-3 py-1.5">
			<span className="mr-auto font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				transcript · {turns.length} turns
			</span>
			<ToolbarButton label={copied ? "copied" : "copy"} onClick={() => void copy()} disabled={empty} />
			<ToolbarButton
				label="export .md"
				onClick={() =>
					downloadText(`console-${timestampSlug()}.md`, transcriptToMarkdown(turns), "text/markdown")
				}
				disabled={empty}
			/>
			<ToolbarButton
				label=".json"
				onClick={() =>
					downloadText(
						`console-${timestampSlug()}.json`,
						JSON.stringify(turns, null, 2),
						"application/json",
					)
				}
				disabled={empty}
			/>
			<ToolbarButton label="save" onClick={onSave} disabled={empty || !canSave} />
		</div>
	);
}

function ToolbarButton({
	label,
	onClick,
	disabled,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="border border-[var(--ret-border)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)] transition-colors hover:border-[var(--ret-border-hover)] hover:text-[var(--ret-text)] disabled:cursor-not-allowed disabled:opacity-40"
		>
			{label}
		</button>
	);
}

const DEFAULT_LOADOUT = [
	{ name: "shell", kind: "tool" as const, description: "Run bash commands in the VM" },
	{ name: "browser", kind: "tool" as const, description: "Navigate, click, screenshot via agent-browser" },
	{ name: "vision", kind: "tool" as const, description: "Analyze images and screenshots" },
	{ name: "memory", kind: "tool" as const, description: "Read/write persistent agent memory" },
	{ name: "web_search", kind: "tool" as const, description: "Search the web for information" },
	{ name: "cursor_agent", kind: "mcp" as const, description: "Delegate code tasks to a Cursor agent" },
	{ name: "cursor_models", kind: "mcp" as const, description: "List available Cursor models" },
	{ name: "agent-ethos", kind: "skill" as const, description: "Core agent operating principles" },
	{ name: "closed-loop-development", kind: "skill" as const, description: "Write, test, verify, iterate" },
	{ name: "production-safety", kind: "skill" as const, description: "Guards against destructive operations" },
	{ name: "code-review", kind: "skill" as const, description: "Staff-level code review patterns" },
	{ name: "dedalus-machines", kind: "skill" as const, description: "Manage Dedalus microVM lifecycle" },
];
