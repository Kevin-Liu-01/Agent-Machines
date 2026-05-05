/**
 * `npm run shell` -- print the `dedalus ssh` invocation for the current machine.
 *
 * We don't try to spawn ssh ourselves because the Dedalus CLI handles guest
 * key trust, retry on `SSH_GUEST_CONNECT_FAILED`, and tunnel setup. This just
 * prints the right command so the user can copy/paste.
 */

import { loadState } from "../lib/client.js";
import { fail, header } from "../lib/progress.js";

export async function shell(): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Run `npm run deploy` first.");
		process.exit(1);
	}
	header("SSH into the machine");
	console.log(`  dedalus ssh ${state.machineId}`);
	console.log("");
	console.log("  If you see SSH_GUEST_CONNECT_FAILED, retry after ~10s.");
	console.log("  Inside the VM:");
	console.log("    source /home/machine/.venv/bin/activate");
	console.log("    hermes              # start the TUI");
	console.log("    hermes cron list    # show scheduled automations");
	console.log("    hermes doctor       # diagnose any issues");
}
