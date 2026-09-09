import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForControlPlaneOperation } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("lifecycle progress", () => {
	it("exposes placement before bootstrap completes so the UI can tail the new machine", async () => {
		const running = {
			operation: { id: "op-1", status: "running" },
			worker: { status: { phase: "bootstrapping" } },
			machineId: "machine-1",
		};
		const completed = { ...running, operation: { id: "op-1", status: "succeeded" } };
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(Response.json(running))
			.mockResolvedValueOnce(Response.json(completed)));
		const onUpdate = vi.fn();
		expect(await waitForControlPlaneOperation("op-1", { intervalMs: 0, onUpdate })).toEqual(completed);
		expect(onUpdate).toHaveBeenNthCalledWith(1, running);
		expect(onUpdate).toHaveBeenNthCalledWith(2, completed);
	});
});
