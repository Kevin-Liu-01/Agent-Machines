/**
 * OpenClaw install pipeline.
 *
 * Installs the upstream OpenClaw package (`npm i -g openclaw@latest`
 * from <https://github.com/openclaw/openclaw>) onto a host VM. By
 * default that host is a Dedalus microVM, but the script only needs:
 *
 *   - a POSIX shell with Node 22+ + npm available
 *   - a writable HOME (we use /home/machine)
 *   - inbound port 18789 reachable from outside the VM
 *
 * So swapping Dedalus for any other Linux host (Vercel Sandbox, Fly
 * Machines, a bare EC2 box, ...) is a question of how you provision
 * the host, not the agent install. The Dedalus exec API is just our
 * runner of choice today.
 *
 * Inspired by the `dedalus-labs/openclaw-ddls` cookbook but uses the
 * real OpenClaw package; we are not vendoring or forking. Three
 * deliberate divergences from the cookbook:
 *
 *   - Bind the gateway to `0.0.0.0` (the cookbook binds to loopback
 *     because they curl from the same VM via the execution API). We
 *     expose the gateway publicly via the host's preview / tunnel,
 *     so loopback would make the chat surface unreachable.
 *   - Retry on transient infra failures (HOST_LAUNCH_THROTTLED,
 *     SNAPSHOT_LAUNCH_HYPERVISOR_CONNECT_FAILED) at the machine
 *     layer before this script runs.
 *   - Mirror the API key into BOTH `ANTHROPIC_API_KEY` and
 *     `OPENAI_API_KEY` so the gateway routes correctly whether the
 *     user picks an `anthropic/*` or `openai/*` model via the
 *     `x-openclaw-model` header. The base URL is whatever the user
 *     points the gateway at -- Dedalus's router by default, or any
 *     other OpenAI-compatible endpoint via `ANTHROPIC_BASE_URL`.
 *
 * Combined into ONE long exec on purpose -- splitting setup across
 * multiple short execs lets the machine sleep mid-install (Dedalus
 * sleeps idle machines aggressively). One long exec keeps it awake.
 */

import type Dedalus from "dedalus";

import { check, exec } from "./exec.js";
import { dim, info, phase, success } from "./progress.js";

export const PORT_OPENCLAW = 18789;

const H = "/home/machine";
const STATE_DIR = `${H}/.openclaw`;
const LOG_PATH = `${STATE_DIR}/gateway.log`;

/* Env prefix used by every shell command after the install. PATH points
 * at the npm-global prefix where `openclaw` lives; HOME and STATE_DIR
 * point at the persistent volume so config + logs survive sleep/wake. */
const ENV_PREFIX = [
	`export HOME=${H}`,
	`export PATH=${H}/.npm-global/bin:$PATH`,
	`export OPENCLAW_STATE_DIR=${STATE_DIR}`,
	`export OPENCLAW_NO_RESPAWN=1`,
].join(" && ");

type RunArgs = {
	client: Dedalus;
	machineId: string;
	/**
	 * Provider API key the gateway will hand to upstream. Mirrored into
	 * both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` so OpenClaw's
	 * built-in router picks whichever provider matches the chosen model.
	 *
	 * Kevin's deploys use the Dedalus key here -- it doubles as a
	 * proxied Anthropic key when paired with `anthropicBaseUrl`.
	 * BYO Anthropic / OpenAI keys also work; just unset
	 * `anthropicBaseUrl` to hit the providers directly.
	 */
	llmApiKey: string;
	/**
	 * Optional override for `ANTHROPIC_BASE_URL`. Defaults to the
	 * Dedalus chat proxy so the same key works for both Dedalus
	 * provisioning and Anthropic inference.
	 */
	anthropicBaseUrl?: string | null;
	/**
	 * Default model id sent in the `x-openclaw-model` header on chat
	 * calls. Persisted in `agent.model` so the dashboard's gateway
	 * probe can read it.
	 */
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
	const { client, machineId, llmApiKey } = args;
	const model = args.model ?? "anthropic/claude-sonnet-4-6";
	const anthropicBaseUrl =
		args.anthropicBaseUrl !== undefined
			? args.anthropicBaseUrl
			: "https://api.dedaluslabs.ai/v1";

	await phase("Install Node + OpenClaw + configure (single shot)", async () => {
		// Idempotency probe: if the gateway is already listening, skip the
		// whole install + config step. Re-runs after sleep/wake hit this
		// path and finish in <1s.
		const listening = await check(
			client,
			machineId,
			`ss -tln 2>/dev/null | awk '{print $4}' | grep -q ':${PORT_OPENCLAW}$'`,
		);
		if (listening) {
			info(`  gateway already listening on :${PORT_OPENCLAW}`);
			return;
		}

		// One long exec. Splitting these would let the machine sleep
		// mid-install (Dedalus sleeps idle machines aggressively).
		const baseUrlLine = anthropicBaseUrl
			? `openclaw config set env.vars.ANTHROPIC_BASE_URL "${anthropicBaseUrl}"`
			: `openclaw config unset env.vars.ANTHROPIC_BASE_URL || true`;

		const setup = [
			`set -e`,
			// Node 22 via apt + nodesource. Upstream cookbook does this;
			// it's smaller surface than the tarball download.
			`command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 && apt-get install -y nodejs >/dev/null 2>&1)`,
			`node --version`,
			`mkdir -p ${H}/.npm-global ${H}/.npm-cache ${H}/.tmp ${STATE_DIR}`,
			`NPM_CONFIG_PREFIX=${H}/.npm-global \\
			  NPM_CONFIG_CACHE=${H}/.npm-cache \\
			  TMPDIR=${H}/.tmp \\
			  npm install -g openclaw@latest --no-audit --no-fund --loglevel=error 2>&1 | tail -3`,
			ENV_PREFIX,
			`openclaw --version`,
			`openclaw config set gateway.mode local`,
			`openclaw config set gateway.http.endpoints.chatCompletions.enabled true`,
			// Bind 0.0.0.0 (not loopback) so the Dedalus preview tunnel
			// can reach us. Auth is intentionally `none` because the
			// preview hostname is unguessable; tighten with token auth
			// before exposing on a stable domain.
			`openclaw config set gateway.bind "0.0.0.0"`,
			`openclaw config set gateway.auth.mode none`,
			`openclaw config set agent.model "${model}"`,
			`openclaw config set env.vars.ANTHROPIC_API_KEY "${llmApiKey}"`,
			`openclaw config set env.vars.OPENAI_API_KEY "${llmApiKey}"`,
			baseUrlLine,
			`echo done`,
		].join(" && ");

		dim("  apt-installing node, npm i -g openclaw, configuring (~2-3 min)...");
		await exec(client, machineId, setup, { timeoutMs: 600_000 });
		success(`  openclaw configured (model: ${model})`);
	});

	await phase("Start gateway", async () => {
		const listening = await check(
			client,
			machineId,
			`ss -tln 2>/dev/null | awk '{print $4}' | grep -q ':${PORT_OPENCLAW}$'`,
		);
		if (listening) {
			info(`  already listening on :${PORT_OPENCLAW}`);
			return;
		}

		// Detached launch. The `setsid bash -c '... && exec openclaw ...'`
		// pattern is the upstream cookbook's recipe -- bare `setsid foo
		// & disown` doesn't fully detach inside the Dedalus execution
		// API. The wrapping subshell + exec replaces bash with openclaw,
		// keeping the process alive after the exec call returns.
		const launchCmd =
			`(setsid bash -c '${ENV_PREFIX} && exec openclaw gateway run > ${LOG_PATH} 2>&1' </dev/null &>/dev/null & disown)`;
		await exec(
			client,
			machineId,
			`${launchCmd} && sleep 14 && ss -tln 2>/dev/null | awk '{print $4}' | grep -q ':${PORT_OPENCLAW}$' && echo OK`,
			{ timeoutMs: 60_000 },
		);
		success(`  gateway listening on :${PORT_OPENCLAW}`);
	});

	return { model, statePath: STATE_DIR, logPath: LOG_PATH };
}
