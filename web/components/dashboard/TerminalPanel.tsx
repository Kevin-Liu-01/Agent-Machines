"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";

type EntryState = "pending" | "running" | "done" | "error";

type Entry = {
	id: string;
	startedAt: string;
	finishedAt: string;
	command: string;
	exitCode: number | null;
	stdout: string;
	stderr: string;
	elapsedMs: number;
	error?: string;
	state: EntryState;
};

const HISTORY_KEY = "agent-machines:terminal:history";
const SCROLLBACK_KEY = "agent-machines:terminal:scrollback";
const MAX_HISTORY = 200;
const MAX_SCROLLBACK = 100;
const OUTPUT_COLLAPSE_LINES = 25;

const COMMAND_GROUPS: ReadonlyArray<{
	label: string;
	items: ReadonlyArray<{ label: string; command: string; hint: string }>;
}> = [
	{
		label: "machine",
		items: [
			{
				label: "identity",
				command: "whoami && hostname && pwd && echo HOME=$HOME",
				hint: "user + host + cwd",
			},
			{
				label: "ports",
				command: "ss -tlnp 2>/dev/null | grep -E ':(8642|18789|9119)\\b' || echo 'no agent ports listening'",
				hint: "gateway listeners",
			},
			{
				label: "processes",
				command: "ps aux --sort=-pcpu | head -12",
				hint: "top by cpu",
			},
			{
				label: "disk",
				command: "df -h /home/machine && echo --- && du -sh /home/machine/.agent-machines 2>/dev/null",
				hint: "persistent volume",
			},
		],
	},
	{
		label: "agent state",
		items: [
			{
				label: "app data",
				command: "find /home/machine/.agent-machines -maxdepth 2 -type f 2>/dev/null | sort | head -60 || echo 'no app data yet'",
				hint: "chats, artifacts, settings",
			},
			{
				label: "settings.json",
				command: "python3 -m json.tool /home/machine/.agent-machines/settings.json 2>/dev/null || echo 'no settings.json yet'",
				hint: "terminal -> UI sync source",
			},
			{
				label: "repo checkout",
				command: "cd /home/machine/agent-machines 2>/dev/null && git status --short && git rev-parse --short HEAD || echo 'repo checkout missing'",
				hint: "git-backed reload",
			},
			{
				label: "live marker",
				command: "cat /home/machine/.agent-machines/live-fire-agent.txt 2>/dev/null || echo 'live-fire marker not found'",
				hint: "last e2e artifact",
			},
		],
	},
	{
		label: "agent runtime",
		items: [
			{
				label: "version",
				command: "hermes --version 2>/dev/null || echo 'agent runtime not installed'",
				hint: "runtime version",
			},
			{
				label: "skills",
				command: "find /home/machine/.agent-machines/skills -maxdepth 2 -type f 2>/dev/null | sed 's#^/home/machine/.agent-machines/skills/##' | sort | head -80 || echo 'no skills dir yet'",
				hint: "/home/machine/.agent-machines/skills",
			},
			{
				label: "crons",
				command: "find /home/machine/.agent-machines/crons -maxdepth 2 -type f 2>/dev/null | sort || echo 'no cron state yet'",
				hint: "scheduled automations",
			},
			{
				label: "gateway log",
				command: "tail -n 80 /home/machine/.agent-machines/logs/gateway.log 2>/dev/null || echo 'no gateway log yet'",
				hint: "last 80 lines",
			},
			{
				label: "models",
				command: "set -a; [ -f /home/machine/.agent-machines/.env ] && . /home/machine/.agent-machines/.env; set +a; curl -s -H \"Authorization: Bearer $API_SERVER_KEY\" http://127.0.0.1:8642/v1/models 2>/dev/null | head -c 1200 || echo 'gateway not responding'",
				hint: "local /v1/models",
			},
		],
	},
	{
		label: "OpenClaw",
		items: [
			{
				label: "state",
				command: "find /home/machine/.openclaw -maxdepth 2 -type f 2>/dev/null | sort | head -80 || echo 'OpenClaw not installed'",
				hint: "/home/machine/.openclaw",
			},
			{
				label: "log",
				command: "tail -n 80 /home/machine/.openclaw/logs/gateway.log 2>/dev/null || tail -n 80 /home/machine/.openclaw/gateway.log 2>/dev/null || echo 'no OpenClaw gateway log yet'",
				hint: "computer-use gateway",
			},
			{
				label: "config",
				command: "OPENCLAW_STATE_DIR=/home/machine/.openclaw PATH=/home/machine/.npm-global/bin:$PATH openclaw config list 2>/dev/null || echo 'OpenClaw config unavailable'",
				hint: "runtime config",
			},
		],
	},
];

const STARTUP_COMMAND =
	"echo '--- MACHINE STATUS ---' && whoami && hostname && echo '--- AGENT RUNTIME ---' && (hermes --version 2>/dev/null || echo 'not installed') && echo '--- LISTENING PORTS ---' && (ss -tlnp 2>/dev/null | grep -E ':(8642|18789|9119)\\b' || echo 'none') && echo '--- APP DATA ---' && (ls /home/machine/.agent-machines/ 2>/dev/null || echo 'no app data') && echo '--- UPTIME ---' && uptime";

type Props = {
	initialCommand?: string;
};

export function TerminalPanel({ initialCommand }: Props) {
	const [input, setInput] = useState(initialCommand ?? "");
	const [entries, setEntries] = useState<Entry[]>([]);
	const [history, setHistory] = useState<string[]>([]);
	const [historyCursor, setHistoryCursor] = useState<number | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const hasAutoRun = useRef(false);

	useEffect(() => {
		try {
			const rawHistory = window.sessionStorage.getItem(HISTORY_KEY);
			if (rawHistory) {
				const parsed = JSON.parse(rawHistory) as string[];
				if (Array.isArray(parsed)) setHistory(parsed.slice(-MAX_HISTORY));
			}
			const rawScroll = window.sessionStorage.getItem(SCROLLBACK_KEY);
			if (rawScroll) {
				const parsed = JSON.parse(rawScroll) as Entry[];
				if (Array.isArray(parsed)) {
					// Mark any previously-running entries as done on restore
					setEntries(parsed.slice(-MAX_SCROLLBACK).map((e) =>
						e.state === "running" || e.state === "pending"
							? { ...e, state: "done" as EntryState }
							: e,
					));
				}
			}
		} catch {}
	}, []);

	useEffect(() => {
		if (hasAutoRun.current) return;
		hasAutoRun.current = true;
		const timer = setTimeout(() => {
			setEntries((current) => {
				if (current.length === 0) {
					void executeStreaming(STARTUP_COMMAND, true);
				}
				return current;
			});
		}, 200);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		try {
			window.sessionStorage.setItem(
				SCROLLBACK_KEY,
				JSON.stringify(entries.slice(-MAX_SCROLLBACK)),
			);
		} catch {}
	}, [entries]);

	useEffect(() => {
		try {
			window.sessionStorage.setItem(
				HISTORY_KEY,
				JSON.stringify(history.slice(-MAX_HISTORY)),
			);
		} catch {}
	}, [history]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [entries, runningIds]);

	const executeStreaming = useCallback(
		async (commandRaw: string, silent = false): Promise<void> => {
			const command = commandRaw.trim();
			if (!command) return;

			if (!silent) {
				setHistoryCursor(null);
				setHistory((prev) => {
					const dedup = prev.filter((c) => c !== command);
					return [...dedup, command].slice(-MAX_HISTORY);
				});
			}

			setError(null);
			const tempId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			const startedAt = new Date().toISOString();

			const entry: Entry = {
				id: tempId,
				startedAt,
				finishedAt: "",
				command,
				exitCode: null,
				stdout: "",
				stderr: "",
				elapsedMs: 0,
				state: "pending",
			};

			setEntries((prev) => [...prev, entry].slice(-MAX_SCROLLBACK));
			setRunningIds((prev) => new Set(prev).add(tempId));

			try {
				const response = await fetch("/api/dashboard/exec/stream", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ command }),
				});

				if (!response.ok || !response.body) {
					const detail = await response.json().catch(() => ({})) as { message?: string; error?: string };
					const message = detail.message ?? detail.error ?? `HTTP ${response.status}`;
					setEntries((prev) =>
						prev.map((e) =>
							e.id === tempId
								? { ...e, state: "error" as EntryState, error: message, finishedAt: new Date().toISOString() }
								: e,
						),
					);
					setRunningIds((prev) => { const next = new Set(prev); next.delete(tempId); return next; });
					return;
				}

				// Mark as running
				setEntries((prev) =>
					prev.map((e) =>
						e.id === tempId ? { ...e, state: "running" as EntryState } : e,
					),
				);

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });

					const blocks = buffer.split("\n\n");
					buffer = blocks.pop() ?? "";

					for (const block of blocks) {
						if (!block.trim()) continue;
						let eventType = "";
						let dataStr = "";
						for (const line of block.split("\n")) {
							if (line.startsWith("event:")) eventType = line.slice(6).trim();
							else if (line.startsWith("data:")) dataStr = line.slice(5).trimStart();
						}
						if (!dataStr) continue;

						try {
							const data = JSON.parse(dataStr);
							handleStreamEvent(tempId, eventType, data);
						} catch {}
					}
				}

				// Finalize: if still running, mark done
				setEntries((prev) =>
					prev.map((e) =>
						e.id === tempId && e.state === "running"
							? { ...e, state: "done" as EntryState, finishedAt: new Date().toISOString() }
							: e,
					),
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : "fetch failed";
				setError(message);
				setEntries((prev) =>
					prev.map((e) =>
						e.id === tempId
							? { ...e, state: "error" as EntryState, error: message, finishedAt: new Date().toISOString() }
							: e,
					),
				);
			} finally {
				setRunningIds((prev) => { const next = new Set(prev); next.delete(tempId); return next; });
				if (!silent) {
					setSubmitting(false);
					setInput("");
					setTimeout(() => inputRef.current?.focus(), 0);
				}
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	const handleStreamEvent = useCallback(
		(entryId: string, event: string, data: Record<string, unknown>) => {
			switch (event) {
				case "started":
					setEntries((prev) =>
						prev.map((e) =>
							e.id === entryId
								? { ...e, state: "running" as EntryState, startedAt: (data.startedAt as string) ?? e.startedAt }
								: e,
						),
					);
					break;

				case "heartbeat":
					setEntries((prev) =>
						prev.map((e) =>
							e.id === entryId
								? { ...e, elapsedMs: (data.elapsedMs as number) ?? e.elapsedMs }
								: e,
						),
					);
					break;

				case "output":
					setEntries((prev) =>
						prev.map((e) =>
							e.id === entryId
								? {
										...e,
										stdout: e.stdout + ((data.stdout as string) ?? ""),
										stderr: e.stderr + ((data.stderr as string) ?? ""),
									}
								: e,
						),
					);
					break;

				case "done":
					setEntries((prev) =>
						prev.map((e) =>
							e.id === entryId
								? {
										...e,
										state: "done" as EntryState,
										exitCode: (data.exitCode as number) ?? 0,
										stdout: (data.stdout as string) ?? e.stdout,
										stderr: (data.stderr as string) ?? e.stderr,
										elapsedMs: (data.elapsedMs as number) ?? e.elapsedMs,
										finishedAt: (data.finishedAt as string) ?? new Date().toISOString(),
									}
								: e,
						),
					);
					break;

				case "error":
					setEntries((prev) =>
						prev.map((e) =>
							e.id === entryId
								? {
										...e,
										state: "error" as EntryState,
										error: (data.message as string) ?? "exec failed",
										elapsedMs: (data.elapsedMs as number) ?? e.elapsedMs,
										finishedAt: (data.finishedAt as string) ?? new Date().toISOString(),
									}
								: e,
						),
					);
					break;
			}
		},
		[],
	);

	const submit = useCallback(
		async (commandRaw: string): Promise<void> => {
			const command = commandRaw.trim();
			if (!command || submitting) return;
			setSubmitting(true);
			await executeStreaming(command);
		},
		[submitting, executeStreaming],
	);

	const runAllDiagnostics = useCallback(async () => {
		const commands = COMMAND_GROUPS.flatMap((g) => g.items.map((i) => i.command));
		for (const cmd of commands) {
			await executeStreaming(cmd, true);
		}
	}, [executeStreaming]);

	const onKey = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>): void => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
				event.preventDefault();
				setEntries([]);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				void submit(input);
				return;
			}
			if (event.key === "ArrowUp" && history.length > 0) {
				event.preventDefault();
				const next =
					historyCursor === null
						? history.length - 1
						: Math.max(0, historyCursor - 1);
				setHistoryCursor(next);
				setInput(history[next] ?? "");
				return;
			}
			if (event.key === "ArrowDown" && historyCursor !== null) {
				event.preventDefault();
				const next = historyCursor + 1;
				if (next >= history.length) {
					setHistoryCursor(null);
					setInput("");
				} else {
					setHistoryCursor(next);
					setInput(history[next] ?? "");
				}
				return;
			}
		},
		[input, history, historyCursor, submit],
	);

	function clearScrollback(): void {
		setEntries([]);
		try {
			window.sessionStorage.removeItem(SCROLLBACK_KEY);
		} catch {}
	}

	const stats = useMemo(() => statsFor(entries), [entries]);
	const runningCount = runningIds.size;

	return (
		<section className="grid gap-3">
			{/* Command palette */}
			<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2 xl:grid-cols-4">
				{COMMAND_GROUPS.map((group) => (
					<div key={group.label} className="bg-[var(--ret-bg)] p-2">
						<div className="mb-2 flex items-center justify-between gap-2">
							<ReticleLabel>{group.label}</ReticleLabel>
							<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{group.items.length} refs
							</span>
						</div>
						<div className="flex flex-wrap gap-1">
							{group.items.map((s) => (
								<button
									key={s.command}
									type="button"
									onClick={() => void executeStreaming(s.command)}
									title={`${s.hint} — click to run`}
									className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-purple)]"
								>
									{s.label}
								</button>
							))}
						</div>
					</div>
				))}
			</div>

			{/* Scrollback */}
			<div className="flex flex-col border border-[var(--ret-border)] bg-[var(--ret-bg)]">
				<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
					<div className="flex items-center gap-2">
						<ReticleLabel>SCROLLBACK</ReticleLabel>
						<ReticleBadge>
							{stats.entryCount} {stats.entryCount === 1 ? "command" : "commands"}
						</ReticleBadge>
						{stats.failureCount > 0 ? (
							<ReticleBadge variant="warning">
								{stats.failureCount} non-zero
							</ReticleBadge>
						) : null}
						{runningCount > 0 ? (
							<ReticleBadge variant="accent">
								<BrailleSpinner name="braille" className="text-[10px]" />
								{runningCount} running
							</ReticleBadge>
						) : null}
					</div>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => void runAllDiagnostics()}
							disabled={runningCount > 0}
							className={cn(
								"font-mono text-[10px] uppercase tracking-[0.18em]",
								runningCount > 0
									? "cursor-not-allowed text-[var(--ret-text-muted)]"
									: "text-[var(--ret-text-dim)] hover:text-[var(--ret-green)]",
							)}
						>
							run all
						</button>
						<button
							type="button"
							onClick={clearScrollback}
							disabled={entries.length === 0}
							className={cn(
								"font-mono text-[10px] uppercase tracking-[0.18em]",
								entries.length === 0
									? "cursor-not-allowed text-[var(--ret-text-muted)]"
									: "text-[var(--ret-text-dim)] hover:text-[var(--ret-purple)]",
							)}
						>
							clear
						</button>
					</div>
				</div>
				<div
					ref={scrollRef}
					className="max-h-[65vh] min-h-[320px] overflow-y-auto px-3 py-3 font-mono text-[12px]"
				>
					{entries.length === 0 ? (
						<div className="flex h-full flex-col items-start gap-1 py-6 text-[var(--ret-text-muted)]">
							<p className="text-[11px] uppercase tracking-[0.2em]">
								empty scrollback
							</p>
							<p className="max-w-[60ch] text-[12px] text-[var(--ret-text-dim)]">
								Run one-shot commands on the active machine. Output streams
								in real-time. Ctrl/Cmd-L clears.
							</p>
						</div>
					) : (
						<ul className="flex flex-col gap-1.5">
							{entries.map((entry) => (
								<EntryRow key={entry.id} entry={entry} />
							))}
						</ul>
					)}
				</div>
				<div className="border-t border-[var(--ret-border)]">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							void submit(input);
						}}
						className="flex items-center gap-2 px-3 py-2"
					>
						<span
							aria-hidden="true"
							className="select-none font-mono text-[12px] text-[var(--ret-purple)]"
						>
							machine $
						</span>
						<input
							ref={inputRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={onKey}
							placeholder="type a command or click a chip above..."
							disabled={submitting}
							spellCheck={false}
							autoCorrect="off"
							autoCapitalize="off"
							className="flex-1 bg-transparent font-mono text-[12px] text-[var(--ret-text)] outline-none placeholder:text-[var(--ret-text-muted)] disabled:opacity-60"
						/>
						{submitting ? (
							<BrailleSpinner name="cascade" className="text-[var(--ret-purple)]" />
						) : null}
						<ReticleButton
							as="button"
							type="submit"
							variant="primary"
							size="sm"
							disabled={!input.trim() || submitting}
						>
							run
						</ReticleButton>
					</form>
					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ret-border)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						<span>history: up/down . clear: ctrl/cmd+L</span>
						{error ? (
							<span className="text-[var(--ret-red)]">! {error}</span>
						) : (
							<span>SSE streaming . 30s default timeout</span>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

/* ─── Entry row ──────────────────────────────────────────────────────── */

function EntryRow({ entry }: { entry: Entry }) {
	const [expanded, setExpanded] = useState(true);
	const [copied, setCopied] = useState(false);
	const [showAll, setShowAll] = useState(false);

	const isRunning = entry.state === "running" || entry.state === "pending";
	const exitTone =
		entry.state === "error" || (entry.exitCode !== null && entry.exitCode !== 0)
			? "text-[var(--ret-red)]"
			: entry.state === "done" && entry.exitCode === 0
				? "text-[var(--ret-green)]"
				: "text-[var(--ret-text-muted)]";

	const fullOutput = entry.stdout + (entry.stderr ? `\n${entry.stderr}` : "");
	const outputLines = fullOutput.split("\n");
	const isLong = outputLines.length > OUTPUT_COLLAPSE_LINES;
	const visibleOutput = isLong && !showAll
		? outputLines.slice(0, OUTPUT_COLLAPSE_LINES).join("\n")
		: fullOutput;

	const copyOutput = useCallback(() => {
		void navigator.clipboard.writeText(fullOutput).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [fullOutput]);

	const elapsed = entry.elapsedMs > 0
		? entry.elapsedMs < 1000
			? `${Math.round(entry.elapsedMs)}ms`
			: `${(entry.elapsedMs / 1000).toFixed(1)}s`
		: null;

	const statusLabel = isRunning
		? "running"
		: entry.state === "error"
			? "error"
			: `exit ${entry.exitCode ?? "?"}`;

	return (
		<li
			className={cn(
				"overflow-hidden border transition-all duration-150",
				isRunning
					? "border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)]"
					: entry.state === "error" || (entry.exitCode !== null && entry.exitCode !== 0)
						? "border-[var(--ret-red)]/20 bg-[var(--ret-red)]/5"
						: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
			)}
		>
			{/* Command header */}
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--ret-surface)]"
			>
				{isRunning ? (
					<BrailleSpinner name="cascade" className="shrink-0 text-[11px] text-[var(--ret-purple)]" />
				) : (
					<span className={cn("shrink-0 font-mono text-[11px]", exitTone)}>
						{entry.exitCode === 0 ? "✓" : entry.state === "error" ? "✗" : "●"}
					</span>
				)}
				<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ret-text)]">
					<span className="text-[var(--ret-purple)]">$ </span>
					{entry.command.length > 80
						? entry.command.slice(0, 80) + "..."
						: entry.command}
				</span>
				<span className="flex shrink-0 items-center gap-2 text-[10px] text-[var(--ret-text-muted)]">
					{elapsed ? <span className="tabular-nums">{elapsed}</span> : null}
					<span className={exitTone}>{statusLabel}</span>
					<span className={cn("transition-transform", expanded ? "rotate-90" : "rotate-0")}>
						{">"}
					</span>
				</span>
			</button>

			{/* Output body */}
			{expanded ? (
				<div className="border-t border-[var(--ret-border)]/50 bg-[var(--ret-bg)]">
					{/* Toolbar */}
					{(fullOutput.trim() || isRunning) ? (
						<div className="flex items-center justify-between gap-2 px-3 py-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<span>
								{isRunning ? (
									<span className="flex items-center gap-1.5">
										<BrailleSpinner name="scan" className="text-[9px] text-[var(--ret-purple)]" />
										streaming output...
										{elapsed ? <span className="tabular-nums">({elapsed})</span> : null}
									</span>
								) : (
									<>
										{outputLines.filter(Boolean).length} line{outputLines.filter(Boolean).length !== 1 ? "s" : ""}
										{entry.stderr ? " · stderr present" : ""}
									</>
								)}
							</span>
							<div className="flex items-center gap-2">
								{isLong && !isRunning ? (
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
										className="hover:text-[var(--ret-purple)]"
									>
										{showAll ? "collapse" : `show all ${outputLines.length}`}
									</button>
								) : null}
								{fullOutput.trim() ? (
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); copyOutput(); }}
										className="hover:text-[var(--ret-purple)]"
									>
										{copied ? "copied!" : "copy"}
									</button>
								) : null}
							</div>
						</div>
					) : null}

					{/* Streaming / final output */}
					{fullOutput.trim() ? (
						<div className="relative max-h-[400px] overflow-auto px-3 pb-2">
							<pre className="whitespace-pre-wrap break-words text-[11px] leading-[1.6]">
								{renderHighlightedOutput(visibleOutput, entry.stderr ? entry.stdout.split("\n").length : 0)}
							</pre>
							{isRunning ? (
								<span className="ret-caret inline-block" aria-hidden="true" />
							) : null}
							{isLong && !showAll && !isRunning ? (
								<button
									type="button"
									onClick={() => setShowAll(true)}
									className="mt-1 font-mono text-[10px] text-[var(--ret-purple)] hover:underline"
								>
									... {outputLines.length - OUTPUT_COLLAPSE_LINES} more lines
								</button>
							) : null}
						</div>
					) : isRunning ? (
						<div className="flex items-center gap-2 px-3 py-3">
							<BrailleSpinner name="scan" className="text-[10px] text-[var(--ret-purple)]" />
							<span className="text-[11px] text-[var(--ret-text-muted)]">
								executing on machine...
							</span>
							{elapsed ? (
								<span className="tabular-nums text-[10px] text-[var(--ret-text-muted)]">
									{elapsed}
								</span>
							) : null}
						</div>
					) : null}

					{/* Error */}
					{entry.error ? (
						<div className="border-t border-[var(--ret-red)]/20 px-3 py-2">
							<p className="text-[11px] text-[var(--ret-red)]">
								<span className="font-bold">error:</span> {entry.error}
							</p>
						</div>
					) : null}
				</div>
			) : null}
		</li>
	);
}

/* ─── Output highlighting ────────────────────────────────────────────── */

function renderHighlightedOutput(text: string, stderrStartLine: number): React.ReactNode {
	const lines = text.split("\n");
	return lines.map((line, i) => {
		const isStderr = stderrStartLine > 0 && i >= stderrStartLine;
		const key = `line-${i}`;

		if (/^---\s+.+\s+---$/.test(line)) {
			return (
				<span key={key} className="block font-bold text-[var(--ret-text)]">
					{line}{"\n"}
				</span>
			);
		}
		if (/^(error|ERROR|Error|fatal|FATAL|panic)/i.test(line.trim())) {
			return (
				<span key={key} className="block text-[var(--ret-red)]">
					{line}{"\n"}
				</span>
			);
		}
		if (/^(warn|WARNING|Warning)/i.test(line.trim())) {
			return (
				<span key={key} className="block text-[var(--ret-amber)]">
					{line}{"\n"}
				</span>
			);
		}
		if (isStderr) {
			return (
				<span key={key} className="block text-[var(--ret-amber)]">
					{line}{"\n"}
				</span>
			);
		}
		if (/^\/[^\s]+/.test(line.trim())) {
			return (
				<span key={key} className="block text-[var(--ret-text-dim)]">
					<span className="text-[var(--ret-purple)]/80">{line}</span>{"\n"}
				</span>
			);
		}
		if (/^[A-Z_]+=/.test(line.trim())) {
			const eqIdx = line.indexOf("=");
			return (
				<span key={key} className="block">
					<span className="text-[var(--ret-text-muted)]">{line.slice(0, eqIdx + 1)}</span>
					<span className="text-[var(--ret-text)]">{line.slice(eqIdx + 1)}</span>{"\n"}
				</span>
			);
		}
		return (
			<span key={key} className="block text-[var(--ret-text)]">
				{line}{"\n"}
			</span>
		);
	});
}

/* ─── Utilities ──────────────────────────────────────────────────────── */

function statsFor(entries: Entry[]) {
	let failureCount = 0;
	for (const entry of entries) {
		const failed =
			entry.state === "error" ||
			(entry.exitCode !== null && entry.exitCode !== 0);
		if (failed) failureCount += 1;
	}
	return { entryCount: entries.length, failureCount };
}
