import { afterEach, describe, expect, it, vi } from "vitest";

import { DedalusProvider } from "./dedalus";
import { MachineProviderError } from "./types";

describe("DedalusProvider background execution", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("returns after the execution is accepted without status/output polling", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({ execution_id: "exec-1", status: "queued" }, { status: 202 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		await provider.execBackground("machine-1", "tmux send-keys -t amconsole -H 61");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://dcs.dedaluslabs.ai/v1/machines/machine-1/executions",
			expect.objectContaining({ method: "POST" }),
		);
		const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(JSON.parse(String(init.body))).toMatchObject({
			command: ["/bin/bash", "-c", "tmux send-keys -t amconsole -H 61"],
		});
	});
});

describe("DedalusProvider provision sizing", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("passes vcpu and memory through the shared substrate contract", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json(
					{ machine_id: "dm-1", status: { phase: "accepted" } },
					{ status: 201 },
				),
			)
			.mockResolvedValueOnce(
				Response.json({
					machine_id: "dm-1",
					vcpu: 4,
					memory_mib: 8192,
					storage_gib: 10,
					created_at: "2026-08-01T00:00:00.000Z",
					desired_state: "running",
					status: { phase: "placement_pending" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);
		const provider = new DedalusProvider({ apiKey: "test-key" });

		const result = await provider.provision({
			spec: { vcpu: 4, memoryMib: 8192, storageGib: 10 },
		});

		expect(result).toEqual({
			id: "dm-1",
			state: "starting",
			rawPhase: "placement_pending",
		});
		const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(JSON.parse(String(init.body))).toEqual({
			vcpu: 4,
			memory_mib: 8192,
			storage_gib: 10,
		});
	});

	it("fails closed on a disk size the substrate contract cannot carry", async () => {
		// The mux CreateSandboxOptions has no disk axis, so honoring a 50 GiB
		// request is impossible -- refuse it instead of quietly provisioning 10.
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
