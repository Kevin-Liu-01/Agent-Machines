/**
 * Equivalence tests for the one-provider-contract facade (ROADMAP 0.2).
 *
 * This is a refactor behind a stable interface, so these prove translation --
 * every MachineState and every error kind in BOTH directions, credentials
 * failing closed, machineId scoping, and the capability gate on streamExec --
 * rather than new behavior.
 */

import { describe, expect, it, vi } from "vitest";

import {
	asMachineProviderError,
	createMuxBackedProvider,
	muxErrorKindOf,
	notSupported,
	toMachineState,
	toMuxErrorKind,
	toMuxMachineState,
	toProviderCapabilities,
	toProviderError,
	type MuxDescription,
	type MuxSandbox,
	type MuxSubstrate,
	type MuxSubstrateBinding,
} from "./mux-facade";
import { MachineProviderError, type MachineState, type ProviderError } from "./types";

const ALL_MACHINE_STATES: MachineState[] = [
	"ready",
	"starting",
	"sleeping",
	"destroying",
	"destroyed",
	"error",
	"unknown",
];

const ALL_ERROR_KINDS: ProviderError[] = [
	"missing_credentials",
	"not_supported",
	"rate_limited",
	"transient",
	"fatal",
];

/** Stand-in for a mux MuxError: same shape the real class produces. */
function muxError(kind: string, message: string): Error & { kind: string } {
	const error = new Error(message) as Error & { kind: string };
	error.name = "MuxError";
	error.kind = kind;
	return error;
}

type FakeOptions = {
	streamingExec?: boolean;
	credentialed?: boolean;
	described?: Partial<MuxDescription>;
	describeFails?: boolean;
	trimOutput?: boolean;
	park?: boolean;
	remove?: boolean;
};

/** Distinct credential scope per fake binding. See the cacheScope field below. */
let bindingSequence = 0;

function fakeBinding(options: FakeOptions = {}) {
	let connectFailsOnce = false;
	const calls: string[] = [];
	const description: MuxDescription = {
		state: "ready",
		rawPhase: "warm",
		spec: { vcpu: 2, memoryMib: 4096, storageGib: 100 },
		createdAt: "2026-08-01T00:00:00.000Z",
		lastError: null,
		...options.described,
	};

	const sandbox = (id: string): MuxSandbox => ({
		id,
		exec: vi.fn(async (command: string, execOptions) => {
			calls.push(`exec:${id}:${command}:${execOptions?.timeoutMs ?? "none"}`);
			return {
				stdout: "  out  ",
				stderr: "  err  ",
				exitCode: 3,
				durationMs: 12,
			};
		}),
		execStream: vi.fn(async function* stream(command: string, streamOptions) {
			calls.push(`stream:${id}:${command}:${streamOptions?.timeoutMs ?? "none"}`);
			yield { type: "stdout" as const, data: "a" };
			yield { type: "stderr" as const, data: "b" };
			yield { type: "exit" as const, exitCode: 7 };
		}),
		execBackground: vi.fn(async (command: string) => {
			calls.push(`background:${id}:${command}`);
		}),
		publicUrl: vi.fn(async (port: number) => {
			calls.push(`publicUrl:${id}:${port}`);
			return `https://${id}-${port}.example`;
		}),
		state: vi.fn(async () => {
			calls.push(`state:${id}`);
			return description.state;
		}),
		sleep: vi.fn(async () => {
			calls.push(`sleep:${id}`);
		}),
		wake: vi.fn(async () => {
			calls.push(`wake:${id}`);
		}),
		destroy: vi.fn(async () => {
			calls.push(`destroy:${id}`);
		}),
	});

	const credentialed = options.credentialed ?? true;
	const substrate: MuxSubstrate = {
		kind: "e2b",
		capabilities: {
			pty: "native",
			persistence: "memory-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: options.streamingExec ?? true,
			detachedWork: "reliable",
		},
		ready: () =>
			credentialed ? { ok: true, missing: [] } : { ok: false, missing: ["E2B_API_KEY"] },
		create: vi.fn(async (createOptions) => {
			if (!credentialed) {
				throw muxError("missing_credentials", "E2B provider is not credentialed");
			}
			calls.push(`create:${createOptions?.name ?? "unnamed"}`);
			return sandbox("sbx-new");
		}),
		connect: vi.fn(async (id: string) => {
			if (!credentialed) {
				throw muxError("missing_credentials", "E2B provider is not credentialed");
			}
			calls.push(`connect:${id}`);
			if (connectFailsOnce) {
				connectFailsOnce = false;
				throw muxError("transient", "connect blipped");
			}
			return sandbox(id);
		}),
	};

	const binding: MuxSubstrateBinding = {
		kind: "e2b",
		substrate,
		// Unique per binding, so one test's connected handle is never served to
		// the next -- which is the same property that keeps one tenant's handle
		// away from another in a warm serverless instance.
		cacheScope: `test-${(bindingSequence += 1)}`,
		describe: vi.fn(async (machineId: string) => {
			calls.push(`describe:${machineId}`);
			if (options.describeFails) throw muxError("transient", "status read blipped");
			return description;
		}),
		...(options.park
			? {
					park: vi.fn(async (machineId: string) => {
						calls.push(`park:${machineId}`);
					}),
				}
			: {}),
		...(options.remove
			? {
					remove: vi.fn(async (machineId: string) => {
						calls.push(`remove:${machineId}`);
					}),
				}
			: {}),
		createOptions: (input) => ({ name: input.name }),
		trimOutput: options.trimOutput ?? false,
	};

	return {
		binding,
		substrate,
		calls,
		/** Make the next connect reject once, for the cached-rejection test. */
		failNextConnect: () => {
			connectFailsOnce = true;
		},
	};
}

describe("state vocabulary", () => {
	it("maps every mux state to a control-plane state and back", () => {
		for (const state of ALL_MACHINE_STATES) {
			expect(toMachineState(toMuxMachineState(state))).toBe(state);
			expect(toMuxMachineState(toMachineState(state))).toBe(state);
		}
	});

	it("throws instead of guessing when a state is not in the union", () => {
		expect(() => toMachineState("hibernating" as MachineState)).toThrow(
			/Unmapped mux machine state/,
		);
		expect(() => toMuxMachineState("hibernating" as MachineState)).toThrow(
			/Unmapped machine state/,
		);
	});

	it("reports the described state and vendor phase verbatim", async () => {
		const { binding } = fakeBinding({
			described: { state: "sleeping", rawPhase: "paused", lastError: "boom" },
		});
		const provider = createMuxBackedProvider(binding);
		const summary = await provider.state("sbx-1");
		expect(summary).toEqual({
			id: "sbx-1",
			state: "sleeping",
			rawPhase: "paused",
			spec: { vcpu: 2, memoryMib: 4096, storageGib: 100 },
			createdAt: "2026-08-01T00:00:00.000Z",
			lastError: "boom",
		});
	});
});

describe("error vocabulary", () => {
	it("maps every error kind in both directions", () => {
		for (const kind of ALL_ERROR_KINDS) {
			expect(toProviderError(toMuxErrorKind(kind))).toBe(kind);
			expect(toMuxErrorKind(toProviderError(kind))).toBe(kind);
		}
	});

	it("recovers a MuxError kind structurally, without instanceof", () => {
		expect(muxErrorKindOf(muxError("rate_limited", "429"))).toBe("rate_limited");
		expect(muxErrorKindOf(muxError("nonsense", "?"))).toBeNull();
		expect(muxErrorKindOf(new Error("plain"))).toBeNull();
		expect(muxErrorKindOf(null)).toBeNull();
	});

	it("preserves the kind of every MuxError raised by a substrate call", async () => {
		for (const kind of ALL_ERROR_KINDS) {
			const { binding, substrate } = fakeBinding();
			substrate.connect = vi.fn(async () => {
				throw muxError(kind, `synthetic ${kind}`);
			});
			const provider = createMuxBackedProvider(binding);
			const error = await provider.exec("sbx-1", "echo hi").catch((err: unknown) => err);
			expect(error).toBeInstanceOf(MachineProviderError);
			expect((error as MachineProviderError).kind).toBe(kind);
			expect((error as MachineProviderError).providerKind).toBe("e2b");
			expect((error as MachineProviderError).message).toContain("sbx-1");
		}
	});

	it("classifies an unrecognizable failure as transient, not fatal", () => {
		const error = asMachineProviderError("e2b", "exec", "sbx-1", new Error("socket hang up"));
		expect(error.kind).toBe("transient");
		expect(error.message).toBe("e2b exec failed on sbx-1: socket hang up");
	});

	it("passes an existing MachineProviderError through untouched", () => {
		const original = notSupported("dedalus", "incremental exec streaming");
		expect(asMachineProviderError("dedalus", "streamExec", "m-1", original)).toBe(original);
		expect(original.kind).toBe("not_supported");
	});
});

describe("credential gating", () => {
	it("reports hasCredentials from the substrate's own ready() check", () => {
		expect(createMuxBackedProvider(fakeBinding().binding).hasCredentials).toBe(true);
		expect(
			createMuxBackedProvider(fakeBinding({ credentialed: false }).binding).hasCredentials,
		).toBe(false);
	});

	it("fails closed with missing_credentials on provision and on exec", async () => {
		const provider = createMuxBackedProvider(fakeBinding({ credentialed: false }).binding);
		const provision = await provider
			.provision({ spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 } })
			.catch((err: unknown) => err);
		expect((provision as MachineProviderError).kind).toBe("missing_credentials");
		const exec = await provider.exec("sbx-1", "echo hi").catch((err: unknown) => err);
		expect((exec as MachineProviderError).kind).toBe("missing_credentials");
	});
});

describe("machineId scoping", () => {
	it("addresses every call by the id the caller passed", async () => {
		const { binding, calls } = fakeBinding({ streamingExec: true });
		const provider = createMuxBackedProvider(binding);
		await provider.exec("machine-B", "whoami");
		await provider.execBackground!("machine-B", "tmux send-keys");
		await provider.getPublicUrl!("machine-B", 8642);
		// One connect, then all three operations on it: the connected handle is
		// cached per (substrate, credential scope, machine id). It used to
		// reconnect per call.
		expect(calls).toEqual([
			"connect:machine-B",
			"exec:machine-B:whoami:30000",
			"background:machine-B:tmux send-keys",
			"publicUrl:machine-B:8642",
		]);
		// The property this test is actually for (2026-05-18 postmortem): no
		// operation may reach a machine the caller did not name. Asserted
		// separately from the call ORDER so a future caching change cannot
		// weaken it by editing the array above.
		for (const call of calls) {
			expect(call, `${call} addressed a machine the caller never named`).toContain(
				"machine-B",
			);
		}
	});

	it("never serves one credential scope's handle to another", async () => {
		// A warm serverless instance serves many users, and a machine id is only
		// unique inside the account that owns it -- two sprites organizations can
		// each have `am-mux-reviewer`. Sharing a handle across scopes would answer
		// one tenant with a connection authenticated as another.
		const first = fakeBinding();
		const second = fakeBinding();
		expect(first.binding.cacheScope).not.toEqual(second.binding.cacheScope);
		await createMuxBackedProvider(first.binding).exec("shared-name", "whoami");
		await createMuxBackedProvider(second.binding).exec("shared-name", "whoami");
		// Each connected for itself.
		expect(first.calls).toContain("connect:shared-name");
		expect(second.calls).toContain("connect:shared-name");
	});

	it("reuses one connect across calls, and drops the handle on sleep and destroy", async () => {
		const { binding, calls } = fakeBinding();
		const provider = createMuxBackedProvider(binding);
		await provider.exec("sbx-1", "one");
		await provider.exec("sbx-1", "two");
		expect(calls.filter((call) => call === "connect:sbx-1")).toHaveLength(1);

		// A handle to a sandbox that may now be parked fails mid-exec instead of
		// at connect, so parking must drop it even though the park succeeded.
		await provider.sleep("sbx-1");
		await provider.exec("sbx-1", "three");
		expect(calls.filter((call) => call === "connect:sbx-1")).toHaveLength(2);

		await provider.destroy("sbx-1");
		await provider.exec("sbx-1", "four");
		expect(calls.filter((call) => call === "connect:sbx-1")).toHaveLength(3);
	});

	it("stops reusing a handle once the TTL has passed", async () => {
		// The TTL exists because the vendors park sandboxes on their own schedule:
		// a handle held past that window fails mid-exec instead of at connect, so
		// it must expire on its own even when nothing invalidated it.
		vi.useFakeTimers();
		try {
			const { binding, calls } = fakeBinding();
			const provider = createMuxBackedProvider(binding);
			await provider.exec("sbx-1", "one");
			vi.advanceTimersByTime(44_000);
			await provider.exec("sbx-1", "two");
			expect(
				calls.filter((call) => call === "connect:sbx-1"),
				"still inside the window",
			).toHaveLength(1);
			vi.advanceTimersByTime(2_000);
			await provider.exec("sbx-1", "three");
			expect(
				calls.filter((call) => call === "connect:sbx-1"),
				"past the window, so reconnect",
			).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not cache a failed connect", async () => {
		// A cached rejection would turn one connect blip into every call failing
		// until the TTL expired.
		const { binding, calls, failNextConnect } = fakeBinding();
		const provider = createMuxBackedProvider(binding);
		failNextConnect();
		await expect(provider.exec("sbx-1", "one")).rejects.toBeInstanceOf(
			MachineProviderError,
		);
		await provider.exec("sbx-1", "two");
		expect(calls.filter((call) => call.startsWith("exec:"))).toHaveLength(1);
		expect(calls.filter((call) => call === "connect:sbx-1")).toHaveLength(2);
	});
});

describe("exec", () => {
	it("keeps the 30s control-plane default and honors an explicit timeout", async () => {
		const { binding, calls } = fakeBinding();
		const provider = createMuxBackedProvider(binding);
		await provider.exec("sbx-1", "a");
		await provider.exec("sbx-1", "b", { timeoutMs: 90_000 });
		expect(calls).toContain("exec:sbx-1:a:30000");
		expect(calls).toContain("exec:sbx-1:b:90000");
	});

	it("returns a non-zero exit as a result so bootstrap can inspect it", async () => {
		const provider = createMuxBackedProvider(fakeBinding().binding);
		await expect(provider.exec("sbx-1", "false")).resolves.toEqual({
			stdout: "  out  ",
			stderr: "  err  ",
			exitCode: 3,
		});
	});

	it("trims output only where the substrate always has", async () => {
		const provider = createMuxBackedProvider(fakeBinding({ trimOutput: true }).binding);
		await expect(provider.exec("sbx-1", "cat x")).resolves.toEqual({
			stdout: "out",
			stderr: "err",
			exitCode: 3,
		});
	});
});

describe("streamExec capability gate", () => {
	it("relays all three frame types when the substrate streams", async () => {
		const provider = createMuxBackedProvider(fakeBinding({ streamingExec: true }).binding);
		const frames = [];
		for await (const frame of provider.streamExec!("sbx-1", "tail -f log")) {
			frames.push(frame);
		}
		expect(frames).toEqual([
			{ type: "stdout", data: "a" },
			{ type: "stderr", data: "b" },
			{ type: "exit", exitCode: 7 },
		]);
	});

	it("omits streamExec entirely when the substrate declares it cannot stream", () => {
		const provider = createMuxBackedProvider(fakeBinding({ streamingExec: false }).binding);
		// Presence is the signal lib/dashboard/exec-stream.ts branches on for its
		// log-tail fallback, so an absent property is the contract, not a throw.
		expect(provider.streamExec).toBeUndefined();
	});
});

describe("lifecycle", () => {
	it("wakes through the handle then re-reads state", async () => {
		const { binding, calls } = fakeBinding();
		const provider = createMuxBackedProvider(binding);
		const summary = await provider.wake("sbx-1");
		expect(summary.state).toBe("ready");
		expect(calls).toEqual(["connect:sbx-1", "wake:sbx-1", "describe:sbx-1"]);
	});

	it("parks and removes by id when the substrate supplies id-addressed ops", async () => {
		const { binding, calls } = fakeBinding({ park: true, remove: true });
		const provider = createMuxBackedProvider(binding);
		await provider.sleep("sbx-1");
		await provider.destroy("sbx-1");
		// No connect: on e2b and vercel, connecting resumes a parked sandbox, so
		// sleeping or destroying through a connection would bill for a wake.
		expect(calls).toEqual(["park:sbx-1", "describe:sbx-1", "remove:sbx-1"]);
	});

	it("falls back to the handle when no id-addressed op is supplied", async () => {
		const { binding, calls } = fakeBinding();
		const provider = createMuxBackedProvider(binding);
		await provider.destroy("sbx-1");
		expect(calls).toEqual(["connect:sbx-1", "destroy:sbx-1"]);
	});

	it("never resolves state by reading a globally active machine", async () => {
		// Postmortem 2026-05-18 item 2: every route must target the machineId in
		// the request, not activeMachine(config).
		const { binding } = fakeBinding();
		const provider = createMuxBackedProvider(binding);
		await expect(provider.state("machine-B")).resolves.toMatchObject({ id: "machine-B" });
		expect(binding.describe).toHaveBeenCalledWith("machine-B");
		expect(binding.describe).toHaveBeenCalledTimes(1);
	});
});

describe("provision", () => {
	it("reports the id plus the vendor phase read back after create", async () => {
		const { binding, calls } = fakeBinding({
			described: { state: "starting", rawPhase: "placement_pending" },
		});
		const provider = createMuxBackedProvider(binding);
		await expect(
			provider.provision({
				spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
				name: "my-agent",
			}),
		).resolves.toEqual({
			id: "sbx-new",
			state: "starting",
			rawPhase: "placement_pending",
		});
		expect(calls).toEqual(["create:my-agent", "describe:sbx-new"]);
	});

	it("still returns the id when the status read fails, so the machine is not orphaned", async () => {
		// Postmortem 2026-05-18 item 5: machines whose id never reached the
		// caller kept consuming the account's quota invisibly.
		const { binding } = fakeBinding({ describeFails: true });
		const provider = createMuxBackedProvider(binding);
		await expect(
			provider.provision({ spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 } }),
		).resolves.toEqual({ id: "sbx-new", state: "starting", rawPhase: "unknown" });
	});
});

describe("capabilities", () => {
	it("derives the control-plane record from the declared mux capabilities", () => {
		expect(
			toProviderCapabilities({
				pty: "native",
				persistence: "memory-snapshot",
				reattach: true,
				publicUrl: true,
				streamingExec: true,
				detachedWork: "reliable",
			}),
		).toEqual({
			runtime: "persistent-machine",
			canProvision: true,
			canWake: true,
			canSleep: true,
			canDestroy: true,
			canExec: true,
			hasPersistentDisk: true,
			usesExternalStorage: false,
		});
	});

	it("calls a substrate with no persistence an ephemeral session", () => {
		const derived = toProviderCapabilities({
			pty: "none",
			persistence: "none",
			reattach: false,
			publicUrl: false,
			streamingExec: false,
			detachedWork: "reliable",
		});
		expect(derived.runtime).toBe("ephemeral-session");
		expect(derived.hasPersistentDisk).toBe(false);
	});
});
