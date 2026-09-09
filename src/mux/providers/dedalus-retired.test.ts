/** Legacy IDs are records, never permission to send requests to a retired API. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createDedalusProvider } from "./dedalus.js";
import { getProvider } from "./index.js";
import { resolveMuxConfig } from "../config.js";
import { MuxError } from "../types.js";

for (const credentials of [{}, { apiKey: "legacy-key", baseUrl: "https://retired.invalid" }]) {
	test(`invariant_retired_provider_performs_no_network_even_${credentials.apiKey ? "with" : "without"}_credentials`, async () => {
		const original = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = async () => { requests++; throw new Error("Network is forbidden"); };
		try {
			const provider = createDedalusProvider(credentials);
			assert.equal(provider.ready().ok, false);
			assert.equal(provider.capabilities.pty, "none");
			assert.equal(provider.capabilities.publicUrl, false);
			assert.equal(provider.park, undefined);
			for (const operation of [() => provider.create({ resources: { memoryMib: 2048 } }), () => provider.connect("legacy-machine"), () => provider.list(), () => provider.describe!("legacy-machine"), () => provider.remove!("legacy-machine")]) {
				await assert.rejects(operation(), (error) => error instanceof MuxError && error.kind === "not_supported" && error.substrate === "dedalus" && /retired/.test(error.message));
			}
			assert.equal(requests, 0);
		} finally { globalThis.fetch = original; }
	});
}

test("invariant_legacy_factory_lookup_never_reinterprets_an_old_id_as_daytona", async () => {
	const config = resolveMuxConfig({ providers: { daytona: { apiKey: "new-key" } } });
	const retired = getProvider("dedalus", config);
	assert.equal(retired.kind, "dedalus");
	await assert.rejects(retired.connect("legacy-machine"), /have not been moved or deleted/);
});
