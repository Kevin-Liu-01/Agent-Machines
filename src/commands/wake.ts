/**
 * `npm run wake` -- resume a sleeping machine and re-bind the gateway.
 *
 * After wake, the root filesystem is fresh (apt deps gone), but /home/machine
 * persists, so the venv + Hermes + skills + sessions DB are all intact. We
 * still re-run the bootstrap idempotently to repair anything that drifted
 * (gateway process, dashboard, port bindings).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBootstrap } from "../lib/bootstrap.js";
import { loadState, makeClient } from "../lib/client.js";
import { loadConfig } from "../lib/env.js";
import { getMachine, wakeMachine } from "../lib/machine.js";
import { fail, header, info } from "../lib/progress.js";

function repoRoot(): string {
	const here = fileURLToPath(import.meta.url);
	return resolve(here, "..", "..", "..");
}

export async function wake(): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Run `npm run deploy` first.");
		process.exit(1);
	}
	const config = loadConfig();
	const client = makeClient(config);

	header(`Wake -- ${state.machineId}`);
	const machine = await getMachine(client, state.machineId);
	const ready = await wakeMachine(client, machine);
	info(`machine running (phase: ${ready.status.phase})`);

	await runBootstrap({
		client,
		machineId: state.machineId,
		config,
		apiServerKey: state.apiServerKey,
		repoRoot: repoRoot(),
		cursorApiKey: config.cursorApiKey,
	});

	console.log("");
	if (state.apiPreviewUrl) console.log(`  API:        ${state.apiPreviewUrl}/v1`);
	if (state.dashboardPreviewUrl) console.log(`  Dashboard:  ${state.dashboardPreviewUrl}`);
}
