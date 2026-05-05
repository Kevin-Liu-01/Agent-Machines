/**
 * `npm run sleep` -- sleep the machine to pause billing while preserving state.
 *
 * Sleep keeps the persistent volume (skills, sessions DB, venv, config) intact.
 * Wake brings it back exactly as it was. This is the cheap-mode for a Hermes
 * deployment: idle most of the time, wake when you want to chat.
 */

import { loadState, makeClient } from "../lib/client.js";
import { loadConfig } from "../lib/env.js";
import { getMachine, sleepMachine } from "../lib/machine.js";
import { fail, header, info } from "../lib/progress.js";

export async function sleep(): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Run `npm run deploy` first.");
		process.exit(1);
	}
	const config = loadConfig();
	const client = makeClient(config);

	header(`Sleep -- ${state.machineId}`);
	const machine = await getMachine(client, state.machineId);
	if (machine.status.phase !== "running") {
		info(`already ${machine.status.phase}; nothing to do`);
		return;
	}
	const result = await sleepMachine(client, machine);
	info(`requested sleep; current phase: ${result.status.phase}`);
	info("preview URLs and API key are preserved; run `npm run wake` to resume");
}
