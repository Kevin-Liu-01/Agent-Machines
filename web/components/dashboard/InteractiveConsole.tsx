"use client";

import "@xterm/xterm/css/xterm.css";

import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { agentLabel, agentLaunchCommand, isCliAgent } from "@/lib/dashboard/agent-launch";

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

/** Printable coalesce window — control keys flush immediately. */
const INPUT_COALESCE_MS = 8;
const RECONNECT_MS = 100;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** Keys that must reach tmux without waiting for the coalesce timer. */
function shouldFlushInputImmediately(data: string): boolean {
	for (let i = 0; i < data.length; i += 1) {
		const code = data.charCodeAt(i);
		if (code === 0x1b || code === 0x0d || code === 0x09 || code === 0x7f) return true;
		if (code < 0x20) return true;
	}
	return false;
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
export function InteractiveConsole() {
	const machineCtx = useOptionalMachineContext();
	const machineId = machineCtx?.machineId;
	const agentKind = machineCtx?.machine?.agentKind ?? null;
	const searchParams = useSearchParams();
	const autoLaunch = searchParams.get("launch") === "1";
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
	const sendInput = useCallback(
		(data: string) => {
			if (!data || !machineId) return;
			sendChainRef.current = sendChainRef.current
				.then(() =>
					fetch("/api/dashboard/terminal/input", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ machineId, data }),
						keepalive: true,
					}),
				)
				.catch(() => {});
		},
		[machineId],
	);
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
		if (!machineId) return;
		const scopedMachineId = machineId;

		let alive = true;
		let term: XTerm | null = null;
		let fit: FitAddonType | null = null;
		let resizeObs: ResizeObserver | null = null;
		let streamAbort: AbortController | null = null;
		let inputBuf = "";
		let inputTimer: ReturnType<typeof setTimeout> | null = null;
		const offsetRef = { current: 0 };
		let pendingWrite = "";
		let pendingBytes = 0;
		let writeScheduled = false;

		const flushPendingWrite = () => {
			writeScheduled = false;
			if (!pendingWrite || !term) return;
			const chunk = pendingWrite;
			const bytes = pendingBytes;
			pendingWrite = "";
			pendingBytes = 0;
			term.write(chunk);
			offsetRef.current += bytes;
		};

		const scheduleWrite = (data: string, bytes: number) => {
			pendingWrite += data;
			pendingBytes += bytes;
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
			if (!created.ok) {
				const e = (await created.json().catch(() => ({}))) as SessionPayload;
				setStatus(created.status === 503 ? "offline" : "error");
				setDetail(e.message ?? e.error ?? `HTTP ${created.status}`);
				return null;
			}
			return (await created.json()) as SessionPayload;
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
						await sleep(400);
						continue;
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
							if (ev !== "output" || !ds) continue;
							try {
								const o = JSON.parse(ds) as { data?: string; bytes?: number };
								if (o.data) {
									scheduleWrite(
										o.data,
										o.bytes ?? new TextEncoder().encode(o.data).length,
									);
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
				fontSize: 12,
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

			const flushInput = () => {
				const data = inputBuf;
				inputBuf = "";
				inputTimer = null;
				if (!data) return;
				sendInputRef.current(data);
			};
			term.onData((d) => {
				inputBuf += d;
				if (shouldFlushInputImmediately(d)) {
					if (inputTimer) {
						clearTimeout(inputTimer);
						inputTimer = null;
					}
					flushInput();
					return;
				}
				if (!inputTimer) inputTimer = setTimeout(flushInput, INPUT_COALESCE_MS);
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

			if (autoLaunch && isCliAgent(agentKind) && !launchedRef.current) {
				launchedRef.current = true;
				setTimeout(() => launchRef.current(), 250);
			}

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
			if (inputTimer) clearTimeout(inputTimer);
			flushPendingWrite();
			term?.dispose();
		};
	}, [machineId]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<ReticleBadge variant={status === "ready" ? "accent" : "default"}>
						{status === "ready" ? "live PTY" : status}
					</ReticleBadge>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						tmux console · send-keys / pane tail
					</span>
				</div>
				<div className="flex items-center gap-2">
					{isCliAgent(agentKind) ? (
						<button
							type="button"
							onClick={launchAgent}
							disabled={status !== "ready"}
							title={`Start the ${agentLabel(agentKind)} CLI in this console`}
							className="border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-purple)] transition-colors hover:border-[var(--ret-purple)] disabled:cursor-not-allowed disabled:opacity-50"
						>
							launch {agentLabel(agentKind)} CLI
						</button>
					) : null}
					{status === "connecting" ? (
						<BrailleSpinner name="cascade" className="text-[var(--ret-purple)]" />
					) : null}
				</div>
			</div>

			<div className="relative border border-[var(--ret-border)] bg-[#0a0a0e]">
				<div ref={hostRef} className="h-[60vh] min-h-[360px] w-full px-2 py-2" />
				{status !== "ready" ? (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0a0a0e]/80">
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
									<p className="max-w-[48ch] font-mono text-[11px] text-[var(--ret-text-muted)]">
										{detail}
									</p>
								</>
							)}
						</div>
					</div>
				) : null}
			</div>

			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				type to interact · run the agent CLI and talk to it · ctrl-c / arrows / tab supported
			</p>
		</div>
	);
}

export { prefetchXterm };
