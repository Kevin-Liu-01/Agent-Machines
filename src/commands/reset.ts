/**
 * `npm run reset` -- wipe Hermes session state on the machine and restart.
 *
 * Use when the agent is throwing 400s from the upstream LLM about orphan
 * `tool_result` blocks (Hermes 0.12.0 occasionally persists conversation
 * history with split tool_use/tool_result pairs after a mid-turn failure;
 * the next request replays the corrupt state and Anthropic rejects it).
 *
 * What gets wiped:
 *   - ~/.agent-machines/sessions/        (FTS5 conversation history)
 *   - ~/.agent-machines/state.db*        (agent state)
 *   - ~/.agent-machines/response_store.db*  (response cache)
 *   - ~/.agent-machines/kanban.db*       (kanban dispatcher state)
 *   - ~/.agent-machines/gateway_state.json, gateway.lock, gateway.pid
 *
 * What survives:
 *   - SOUL.md / USER.md / MEMORY.md / AGENTS.md
 *   - ~/.agent-machines/skills/
 *   - ~/.agent-machines/cron/  (scheduled jobs persist)
 *   - ~/.agent-machines/.env   (API_SERVER_KEY, CURSOR_API_KEY, ...)
 *   - ~/.agent-machines/config.yaml
 *
 * Then the gateway is force-restarted so the running process doesn't keep
 * a stale in-memory copy of the wiped state. The cloudflared tunnels keep
 * pointing at the same loopback ports, so existing API URLs stay valid.
 */

import { loadState, makeClient } from "../lib/client.js";
import {
	PORT_API,
	SHELL_ENV,
	VM_HERMES_HOME,
	VM_VENV,
} from "../lib/constants.js";
import { loadConfig } from "../lib/env.js";
import { check, exec, execOut } from "../lib/exec.js";
import { getMachine } from "../lib/machine.js";
import { fail, header, info, phase, success } from "../lib/progress.js";

export async function reset(): Promise<void> {
	const state = loadState();
	if (!state?.machineId) {
		fail("No deployed machine. Run `npm run deploy` first.");
		process.exit(1);
	}
	const config = loadConfig();
	const client = makeClient(config);

	header(`Reset session state -- ${state.machineId}`);

	const machine = await getMachine(client, state.machineId);
	if (machine.status.phase !== "running") {
		fail(`Machine is ${machine.status.phase}, not running. Run \`npm run deploy\` to recover.`);
		process.exit(1);
	}

	await phase("Stop the running gateway", async () => {
		await exec(
			client,
			state.machineId,
			`ps -eo pid,cmd | awk '/${VM_VENV.replace(/\//g, "\\/")}\\/bin\\/hermes gateway/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null; sleep 3; true`,
		);
	});

	await phase("Wipe session + agent-state databases", async () => {
		const before = await execOut(
			client,
			state.machineId,
			`du -sh ${VM_HERMES_HOME}/sessions ${VM_HERMES_HOME}/state.db 2>/dev/null | awk '{print $1, $2}' | head -5`,
		);
		if (before.trim()) info(`  before: ${before.replace(/\n/g, " · ")}`);
		await exec(
			client,
			state.machineId,
			`rm -rf ${VM_HERMES_HOME}/sessions/* ` +
				`${VM_HERMES_HOME}/state.db* ` +
				`${VM_HERMES_HOME}/response_store.db* ` +
				`${VM_HERMES_HOME}/kanban.db* ` +
				`${VM_HERMES_HOME}/gateway_state.json ` +
				`${VM_HERMES_HOME}/gateway.lock ` +
				`${VM_HERMES_HOME}/gateway.pid`,
		);
	});

	await phase("Restart the gateway", async () => {
		await exec(
			client,
			state.machineId,
			`(setsid /home/machine/start-gateway.sh </dev/null &>/dev/null &) && sleep 12`,
		);
		const bound = await check(
			client,
			state.machineId,
			`ss -tlnp | grep ':${PORT_API}'`,
		);
		if (!bound) throw new Error(`gateway did not rebind on :${PORT_API}`);
	});

	await phase("Verify the agent answers a fresh prompt", async () => {
		const probe = await execOut(
			client,
			state.machineId,
			`${SHELL_ENV} && curl -sS --max-time 30 ` +
				`-H "Authorization: Bearer ${state.apiServerKey}" ` +
				`-H "Content-Type: application/json" ` +
				`http://127.0.0.1:${PORT_API}/v1/chat/completions ` +
				`-d '{"model":"hermes-agent","messages":[{"role":"user","content":"reply with the single word: ok"}],"stream":false}' ` +
				`| python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','(none)'))"`,
			{ timeoutMs: 60_000 },
		);
		info(`  agent says: ${probe.trim().slice(0, 200)}`);
	});

	success(`reset complete. URLs unchanged: ${state.apiPreviewUrl}/v1`);
}
