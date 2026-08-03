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
import {
	agentLabel,
	agentLaunchCommand,
	agentTerminalLauncherCommand,
	isCliAgent,
} from "@/lib/dashboard/agent-launch";
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

type SendInputOptions = {
	rememberAgentKind?: string | null;
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
	/**
	 * WHY the failure gets classified instead of just displayed: a dead stream
	 * has three different fixes depending on the cause, and a bare
	 * "HTTP 401" card with no way forward strands the user (2026-08-03
	 * screenshot: a live tmux scrollback behind an unrecoverable error card).
	 *
	 *  - "session": the DASHBOARD auth expired (the terminal routes 401 when
	 *    getEffectiveUserId() is null -- a stale tab, not a dead machine).
	 *    Re-authenticating fixes it; restarting the console cannot.
	 *  - "expired": the machine itself is gone or destroyed, confirmed by the
	 *    machines/[id] probe -- restarting cannot help, say so plainly.
	 *  - null: transient/unknown. Offer restart, which re-runs the whole
	 *    attach + stream effect via retryNonce.
	 */
	const [failureKind, setFailureKind] = useState<"session" | "expired" | null>(null);
	const [retryNonce, setRetryNonce] = useState(0);
	const [detailCopy, setDetailCopy] = useState<"idle" | "copied" | "failed">(
		"idle",
	);
	const launchedRef = useRef(false);

	useEffect(() => {
		prefetchXterm();
	}, []);

	// The provider errors surfaced here are the ones worth pasting into an issue
	// (the 2026-08-02 e2b failure was a 5-line ERR_REQUIRE_ESM message carrying
	// two /var/task/node_modules/.pnpm/... paths, which wrapped to roughly a
	// dozen lines in this panel), so it needs a copy affordance rather than
	// asking the reader to hand-select wrapped mono text.
	// `writeText` rejects outside a secure context and when the permission is
	// denied; say so instead of showing a "copied!" that did not happen.
	const copyDetail = useCallback(() => {
		void navigator.clipboard
			.writeText(detail)
			.then(() => setDetailCopy("copied"))
			.catch(() => setDetailCopy("failed"));
	}, [detail]);

	useEffect(() => {
		if (detailCopy === "idle") return;
		const timer = window.setTimeout(() => setDetailCopy("idle"), 1_500);
		return () => window.clearTimeout(timer);
	}, [detailCopy]);

	// Keep only one POST in flight and merge everything typed while it runs into
	// the next batch. This preserves order without building a fetch-per-10ms
	// backlog when the provider is briefly slow.
	const queuedPostRef = useRef({
		data: "",
		rememberAgentKind: null as string | null,
	});
	const postRunningRef = useRef(false);
	const pendingInputRef = useRef("");
	const inputFlushTimerRef = useRef<number | null>(null);
	const drainInputPosts = useCallback(async () => {
		if (!machineId || postRunningRef.current) return;
		postRunningRef.current = true;
		try {
			while (queuedPostRef.current.data) {
				const batch = queuedPostRef.current;
				queuedPostRef.current = { data: "", rememberAgentKind: null };
				const controller = new AbortController();
				const timeout = window.setTimeout(
					() => controller.abort(),
					INPUT_POST_TIMEOUT_MS,
				);
				try {
					await fetch("/api/dashboard/terminal/input", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							machineId,
							data: batch.data,
							rememberAgentKind: batch.rememberAgentKind ?? undefined,
						}),
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
			}
		} finally {
			postRunningRef.current = false;
		}
	}, [machineId]);
	const postInput = useCallback(
		(data: string, options: SendInputOptions = {}) => {
			if (!data || !machineId) return;
			queuedPostRef.current.data += data;
			if (options.rememberAgentKind) {
				queuedPostRef.current.rememberAgentKind = options.rememberAgentKind;
			}
			void drainInputPosts();
		},
		[drainInputPosts, machineId],
	);
	const flushInput = useCallback((options: SendInputOptions = {}) => {
		if (inputFlushTimerRef.current) {
			window.clearTimeout(inputFlushTimerRef.current);
			inputFlushTimerRef.current = null;
		}
		const data = pendingInputRef.current;
		pendingInputRef.current = "";
		postInput(data, options);
	}, [postInput]);
	const sendInput = useCallback(
		(data: string, options: SendInputOptions = {}) => {
			if (!data || !machineId) return;
			pendingInputRef.current += data;
			if (data.includes("\r") || data.includes("\x03")) {
				flushInput(options);
				return;
			}
			if (inputFlushTimerRef.current) return;
			inputFlushTimerRef.current = window.setTimeout(
				() => flushInput(options),
				INPUT_FLUSH_MS,
			);
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
			queuedPostRef.current = { data: "", rememberAgentKind: null };
		};
	}, [machineId]);
	const sendInputRef = useRef(sendInput);
	sendInputRef.current = sendInput;

	const launchAgent = useCallback(() => {
		const cmd =
			agentTerminalLauncherCommand(agentKind) ?? agentLaunchCommand(agentKind);
		if (!cmd) return;
		sendInput(`${cmd}\r`, { rememberAgentKind: agentKind });
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
		setFailureKind(null);

		let alive = true;

		/**
		 * Classify a failed request so the error card can offer the right
		 * action. 401 needs no probe -- the terminal routes return it only when
		 * the dashboard session is gone. Anything else asks machines/[id],
		 * which does a no-wake live-state read: a 404 or a destroyed/missing
		 * state means the INSTANCE expired, which no number of restarts fixes.
		 * Probe failures leave the kind null (restart stays available) --
		 * fail open here, because withholding the restart button on a guess
		 * would strand exactly the transient cases restart exists for.
		 */
		async function diagnose(httpStatus: number): Promise<void> {
			if (httpStatus === 401) {
				if (!alive) return;
				setFailureKind("session");
				setDetail(
					"Your dashboard session expired, so the terminal stream was refused (HTTP 401). " +
						"The machine itself is likely still running. Sign in again to reattach.",
				);
				return;
			}
			try {
				const probe = await fetch(
					`/api/dashboard/machines/${encodeURIComponent(scopedMachineId)}`,
				);
				if (!alive) return;
				if (probe.status === 404) {
					setFailureKind("expired");
					setDetail(
						"This machine no longer exists -- it was destroyed or removed. " +
							"Provision a new machine to continue.",
					);
					return;
				}
				if (!probe.ok) return;
				const body = (await probe.json().catch(() => null)) as {
					live?: { state?: string; error?: string } | null;
				} | null;
				if (!alive || !body) return;
				const live = body.live ?? null;
				const liveError = live?.error ?? "";
				if (
					live?.state === "destroyed" ||
					/not found|no longer exists|terminated|expired/i.test(liveError)
				) {
					setFailureKind("expired");
					setDetail(
						`This machine's sandbox has expired or been destroyed${
							liveError ? ` (provider: ${liveError})` : ""
						}. Provision a new machine to continue.`,
					);
				}
			} catch {
				// Probe unreachable: keep the generic error, restart stays offered.
			}
		}
		let term: XTerm | null = null;
		let fit: FitAddonType | null = null;
		let resizeObs: ResizeObserver | null = null;
		let resizeTimer: number | null = null;
		let lastResize = { cols: 0, rows: 0 };
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
				void diagnose(created.status);
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
						if (r.status !== 503) void diagnose(r.status);
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
			lastResize = { cols: term.cols, rows: term.rows };

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
						if (term.cols === lastResize.cols && term.rows === lastResize.rows) return;
						const next = { cols: term.cols, rows: term.rows };
						lastResize = next;
						if (resizeTimer) window.clearTimeout(resizeTimer);
						resizeTimer = window.setTimeout(() => {
							void fetch("/api/dashboard/terminal/resize", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ machineId: scopedMachineId, ...next }),
							}).catch(() => {});
						}, 80);
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
			if (resizeTimer) window.clearTimeout(resizeTimer);
			flushPendingWrite();
			term?.dispose();
		};
		// retryNonce: bumped by the restart button; re-running this effect IS
		// the restart (fresh session POST, fresh stream, fresh xterm).
	}, [machineId, agentKind, retryNonce]);

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
						{status === "connecting" ? (
							<div className="flex flex-col items-center gap-2 text-center">
								<BrailleSpinner name="scan" className="text-[var(--ret-purple)]" />
								<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-dim)]">
									attaching tmux console...
								</p>
							</div>
						) : (
							/*
							 * Errors get their own left-aligned card instead of sharing the
							 * spinner's centered stack. Centering a one-line "attaching..."
							 * reads fine; centering a multi-line provider stack trace does
							 * not -- every line starts at a different x, so there is no
							 * column to scan down. `pointer-events-auto` re-enables input on
							 * this card only (the overlay stays transparent to clicks) --
							 * without it the internal scroll, the copy button, and plain
							 * text selection are all dead.
							 *
							 * Fixed white-on-#0d0d12 rather than --ret-text-muted /
							 * --ret-surface, because this console hard-codes background
							 * #0a0a0e in both themes (see the xterm theme above) while the
							 * light branch of globals.css sets --ret-text-muted to
							 * rgba(0,0,0,0.35): dark grey on near-black, i.e. the error was
							 * effectively invisible for anyone on the light theme. Same
							 * white-scale-on-a-dark-terminal convention as
							 * WorkflowNavigator's bg-[#0d0d12] panel.
							 */
							<div className="pointer-events-auto flex w-full min-w-0 max-w-[min(80ch,100%)] flex-col gap-1.5 border border-white/10 bg-[#0d0d12] px-3 py-2 text-left">
								<div className="flex items-center justify-between gap-3">
									<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-amber)]">
										{failureKind === "expired"
											? "instance expired"
											: failureKind === "session"
												? "session expired"
												: status === "offline"
													? "machine offline"
													: "console error"}
									</p>
									{detail ? (
										<button
											type="button"
											onClick={copyDetail}
											className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45 transition-colors hover:text-white"
										>
											{detailCopy === "copied"
												? "copied!"
												: detailCopy === "failed"
													? "copy failed"
													: "copy"}
										</button>
									) : null}
								</div>
								{detail ? (
									/*
									 * whitespace-pre-wrap: these messages are multi-line and the
									 * line structure carries the meaning (which module required
									 * which file). break-words: the tokens are /var/task/... paths
									 * with no spaces, and letting them set the min-content width
									 * would stretch the card past its max-w and scroll the page
									 * sideways. overflow-auto + max-h-60: anything that still
									 * cannot break scrolls inside this block, and a long trace
									 * cannot push the console around it. max-h-60 is this repo's
									 * scrolling-output height: CursorRunsList.tsx:148, Chat.tsx
									 * and agent-console/EventCard.tsx all use it. (TerminalPanel
									 * is NOT one of them -- it uses max-h-[400px] and
									 * max-h-[65dvh] -- so do not cite it here.)
									 */
									<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-white/70">
										{detail}
									</pre>
								) : null}
								{/*
								  * One action per failure kind, never a dead end:
								  *  - session expired: reload; Clerk re-authenticates on
								  *    navigation and the console reattaches to the SAME tmux
								  *    session (the pane log offset survives server-side).
								  *  - instance expired: nothing to restart -- a button that
								  *    re-runs the effect would fail identically and teach the
								  *    user the button lies. The card copy already says what
								  *    to do (provision a new machine).
								  *  - anything else (transient error, offline): restart the
								  *    console. Bumping retryNonce re-runs the whole connect
								  *    effect: fresh session POST, fresh SSE stream, fresh
								  *    xterm.
								  */}
								{failureKind === "session" ? (
									<button
										type="button"
										onClick={() => window.location.reload()}
										className="self-start border border-[var(--ret-amber)]/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-amber)] transition-colors hover:border-[var(--ret-amber)]"
									>
										sign in again
									</button>
								) : failureKind !== "expired" ? (
									<button
										type="button"
										onClick={() => {
											setStatus("connecting");
											setDetail("");
											setRetryNonce((nonce) => nonce + 1);
										}}
										className="self-start border border-white/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-white/50 hover:text-white"
									>
										restart console
									</button>
								) : null}
							</div>
						)}
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
