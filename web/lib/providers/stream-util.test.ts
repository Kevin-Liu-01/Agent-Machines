import { describe, expect, it } from "vitest";

import { bridgeExecStream } from "./stream-util";
import type { ExecStreamEvent } from "./types";

async function collect(
	gen: AsyncGenerator<ExecStreamEvent, void, void>,
): Promise<ExecStreamEvent[]> {
	const out: ExecStreamEvent[] = [];
	for await (const event of gen) out.push(event);
	return out;
}

describe("bridgeExecStream", () => {
	it("yields synchronously emitted stdout/stderr in order then exit", async () => {
		const events = await collect(
			bridgeExecStream(async (emit) => {
				emit.stdout("hello ");
				emit.stdout("world\n");
				emit.stderr("a warning\n");
				return 0;
			}),
		);
		expect(events).toEqual([
			{ type: "stdout", data: "hello " },
			{ type: "stdout", data: "world\n" },
			{ type: "stderr", data: "a warning\n" },
			{ type: "exit", exitCode: 0 },
		]);
	});

	it("interleaves async emissions before resolving the exit code", async () => {
		const events = await collect(
			bridgeExecStream(async (emit) => {
				await new Promise((r) => setTimeout(r, 5));
				emit.stdout("chunk-1\n");
				await new Promise((r) => setTimeout(r, 5));
				emit.stdout("chunk-2\n");
				return 3;
			}),
		);
		expect(
			events.map((e) => (e.type === "exit" ? `exit:${e.exitCode}` : e.data)),
		).toEqual(["chunk-1\n", "chunk-2\n", "exit:3"]);
	});

	it("drops empty chunks", async () => {
		const events = await collect(
			bridgeExecStream(async (emit) => {
				emit.stdout("");
				emit.stderr("");
				emit.stdout("x");
				return 0;
			}),
		);
		expect(events).toEqual([
			{ type: "stdout", data: "x" },
			{ type: "exit", exitCode: 0 },
		]);
	});

	it("flushes buffered output before propagating a run failure", async () => {
		const out: ExecStreamEvent[] = [];
		await expect(async () => {
			for await (const event of bridgeExecStream(async (emit) => {
				emit.stdout("partial\n");
				throw new Error("transport died");
			})) {
				out.push(event);
			}
		}).rejects.toThrow("transport died");
		expect(out).toEqual([{ type: "stdout", data: "partial\n" }]);
	});
});
