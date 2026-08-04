/**
 * Behavior-preservation tests for the Dedalus lane, run through the REAL mux
 * adapter (dist of src/mux/providers/dedalus.ts) with only global fetch
 * stubbed -- Dedalus is the one substrate whose adapter speaks raw REST, so
 * these prove the deleted vendor half's observable behavior survived the
 * ROADMAP 0.2 swap on the real code path, not on a mock of it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { clearHandleCache } from "./mux-facade";
import { DedalusProvider } from "./dedalus";
import { MachineProviderError } from "./types";

const RUNNING_MACHINE = {
	machine_id: "dm-1",
	vcpu: 4,
	memory_mib: 8192,
	storage_gib: 10,
	created_at: "2026-08-01T00:00:00.000Z",
	desired_state: "running",
	status: { phase: "running" },
};

describe("DedalusProvider background execution", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		clearHandleCache();
	});

	it("returns after the execution is accepted without status/output polling", async () => {
		const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
			const target = String(url);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && target.endsWith("/v1/machines/machine-1")) {
				// connect() reads the record (no execution -- reads cannot wake).
				return Response.json({ ...RUNNING_MACHINE, machine_id: "machine-1" });
			}
			if (method === "POST" && target.endsWith("/v1/machines/machine-1/executions")) {
				return Response.json(
					{ execution_id: "exec-1", status: "queued" },
					{ status: 202 },
				);
			}
			throw new Error(`unexpected ${method} ${target}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		await provider.execBackground("machine-1", "tmux send-keys -t amconsole -H 61");

		// Fire-and-forget: one record read (connect), one execution POST, and
		// NO status poll or output fetch afterwards -- the property that keeps
		// interactive terminal input at one round trip.
		const posts = fetchMock.mock.calls.filter(
			([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
		);
		expect(posts).toHaveLength(1);
		const body = JSON.parse(String(posts[0]?.[1]?.body)) as { command: string[] };
		// The payload is a setsid/nohup launcher now (the fix for detached
		// installs dying at the tracked execution's 30s timeout), so the raw
		// command rides inside it base64-encoded rather than as argv[2].
		expect(body.command[0]).toBe("/bin/bash");
		expect(body.command.join(" ")).toContain("base64 -d | bash");
	});
});

describe("DedalusProvider provision sizing", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		clearHandleCache();
	});

	it("passes all three axes through the substrate contract and blocks until running", async () => {
		const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
			const target = String(url);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && target.endsWith("/v1/machines")) {
				return Response.json(
					{ ...RUNNING_MACHINE, status: { phase: "accepted" } },
					{ status: 201 },
				);
			}
			if (method === "GET" && target.endsWith("/v1/machines/dm-1")) {
				// First read already running, so waitUntilReady returns without
				// sleeping through its poll loop.
				return Response.json(RUNNING_MACHINE);
			}
			throw new Error(`unexpected ${method} ${target}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		const result = await provider.provision({
			spec: { vcpu: 4, memoryMib: 8192, storageGib: 10 },
		});

		// create() waits for the machine now (mux waitUntilReady), so the phase
		// reported back is the running machine, not the POST's "accepted".
		expect(result).toEqual({ id: "dm-1", state: "ready", rawPhase: "running" });
		const createCall = fetchMock.mock.calls.find(
			([url, init]) =>
				String(url).endsWith("/v1/machines") &&
				(init?.method ?? "GET").toUpperCase() === "POST",
		);
		expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
			vcpu: 4,
			memory_mib: 8192,
			// storage rides the contract's diskGib axis end to end.
			storage_gib: 10,
		});
	});

	it("fails closed on a disk size the Hobby ceiling would silently shrink", async () => {
		// The mux clamps disk to 1..10 GiB; the binding refuses instead, so a
		// 50 GiB machine is never quietly provisioned as a 10 GiB one.
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		const error = await provider
			.provision({ spec: { vcpu: 1, memoryMib: 2048, storageGib: 50 } })
			.catch((err: unknown) => err);

		expect(error).toBeInstanceOf(MachineProviderError);
		expect((error as MachineProviderError).kind).toBe("not_supported");
		expect((error as MachineProviderError).message).toContain("50 GiB");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("DedalusProvider no-wake reads", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		clearHandleCache();
	});

	it("describes a destroyed id as destroyed instead of throwing", async () => {
		const fetchMock = vi.fn(async () => new Response("gone", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		const summary = await provider.state("dm-gone");
		expect(summary.state).toBe("destroyed");
		expect(summary.rawPhase).toBe("destroyed");
		expect(summary.spec).toEqual({});
	});

	it("reports the machine's own sizing and failure text through describe", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				...RUNNING_MACHINE,
				status: { phase: "failed", last_error: "OutOfCredits" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		const summary = await provider.state("dm-1");
		expect(summary).toEqual({
			id: "dm-1",
			state: "error",
			rawPhase: "failed",
			spec: { vcpu: 4, memoryMib: 8192, storageGib: 10 },
			createdAt: "2026-08-01T00:00:00.000Z",
			lastError: "OutOfCredits",
		});
	});
});
