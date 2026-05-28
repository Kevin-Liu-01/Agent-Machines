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

const INPUT_COALESCE_MS = 12;
const RECONNECT_MS = 300;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
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

	const launchAgent = useCallback(() => {
		const cmd = agentLaunchCommand(agentKind);
		if (!cmd || !machineId) return;
		void fetch("/api/dashboard/terminal/input", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ machineId, data: `${cmd}\r` }),
		}).catch(() => {});
	}, [agentKind, machineId]);

	const launchRef = useRef(launchAgent);
	launchRef.current = launchAgent;

	useEffect(() => {
		let alive = true;
		let term: XTerm | null = null;
		let fit: FitAddonType | null = null;
		let resizeObs: ResizeObserver | null = null;
		let streamAbort: AbortController | null = null;
		let inputBuf = "";
		let inputTimer: ReturnType<typeof setTimeout> | null = null;
		const offsetRef = { current: 0 };

		async function boot() {
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
					cursor: "#b794f6",
					selectionBackground: "#3a3357",
				},
				scrollback: 8_000,
				convertEol: false,
			});
			fit = new FitAddon();
			term.loadAddon(fit);
			term.open(hostRef.current);
			try {
				fit.fit();
			} catch {
				// container not measured yet; default 80x24 is fine
			}

			const flushInput = () => {
				const data = inputBuf;
				inputBuf = "";
				inputTimer = null;
				if (!data || !machineId) return;
				void fetch("/api/dashboard/terminal/input", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ machineId, data }),
				}).catch(() => {});
			};
			term.onData((d) => {
				inputBuf += d;
				if (!inputTimer) inputTimer = setTimeout(flushInput, INPUT_COALESCE_MS);
			});

			const created = await fetch("/api/dashboard/terminal/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId, cols: term.cols, rows: term.rows }),
			});
			if (!alive) return;
			if (!created.ok) {
				const e = (await created.json().catch(() => ({}))) as {
					message?: string;
					error?: string;
				};
				setStatus(created.status === 503 ? "offline" : "error");
				setDetail(e.message ?? e.error ?? `HTTP ${created.status}`);
				return;
			}
			setStatus("ready");
			term.focus();

			// One-click flow: auto-start the agent CLI once the pane is attached.
			if (autoLaunch && isCliAgent(agentKind) && !launchedRef.current) {
				launchedRef.current = true;
				setTimeout(() => launchRef.current(), 700);
			}

			if (hostRef.current) {
				resizeObs = new ResizeObserver(() => {
					if (!fit || !term) return;
					try {
						fit.fit();
						if (machineId) {
							void fetch("/api/dashboard/terminal/resize", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ machineId, cols: term.cols, rows: term.rows }),
							}).catch(() => {});
						}
					} catch {
						// ignore transient layout errors
					}
				});
				resizeObs.observe(hostRef.current);
			}

			// Output stream loop: stream from byte offset, reconnect on end.
			while (alive) {
				streamAbort = new AbortController();
				try {
					const r = await fetch(
						`/api/dashboard/terminal/stream?machineId=${encodeURIComponent(machineId ?? "")}&offset=${offsetRef.current}`,
						{ signal: streamAbort.signal },
					);
					if (!r.ok || !r.body) {
						await sleep(800);
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
								if (o.data && term) {
									term.write(o.data);
									offsetRef.current +=
										o.bytes ?? new TextEncoder().encode(o.data).length;
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
				await sleep(RECONNECT_MS);
			}
		}

		void boot();

		return () => {
			alive = false;
			streamAbort?.abort();
			resizeObs?.disconnect();
			if (inputTimer) clearTimeout(inputTimer);
			term?.dispose();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
