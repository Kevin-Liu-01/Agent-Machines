"use client";

import "@xterm/xterm/css/xterm.css";

import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { agentLabel, agentLaunchCommand, isCliAgent } from "@/lib/dashboard/agent-launch";
import {
	isPrintableInput,
	stripSuppressedEcho,
	stripTerminalDeviceResponses,
} from "@/lib/dashboard/terminal-input";

type Status = "connecting" | "ready" | "offline" | "error";

type SessionPayload = {
	ok?: boolean;
	snapshot?: string;
	offset?: number;
	/** tmux pane cursor (0-based) so the client can re-home xterm's cursor. */
	cursorRow?: number;
	cursorCol?: number;
	message?: string;
	error?: string;
};

type InteractiveConsoleProps = {
	autoLaunch?: boolean;
	heightClassName?: string;
	showFooter?: boolean;
};

const RECONNECT_MS = 100;
const INPUT_FLUSH_MS = 10;
const INPUT_POST_TIMEOUT_MS = 5_000;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function prefetchXterm(): void {
	void import("@xterm/xterm");
	void import("@xterm/addon-fit");
}

/**
 * Real interactive terminal (PTY) bound to the machine's tmux console.
 * Keystrokes POST to /terminal/input (tmux send-keys); output streams
 * back over SSE from /terminal/stream (tail of the tmux pane log) and is
 * rendered by xterm.js. This is the "talk to the agent as if local"
 * surface -- run the agent CLI in it and interact line-by-line.
 */
export function InteractiveConsole({
	autoLaunch: autoLaunchProp = false,
	heightClassName = "h-[58dvh] min-h-[340px] sm:h-[60dvh] sm:min-h-[360px]",
	showFooter = true,
}: InteractiveConsoleProps = {}) {
	const machineCtx = useOptionalMachineContext();
	const machineId = machineCtx?.machineId;
	const agentKind = machineCtx?.machine?.agentKind ?? null;
	const searchParams = useSearchParams();
	const autoLaunch = autoLaunchProp || searchParams.get("launch") === "1";
	const hostRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<Status>("connecting");
	const [detail, setDetail] = useState<string>("");
	const launchedRef = useRef(false);

	useEffect(() => {
		prefetchXterm();
	}, []);

	// Serialize input POSTs through one promise chain so rapid keystrokes
	// arrive at tmux in order — concurrent fire-and-forget fetches can race
	// and reorder characters ("Reply" -> "y...lRep").
	const sendChainRef = useRef<Promise<unknown>>(Promise.resolve());
	const pendingInputRef = useRef("");
	const inputFlushTimerRef = useRef<number | null>(null);
	const postInput = useCallback(
		(data: string) => {
			if (!data || !machineId) return;
			sendChainRef.current = sendChainRef.current
				.catch(() => {})
				.then(async () => {
					const controller = new AbortController();
					const timeout = window.setTimeout(
						() => controller.abort(),
						INPUT_POST_TIMEOUT_MS,
					);
					try {
						await fetch("/api/dashboard/terminal/input", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ machineId, data }),
							keepalive: true,
							signal: controller.signal,
						});
					} catch {
						// The local line editor already accepted the input. A reconnect or
						// the next Enter will surface real sandbox issues without freezing
						// character entry behind one slow send-keys request.
					} finally {
						window.clearTimeout(timeout);
					}
				});
		},
		[machineId],
	);
	const flushInput = useCallback(() => {
		if (inputFlushTimerRef.current) {
			window.clearTimeout(inputFlushTimerRef.current);
			inputFlushTimerRef.current = null;
		}
		const data = pendingInputRef.current;
		pendingInputRef.current = "";
		postInput(data);
	}, [postInput]);
	const sendInput = useCallback(
		(data: string) => {
			if (!data || !machineId) return;
			pendingInputRef.current += data;
			if (data.includes("\r") || data.includes("\x03")) {
				flushInput();
				return;
			}
			if (inputFlushTimerRef.current) return;
			inputFlushTimerRef.current = window.setTimeout(flushInput, INPUT_FLUSH_MS);
		},
		[flushInput, machineId],
	);
	useEffect(() => {
		return () => {
			if (inputFlushTimerRef.current) {
				window.clearTimeout(inputFlushTimerRef.current);
				inputFlushTimerRef.current = null;
			}
			pendingInputRef.current = "";
		};
	}, [machineId]);
	const sendInputRef = useRef(sendInput);
	sendInputRef.current = sendInput;

	const launchAgent = useCallback(() => {
		const cmd = agentLaunchCommand(agentKind);
		if (!cmd) return;
		sendInput(`${cmd}\r`);
	}, [agentKind, sendInput]);

	const launchRef = useRef(launchAgent);
	launchRef.current = launchAgent;

	useEffect(() => {
		launchedRef.current = false;
	}, [machineId, agentKind]);

	useEffect(() => {
		if (status !== "ready" || !autoLaunch || !isCliAgent(agentKind) || launchedRef.current) {
			return;
		}
		launchedRef.current = true;
		const timer = window.setTimeout(() => launchRef.current(), 150);
		return () => window.clearTimeout(timer);
	}, [agentKind, autoLaunch, status]);

	useEffect(() => {
		if (!machineId) return;
		const scopedMachineId = machineId;
		setStatus("connecting");
		setDetail("");

		let alive = true;
		let term: XTerm | null = null;
		let fit: FitAddonType | null = null;
		let resizeObs: ResizeObserver | null = null;
		let streamAbort: AbortController | null = null;
		const offsetRef = { current: 0 };
		let pendingWrite = "";
		let writeScheduled = false;
		let localLine = "";
		let localCursor = 0;
		let historyIndex: number | null = null;
		const commandHistory: string[] = [];
		let suppressedEcho = "";

		const flushPendingWrite = () => {
			writeScheduled = false;
			if (!pendingWrite || !term) return;
			const chunk = pendingWrite;
			pendingWrite = "";
			term.write(chunk);
		};

		const scheduleWrite = (data: string) => {
			pendingWrite += data;
			if (writeScheduled) return;
			writeScheduled = true;
			requestAnimationFrame(flushPendingWrite);
		};

		async function attachSession(cols: number, rows: number): Promise<SessionPayload | null> {
			const created = await fetch("/api/dashboard/terminal/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId: scopedMachineId, cols, rows }),
			});
			if (!alive) return null;
			const payload = (await created.json().catch(() => ({}))) as SessionPayload;
			if (!created.ok || payload.ok === false) {
				setStatus(payload.error === "machine_offline" || created.status === 503 ? "offline" : "error");
				setDetail(payload.message ?? payload.error ?? `HTTP ${created.status}`);
				return null;
			}
			return payload;
		}

		async function streamLoop(): Promise<void> {
			while (alive) {
				streamAbort = new AbortController();
				try {
					const r = await fetch(
						`/api/dashboard/terminal/stream?machineId=${encodeURIComponent(scopedMachineId)}&offset=${offsetRef.current}`,
						{ signal: streamAbort.signal },
					);
					if (!r.ok || !r.body) {
						setStatus(r.status === 503 ? "offline" : "error");
						setDetail(
							r.status === 503
								? "Machine is not awake."
								: `Terminal stream failed with HTTP ${r.status}.`,
						);
						return;
					}
					const reader = r.body.getReader();
					const dec = new TextDecoder();
					let buf = "";
					while (alive) {
						const { value, done } = await reader.read();
						if (done) break;
						buf += dec.decode(value, { stream: true });
						const blocks = buf.split("\n\n");
						buf = blocks.pop() ?? "";
						for (const block of blocks) {
							let ev = "";
							let ds = "";
							for (const line of block.split("\n")) {
								if (line.startsWith("event:")) ev = line.slice(6).trim();
								else if (line.startsWith("data:")) ds = line.slice(5).trim();
							}
							if (!ds) continue;
							try {
								const o = JSON.parse(ds) as {
									data?: string;
									bytes?: number;
									message?: string;
								};
								if (ev === "offline") {
									setStatus("offline");
									setDetail(o.message ?? "Machine is not awake.");
									return;
								}
								if (ev === "error") {
									setStatus("error");
									setDetail(o.message ?? "Terminal stream failed.");
									return;
								}
								if (ev === "output" && o.data) {
									offsetRef.current +=
										o.bytes ?? new TextEncoder().encode(o.data).length;
									const stripped = stripSuppressedEcho(o.data, suppressedEcho);
									suppressedEcho = stripped.pendingEcho;
									if (stripped.data) scheduleWrite(stripped.data);
								}
							} catch {
								// skip malformed frame
							}
						}
					}
				} catch {
					if (!alive) break;
				}
				if (!alive) break;
				flushPendingWrite();
				await sleep(RECONNECT_MS);
			}
		}

		async function boot() {
			// Warm the xterm bundle (prefetched on mount), then fit and attach
			// at the REAL dimensions so the tmux pane, the snapshot height, and
			// xterm all agree — required for correct cursor sync.
			const [{ Terminal }, { FitAddon }] = await Promise.all([
				import("@xterm/xterm"),
				import("@xterm/addon-fit"),
			]);
			if (!alive || !hostRef.current) return;

			term = new Terminal({
				cursorBlink: true,
				fontSize: window.innerWidth < 640 ? 10 : 12,
				fontFamily:
					'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
				theme: {
					background: "#0a0a0e",
					foreground: "#d7d7e0",
					cursor: "#e4e4e7",
					selectionBackground: "#33333a",
				},
				scrollback: 4_000,
				convertEol: false,
			});
			fit = new FitAddon();
			term.loadAddon(fit);
			term.open(hostRef.current);

			const localLength = () => Array.from(localLine).length;
			const moveLeft = (count: number) => {
				if (count > 0) term?.write(`\x1b[${count}D`);
			};
			const moveRight = (count: number) => {
				if (count > 0) term?.write(`\x1b[${count}C`);
			};
			const replaceLocalLine = (next: string, cursor = Array.from(next).length) => {
				const oldLength = localLength();
				moveLeft(localCursor);
				if (oldLength > 0) {
					term?.write(" ".repeat(oldLength));
					moveLeft(oldLength);
				}
				localLine = next;
				localCursor = Math.min(Math.max(0, cursor), localLength());
				if (localLine) term?.write(localLine);
				moveLeft(localLength() - localCursor);
			};
			const insertPrintable = (text: string) => {
				const inserted = Array.from(text);
				if (inserted.length === 0) return;
				const chars = Array.from(localLine);
				const before = chars.slice(0, localCursor);
				const after = chars.slice(localCursor);
				localLine = [...before, ...inserted, ...after].join("");
				localCursor += inserted.length;
				term?.write(`${text}${after.join("")}`);
				moveLeft(after.length);
			};
			const deleteBeforeCursor = () => {
				if (localCursor <= 0) return;
				const chars = Array.from(localLine);
				const after = chars.slice(localCursor);
				chars.splice(localCursor - 1, 1);
				localLine = chars.join("");
				localCursor -= 1;
				term?.write(`\b${after.join("")} `);
				moveLeft(after.length + 1);
			};
			const deleteAtCursor = () => {
				const chars = Array.from(localLine);
				if (localCursor >= chars.length) return;
				const after = chars.slice(localCursor + 1);
				chars.splice(localCursor, 1);
				localLine = chars.join("");
				term?.write(`${after.join("")} `);
				moveLeft(after.length + 1);
			};
			const clearLocalLine = () => {
				replaceLocalLine("");
				historyIndex = null;
			};
			const sendLocalLineWithoutEnter = () => {
				if (!localLine) return;
				suppressedEcho += localLine;
				sendInputRef.current(localLine);
				localLine = "";
				localCursor = 0;
				historyIndex = null;
			};
			const submitLocalLine = () => {
				moveRight(localLength() - localCursor);
				const submitted = localLine;
				if (submitted.trim() && commandHistory[commandHistory.length - 1] !== submitted) {
					commandHistory.push(submitted);
				}
				historyIndex = null;
				suppressedEcho += `${submitted}\r\n`;
				term?.write("\r\n");
				sendInputRef.current(`${submitted}\r`);
				localLine = "";
				localCursor = 0;
			};
			const showHistory = (direction: -1 | 1) => {
				if (commandHistory.length === 0) return;
				if (historyIndex === null) {
					if (direction > 0) return;
					historyIndex = commandHistory.length - 1;
				} else {
					historyIndex += direction;
					if (historyIndex < 0) historyIndex = 0;
					if (historyIndex >= commandHistory.length) {
						historyIndex = null;
						replaceLocalLine("");
						return;
					}
				}
				replaceLocalLine(commandHistory[historyIndex]);
			};
			const sendControl = (data: string) => {
				sendLocalLineWithoutEnter();
				sendInputRef.current(data);
			};
			const handleEscapeSequence = (data: string, index: number): number => {
				const rest = data.slice(index);
				if (rest.startsWith("\x1b[D")) {
					if (localCursor > 0) {
						localCursor -= 1;
						moveLeft(1);
					}
					return index + 3;
				}
				if (rest.startsWith("\x1b[C")) {
					if (localCursor < localLength()) {
						localCursor += 1;
						moveRight(1);
					}
					return index + 3;
				}
				if (rest.startsWith("\x1b[A")) {
					showHistory(-1);
					return index + 3;
				}
				if (rest.startsWith("\x1b[B")) {
					showHistory(1);
					return index + 3;
				}
				if (
					rest.startsWith("\x1b[H") ||
					rest.startsWith("\x1bOH") ||
					rest.startsWith("\x1b[1~") ||
					rest.startsWith("\x1b[7~")
				) {
					moveLeft(localCursor);
					localCursor = 0;
					return index + (rest.startsWith("\x1bO") ? 3 : rest.startsWith("\x1b[H") ? 3 : 4);
				}
				if (
					rest.startsWith("\x1b[F") ||
					rest.startsWith("\x1bOF") ||
					rest.startsWith("\x1b[4~") ||
					rest.startsWith("\x1b[8~")
				) {
					moveRight(localLength() - localCursor);
					localCursor = localLength();
					return index + (rest.startsWith("\x1bO") ? 3 : rest.startsWith("\x1b[F") ? 3 : 4);
				}
				if (rest.startsWith("\x1b[3~")) {
					deleteAtCursor();
					return index + 4;
				}
				sendControl(rest);
				return data.length;
			};

			term.onData((d) => {
				const data = stripTerminalDeviceResponses(d);
				if (!data) return;

				let index = 0;
				while (index < data.length) {
					if (data[index] === "\x1b") {
						index = handleEscapeSequence(data, index);
						continue;
					}

					const code = data.codePointAt(index) ?? 0;
					const char = String.fromCodePoint(code);
					index += char.length;

					if (char === "\r" || char === "\n") {
						submitLocalLine();
					} else if (char === "\x7f" || char === "\b") {
						deleteBeforeCursor();
					} else if (char === "\x03") {
						clearLocalLine();
						sendInputRef.current(char);
					} else if (char === "\x01") {
						moveLeft(localCursor);
						localCursor = 0;
					} else if (char === "\x05") {
						moveRight(localLength() - localCursor);
						localCursor = localLength();
					} else if (char === "\t") {
						sendControl(char);
					} else if (isPrintableInput(char)) {
						insertPrintable(char);
					} else {
						sendControl(char);
					}
				}
			});

			try {
				fit.fit();
			} catch {
				// container not measured yet; default cols/rows is fine
			}

			// Attach at the fitted size; the route resizes the tmux pane to
			// match and returns the snapshot + cursor captured at that size.
			const session = await attachSession(
				term.cols || DEFAULT_COLS,
				term.rows || DEFAULT_ROWS,
			);
			if (!alive || !session) return;

			if (session.snapshot) {
				// `tmux capture-pane` joins visible lines with a bare "\n" and
				// pads to the pane height. Strip trailing blanks so painting
				// doesn't scroll, then normalize lone "\n" to CRLF (xterm runs
				// convertEol:false for the raw live PTY stream).
				const snap = session.snapshot
					.replace(/[\r\n]+$/, "")
					.replace(/\r?\n/g, "\r\n");
				term.write(snap);
			}
			// Re-home the cursor to tmux's real position. capture-pane leaves
			// the terminal cursor at the bottom of the paint, so without this
			// keystroke echoes land in the wrong row (typing showed up at the
			// bottom of the pane instead of at the prompt).
			if (
				typeof session.cursorRow === "number" &&
				typeof session.cursorCol === "number"
			) {
				term.write(`\x1b[${session.cursorRow + 1};${session.cursorCol + 1}H`);
			}
			offsetRef.current = session.offset ?? 0;

			setStatus("ready");
			term.focus();

			void streamLoop();

			if (hostRef.current) {
				resizeObs = new ResizeObserver(() => {
					if (!fit || !term) return;
					try {
						fit.fit();
						void fetch("/api/dashboard/terminal/resize", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ machineId: scopedMachineId, cols: term.cols, rows: term.rows }),
						}).catch(() => {});
					} catch {
						// ignore transient layout errors
					}
				});
				resizeObs.observe(hostRef.current);
			}
		}

		void boot();

		return () => {
			alive = false;
			streamAbort?.abort();
			resizeObs?.disconnect();
			flushPendingWrite();
			term?.dispose();
		};
	}, [machineId, agentKind]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<ReticleBadge variant={status === "ready" ? "accent" : "default"}>
						{status === "ready" ? "live PTY" : status}
					</ReticleBadge>
					<span className="min-w-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						tmux console · send-keys / pane tail
					</span>
				</div>
				<div className="flex w-full items-center gap-2 sm:w-auto">
					{isCliAgent(agentKind) ? (
						<button
							type="button"
							onClick={launchAgent}
							disabled={status !== "ready"}
							title={`Start the ${agentLabel(agentKind)} CLI in this console`}
							className="min-h-10 w-full border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-purple)] transition-colors hover:border-[var(--ret-purple)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
						>
							<span className="sm:hidden">launch CLI</span>
							<span className="hidden sm:inline">launch {agentLabel(agentKind)} CLI</span>
						</button>
					) : null}
					{status === "connecting" ? (
						<BrailleSpinner name="cascade" className="text-[var(--ret-purple)]" />
					) : null}
				</div>
			</div>

			<div className="relative overflow-hidden border border-[var(--ret-border)] bg-[#0a0a0e]">
				<div
					ref={hostRef}
					className={cn("w-full max-w-full overflow-hidden px-1.5 py-2 sm:px-2", heightClassName)}
				/>
				{status !== "ready" ? (
					<div
						className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0a0a0e]/80 px-4"
						role={status === "connecting" ? "status" : "alert"}
						aria-live={status === "connecting" ? "polite" : "assertive"}
					>
						<div className="flex flex-col items-center gap-2 text-center">
							{status === "connecting" ? (
								<>
									<BrailleSpinner name="scan" className="text-[var(--ret-purple)]" />
									<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-dim)]">
										attaching tmux console...
									</p>
								</>
							) : (
								<>
									<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-amber)]">
										{status === "offline" ? "machine offline" : "console error"}
									</p>
									<p className="max-w-[min(48ch,calc(100vw-3rem))] break-words font-mono text-[11px] text-[var(--ret-text-muted)]">
										{detail}
									</p>
								</>
							)}
						</div>
					</div>
				) : null}
			</div>

			{showFooter ? (
				<p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-[var(--ret-text-muted)]">
					type to interact · run the agent CLI and talk to it · ctrl-c / arrows / tab supported
				</p>
			) : null}
		</div>
	);
}

export { prefetchXterm };
