/**
 * Shared adapter that turns a callback / event-emitter style command run
 * into an async generator of `ExecStreamEvent`s.
 *
 * E2B surfaces streaming via `onStdout`/`onStderr` callbacks; Sprites via
 * Node `Readable` streams on a spawned process. Both push output as it
 * arrives and resolve an exit code at the end -- exactly the shape this
 * bridge consumes. Vercel exposes a native async iterator (`Command.logs()`)
 * so it does not need this bridge.
 */

import type { ExecStreamEvent } from "./types";

export type StreamEmitter = {
	stdout: (chunk: string) => void;
	stderr: (chunk: string) => void;
};

/**
 * Drive `run` to completion, yielding each emitted chunk as it arrives and
 * a terminal `exit` event with the resolved exit code. Output buffered
 * before a transport failure is still yielded; the failure is thrown after
 * the buffer drains.
 *
 * `run` MUST settle (resolve or reject) on its own -- providers bound it
 * with a timeout / AbortSignal so the generator can never hang.
 */
export async function* bridgeExecStream(
	run: (emit: StreamEmitter) => Promise<number>,
): AsyncGenerator<ExecStreamEvent, void, void> {
	const queue: ExecStreamEvent[] = [];
	let notify: (() => void) | null = null;
	let settled = false;
	let failure: unknown = null;

	const wake = (): void => {
		const fn = notify;
		notify = null;
		if (fn) fn();
	};

	const emit: StreamEmitter = {
		stdout: (chunk) => {
			if (chunk) {
				queue.push({ type: "stdout", data: chunk });
				wake();
			}
		},
		stderr: (chunk) => {
			if (chunk) {
				queue.push({ type: "stderr", data: chunk });
				wake();
			}
		},
	};

	// Rejection is captured into `failure` (never unhandled). `settled` is
	// flipped in `finally`, which runs after the resolve/reject handlers, so
	// observing `settled === true` guarantees `failure` is already populated.
	void run(emit)
		.then(
			(exitCode) => {
				queue.push({ type: "exit", exitCode });
			},
			(err) => {
				failure = err;
			},
		)
		.finally(() => {
			settled = true;
			wake();
		});

	while (true) {
		while (queue.length > 0) {
			yield queue.shift() as ExecStreamEvent;
		}
		if (settled) break;
		await new Promise<void>((resolve) => {
			notify = resolve;
		});
	}

	if (failure) {
		throw failure instanceof Error ? failure : new Error(String(failure));
	}
}
