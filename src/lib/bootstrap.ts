/**
 * Bootstrap a fresh (or freshly woken) Dedalus machine into a fully configured
 * Hermes Agent. Each function is idempotent and short-circuits if the work is
 * already done, so re-running `npm run deploy` is cheap and safe.
 *
 * Phases (in order):
 *   1. systemDeps      — apt: curl, git, build-essential, ca-certs
 *   2. installUv       — uv into /home/machine/.local/bin
 *   3. installHermes   — Python 3.11 venv + `uv pip install hermes-agent`
 *   4. seedKnowledge   — tarball the local knowledge/ folder into ~/.hermes/
 *   5. configureHermes — set provider, model, API server, knowledge paths
 *   6. seedCronJobs    — create the scheduled automations from knowledge/crons
 *   7. startGateway    — `hermes gateway` in setsid background, binds 8642
 *   8. startDashboard  — `hermes web` in setsid background, binds 9119
 */

import { resolve } from "node:path";

import type Dedalus from "dedalus";

import {
	DEPLOY_VERSION,
	PORT_API,
	PORT_DASHBOARD,
	SHELL_ENV,
	VM_DEPLOY_MARKER,
	VM_GATEWAY_LOG,
	VM_HERMES_HOME,
	VM_HOME,
	VM_LOCAL_BIN,
	VM_UV_CACHE,
	VM_VENV,
} from "./constants.js";
import type { Config } from "./env.js";
import { check, exec, execOut } from "./exec.js";
import { phase, dim } from "./progress.js";
import { uploadKnowledge } from "./upload.js";

export type BootstrapInput = {
	client: Dedalus;
	machineId: string;
	config: Config;
	apiServerKey: string;
	repoRoot: string;
};

async function systemDeps({ client, machineId }: BootstrapInput): Promise<void> {
	// `/home/machine` should pre-exist on Dedalus dev machines, but a fresh
	// reboot or volume recycle can leave the root fs in a state where we have
	// to recreate it. mkdir -p is cheap and idempotent.
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_HOME} ${VM_LOCAL_BIN} ${VM_UV_CACHE} ${VM_HERMES_HOME}/logs`,
	);
	if (await check(client, machineId, `command -v curl && command -v git && command -v gcc`)) {
		dim("  apt deps already present");
		return;
	}
	await exec(
		client,
		machineId,
		"apt-get update -qq 2>&1 | tail -3 && " +
			"apt-get install -y -qq curl git build-essential ca-certificates 2>&1 | tail -3",
		{ timeoutMs: 300_000 },
	);
}

async function installUv({ client, machineId }: BootstrapInput): Promise<void> {
	if (await check(client, machineId, `${SHELL_ENV} && command -v uv`)) {
		dim("  uv already installed");
		return;
	}
	await exec(
		client,
		machineId,
		`export HOME=${VM_HOME} && ` +
			`export XDG_DATA_HOME=${VM_HOME}/.local/share && ` +
			`export XDG_BIN_HOME=${VM_LOCAL_BIN} && ` +
			`mkdir -p ${VM_LOCAL_BIN} ${VM_UV_CACHE} && ` +
			"curl -LsSf https://astral.sh/uv/install.sh | sh 2>&1 | tail -3",
		{ timeoutMs: 180_000 },
	);
	await exec(client, machineId, `${SHELL_ENV} && uv --version`);
}

async function installHermes({ client, machineId }: BootstrapInput): Promise<void> {
	// Both the binary AND the [web] extra (fastapi) need to be present.
	// Old base-only installs from earlier deploy versions need a re-install.
	if (
		await check(
			client,
			machineId,
			`${SHELL_ENV} && [ -x ${VM_VENV}/bin/hermes ] && hermes --version >/dev/null && ` +
				`${VM_VENV}/bin/python -c 'import fastapi'`,
		)
	) {
		dim("  hermes + web extra already installed");
		return;
	}
	if (
		!(await check(
			client,
			machineId,
			`${SHELL_ENV} && [ -d ${VM_VENV} ] && [ -x ${VM_VENV}/bin/python ]`,
		))
	) {
		await exec(
			client,
			machineId,
			`${SHELL_ENV} && uv venv ${VM_VENV} --python 3.11 2>&1 | tail -3`,
			{ timeoutMs: 180_000 },
		);
	}
	// Wipe any prior failed clone so a partial repo state from an earlier run
	// doesn't poison the install. uv resolves the git ref + clones + installs
	// in one optimized step.
	await exec(client, machineId, `rm -rf ${VM_HOME}/hermes-agent-src`);
	// Install with the [web] extra so `hermes dashboard` works (pulls FastAPI
	// + uvicorn — about 5 MB). We deliberately avoid [all] which would pull
	// Playwright/Chromium (~250 MB) and ElevenLabs/Modal/Daytona deps we
	// don't need for an API + dashboard + cron deployment.
	await exec(
		client,
		machineId,
		`${SHELL_ENV} && uv pip install --python ${VM_VENV}/bin/python ` +
			`'hermes-agent[web] @ git+https://github.com/NousResearch/hermes-agent.git@main' 2>&1 | tail -8`,
		{ timeoutMs: 900_000 },
	);
	await exec(
		client,
		machineId,
		`${SHELL_ENV} && [ -x ${VM_VENV}/bin/hermes ] && hermes --version`,
	);
}

async function seedKnowledge({
	client,
	machineId,
	repoRoot,
}: BootstrapInput): Promise<void> {
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_HERMES_HOME}/skills ${VM_HERMES_HOME}/cron ${VM_HERMES_HOME}/logs`,
	);
	const localKnowledge = resolve(repoRoot, "knowledge");
	const result = await uploadKnowledge(
		client,
		machineId,
		localKnowledge,
		VM_HERMES_HOME,
	);
	dim(`  uploaded ${result.chunks} chunks, ${(result.sizeBytes / 1024).toFixed(1)} KB`);
}

async function configureHermes(input: BootstrapInput): Promise<void> {
	const { client, machineId, config, apiServerKey } = input;
	// Strip the optional "openai:" prefix from the model spec — Hermes's
	// `model.default` wants just the model name (e.g. "anthropic/claude-sonnet-4.5").
	const modelName = config.model.startsWith("openai:")
		? config.model.slice("openai:".length)
		: config.model;
	// Reset the config so stale `providers.*` keys from earlier deploy
	// versions don't shadow the new `model.*` keys.
	await exec(
		client,
		machineId,
		`${SHELL_ENV} && rm -f ${VM_HERMES_HOME}/config.yaml`,
	);
	const settings: Array<[string, string]> = [
		// Use `provider: custom` to point at any OpenAI-compatible endpoint.
		// Per hermes_cli/runtime_provider.py, when provider=custom the runtime
		// honors model.base_url + model.api_key and won't fall back to OpenRouter.
		["model.provider", "custom"],
		["model.base_url", config.chatBaseUrl],
		["model.api_key", config.apiKey],
		["model.default", modelName],
		["first_run_complete", "true"],
		["display.streaming", "true"],
		["display.tool_progress", "all"],
		["agent.max_turns", "60"],
		["memory.memory_enabled", "true"],
		["memory.user_profile_enabled", "true"],
		["compression.enabled", "true"],
	];
	for (const [key, value] of settings) {
		await exec(
			client,
			machineId,
			`${SHELL_ENV} && hermes config set ${key} ${JSON.stringify(value)}`,
		);
	}

	// API server config: set via .env so hermes gateway picks it up at startup.
	const envLines = [
		"API_SERVER_ENABLED=true",
		`API_SERVER_KEY=${apiServerKey}`,
		"API_SERVER_HOST=0.0.0.0",
		`API_SERVER_PORT=${PORT_API}`,
	];
	for (const line of envLines) {
		const [name] = line.split("=");
		await exec(
			client,
			machineId,
			`${SHELL_ENV} && touch ${VM_HERMES_HOME}/.env && ` +
				`grep -v '^${name}=' ${VM_HERMES_HOME}/.env > ${VM_HERMES_HOME}/.env.tmp || true && ` +
				`echo '${line}' >> ${VM_HERMES_HOME}/.env.tmp && ` +
				`mv ${VM_HERMES_HOME}/.env.tmp ${VM_HERMES_HOME}/.env && ` +
				`chmod 600 ${VM_HERMES_HOME}/.env`,
		);
	}
}

async function seedCronJobs({ client, machineId }: BootstrapInput): Promise<void> {
	// Hermes itself owns ${VM_HERMES_HOME}/cron/ (singular, scheduler state).
	// Our knowledge tarball drops the seed file at crons/seed.json (plural)
	// to avoid colliding with that directory.
	const seedFile = `${VM_HERMES_HOME}/crons/seed.json`;
	if (!(await check(client, machineId, `[ -f ${seedFile} ]`))) {
		dim("  no cron seed file, skipping");
		return;
	}
	if (await check(client, machineId, `[ -f ${VM_HERMES_HOME}/crons/.seeded ]`)) {
		dim("  cron seed already applied");
		return;
	}
	// Write the seeder script to a real file so we can avoid escape-hell with
	// quoted python -c. Heredocs are unreliable through the execution API
	// (per the AgentWings notes), so we use a one-line printf chain instead.
	const seederScript = `${VM_HERMES_HOME}/crons/seed.py`;
	const seederBody = [
		"import json, subprocess",
		`with open("${seedFile}") as f: jobs = json.load(f)`,
		"for job in jobs:",
		"    cmd = [\"hermes\", \"cron\", \"create\", job[\"schedule\"], job[\"prompt\"], \"--name\", job[\"name\"]]",
		"    for s in job.get(\"skills\", []): cmd += [\"--skill\", s]",
		"    r = subprocess.run(cmd, capture_output=True, text=True)",
		"    out = (r.stdout or r.stderr).strip()[:200]",
		'    print("[" + str(r.returncode) + "] " + job["name"] + ": " + out)',
	].join("\\n");
	await exec(
		client,
		machineId,
		`printf '%b' '${seederBody}' > ${seederScript}`,
	);
	const stdout = await execOut(
		client,
		machineId,
		`${SHELL_ENV} && python3 ${seederScript}`,
		{ timeoutMs: 120_000 },
	);
	if (stdout) dim(stdout.split("\n").slice(0, 6).map((l) => `  ${l}`).join("\n"));
	await exec(client, machineId, `touch ${VM_HERMES_HOME}/crons/.seeded`);
}

async function startGateway({ client, machineId }: BootstrapInput): Promise<void> {
	// Always restart: the gateway only reads config at process startup, so
	// any config or .env change made earlier in this bootstrap run won't
	// take effect until we recycle. The cost is ~10s; the alternative is
	// the user wondering why their model setting silently doesn't apply.
	//
	// `pkill -f` matches its own /proc/PID/cmdline, so we filter through
	// `ps + grep -v grep + awk + xargs kill` to avoid killing the bash that
	// runs the kill itself.
	await exec(
		client,
		machineId,
		`ps -eo pid,cmd | awk '/${VM_VENV.replace(/\//g, "\\/")}\\/bin\\/hermes gateway/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null; sleep 3; true`,
	);
	const startScript = `${VM_HOME}/start-gateway.sh`;
	const startScriptContent = [
		"#!/bin/bash",
		`export HOME=${VM_HOME}`,
		`export HERMES_HOME=${VM_HERMES_HOME}`,
		`export VIRTUAL_ENV=${VM_VENV}`,
		`export UV_CACHE_DIR=${VM_UV_CACHE}`,
		`export PATH=${VM_LOCAL_BIN}:${VM_VENV}/bin:$PATH`,
		`mkdir -p ${VM_HERMES_HOME}/logs`,
		`exec hermes gateway >> ${VM_GATEWAY_LOG} 2>&1`,
	].join("\\n");
	await exec(
		client,
		machineId,
		`printf '%b' '${startScriptContent}' > ${startScript} && chmod +x ${startScript}`,
	);
	await exec(
		client,
		machineId,
		`(setsid ${startScript} </dev/null &>/dev/null &) && sleep 12`,
	);
	if (!(await check(client, machineId, `ss -tlnp | grep ':${PORT_API}'`))) {
		const tail = await execOut(client, machineId, `tail -50 ${VM_GATEWAY_LOG} || true`);
		throw new Error(`gateway did not bind on :${PORT_API}.\nLog tail:\n${tail}`);
	}
}

async function startDashboard({ client, machineId }: BootstrapInput): Promise<void> {
	if (await check(client, machineId, `ss -tlnp | grep ':${PORT_DASHBOARD}'`)) {
		dim(`  dashboard already bound on :${PORT_DASHBOARD}`);
		return;
	}
	const startScript = `${VM_HOME}/start-dashboard.sh`;
	const dashLog = `${VM_HERMES_HOME}/logs/dashboard.log`;
	const startScriptContent = [
		"#!/bin/bash",
		`export HOME=${VM_HOME}`,
		`export HERMES_HOME=${VM_HERMES_HOME}`,
		`export VIRTUAL_ENV=${VM_VENV}`,
		`export PATH=${VM_LOCAL_BIN}:${VM_VENV}/bin:$PATH`,
		`mkdir -p ${VM_HERMES_HOME}/logs`,
		`exec hermes dashboard --host 0.0.0.0 --port ${PORT_DASHBOARD} --no-open --insecure >> ${dashLog} 2>&1`,
	].join("\\n");
	await exec(
		client,
		machineId,
		`printf '%b' '${startScriptContent}' > ${startScript} && chmod +x ${startScript}`,
	);
	await exec(
		client,
		machineId,
		`(setsid ${startScript} </dev/null &>/dev/null &) && sleep 10`,
	);
	if (!(await check(client, machineId, `ss -tlnp | grep ':${PORT_DASHBOARD}'`))) {
		const tail = await execOut(client, machineId, `tail -20 ${dashLog} 2>/dev/null || echo "(no log)"`);
		dim(`  dashboard did not bind on :${PORT_DASHBOARD} (non-fatal):`);
		dim(tail.split("\n").slice(0, 5).map((l) => `    ${l}`).join("\n"));
	}
}

async function recordVersion({ client, machineId }: BootstrapInput): Promise<void> {
	await exec(
		client,
		machineId,
		`echo '${DEPLOY_VERSION}' > ${VM_DEPLOY_MARKER}`,
	);
}

export async function runBootstrap(input: BootstrapInput): Promise<void> {
	await phase("Install system deps (curl, git, build-essential)", () => systemDeps(input));
	await phase("Install uv (Python package manager)", () => installUv(input));
	await phase("Install Hermes Agent (this can take a few minutes)", () => installHermes(input));
	await phase("Seed knowledge base (skills, persona, memory)", () => seedKnowledge(input));
	await phase("Configure Hermes (provider, model, API server, memory)", () => configureHermes(input));
	await phase("Seed scheduled cron automations", () => seedCronJobs(input));
	await phase(`Start gateway + API server on :${PORT_API}`, () => startGateway(input));
	await phase(`Start web dashboard on :${PORT_DASHBOARD}`, () => startDashboard(input));
	await phase("Record deploy version", () => recordVersion(input));
}
