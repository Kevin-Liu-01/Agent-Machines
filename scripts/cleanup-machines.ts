/**
 * `npm run gc` -- destroy every machine on the org that this API key sees.
 *
 * Use when the org has hit its `409 machine quota exceeded` ceiling because
 * old failed/sleeping machines from a flaky placement window are still
 * registered. This is destructive: any sleeping machine you wanted to
 * resume goes away too. The local `.machine-state.json` is also wiped so a
 * subsequent `npm run deploy` provisions fresh.
 *
 * Skips machines already in the `destroyed` or `destroying` terminal phases.
 * Mutating ops require an `If-Match` header against the current revision
 * (we refetch right before deleting so we never race a state transition).
 */

import "dotenv/config";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Dedalus from "dedalus";

async function main() {
	const apiKey = process.env.DEDALUS_API_KEY;
	if (!apiKey) {
		console.error("DEDALUS_API_KEY is required (.env or environment)");
		process.exit(1);
	}
	const client = new Dedalus({
		xAPIKey: apiKey,
		baseURL: "https://dcs.dedaluslabs.ai",
	});
	const list = await client.machines.list({ limit: 50 });
	const items = list.items ?? [];
	const live = items.filter(
		(m) => m.status.phase !== "destroyed" && m.status.phase !== "destroying",
	);
	console.log(`Found ${items.length} machines, ${live.length} live`);
	for (const m of live) {
		try {
			const fresh = await client.machines.retrieve({ machine_id: m.machine_id });
			await client.machines.delete({
				machine_id: m.machine_id,
				"If-Match": fresh.status.revision,
			});
			console.log(`  destroyed: ${m.machine_id} (was ${m.status.phase})`);
		} catch (err) {
			const message = err instanceof Error ? err.message.slice(0, 100) : String(err);
			console.log(`  skip: ${m.machine_id} -- ${message}`);
		}
	}

	const here = fileURLToPath(import.meta.url);
	const stateFile = resolve(here, "..", "..", ".machine-state.json");
	if (existsSync(stateFile)) {
		unlinkSync(stateFile);
		console.log("  removed .machine-state.json");
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
