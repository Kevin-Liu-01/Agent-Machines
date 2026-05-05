/**
 * `npm run status` -- show deploy state, machine phase, port bindings, and a
 * health probe of the API server. Useful as the first command after a deploy
 * stalls or after a reboot.
 */

import { probeApi } from "../lib/api.js";
import { loadState, makeClient } from "../lib/client.js";
import { PORT_API, PORT_DASHBOARD, SHELL_ENV } from "../lib/constants.js";
import { loadConfig } from "../lib/env.js";
import { check, execOut } from "../lib/exec.js";
import { getMachine } from "../lib/machine.js";
import { fail, header, info, dim } from "../lib/progress.js";

export async function status(): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No state file. Run `npm run deploy` first.");
		process.exit(1);
	}
	const config = loadConfig();
	const client = makeClient(config);

	header(`Status -- ${state.machineId}`);

	const machine = await getMachine(client, state.machineId);
	info(`phase:        ${machine.status.phase}`);
	info(`shape:        ${machine.vcpu} vCPU, ${machine.memory_mib} MiB, ${machine.storage_gib} GiB`);
	info(`deployed at:  ${state.deployedAt}`);
	info(`model:        ${state.model}`);

	if (machine.status.phase !== "running") {
		dim(`  machine is ${machine.status.phase}; run \`npm run wake\` to resume`);
		return;
	}

	const apiBound = await check(client, state.machineId, `ss -tlnp | grep ':${PORT_API}'`);
	const dashBound = await check(client, state.machineId, `ss -tlnp | grep ':${PORT_DASHBOARD}'`);
	info(`port ${PORT_API} (api):    ${apiBound ? "bound" : "DOWN"}`);
	info(`port ${PORT_DASHBOARD} (dash):  ${dashBound ? "bound" : "DOWN"}`);

	if (state.apiPreviewUrl) {
		const probe = await probeApi({ apiUrl: state.apiPreviewUrl, apiKey: state.apiServerKey });
		info(`api probe:    ${probe.ok ? `OK (${probe.status})` : `FAIL (${probe.status})`}`);
		info(`api url:      ${state.apiPreviewUrl}/v1`);
	}
	if (state.dashboardPreviewUrl) {
		info(`dashboard:    ${state.dashboardPreviewUrl}`);
	}

	if (await check(client, state.machineId, `${SHELL_ENV} && command -v hermes`)) {
		const version = await execOut(client, state.machineId, `${SHELL_ENV} && hermes --version`);
		info(`hermes:       ${version.split("\n")[0]}`);
		const skills = await execOut(
			client,
			state.machineId,
			`${SHELL_ENV} && ls -1 ~/.hermes/skills/ 2>/dev/null | wc -l`,
		);
		info(`skills:       ${skills.trim()} loaded`);
		const crons = await execOut(
			client,
			state.machineId,
			`${SHELL_ENV} && hermes cron list 2>/dev/null | grep -c '^' || echo 0`,
		);
		info(`cron jobs:    ${crons.trim()}`);
	}
}
