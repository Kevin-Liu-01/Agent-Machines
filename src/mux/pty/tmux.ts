/**
 * tmux-over-exec PTY fallback.
 *
 * Substrates without a native PTY primitive (Vercel Sandbox has no
 * stdin; Dedalus is batch REST) still get interactive terminals by
 * hosting the session in tmux ON the sandbox and driving it purely
 * through `exec`:
 *
 *   input  -> tmux send-keys -H <hex bytes>
 *   output -> pipe-pane to a log file, tailed via streaming exec
 *   resize -> tmux resize-window
 *
 * Same inversion the dashboard console uses (the session outlives every
 * control-plane request), packaged behind the PtyHandle contract so
 * callers cannot tell it apart from a native PTY.
 */

import type {
	ExecStreamOptions,
	ExecResult,
	ExecStreamEvent,
	PtyHandle,
	PtyOptions,
} from "../types.js";

type ExecLike = {
	exec(command: string, options?: { timeoutMs?: number }): Promise<ExecResult>;
	execBackground(command: string): Promise<void>;
	execStream(
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void>;
};

const DEFAULT_SESSION = "ammux";

function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toHex(data: Uint8Array): string {
	return Array.from(data, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join(" ");
}

export async function openTmuxPty(
	target: ExecLike,
	options: PtyOptions = {},
): Promise<PtyHandle> {
	// A caller that named the session wants it to outlive this handle, so
	// close() detaches. An unnamed session is a one-off and close() reaps
	// it -- there is no name to reattach with.
	const named = options.session !== undefined;
	const session = options.session ?? DEFAULT_SESSION;
	const cols = options.cols ?? 100;
	const rows = options.rows ?? 30;
	const log = `/tmp/am-mux-${session}.log`;
	const envExports = Object.entries(options.env ?? {})
		.map(([key, value]) => `${key}=${shq(value)}`)
		.join(" ");
	const shellCommand = options.command
		? `${envExports} ${options.command}`.trim()
		: "";

	// One round trip: ensure tmux, (re)create session, wire pipe-pane,
	// report the log byte offset so the tail starts at "now".
	// One round trip: ensure tmux and the session, wire the output log,
	// then report a visible-pane snapshot plus the log byte offset. The
	// snapshot is what makes reattach feel instant -- the client paints
	// the current screen immediately and streams only deltas after it.
	const marker = "__AM_SNAPSHOT__";
	const ensure = [
		`command -v tmux >/dev/null 2>&1 || (sudo apt-get install -y tmux >/dev/null 2>&1 || apt-get install -y tmux >/dev/null 2>&1 || apk add tmux >/dev/null 2>&1)`,
		`tmux has-session -t ${shq(session)} 2>/dev/null || tmux new-session -d -s ${shq(session)} -x ${cols} -y ${rows} ${shellCommand ? shq(shellCommand) : ""}`,
		`tmux set-option -t ${shq(session)} history-limit 10000 >/dev/null 2>&1 || true`,
		`tmux pipe-pane -o -t ${shq(session)} ${shq(`cat >> ${log}`)}`,
		`touch ${log}`,
		`wc -c < ${log}`,
		`echo ${marker}`,
		`tmux capture-pane -p -e -t ${shq(session)} 2>/dev/null || true`,
	].join(" && ");
	const ensured = await target.exec(ensure, { timeoutMs: 75_000 });
	if (ensured.exitCode !== 0) {
		throw new Error(
			`tmux session setup failed (exit ${ensured.exitCode}): ${ensured.stderr || ensured.stdout}`,
		);
	}
	const markerAt = ensured.stdout.indexOf(marker);
	const head =
		markerAt === -1 ? ensured.stdout : ensured.stdout.slice(0, markerAt);
	const snapshot =
		markerAt === -1
			? ""
			: ensured.stdout.slice(markerAt + marker.length).replace(/^\n/, "");
	const offset = Number.parseInt(head.trim(), 10) || 0;

	const abort = new AbortController();
	let exitResolve: (code: number | null) => void = () => {};
	const exited = new Promise<number | null>((resolvePromise) => {
		exitResolve = resolvePromise;
	});

	const encoder = new TextEncoder();
	const output: AsyncIterable<Uint8Array> = (async function* () {
		// Replay the visible pane first so a reattach shows the session as
		// it stands, then stream only what arrives after the snapshot.
		if (snapshot.length > 0) yield encoder.encode(snapshot);
		const tail = `stdbuf -o0 tail -c +${offset + 1} -f ${log}`;
		try {
			for await (const event of target.execStream(tail, {
				signal: abort.signal,
			})) {
				if (event.type === "stdout") yield encoder.encode(event.data);
				if (event.type === "exit") break;
			}
		} finally {
			exitResolve(null);
		}
	})();

	return {
		output,
		async write(data) {
			const bytes =
				typeof data === "string" ? encoder.encode(data) : data;
			await target.execBackground(
				`tmux send-keys -H -t ${shq(session)} ${toHex(bytes)}`,
			);
		},
		async resize(nextCols, nextRows) {
			await target.execBackground(
				`tmux resize-window -t ${shq(session)} -x ${nextCols} -y ${nextRows}`,
			);
		},
		exited,
		async close() {
			abort.abort();
			// Detach only: a named session must survive for the next
			// openPty to reattach to (the process group keeps running).
			if (named) return;
			await target
				.exec(`tmux kill-session -t ${shq(session)} 2>/dev/null || true`)
				.catch(() => {});
		},
	};
}
