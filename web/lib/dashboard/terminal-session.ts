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
import type { ExecStreamEvent, MachineProvider } from "@/lib/providers/types";
import { getUserConfigCached } from "@/lib/user-config/request-cache";

import { resolveMachine } from "./exec";
import { tailFileStreamOnMachine } from "./exec-stream";

/** One interactive console session per machine (sufficient for the operator UI). */
export const CONSOLE_SESSION = "amconsole";
export const CONSOLE_LOG = "/tmp/am-console.log";
export const CONSOLE_AGENT_STATE =
	"$HOME/.agent-machines/state/terminal-agent.json";
export const CONSOLE_AGENT_LAUNCHER =
	"$HOME/.agent-machines/bin/am-launch-agent";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const EXPECTED_STREAM_END_PATTERNS = [
	/deadline_exceeded/i,
	/operation timed out/i,
	/timed out after \d+ms/i,
	/streamExec timed out/i,
	/AbortError/i,
	/The operation was aborted/i,
];

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
		`am_console_created=0`,
		`tmux has-session -t ${CONSOLE_SESSION} 2>/dev/null || { tmux new-session -d -s ${CONSOLE_SESSION} -x ${c} -y ${r}; am_console_created=1; tmux set-option -g -t ${CONSOLE_SESSION} history-limit 10000 2>/dev/null || true; : > ${CONSOLE_LOG}; tmux pipe-pane -t ${CONSOLE_SESSION} -o 'cat >> ${CONSOLE_LOG}'; }`,
		restoreAgentSessionCommand(),
		`tmux has-session -t ${CONSOLE_SESSION} 2>/dev/null && echo AM_CONSOLE_READY || echo AM_CONSOLE_FAILED`,
	].join("\n");
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Best-effort console warmup. Provisioning can return as soon as the host
 * exists, then this starts tmux setup on the machine while the browser is
 * navigating to the terminal. The normal session route still verifies readiness.
 */
export function primeConsoleSession(
	provider: MachineProvider,
	machineId: string,
	options: { cols?: number; rows?: number } = {},
): void {
	const command = ensureSessionCommand(
		options.cols ?? DEFAULT_COLS,
		options.rows ?? DEFAULT_ROWS,
	);
	if (typeof provider.execBackground === "function") {
		void provider.execBackground(machineId, command).catch((err) => {
			console.warn(
				`[terminal] console prime failed for ${machineId}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		});
		return;
	}

	void provider
		.exec(
			machineId,
			`nohup bash -lc ${shellQuote(command)} >/tmp/am-console-prime.log 2>&1 &`,
			{ timeoutMs: 5_000 },
		)
		.catch((err) => {
			console.warn(
				`[terminal] console prime failed for ${machineId}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		});
}

export function sendKeysCommand(input: string): string {
	const hex = toHexKeys(input);
	if (!hex) return ":";
	return `tmux send-keys -t ${CONSOLE_SESSION} -H ${hex}`;
}

export function installAgentLauncherCommand(): string {
	return String.raw`mkdir -p "$HOME/.agent-machines/bin" "$HOME/.agent-machines/state"
cat > "$HOME/.agent-machines/bin/am-launch-agent" <<'AM_LAUNCHER'
#!/usr/bin/env bash
set -u

kind="${"${1:-}"}"
state_dir="$HOME/.agent-machines/state"
state_file="$state_dir/terminal-agent.json"
mkdir -p "$state_dir"

write_state() {
	status="$1"
	ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date)"
	printf '{"desiredAgentKind":"%s","status":"%s","updatedAt":"%s"}\n' "$kind" "$status" "$ts" > "$state_file"
}

finish() {
	code=$?
	if [ "$code" -eq 0 ]; then
		write_state exited
	else
		write_state error
	fi
	exit "$code"
}
trap finish EXIT

case "$kind" in
	hermes|openclaw|claude-code|codex) ;;
	*)
		echo "unknown agent kind: $kind" >&2
		exit 64
		;;
esac

write_state running
cd "$HOME/agent-machines" 2>/dev/null || cd "$HOME" || exit 1
source "$HOME/.agent-machines/.agent-env" 2>/dev/null || true

case "$kind" in
	hermes)
		export HERMES_HOME="$HOME/.agent-machines"
		export PATH="$HOME/.agent-machines/venv/bin:$PATH"
		hermes chat
		;;
	openclaw)
		export PATH="$HOME/.npm-global/bin:$PATH"
		export OPENCLAW_STATE_DIR="$HOME/.openclaw"
		export OPENCLAW_NO_RESPAWN=1
		openclaw chat
		;;
	claude-code)
		claude
		;;
	codex)
		codex
		;;
esac
AM_LAUNCHER
chmod +x "$HOME/.agent-machines/bin/am-launch-agent"`;
}

function restoreAgentSessionCommand(): string {
	return String.raw`if [ "$am_console_created" = "1" ] && [ -f "$HOME/.agent-machines/state/terminal-agent.json" ]; then
	am_status="$(sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.agent-machines/state/terminal-agent.json" | head -1)"
	am_kind="$(sed -n 's/.*"desiredAgentKind"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.agent-machines/state/terminal-agent.json" | head -1)"
	if [ "$am_status" = "running" ]; then
		case "$am_kind" in
			hermes|openclaw|claude-code|codex)
				` + installAgentLauncherCommand() + String.raw`
				tmux send-keys -t amconsole "$HOME/.agent-machines/bin/am-launch-agent $am_kind" Enter
				;;
		esac
	fi
fi`;
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
 * Long-running `tail -f` commands end when the provider-enforced deadline
 * fires. That is a normal reconnect boundary for the browser console, not a
 * terminal failure the user needs to see.
 */
export function isExpectedConsoleStreamEnd(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? "");
	return EXPECTED_STREAM_END_PATTERNS.some((pattern) => pattern.test(message));
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
