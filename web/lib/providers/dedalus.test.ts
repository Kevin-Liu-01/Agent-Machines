import { afterEach, describe, expect, it, vi } from "vitest";

import { DedalusProvider } from "./dedalus";

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
