/**
 * Tests for the PTY fan-out.
 *
 * Run: npx tsx --test src/mux/pty/fanout.test.ts
 *
 * The fake handle enforces the same single-use rule the real one does
 * (`./tmux.ts`), so a fan-out that iterated `output` twice fails loudly here
 * instead of misdelivering chunks in production.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
	createPtyFanout,
	formatGapMarker,
	type PtySubscription,
} from "./fanout.js";
import { MuxError, type PtyHandle } from "../types.js";

type FakePty = {
	handle: PtyHandle;
	push(text: string): void;
	end(): void;
	fail(error: Error): void;
	readonly iterations: number;
	readonly closes: number;
	readonly writes: string[];
	readonly resizes: string[];
};

function fakePty(): FakePty {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const pending: Uint8Array[] = [];
	const writes: string[] = [];
	const resizes: string[] = [];
	let wake: (() => void) | null = null;
	let done = false;
	let failure: Error | null = null;
	let iterations = 0;
	let closes = 0;

	async function* live(): AsyncGenerator<Uint8Array, void, void> {
		for (;;) {
			while (pending.length > 0) {
				const chunk = pending.shift();
				if (chunk === undefined) break;
				yield chunk;
			}
			if (failure !== null) throw failure;
			if (done) return;
			await new Promise<void>((resolve) => {
				wake = resolve;
			});
		}
	}
	const stream = live();

	return {
		handle: {
			output: {
				[Symbol.asyncIterator]() {
					iterations += 1;
					if (iterations > 1) {
						throw new Error(
							"PtyHandle.output is a single-use live byte stream",
						);
					}
					return stream[Symbol.asyncIterator]();
				},
			},
			async write(data) {
				writes.push(typeof data === "string" ? data : decoder.decode(data));
			},
			async resize(cols, rows) {
				resizes.push(`${cols}x${rows}`);
			},
			exited: Promise.resolve(null),
			async close() {
				closes += 1;
			},
		},
		push(text) {
			pending.push(encoder.encode(text));
			const resume = wake;
			wake = null;
			resume?.();
		},
		end() {
			done = true;
			const resume = wake;
			wake = null;
			resume?.();
		},
		fail(error) {
			failure = error;
			const resume = wake;
			wake = null;
			resume?.();
		},
		get iterations() {
			return iterations;
		},
		get closes() {
			return closes;
		},
		writes,
		resizes,
	};
}

/** A macrotask turn drains every pending microtask, so the pump catches up. */
function flush(): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function collect(subscription: PtySubscription): Promise<string> {
	const decoder = new TextDecoder();
	let text = "";
	for await (const bytes of subscription.output) text += decoder.decode(bytes);
	return text;
}

test("every subscriber receives the same bytes from one iteration", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle);
	const first = fanout.subscribe();
	const second = fanout.subscribe();

	const readFirst = collect(first);
	const readSecond = collect(second);
	fake.push("hello ");
	fake.push("world");
	fake.end();

	assert.equal(await readFirst, "hello world");
	assert.equal(await readSecond, "hello world");
	// The whole point: the handle's single-use contract is honored, not
	// worked around.
	assert.equal(fake.iterations, 1);
	assert.equal(fanout.subscribers, 2);
});

test("a slow subscriber does not stall a fast one", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 0,
		subscriberBufferBytes: 1024,
	});
	const fast = fanout.subscribe();
	const slow = fanout.subscribe();

	const decoder = new TextDecoder();
	const seen: string[] = [];
	const reading = (async () => {
		for await (const bytes of fast.output) seen.push(decoder.decode(bytes));
	})();

	fake.push("one");
	fake.push("two");
	fake.push("three");
	await flush();

	// `slow` has not pulled a single byte, and the fast viewer still has all
	// three chunks -- delivery never awaits a consumer.
	assert.deepEqual(seen, ["one", "two", "three"]);
	assert.equal(slow.state, "live");

	fake.end();
	// And the slow one still gets everything it missed, in order.
	assert.equal(await collect(slow), "onetwothree");
	await reading;
});

test("the disconnect policy drops a subscriber that falls behind, and says so", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 0,
		subscriberBufferBytes: 8,
		overflow: "disconnect",
	});
	const fast = fanout.subscribe();
	const slow = fanout.subscribe();

	const decoder = new TextDecoder();
	let fastText = "";
	const reading = (async () => {
		for await (const bytes of fast.output) fastText += decoder.decode(bytes);
	})();

	fake.push("12345678");
	await flush();
	assert.equal(slow.state, "live", "exactly at the budget is not over it");
	fake.push("9abcdefg");
	await flush();

	assert.equal(slow.state, "dropped");
	assert.equal(slow.droppedBytes, 16, "both queued chunks are accounted for");
	await assert.rejects(
		collect(slow),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "transient" &&
			/fell behind/.test(error.message),
		"a dropped viewer must not read as a clean end of session",
	);
	// The fast viewer is untouched by its neighbour's disconnect.
	assert.equal(fastText, "123456789abcdefg");
	// A drop is not a close: only the owner knows whether it will reattach,
	// and close() reaps an unnamed tmux session.
	assert.equal(fake.closes, 0);
	assert.equal(fanout.subscribers, 2);

	fake.end();
	await reading;
});

test("the gap-marker policy keeps the newest bytes and counts the loss", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 0,
		subscriberBufferBytes: 8,
		overflow: "gap-marker",
	});
	const slow = fanout.subscribe();

	fake.push("AAAAAAAA");
	fake.push("BBBBBBBB");
	await flush();
	fake.end();

	const text = await collect(slow);
	assert.equal(text, `${formatGapMarker(8)}BBBBBBBB`);
	assert.match(text, /8 bytes dropped/);
	assert.ok(!text.includes("AAAA"), "the OLDEST bytes are the ones dropped");
	assert.equal(slow.droppedBytes, 8);
	assert.equal(slow.state, "ended");
});

test("a late subscriber gets the replay ring and nothing older", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 8,
		subscriberBufferBytes: 64,
	});
	fake.push("0123");
	fake.push("4567");
	fake.push("89ab");
	fake.push("cdef");
	await flush();
	assert.equal(fanout.bufferedReplayBytes, 8);

	const late = fanout.subscribe();
	fake.push("LIVE");
	fake.end();

	const text = await collect(late);
	assert.equal(text, "89abcdefLIVE");
	assert.ok(!text.includes("0123"), "the ring is bounded, not scrollback");
});

test("a chunk larger than the ring replays its tail, not nothing", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 4,
		subscriberBufferBytes: 32,
	});
	fake.push("0123456789");
	await flush();

	const late = fanout.subscribe();
	fake.end();
	// The newest bytes describe the current screen, so the head is what goes.
	// This is why replay can begin mid-escape-sequence.
	assert.equal(await collect(late), "6789");
});

test("closing one subscriber ends only that stream", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 0,
		subscriberBufferBytes: 1024,
	});
	const leaving = fanout.subscribe();
	const staying = fanout.subscribe();

	const readLeaving = collect(leaving);
	fake.push("first");
	await flush();
	await leaving.close();
	fake.push("second");
	await flush();
	fake.end();

	assert.equal(await readLeaving, "first");
	assert.equal(leaving.state, "closed");
	assert.equal(await collect(staying), "firstsecond");
	assert.equal(fake.closes, 0, "one of several closing must not release");
});

test("the last close releases the underlying handle exactly once", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle);
	const first = fanout.subscribe();
	const second = fanout.subscribe();

	await first.close();
	assert.equal(fake.closes, 0);
	await second.close();
	assert.equal(fake.closes, 1);

	// Idempotent from every direction.
	await second.close();
	await first.close();
	await fanout.close();
	assert.equal(fake.closes, 1);
	assert.equal(fanout.subscribers, 0);
	assert.throws(() => fanout.subscribe(), /fan-out is closed/);
});

test("closing a fan-out nobody subscribed to still releases once", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle);
	await fanout.close();
	await fanout.close();
	assert.equal(fake.closes, 1);
});

test("the handle is iterated once no matter how many viewers come and go", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle);
	const first = fanout.subscribe();
	const second = fanout.subscribe();
	fake.push("x");
	fake.end();
	assert.equal(await collect(first), "x");
	assert.equal(await collect(second), "x");

	// A subscriber joining after the stream ended is served from the ring and
	// finishes, rather than reaching for a second iteration.
	const late = fanout.subscribe();
	assert.equal(await collect(late), "x");
	assert.equal(fake.iterations, 1);

	// Each subscription carries the same single-use rule as the handle.
	assert.throws(
		() => first.output[Symbol.asyncIterator](),
		/single-use/,
		"a second loop over one subscription misdelivers exactly as it does on the handle",
	);
});

test("only the pen holder may write or resize", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle);
	const driver = fanout.subscribe({ write: true });
	const viewer = fanout.subscribe();

	assert.equal(driver.canWrite, true);
	assert.equal(viewer.canWrite, false);
	assert.equal(fanout.penHeld, true);

	await driver.write("ls\n");
	await driver.resize(120, 40);
	assert.deepEqual(fake.writes, ["ls\n"]);
	assert.deepEqual(fake.resizes, ["120x40"]);

	const readOnly = (error: unknown): boolean =>
		error instanceof MuxError && error.kind === "not_supported";
	await assert.rejects(viewer.write("rm -rf /\n"), readOnly);
	// Geometry is global, so a viewer reflowing the pane would reflow it for
	// the driver too.
	await assert.rejects(viewer.resize(80, 24), readOnly);
	assert.deepEqual(fake.writes, ["ls\n"]);
	assert.deepEqual(fake.resizes, ["120x40"]);

	// A second pen request fails at subscribe time, not on a keystroke that
	// silently went nowhere.
	assert.throws(
		() => fanout.subscribe({ write: true }),
		(error: unknown) =>
			error instanceof MuxError &&
			error.kind === "not_supported" &&
			/pen is held/.test(error.message),
	);

	driver.releasePen();
	assert.equal(driver.canWrite, false);
	assert.equal(fanout.penHeld, false);
	const successor = fanout.subscribe({ write: true });
	await successor.write("echo hi\n");
	assert.deepEqual(fake.writes, ["ls\n", "echo hi\n"]);

	await fanout.close();
});

test("a dropped subscriber loses the pen", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, {
		replayBytes: 0,
		subscriberBufferBytes: 4,
	});
	const driver = fanout.subscribe({ write: true });
	assert.equal(fanout.penHeld, true);

	fake.push("far too many bytes");
	await flush();

	// A viewer that cannot see the screen must not be driving it.
	assert.equal(driver.state, "dropped");
	assert.equal(driver.canWrite, false);
	assert.equal(fanout.penHeld, false);
	await assert.rejects(
		driver.write("x"),
		(error: unknown) =>
			error instanceof MuxError && /is dropped/.test(error.message),
	);
	assert.deepEqual(fake.writes, []);
});

test("the shared policy lets every writer drive, and readers still cannot", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle, { writePolicy: "shared" });
	const one = fanout.subscribe({ write: true });
	const two = fanout.subscribe({ write: true });
	const observer = fanout.subscribe();

	await one.write("a");
	await two.write("b");
	assert.deepEqual(fake.writes, ["a", "b"]);
	assert.equal(observer.canWrite, false);
	await assert.rejects(
		observer.write("c"),
		(error: unknown) =>
			error instanceof MuxError && error.kind === "not_supported",
	);
	// There is no pen under "shared", so nothing can be reported as holding it.
	assert.equal(fanout.penHeld, false);

	await fanout.close();
});

test("a stream that dies reports the failure instead of a clean end", async () => {
	const fake = fakePty();
	const fanout = createPtyFanout(fake.handle);
	const viewer = fanout.subscribe();

	fake.push("partial");
	fake.fail(new Error("tail died"));

	await assert.rejects(collect(viewer), /tail died/);
});

test("a replay ring larger than the subscriber budget is rejected up front", () => {
	const fake = fakePty();
	assert.throws(
		() =>
			createPtyFanout(fake.handle, {
				replayBytes: 1024,
				subscriberBufferBytes: 16,
			}),
		/replayBytes/,
	);
	// A rejected config must leave the caller a usable handle, not a burned
	// single-use stream.
	assert.equal(fake.iterations, 0);
});
