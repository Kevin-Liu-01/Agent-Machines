/**
 * `npm run logs` -- print the last N lines of the Hermes gateway log.
 *
 * Pass `-n 200` (or any number) to widen the window. Default is 80 lines,
 * which is enough to see the most recent agent turn and any tool errors.
 */

import { loadState, makeClient } from "../lib/client.js";
import { SHELL_ENV, VM_GATEWAY_LOG } from "../lib/constants.js";
import { loadConfig } from "../lib/env.js";
import { execOut } from "../lib/exec.js";
import { fail, header } from "../lib/progress.js";

export async function logs(args: string[]): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Run `npm run deploy` first.");
		process.exit(1);
	}

	let lines = 80;
	const nIndex = args.indexOf("-n");
	if (nIndex >= 0 && args[nIndex + 1]) {
		const parsed = Number(args[nIndex + 1]);
		if (Number.isFinite(parsed) && parsed > 0) lines = parsed;
	}

	const config = loadConfig();
	const client = makeClient(config);

	header(`Last ${lines} lines -- ${VM_GATEWAY_LOG}`);
	const tail = await execOut(
		client,
		state.machineId,
		`${SHELL_ENV} && tail -n ${lines} ${VM_GATEWAY_LOG} 2>/dev/null || echo '(log not found)'`,
	);
	console.log(tail);
}
