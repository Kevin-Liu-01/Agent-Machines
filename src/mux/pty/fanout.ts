/**
 * PTY fan-out: one PtyHandle, many viewers.
 *
 * `PtyHandle.output` is a single-use live byte stream that THROWS on a second
 * iteration, because two loops over one async generator interleave their
 * `next()` calls and silently deliver chunks to the abandoned consumer -- which
 * is indistinguishable from a frozen terminal and cost real debugging time
 * (docs/MUX-RESULTS.md, "Resolved: the reattach report was a test bug").
 * That contract is right, and it also means exactly one viewer can watch a
 * terminal, which a multi-viewer console cannot live with (ROADMAP pillar 11).
 *
 * So this module iterates the handle EXACTLY ONCE, for the life of the
 * fan-out, and re-broadcasts to per-subscriber queues. Creating a fan-out
 * TAKES OWNERSHIP of the handle: after that, nothing else may touch
 * `handle.output` or `handle.close()`, or the single-use contract is violated
 * and the release count stops being one.
 *
 * The policies below are choices, not defaults that fell out of the
 * implementation. Terminal bytes are stateful -- a dropped or split ANSI
 * sequence leaves the screen in an undefined state that the viewer cannot
 * repair on its own -- so every one of them has a visible consequence and the
 * caller needs to know which one it got.
 *
 * OVERFLOW (per subscriber, `subscriberBufferBytes`, default 256 KiB).
 *   There is no backpressure to push on: the underlying stream is a live tail
 *   of a tmux pane (`./tmux.ts`) or a native PTY, and neither can be told to
 *   slow down. Buffering is therefore the only option, and it has to be
 *   bounded. A subscriber that exceeds its budget is handled by ONE of:
 *
 *   "disconnect" (default) -- the subscriber is dropped with a MuxError
 *     ("transient", so a caller reads it as retryable) and its buffer is
 *     freed. Chosen as the default because a gap cannot be repaired in band,
 *     while a disconnect IS repairable: reopening a named session replays the
 *     visible pane (verified live, docs/MUX-RESULTS.md "Interfaces verified
 *     live"), so a reattached viewer gets a correct screen where a viewer that
 *     silently missed bytes would render corruption indefinitely.
 *   "gap-marker" -- the OLDEST queued bytes are discarded (the newest bytes
 *     are the ones that describe the current screen) and a human-readable
 *     marker naming the byte count is inserted at the gap. For callers whose
 *     renderer can resync -- reset the emulator, or request a fresh snapshot
 *     -- on seeing the marker. Never silent: `droppedBytes` counts every byte
 *     that never reached the subscriber under either policy.
 *
 *   A chunk is never split to fit, so the budget may be exceeded by at most
 *   one chunk before the policy fires: half a write is worse than a big one.
 *
 * REPLAY (`replayBytes`, default 64 KiB). A bounded ring of the most recent
 *   bytes, so a late joiner sees recent scrollback instead of a blank screen.
 *   What a late joiner does NOT see: anything older than the ring; anything
 *   that flowed before the fan-out was created (the fan-out cannot read what
 *   it did not consume); and, when one chunk is larger than the whole ring,
 *   the head of that chunk -- the tail is kept, so replay can begin
 *   mid-escape-sequence. A client should therefore reset its emulator before
 *   painting replay. This is a recent-output window, not scrollback: the tmux
 *   session's own `history-limit` (10000 lines) is far larger, and a viewer
 *   that needs real scrollback must ask the session, not the fan-out.
 *   `replayBytes` may not exceed `subscriberBufferBytes` -- a late joiner
 *   seeded past its own budget would be disconnected by its own replay -- and
 *   a config that does is rejected at construction instead of at first byte.
 *
 * WRITING (`writePolicy`, default "single-pen"). Two writers interleaving
 *   keystrokes into one shell is unusable, so by default exactly one
 *   subscriber holds the pen: the first to ask (`subscribe({ write: true })`),
 *   until it calls `releasePen()`, closes, or is dropped for falling behind (a
 *   viewer that cannot see the screen must not be driving it). Everyone else
 *   is read-only and `write()` rejects rather than quietly reordering
 *   keystrokes. `resize()` is gated the same way because geometry is global --
 *   one viewer reflowing the pane reflows it for every other viewer.
 *   "shared" lets every subscriber that asked for write drive the same
 *   terminal, with interleaving as the caller's declared problem.
 *
 * RELEASE. `handle.close()` runs at most once, on the close of the last
 *   subscription (or on `fanout.close()`, which also covers a fan-out nobody
 *   ever subscribed to). Closing one of several does not release. A subscriber
 *   the overflow policy dropped is NOT a released subscriber: only its owner
 *   knows whether it will reattach, and for the tmux fallback `close()` reaps
 *   an unnamed session -- so a slow network must not be able to destroy the
 *   terminal. A fan-out is not reusable after release; open a new PTY.
 *
 * Chunks are broadcast by reference, never copied: copying would multiply
 * memory by subscriber count. Yielded chunks are treated as immutable, which
 * every PtyHandle implementation in this repo satisfies (each yield is a fresh
 * encode).
 */

import { MuxError, type PtyHandle } from "../types.js";

/** Recent bytes a late joiner may be shown. Roughly a few full repaints. */
export const DEFAULT_REPLAY_BYTES = 64 * 1024;
/** Un-read bytes one subscriber may hold before the overflow policy fires. */
export const DEFAULT_SUBSCRIBER_BUFFER_BYTES = 256 * 1024;

export type PtyOverflowPolicy = "disconnect" | "gap-marker";
export type PtyWritePolicy = "single-pen" | "shared";

/**
 *   "live"    -- attached and receiving.
 *   "ended"   -- the terminal stream finished and this subscriber drained it.
 *   "dropped" -- the overflow policy disconnected it; reattach for a snapshot.
 *   "closed"  -- its owner closed it.
 */
export type PtySubscriptionState = "live" | "ended" | "dropped" | "closed";

export type PtyFanoutOptions = {
	replayBytes?: number;
	subscriberBufferBytes?: number;
	overflow?: PtyOverflowPolicy;
	writePolicy?: PtyWritePolicy;
};

export type PtySubscribeOptions = {
	/**
	 * Ask to drive the terminal. Under "single-pen" this throws when another
	 * subscriber already holds the pen, so a caller finds out at subscribe
	 * time rather than on a keystroke that silently went nowhere.
	 */
	write?: boolean;
};

/**
 * One viewer's view. It IS a PtyHandle, so anything that already consumes a
 * PTY (the console SSE route, `am mux term`) takes a subscription unchanged --
 * including the single-use `output` rule, which holds here for the same reason
 * it holds on the handle.
 */
export type PtySubscription = PtyHandle & {
	readonly id: number;
	readonly state: PtySubscriptionState;
	/** Bytes this subscriber never saw because it fell behind. */
	readonly droppedBytes: number;
	/** Whether `write()`/`resize()` will be accepted right now. */
	readonly canWrite: boolean;
	/** Hand the pen to the next viewer without disconnecting this one. */
	releasePen(): void;
};

export type PtyFanout = {
	subscribe(options?: PtySubscribeOptions): PtySubscription;
	/** Subscriptions created and not yet closed, dropped ones included. */
	readonly subscribers: number;
	/** False under "shared", where there is no pen to hold. */
	readonly penHeld: boolean;
	/** Bytes a subscriber joining right now would be replayed. */
	readonly bufferedReplayBytes: number;
	/** End every subscription and release the handle (at most once). */
	close(): Promise<void>;
};

/** In-band, human-readable, and countable -- a dropped byte is never silent. */
export function formatGapMarker(droppedBytes: number): string {
	return `\r\n[am-mux: ${droppedBytes} bytes dropped]\r\n`;
}

type QueuedChunk = {
	bytes: Uint8Array;
	/**
	 * Gap markers are bookkeeping, not terminal output, so they are excluded
	 * from the budget: counting them would let a marker evict the very bytes
	 * it annotates, and would make every marker trigger the next overflow.
	 */
	counted: boolean;
};

type Subscriber = {
	id: number;
	state: PtySubscriptionState;
	queue: QueuedChunk[];
	queuedBytes: number;
	droppedBytes: number;
	wantsWrite: boolean;
	pen: boolean;
	iterated: boolean;
	failure: Error | null;
	wake: (() => void) | null;
};

export function createPtyFanout(
	handle: PtyHandle,
	options: PtyFanoutOptions = {},
): PtyFanout {
	const replayLimit = Math.max(0, options.replayBytes ?? DEFAULT_REPLAY_BYTES);
	const bufferLimit = Math.max(
		1,
		options.subscriberBufferBytes ?? DEFAULT_SUBSCRIBER_BUFFER_BYTES,
	);
	const overflow = options.overflow ?? "disconnect";
	const writePolicy = options.writePolicy ?? "single-pen";
	// Rejected here, before the handle is iterated, so a bad config leaves the
	// caller a usable single-consumer handle instead of a burned one.
	if (replayLimit > bufferLimit) {
		throw new Error(
			`pty fan-out replayBytes (${replayLimit}) exceeds ` +
				`subscriberBufferBytes (${bufferLimit}): a late subscriber would be ` +
				"disconnected by its own replay before reading a byte",
		);
	}

	const encoder = new TextEncoder();
	const subscribers = new Set<Subscriber>();
	const replay: Uint8Array[] = [];
	let replayHeld = 0;
	let nextId = 1;
	let sourceEnded = false;
	let sourceFailure: Error | null = null;
	let releasing: Promise<void> | null = null;

	function wakeUp(subscriber: Subscriber): void {
		const wake = subscriber.wake;
		if (wake !== null) {
			subscriber.wake = null;
			wake();
		}
	}

	function remember(chunk: Uint8Array): void {
		if (replayLimit === 0) return;
		replay.push(chunk);
		replayHeld += chunk.byteLength;
		while (replayHeld > replayLimit && replay.length > 1) {
			const oldest = replay.shift();
			if (oldest === undefined) break;
			replayHeld -= oldest.byteLength;
		}
		const only = replay[0];
		if (replay.length === 1 && only !== undefined && replayHeld > replayLimit) {
			// One chunk bigger than the whole ring: keep its TAIL. The newest
			// bytes describe the current screen; dropping the chunk entirely
			// would leave a late joiner with nothing at all.
			replay[0] = only.subarray(only.byteLength - replayLimit);
			replayHeld = replayLimit;
		}
	}

	function applyOverflow(subscriber: Subscriber): void {
		if (overflow === "disconnect") {
			subscriber.droppedBytes += subscriber.queuedBytes;
			subscriber.queue = [];
			subscriber.queuedBytes = 0;
			subscriber.state = "dropped";
			subscriber.pen = false;
			subscriber.failure = new MuxError(
				"transient",
				`pty fan-out subscriber ${subscriber.id} fell behind by more than ` +
					`${bufferLimit} buffered bytes and was disconnected; reattach to ` +
					"get a fresh screen snapshot",
			);
			return;
		}
		let dropped = 0;
		while (subscriber.queuedBytes > bufferLimit && subscriber.queue.length > 1) {
			const oldest = subscriber.queue.shift();
			if (oldest === undefined) break;
			if (!oldest.counted) continue;
			subscriber.queuedBytes -= oldest.bytes.byteLength;
			dropped += oldest.bytes.byteLength;
		}
		if (dropped === 0) return;
		subscriber.droppedBytes += dropped;
		// Unshifted, not pushed: the gap is at the FRONT of what survives, so a
		// marker at the end would tell the viewer the wrong place to resync.
		subscriber.queue.unshift({
			bytes: encoder.encode(formatGapMarker(dropped)),
			counted: false,
		});
	}

	function deliverTo(subscriber: Subscriber, chunk: Uint8Array): void {
		if (subscriber.state !== "live") return;
		subscriber.queue.push({ bytes: chunk, counted: true });
		subscriber.queuedBytes += chunk.byteLength;
		if (subscriber.queuedBytes > bufferLimit) applyOverflow(subscriber);
		wakeUp(subscriber);
	}

	// The one and only iteration of handle.output. It reads as fast as the
	// handle yields and never awaits a subscriber, which is what keeps a slow
	// viewer from stalling a fast one.
	void (async () => {
		try {
			for await (const chunk of handle.output) {
				if (chunk.byteLength === 0) continue;
				remember(chunk);
				for (const subscriber of subscribers) deliverTo(subscriber, chunk);
			}
		} catch (error) {
			// A stream that DIED must not look like a terminal that exited
			// cleanly: a viewer would paint a normal end of session and nobody
			// would learn the tail broke.
			sourceFailure =
				error instanceof Error ? error : new Error(String(error));
		} finally {
			sourceEnded = true;
			for (const subscriber of subscribers) wakeUp(subscriber);
		}
	})();

	async function* drain(
		subscriber: Subscriber,
	): AsyncGenerator<Uint8Array, void, void> {
		for (;;) {
			while (subscriber.queue.length > 0) {
				const next = subscriber.queue.shift();
				if (next === undefined) break;
				if (next.counted) subscriber.queuedBytes -= next.bytes.byteLength;
				yield next.bytes;
			}
			if (subscriber.failure !== null) {
				const failure = subscriber.failure;
				subscriber.failure = null;
				throw failure;
			}
			if (subscriber.state === "dropped" || subscriber.state === "closed") {
				return;
			}
			if (sourceEnded) {
				if (sourceFailure !== null) throw sourceFailure;
				if (subscriber.state === "live") subscriber.state = "ended";
				return;
			}
			await new Promise<void>((resolve) => {
				subscriber.wake = resolve;
			});
		}
	}

	function mayDrive(subscriber: Subscriber): boolean {
		if (subscriber.state === "dropped" || subscriber.state === "closed") {
			return false;
		}
		return writePolicy === "shared" ? subscriber.wantsWrite : subscriber.pen;
	}

	function requirePen(subscriber: Subscriber, action: string): void {
		if (mayDrive(subscriber)) return;
		if (subscriber.state === "dropped" || subscriber.state === "closed") {
			throw new MuxError(
				"not_supported",
				`pty fan-out subscription ${subscriber.id} is ${subscriber.state} and ` +
					`cannot ${action}`,
			);
		}
		throw new MuxError(
			"not_supported",
			`pty fan-out subscription ${subscriber.id} is read-only and cannot ` +
				`${action}: ` +
				(writePolicy === "shared"
					? "subscribe with write: true to drive this terminal"
					: "another subscriber holds the pen, and two writers " +
						"interleaving keystrokes is unusable"),
		);
	}

	function penHolder(): Subscriber | null {
		if (writePolicy !== "single-pen") return null;
		for (const subscriber of subscribers) {
			if (subscriber.pen) return subscriber;
		}
		return null;
	}

	function release(): Promise<void> {
		if (releasing === null) releasing = handle.close();
		return releasing;
	}

	async function closeSubscription(subscriber: Subscriber): Promise<void> {
		if (!subscribers.has(subscriber)) return;
		subscribers.delete(subscriber);
		// A dropped subscription keeps its state so its owner can still read
		// WHY it ended after closing it.
		if (subscriber.state === "live" || subscriber.state === "ended") {
			subscriber.state = "closed";
		}
		subscriber.pen = false;
		subscriber.queue = [];
		subscriber.queuedBytes = 0;
		wakeUp(subscriber);
		if (subscribers.size === 0) await release();
	}

	function makeSubscription(subscriber: Subscriber): PtySubscription {
		const output: AsyncIterable<Uint8Array> = {
			[Symbol.asyncIterator]() {
				if (subscriber.iterated) {
					throw new Error(
						`pty fan-out subscription ${subscriber.id} output is single-use, ` +
							"for the same reason PtyHandle.output is: two loops over one " +
							"stream misdeliver chunks to the abandoned consumer. Call " +
							"subscribe() again for a second viewer.",
					);
				}
				subscriber.iterated = true;
				return drain(subscriber);
			},
		};
		return {
			id: subscriber.id,
			output,
			get state() {
				return subscriber.state;
			},
			get droppedBytes() {
				return subscriber.droppedBytes;
			},
			get canWrite() {
				return mayDrive(subscriber);
			},
			exited: handle.exited,
			async write(data) {
				requirePen(subscriber, "write");
				await handle.write(data);
			},
			async resize(cols, rows) {
				requirePen(subscriber, "resize");
				await handle.resize(cols, rows);
			},
			releasePen() {
				subscriber.pen = false;
			},
			async close() {
				await closeSubscription(subscriber);
			},
		};
	}

	return {
		subscribe(subscribeOptions: PtySubscribeOptions = {}): PtySubscription {
			if (releasing !== null) {
				throw new Error(
					"pty fan-out is closed: the underlying handle was already " +
						"released, and a live byte stream cannot be reopened. Open a new " +
						"PTY and fan out from that handle.",
				);
			}
			const wantsWrite = subscribeOptions.write === true;
			const holder = penHolder();
			if (wantsWrite && holder !== null) {
				throw new MuxError(
					"not_supported",
					`the pty fan-out pen is held by subscription ${holder.id}; two ` +
						"writers interleaving keystrokes is unusable, so subscribe " +
						"read-only or wait for releasePen()",
				);
			}
			const subscriber: Subscriber = {
				id: nextId++,
				state: "live",
				queue: replay.map((bytes) => ({ bytes, counted: true })),
				queuedBytes: replayHeld,
				droppedBytes: 0,
				wantsWrite,
				pen: wantsWrite && writePolicy === "single-pen",
				iterated: false,
				failure: null,
				wake: null,
			};
			subscribers.add(subscriber);
			return makeSubscription(subscriber);
		},
		get subscribers() {
			return subscribers.size;
		},
		get penHeld() {
			return penHolder() !== null;
		},
		get bufferedReplayBytes() {
			return replayHeld;
		},
		async close() {
			for (const subscriber of [...subscribers]) {
				await closeSubscription(subscriber);
			}
			await release();
		},
	};
}
