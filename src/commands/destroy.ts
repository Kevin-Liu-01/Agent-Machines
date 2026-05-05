/**
 * `npm run destroy` -- permanently delete the machine and clear local state.
 *
 * Requires `--yes` to actually fire so a stray autocomplete doesn't nuke a
 * deployment with hours of accumulated skills + memory.
 */

import { clearState, loadState, makeClient } from "../lib/client.js";
import { loadConfig } from "../lib/env.js";
import { destroyMachine, getMachine } from "../lib/machine.js";
import { fail, header, info, warn } from "../lib/progress.js";

export async function destroy(args: string[]): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Nothing to destroy.");
		return;
	}
	if (!args.includes("--yes")) {
		warn(`This will permanently delete machine ${state.machineId}.`);
		warn("All skills, memories, and session history will be lost.");
		warn("Re-run with --yes to confirm:  npm run destroy -- --yes");
		process.exit(1);
	}
	const config = loadConfig();
	const client = makeClient(config);

	header(`Destroy -- ${state.machineId}`);
	const machine = await getMachine(client, state.machineId);
	await destroyMachine(client, machine);
	clearState();
	info("destroyed; local state cleared");
}
