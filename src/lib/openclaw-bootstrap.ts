/**
 * OpenClaw install pipeline for an existing Dedalus machine.
 *
 * Mirrors the Hermes bootstrap pipeline but for the alternative agent
 * kind. OpenClaw is much simpler than Hermes -- one npm global install,
 * five `openclaw config set` calls, one launcher script -- so the whole
 * thing fits in four idempotent phases.
 *
 * The install matches dedalus-labs/openclaw-demo's known-good recipe:
 *   - Node 22.15 from the official tarball (no apt/unzip required)
 *   - npm global prefix pinned to /home/machine/.npm-global
 *   - openclaw@latest from npm
 *   - gateway in `local` mode on port 18789, auth=none
 *   - model anthropic/claude-sonnet-4-20250514, pointed at api.dedaluslabs.ai
 *
 * After install the gateway listens on 18789 ready to receive
 * OpenAI-compatible chat completions.
 */

import type Dedalus from "dedalus";

import { check, exec } from "./exec.js";
import { dim, info, phase, success } from "./progress.js";

export const PORT_OPENCLAW = 18789;

const H = "/home/machine";
const NODE_VERSION = "v22.15.0";
const NODE_DIR = `${H}/node-${NODE_VERSION}-linux-x64`;
const NODE_BIN = `${NODE_DIR}/bin`;
const STATE_DIR = `${H}/.openclaw`;
const LAUNCHER = `${H}/run-openclaw.sh`;
const LOG_PATH = `${STATE_DIR}/gateway.log`;

const ENV_PREFIX = [
	`export HOME=${H}`,
	`export PATH=${H}/.npm-global/bin:${NODE_BIN}:$PATH`,
	`export OPENCLAW_STATE_DIR=${STATE_DIR}`,
	`export OPENCLAW_NO_RESPAWN=1`,
	`export NPM_CONFIG_PREFIX=${H}/.npm-global`,
	`export NPM_CONFIG_CACHE=${H}/.npm-cache`,
	`export TMPDIR=${H}/.tmp`,
].join(" && ");

type RunArgs = {
	client: Dedalus;
	machineId: string;
	dedalusApiKey: string;
	model?: string;
};

export type OpenclawInstallResult = {
	model: string;
	statePath: string;
	logPath: string;
};

export async function runOpenclawBootstrap(
	args: RunArgs,
): Promise<OpenclawInstallResult> {
	const { client, machineId, dedalusApiKey } = args;
	const model = args.model ?? "anthropic/claude-sonnet-4-20250514";

	await phase("Install Node.js (tarball)", async () => {
		const installed = await check(client, machineId, `test -x ${NODE_BIN}/node`);
		if (installed) {
			info("  node already installed");
			return;
		}
		dim("  downloading node tarball...");
		await exec(
			client,
			machineId,
			`curl -fsSL https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz | tar -xJ -C ${H}`,
			{ timeoutMs: 180_000 },
		);
		success("  node ready");
	});

	await phase("Install OpenClaw (npm global)", async () => {
		const installed = await check(
			client,
			machineId,
			`${ENV_PREFIX} && command -v openclaw >/dev/null`,
		);
		if (installed) {
			info("  openclaw already installed");
		} else {
			dim("  npm i -g openclaw@latest...");
			await exec(
				client,
				machineId,
				`mkdir -p ${H}/.npm-global ${H}/.npm-cache ${H}/.tmp ${STATE_DIR} && ${ENV_PREFIX} && npm i -g openclaw@latest 2>&1 | tail -5`,
				{ timeoutMs: 240_000 },
			);
		}
		const { stdout } = await exec(
			client,
			machineId,
			`${ENV_PREFIX} && openclaw --version`,
			{ timeoutMs: 30_000 },
		);
		success(`  openclaw ${stdout.trim()}`);
	});

	await phase("Configure OpenClaw", async () => {
		const configCmds = [
			`openclaw config set gateway.mode local`,
			`openclaw config set gateway.bind "0.0.0.0"`,
			`openclaw config set agent.model "${model}"`,
			`openclaw config set env.vars.ANTHROPIC_API_KEY "${dedalusApiKey}"`,
			`openclaw config set env.vars.ANTHROPIC_BASE_URL "https://api.dedaluslabs.ai/v1"`,
			`openclaw config set gateway.http.endpoints.chatCompletions.enabled true`,
		].join(" && ");
		await exec(client, machineId, `${ENV_PREFIX} && ${configCmds}`, {
			timeoutMs: 60_000,
		});
		info(`  model: ${model}`);
	});

	await phase("Start gateway", async () => {
		const listening = await check(
			client,
			machineId,
			`ss -tlnp 2>/dev/null | grep ${PORT_OPENCLAW} >/dev/null`,
		);
		if (listening) {
			info(`  gateway already on :${PORT_OPENCLAW}`);
			return;
		}

		const launcherScript = [
			"#!/bin/bash",
			`export HOME=${H}`,
			`export PATH=${H}/.npm-global/bin:${NODE_BIN}:$PATH`,
			`export OPENCLAW_STATE_DIR=${STATE_DIR}`,
			"export OPENCLAW_NO_RESPAWN=1",
			`exec openclaw gateway run --auth none >> ${LOG_PATH} 2>&1`,
		].join("\n");
		const launcherB64 = Buffer.from(launcherScript).toString("base64");

		await exec(
			client,
			machineId,
			`echo ${launcherB64} | base64 -d > ${LAUNCHER} && chmod +x ${LAUNCHER}`,
			{ timeoutMs: 15_000 },
		);

		// `setsid foo & disown` doesn't fully detach inside the execution API;
		// wrapping in a subshell that exits immediately is the trick.
		await exec(
			client,
			machineId,
			`(setsid ${LAUNCHER} </dev/null &>/dev/null &) && sleep 12 && ss -tlnp 2>/dev/null | grep ${PORT_OPENCLAW}`,
			{ timeoutMs: 30_000 },
		);
		success(`  gateway listening on :${PORT_OPENCLAW}`);
	});

	return { model, statePath: STATE_DIR, logPath: LOG_PATH };
}
