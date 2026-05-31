/**
 * Interactive terminal (PTY) session over the provider `exec` primitive.
 *
 * Why tmux-over-exec instead of a raw WebSocket PTY: Vercel serverless
 * functions cannot host a long-lived WebSocket server, so a naive WS PTY
 * route only works on localhost. Instead we keep a persistent `tmux`
 * session ON the sandbox and drive it with three cheap, stateless calls:
 *
 *   - input  : `tmux send-keys -H <hex>`         (one quick exec per keystroke batch)
 *   - output : `tail -f` the tmux pipe-pane log  (native streamExec, poll fallback)
 *   - resize : `tmux resize-window`              (one quick exec)
 *
 * This is provider-agnostic (only needs `exec`), survives sleep/wake and
 * serverless cold boots (the session lives on the box), and deploys on
 * Vercel unchanged. xterm.js renders the raw ANSI the pane emits.
 */

import { getProvider } from "@/lib/providers";
import type { ExecStreamEvent } from "@/lib/providers/types";
import { getUserConfigCached } from "@/lib/user-config/request-cache";

import { resolveMachine } from "./exec";
import { tailFileStreamOnMachine } from "./exec-stream";

/** One interactive console session per machine (sufficient for the operator UI). */
export const CONSOLE_SESSION = "amconsole";
export const CONSOLE_LOG = "/tmp/am-console.log";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export function clampDim(value: unknown, min: number, max: number, fallback: number): number {
	const n = Math.floor(Number(value));
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/**
 * Convert a UTF-8 input string into the space-separated hex byte pairs
 * `tmux send-keys -H` expects. Sending raw bytes this way handles every
 * key — printable text, Enter (0a), Ctrl-C (03), arrows (escape seqs),
 * Tab (09) — without per-key special-casing.
 */
export function toHexKeys(input: string): string {
	return Array.from(Buffer.from(input, "utf8"))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join(" ");
}

/**
 * Idempotent session bootstrap: ensure tmux exists, create the detached
 * session + pipe its pane to a log on first call, and report readiness.
 */
export function ensureSessionCommand(cols: number, rows: number): string {
	const c = clampDim(cols, 20, 500, DEFAULT_COLS);
	const r = clampDim(rows, 5, 200, DEFAULT_ROWS);
	return [
		`command -v tmux >/dev/null 2>&1 || { (sudo -n apt-get install -y tmux || apt-get install -y tmux || sudo -n dnf install -y tmux || dnf install -y tmux || apk add --no-cache tmux || sudo -n yum install -y tmux || yum install -y tmux) >/dev/null 2>&1; }`,
		`if ! command -v tmux >/dev/null 2>&1; then echo AM_CONSOLE_NO_TMUX; exit 0; fi`,
		`tmux has-session -t ${CONSOLE_SESSION} 2>/dev/null || { tmux new-session -d -s ${CONSOLE_SESSION} -x ${c} -y ${r}; tmux set-option -g -t ${CONSOLE_SESSION} history-limit 10000 2>/dev/null || true; : > ${CONSOLE_LOG}; tmux pipe-pane -t ${CONSOLE_SESSION} -o 'cat >> ${CONSOLE_LOG}'; }`,
		`tmux has-session -t ${CONSOLE_SESSION} 2>/dev/null && echo AM_CONSOLE_READY || echo AM_CONSOLE_FAILED`,
	].join("\n");
}

export function sendKeysCommand(input: string): string {
	const hex = toHexKeys(input);
	if (!hex) return ":";
	return `tmux send-keys -t ${CONSOLE_SESSION} -H ${hex}`;
}

export function resizeCommand(cols: number, rows: number): string {
	const c = clampDim(cols, 20, 500, DEFAULT_COLS);
	const r = clampDim(rows, 5, 200, DEFAULT_ROWS);
	return (
		`tmux resize-window -t ${CONSOLE_SESSION} -x ${c} -y ${r} 2>/dev/null || ` +
		`tmux resize-pane -t ${CONSOLE_SESSION} -x ${c} -y ${r} 2>/dev/null || true`
	);
}

/** Current screen contents (with colors) for first paint / reconnect. */
export function capturePaneCommand(): string {
	return `tmux capture-pane -e -p -t ${CONSOLE_SESSION} 2>/dev/null || true`;
}

/**
 * The pane's cursor position as `row col` (0-based, from the pane's top-left).
 * `capture-pane` paints every line and leaves the terminal cursor at the
 * bottom, so the client must move xterm's cursor back here after painting —
 * otherwise keystroke echoes land wherever the snapshot ended, not at the
 * prompt.
 */
export function cursorPosCommand(): string {
	return `tmux display-message -p -t ${CONSOLE_SESSION} -F '#{cursor_y} #{cursor_x}' 2>/dev/null || echo '0 0'`;
}

export function logSizeCommand(): string {
	return `[ -f ${CONSOLE_LOG} ] && wc -c < ${CONSOLE_LOG} || echo 0`;
}

/**
 * Stream new pane output starting at byte `offset`. Uses the provider's
 * native `tail -f` streaming when available (real-time), else falls back
 * to offset-aware log polling (Dedalus).
 */
export async function* streamConsoleOutput(
	machineId: string | null | undefined,
	options: { offset?: number; maxDurationMs?: number } = {},
): AsyncGenerator<ExecStreamEvent, void, void> {
	const config = await getUserConfigCached();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		throw new Error(
			machineId
				? `Machine ${machineId} not found in your account.`
				: "No active machine selected.",
		);
	}
	const provider = getProvider(machine.providerKind, config.providers);
	const offset = Math.max(0, Math.floor(options.offset ?? 0));
	const maxDurationMs = options.maxDurationMs ?? 110_000;

	if (typeof provider.streamExec === "function") {
		// `tail -c +N` is 1-indexed: +1 == whole file, +(offset+1) == skip `offset` bytes.
		// Fully unbuffered (-o0), NOT line-buffered: full-screen TUIs (codex/claude)
		// emit cursor-addressed escape sequences with no newlines, so line buffering
		// would stall the live screen until the buffer filled. -o0 flushes each write.
		const follow = `stdbuf -o0 -e0 tail -c +${offset + 1} -f ${CONSOLE_LOG}`;
		yield* provider.streamExec(machine.id, follow, { timeoutMs: maxDurationMs });
		return;
	}

	yield* tailFileStreamOnMachine(CONSOLE_LOG, {
		machineId: machine.id,
		startOffset: offset,
		maxDurationMs,
		pollMs: 400,
	});
}
