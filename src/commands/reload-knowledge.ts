/**
 * `npm run reload` -- re-upload the local knowledge/ folder onto the machine.
 *
 * Useful when you edit a SKILL.md, MEMORY.md, or cron seed locally and want
 * the deployed agent to pick up the new content without a full re-bootstrap.
 * After upload, we restart the gateway so cron job changes register.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadState, makeClient } from "../lib/client.js";
import { PORT_API, SHELL_ENV, VM_HERMES_HOME } from "../lib/constants.js";
import { loadConfig } from "../lib/env.js";
import { exec } from "../lib/exec.js";
import { fail, header, phase } from "../lib/progress.js";
import { uploadKnowledge } from "../lib/upload.js";

function repoRoot(): string {
	const here = fileURLToPath(import.meta.url);
	return resolve(here, "..", "..", "..");
}

export async function reloadKnowledge(): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Run `npm run deploy` first.");
		process.exit(1);
	}
	const config = loadConfig();
	const client = makeClient(config);

	header(`Reload knowledge -- ${state.machineId}`);

	await phase("Re-upload knowledge folder", async () => {
		await uploadKnowledge(
			client,
			state.machineId,
			resolve(repoRoot(), "knowledge"),
			VM_HERMES_HOME,
		);
		await exec(
			client,
			state.machineId,
			`rm -f ${VM_HERMES_HOME}/cron/.seeded`,
		);
	});

	await phase("Restart gateway to pick up changes", async () => {
		await exec(
			client,
			state.machineId,
			`${SHELL_ENV} && pkill -f 'hermes gateway' || true`,
		);
		await exec(
			client,
			state.machineId,
			`setsid /home/machine/start-gateway.sh </dev/null &>/dev/null & disown && sleep 10`,
		);
		await exec(
			client,
			state.machineId,
			`ss -tlnp | grep ':${PORT_API}' >/dev/null`,
		);
	});

	console.log("");
	console.log("  Skills, memory, and crons reloaded. Try a fresh `npm run chat`.");
}
