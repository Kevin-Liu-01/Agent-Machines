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
					return { stdout: next, stderr: "", exitCode: 0 };
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
});
