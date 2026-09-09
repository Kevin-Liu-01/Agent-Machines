/** Retired identities must never contact a vendor or be reinterpreted as Daytona. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDedalusProvider } from "agent-machines/mux/providers/dedalus";
import { getProvider } from "./index";

afterEach(() => vi.unstubAllGlobals());
describe("retired provider", () => {
	it("rejects hosted access before any network request regardless of credentials", () => {
		const network = vi.fn();
		vi.stubGlobal("fetch", network);
		expect(() => getProvider("dedalus", { dedalus: { apiKey: "old-key" }, daytona: { apiKey: "new-key" } })).toThrow("retired");
		expect(network).not.toHaveBeenCalled();
	});
	it("keeps the old mux discriminator but rejects every vendor action", async () => {
		const network = vi.fn();
		vi.stubGlobal("fetch", network);
		const provider = createDedalusProvider({ apiKey: "old-key", baseUrl: "https://legacy.example" });
		expect(provider.kind).toBe("dedalus");
		expect(provider.ready()).toEqual({ ok: false, missing: ["Provider retired"] });
		for (const action of [() => provider.create(), () => provider.connect("dm-old"), () => provider.describe!("dm-old"), () => provider.remove!("dm-old"), () => provider.list()]) {
			await expect(action()).rejects.toMatchObject({ kind: "not_supported", substrate: "dedalus" });
		}
		expect(network).not.toHaveBeenCalled();
	});
});
