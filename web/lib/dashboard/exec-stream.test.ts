import { describe, expect, it, vi } from "vitest";

import type {
	ExecResult,
	ExecStreamEvent,
	MachineProvider,
} from "@/lib/providers/types";

import { streamFromProvider } from "./exec-stream";

async function collect(
	gen: AsyncGenerator<ExecStreamEvent, void, void>,
): Promise<ExecStreamEvent[]> {
	const out: ExecStreamEvent[] = [];
	for await (const event of gen) out.push(event);
	return out;
}

/** Minimal provider stub; only the methods under test are populated. */
function makeProvider(overrides: Partial<MachineProvider>): MachineProvider {
	return {
		kind: "dedalus",
		hasCredentials: true,
		capabilities: {} as MachineProvider["capabilities"],
		provision: vi.fn(),
		state: vi.fn(),
		wake: vi.fn(),
		sleep: vi.fn(),
		destroy: vi.fn(),
		exec: vi.fn(),
		...overrides,
	} as MachineProvider;
}

describe("streamFromProvider", () => {
	it("delegates to provider.streamExec when present and does not poll", async () => {
		async function* fakeStream(): AsyncGenerator<ExecStreamEvent, void, void> {
			yield { type: "stdout", data: "native-1\n" };
			yield { type: "stdout", data: "native-2\n" };
			yield { type: "exit", exitCode: 0 };
		}
		const exec = vi.fn();
		const execBackground = vi.fn();
		const provider = makeProvider({
			kind: "e2b",
			streamExec: vi.fn(() => fakeStream()),
			exec,
			execBackground,
		});

		const events = await collect(
			streamFromProvider(provider, "sbx-1", "echo hi", { timeoutMs: 5_000 }),
		);

		expect(events).toEqual([
			{ type: "stdout", data: "native-1\n" },
			{ type: "stdout", data: "native-2\n" },
			{ type: "exit", exitCode: 0 },
		]);
		expect(provider.streamExec).toHaveBeenCalledWith("sbx-1", "echo hi", {
			timeoutMs: 5_000,
		});
		// Native streaming must NOT touch the poll fallback.
		expect(exec).not.toHaveBeenCalled();
		expect(execBackground).not.toHaveBeenCalled();
	});

	it("falls back to log-tail polling when streamExec is absent (Dedalus)", async () => {
		const stdoutChunks = ["chunk-1\n", "chunk-2\n"];
		let allChunksRead = false;
		const execBackground = vi.fn().mockResolvedValue(undefined);

		const exec = vi.fn(
			async (_id: string, command: string): Promise<ExecResult> => {
				if (/\.ready/.test(command)) {
					return { stdout: "ok", stderr: "", exitCode: 0 };
				}
				if (/dd if=/.test(command)) {
					const next = stdoutChunks.shift();
					if (next === undefined) {
						allChunksRead = true;
						return { stdout: "", stderr: "", exitCode: 0 };
					}
					return { stdout: Buffer.from(next).toString("base64"), stderr: "", exitCode: 0 };
				}
				if (/\.exit/.test(command)) {
					return {
						stdout: allChunksRead ? "0" : "",
						stderr: "",
						exitCode: 0,
					};
				}
				return { stdout: "", stderr: "", exitCode: 0 };
			},
		);

		const provider = makeProvider({ kind: "dedalus", exec, execBackground });

		const events = await collect(
			streamFromProvider(provider, "dm-1", "echo chunk-1; echo chunk-2", {
				timeoutMs: 10_000,
				pollMs: 5,
			}),
		);

		const stdout = events
			.filter((e): e is { type: "stdout"; data: string } => e.type === "stdout")
			.map((e) => e.data)
			.join("");
		expect(stdout).toBe("chunk-1\nchunk-2\n");

		const last = events.at(-1);
		expect(last).toEqual({ type: "exit", exitCode: 0 });
		// Fallback launches the detached shell on the VM.
		expect(execBackground).toHaveBeenCalledTimes(1);
	});

	it("drains all completed output and preserves UTF-8 at byte boundaries", async () => {
		const output = `${"a".repeat(8191)}🚀${"é".repeat(16000)}\nfinished\n`;
		const bytes = Buffer.from(output);
		const exec = vi.fn(async (_id: string, command: string): Promise<ExecResult> => {
			let stdout = "";
			if (command.includes(".ready")) stdout = "ok";
			else if (command.includes("dd if=")) {
				const offset = Number(command.match(/skip=(\d+)/)?.[1]);
				const count = Number(command.match(/count=(\d+)/)?.[1]);
				stdout = bytes.subarray(offset, offset + count).toString("base64");
			} else if (command.includes(".exit")) stdout = "7";
			return { stdout, stderr: "", exitCode: 0 };
		});
		const provider = makeProvider({ exec, execBackground: vi.fn().mockResolvedValue(undefined) });
		const events = await collect(streamFromProvider(provider, "completed", "large command"));
		const result = events.flatMap((event) => event.type === "stdout" ? [event.data] : []).join("");

		expect(result).toBe(output);
		expect(events.at(-1)).toEqual({ type: "exit", exitCode: 7 });
	});

	it("rejects an invalid exit marker instead of reporting a successful command", async () => {
		const provider = makeProvider({
			execBackground: vi.fn().mockResolvedValue(undefined),
			exec: vi.fn(async (_id: string, command: string): Promise<ExecResult> => ({
				stdout: command.includes(".ready") ? "ok" : command.includes(".exit") ? "broken" : "",
				stderr: "",
				exitCode: 0,
			})),
		});
		await expect(collect(streamFromProvider(provider, "failed", "command")))
			.rejects.toThrow("invalid command exit status");
	});
});
