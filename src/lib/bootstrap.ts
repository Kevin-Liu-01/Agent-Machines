/**
 * Bootstrap a fresh (or freshly woken) Dedalus machine into a fully configured
 * Agent Machines runtime. Each function is idempotent and short-circuits if
 * the work is already done, so re-running `npm run deploy` is cheap and safe.
 *
 * Runtime root: ~/.agent-machines (HERMES_HOME env points here for the Hermes
 * agent package). Legacy ~/.hermes is migrated once and symlinked.
 */

import { resolve } from "node:path";

import type Dedalus from "dedalus";

import { resolve as resolvePath } from "node:path";

import {
	DEPLOY_VERSION,
	NODE_MAJOR,
	PORT_API,
	PORT_DASHBOARD,
	REPO_BRANCH,
	REPO_CLONE_URL,
	SHELL_ENV,
	VM_AGENT_DOCS_DIR,
	VM_AGENT_HOME,
	VM_AGENT_BROWSER_HOME,
	VM_APP_HOME,
	VM_BRIDGE_DIR,
	VM_DEPLOY_MARKER,
	VM_GATEWAY_LOG,
	VM_HERMES_HOME,
	VM_HOME,
	VM_LOCAL_BIN,
	VM_MACHINE_HOME,
	VM_NODE_DIR,
	VM_NPM_CACHE,
	VM_NPM_PREFIX,
	VM_PLAYWRIGHT_BROWSERS,
	VM_RELOAD_SCRIPT,
	VM_REPO_DIR,
	VM_UV_CACHE,
	VM_VENV,
} from "./constants.js";
import type { Config } from "./env.js";
import { check, exec, execOut } from "./exec.js";
import { loadMcpCatalog } from "./mcp-catalog.js";
import { buildMcpRegisterScript, defaultMcpRegisterContext } from "./mcp-register.js";
import { phase, dim } from "./progress.js";
import { buildReloadScript } from "./reload-script.js";
import { uploadKnowledge } from "./upload.js";

export type BootstrapInput = {
	client: Dedalus;
	machineId: string;
	config: Config;
	apiServerKey: string;
	repoRoot: string;
	cursorApiKey: string | null;
};

async function migrateLegacyPaths({ client, machineId }: BootstrapInput): Promise<void> {
	await exec(
		client,
		machineId,
		[
			`mkdir -p ${VM_APP_HOME}/logs ${VM_APP_HOME}/skills ${VM_APP_HOME}/scripts`,
			`if [ -d ${VM_HOME}/.hermes ] && [ ! -f ${VM_APP_HOME}/.migrated-from-hermes ]; then (command -v rsync >/dev/null && rsync -a ${VM_HOME}/.hermes/ ${VM_APP_HOME}/) || cp -a ${VM_HOME}/.hermes/. ${VM_APP_HOME}/ || true; touch ${VM_APP_HOME}/.migrated-from-hermes; fi`,
			`ln -sfn ${VM_APP_HOME} ${VM_HOME}/.hermes`,
			`if [ -d ${VM_HOME}/hermes-machines/.git ] && [ ! -e ${VM_REPO_DIR} ]; then ln -sfn ${VM_HOME}/hermes-machines ${VM_REPO_DIR}; fi`,
		].join(" && "),
	);
	dim("  runtime root ~/.agent-machines (legacy ~/.hermes symlinked)");
}

async function systemDeps({ client, machineId }: BootstrapInput): Promise<void> {
	// `/home/machine` should pre-exist on Dedalus dev machines, but a fresh
	// reboot or volume recycle can leave the root fs in a state where we have
	// to recreate it. mkdir -p is cheap and idempotent.
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_HOME} ${VM_LOCAL_BIN} ${VM_UV_CACHE} ${VM_NPM_PREFIX} ${VM_NPM_CACHE} ` +
			`${VM_PLAYWRIGHT_BROWSERS} ${VM_AGENT_BROWSER_HOME} ${VM_AGENT_DOCS_DIR} ` +
			`${VM_HERMES_HOME}/logs ${VM_MACHINE_HOME}/logs/services`,
	);
	if (
		await check(
			client,
			machineId,
			"command -v curl && command -v git && command -v gcc && " +
				"command -v jq && command -v sqlite3 && command -v dig && command -v ss",
		)
	) {
		dim("  apt deps already present");
		return;
	}
	await exec(
		client,
		machineId,
		"apt-get update -qq 2>&1 | tail -3 && " +
			"apt-get install -y -qq curl git build-essential ca-certificates jq sqlite3 dnsutils iproute2 netcat-openbsd 2>&1 | tail -3",
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
	// Three things need to be present: the binary, the [web] extra (fastapi
	// for `hermes dashboard`), and the [mcp] extra (the upstream `mcp` Python
	// package -- Hermes loads `mcp_servers` from config.yaml only when this
	// import succeeds; without it MCP support is a silent no-op).
	if (
		await check(
			client,
			machineId,
			`${SHELL_ENV} && [ -x ${VM_VENV}/bin/hermes ] && hermes --version >/dev/null && ` +
				`${VM_VENV}/bin/python -c 'import fastapi, mcp, aiohttp'`,
		)
	) {
		dim("  hermes + web + mcp already installed");
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
	// Install with the [web,mcp] extras so `hermes dashboard` works (FastAPI
	// + uvicorn) and so the gateway can discover/connect to MCP servers (the
	// upstream `mcp` Python package). We deliberately avoid [all] which would
	// pull Playwright/Chromium (~250 MB) and ElevenLabs/Modal/Daytona deps we
	// don't need for an API + dashboard + cron + cursor-bridge deployment.
	// aiohttp is required separately -- the API server adapter imports it at
	// runtime and silently disables the /v1 endpoint when it's absent.
	await exec(
		client,
		machineId,
		`${SHELL_ENV} && uv pip install --python ${VM_VENV}/bin/python ` +
			`'hermes-agent[web,mcp] @ git+https://github.com/NousResearch/hermes-agent.git@main' ` +
			`aiohttp 2>&1 | tail -40`,
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
		`mkdir -p ${VM_HERMES_HOME}/skills ${VM_HERMES_HOME}/cron ${VM_HERMES_HOME}/logs ${VM_HERMES_HOME}/mcps`,
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

/**
 * Clone (or update) the agent-machines repo on the VM and install a
 * `reload-from-git.sh` helper that the dashboard's reload route can
 * exec to pull the latest knowledge without touching the local CLI.
 *
 * Idempotent. Re-running deploy refreshes the checkout. The script is
 * tiny and always overwritten so changes here propagate cleanly.
 */
async function installGitReload(input: BootstrapInput): Promise<void> {
	const { client, machineId } = input;
	// Clone or fast-forward the repo. We use --depth 1 so the checkout
	// stays small; reload uses --depth 1 fetches too.
	await exec(
		client,
		machineId,
		`if [ ! -d ${VM_REPO_DIR}/.git ]; then ` +
			`  git clone --depth 1 --branch ${REPO_BRANCH} ${REPO_CLONE_URL} ${VM_REPO_DIR}; ` +
			`else ` +
			`  cd ${VM_REPO_DIR} && git fetch --depth 1 origin ${REPO_BRANCH} && git reset --hard origin/${REPO_BRANCH}; ` +
			`fi`,
	);
	dim(`  cloned ${REPO_CLONE_URL} -> ${VM_REPO_DIR}`);

	const script = buildReloadScript();
	const scriptB64 = Buffer.from(script).toString("base64");
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_APP_HOME}/scripts && ` +
			`echo ${scriptB64} | base64 -d > ${VM_RELOAD_SCRIPT} && ` +
			`chmod +x ${VM_RELOAD_SCRIPT}`,
	);
	dim(`  installed ${VM_RELOAD_SCRIPT}`);
}

async function configureHermes(input: BootstrapInput): Promise<void> {
	const { client, machineId, config, apiServerKey } = input;
	// Strip the optional "openai:" prefix from the model spec -- Hermes's
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
		["model.api_key", config.chatApiKey],
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
		"GATEWAY_ALLOW_ALL_USERS=true",
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
		`export NPM_CONFIG_PREFIX=${VM_NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${VM_NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${VM_PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${VM_AGENT_BROWSER_HOME}`,
		`export PATH=${VM_NPM_PREFIX}/bin:${VM_NODE_DIR}/bin:${VM_LOCAL_BIN}:${VM_VENV}/bin:$PATH`,
		`mkdir -p ${VM_HERMES_HOME}/logs ${VM_MACHINE_HOME}/logs/services`,
		`ln -sfn ${VM_GATEWAY_LOG} ${VM_MACHINE_HOME}/logs/services/hermes-gateway.log`,
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
		`export NPM_CONFIG_PREFIX=${VM_NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${VM_NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${VM_PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${VM_AGENT_BROWSER_HOME}`,
		`export PATH=${VM_NPM_PREFIX}/bin:${VM_NODE_DIR}/bin:${VM_LOCAL_BIN}:${VM_VENV}/bin:$PATH`,
		`mkdir -p ${VM_HERMES_HOME}/logs ${VM_MACHINE_HOME}/logs/services`,
		`ln -sfn ${dashLog} ${VM_MACHINE_HOME}/logs/services/hermes-dashboard.log`,
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

async function installNode({ client, machineId }: BootstrapInput): Promise<void> {
	if (
		await check(
			client,
			machineId,
			`[ -x ${VM_NODE_DIR}/bin/node ] && ${VM_NODE_DIR}/bin/node --version | grep -q '^v${NODE_MAJOR}'`,
		)
	) {
		dim(`  node ${NODE_MAJOR} already installed at ${VM_NODE_DIR}`);
		return;
	}
	// Resolve the latest v22.x.x linux-x64 tarball off nodejs.org and unpack
	// into /home/machine/node so it survives root-fs resets.
	const resolveScript =
		`url=$(curl -fsSL https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/ ` +
		`| grep -oE 'node-v${NODE_MAJOR}\\.[0-9]+\\.[0-9]+-linux-x64\\.tar\\.xz' | head -1) && ` +
		`echo "downloading $url" && ` +
		`curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/$url" -o /tmp/node.tar.xz && ` +
		`mkdir -p ${VM_NODE_DIR} && ` +
		`tar -xJf /tmp/node.tar.xz -C ${VM_NODE_DIR} --strip-components=1 && ` +
		`rm /tmp/node.tar.xz && ${VM_NODE_DIR}/bin/node --version`;
	await exec(client, machineId, resolveScript, { timeoutMs: 300_000 });
}

async function installClosedLoopTools({
	client,
	machineId,
}: BootstrapInput): Promise<void> {
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_NPM_PREFIX} ${VM_NPM_CACHE} ${VM_PLAYWRIGHT_BROWSERS} ${VM_AGENT_BROWSER_HOME}`,
	);
	const hasTools = await check(
		client,
		machineId,
		`${SHELL_ENV} && command -v agent-browser && command -v playwright && command -v httpx && ` +
			`ls ${VM_PLAYWRIGHT_BROWSERS}/chromium-* >/dev/null 2>&1`,
	);
	if (hasTools) {
		// Browser system libraries live on the resettable root filesystem, so
		// re-assert them even when the persistent browser cache is already warm.
		await exec(
			client,
			machineId,
			`${SHELL_ENV} && playwright install-deps chromium 2>&1 | tail -8`,
			{ timeoutMs: 300_000 },
		);
		dim("  closed-loop tools already installed");
		return;
	}
	await exec(
		client,
		machineId,
		`set -o pipefail; ${SHELL_ENV} && ` +
			`npm install -g --no-audit --no-fund --loglevel=error agent-browser playwright @playwright/mcp 2>&1 | tail -30 && ` +
			`playwright install --with-deps chromium 2>&1 | tail -20 && ` +
			`agent-browser install 2>&1 | tail -20 && ` +
			`uv tool install 'httpx[cli]' 2>&1 | tail -12`,
		{ timeoutMs: 900_000 },
	);
	await exec(
		client,
		machineId,
		`${SHELL_ENV} && command -v agent-browser && playwright --version && command -v httpx`,
	);
}

async function writeAgentEnvironmentDocs({
	client,
	machineId,
}: BootstrapInput): Promise<void> {
	const llmTxt = [
		"Agent Machines runtime context.",
		"",
		"Read /.agent/docs/agent-context.md before assuming which tools exist.",
		"Close the loop yourself: write code, start the service, hit the endpoint, inspect logs, fix, and retry.",
		"Use browser automation for UI verification, curl/httpx+jq for APIs, sqlite3 for local DBs, and ss/dig/curl -v for network debugging.",
		"Service logs are available at /.machine/logs/services/ with persistent originals under /home/machine.",
	].join("\n");
	const contextMd = [
		"# Agent Machine Context",
		"",
		"Agent Machines: a persistent Linux rig for Hermes, OpenClaw, Claude Code, or Codex. Providers: Dedalus Machines, E2B Sandbox, Sprites.",
		"",
		"## Persistent Paths",
		"",
		"- `/home/machine` survives sleep/wake on Dedalus; E2B/Sprites use their own home paths but same layout.",
		"- `/.agent` -> `~/.agent` machine-readable docs (this file).",
		"- `/.machine` -> `~/.machine` runtime state and service log symlinks.",
		"- `~/.agent-machines` runtime root: config, 161 skills, MCP catalog, crons, sessions, logs, chats, artifacts.",
		"- `HERMES_HOME` env var points at the same directory (required by the Hermes agent package).",
		"- `~/.openclaw` when OpenClaw is the selected agent runtime.",
		"- `/home/machine/agent-machines` git checkout for dashboard Reload (legacy: hermes-machines).",
		"",
		"## Built-in Agent Tools (22)",
		"",
		"terminal, read_file, write_file, patch, search, web_search, web_extract, browser_*, vision_analyze,",
		"image_generate, tts, execute_code, delegate_task, cronjob, skills_list, skill_view, memory, session_search, computer_use.",
		"",
		"## MCP Servers",
		"",
		"Catalog: `~/.agent-machines/mcps/catalog.json`. Active servers in `~/.agent-machines/config.yaml` under `mcp_servers`.",
		"Core: playwright (@playwright/mcp), cursor-bridge (cursor_agent/resume/list_skills/models when CURSOR_API_KEY set).",
		"Bundled (register when credentials exist): Vercel, Stripe, Supabase, Clerk, Firebase, Figma, PostHog, Sentry,",
		"Datadog, Linear, Slack, Sanity, ClickHouse, Neon, Upstash, Turso, Resend, Notion, Brave, Exa, Memory, Cloudflare, Grafana, GitHub.",
		"",
		"## Closed-Loop CLIs",
		"",
		"- Browser: agent-browser, playwright, npx @playwright/mcp (Chromium at ~/.cache/ms-playwright).",
		"- API: curl, jq, httpx.",
		"- DB: sqlite3.",
		"- Network: ss, dig, nc.",
		"",
		"## Inference",
		"",
		"OpenAI-compatible gateway on :8642 (Hermes) or :18789 (OpenClaw). Default upstream priority: Vercel AI Gateway, OpenRouter, then configured fallbacks.",
		"Also supports direct Anthropic, OpenAI, Google, or a custom base URL.",
		"",
		"## Default Loop",
		"",
		"1. Read AGENTS.md, MEMORY.md, and project instructions.",
		"2. Smallest viable change.",
		"3. Start service or test target.",
		"4. Verify with browser, curl/httpx, sqlite3, or test runner.",
		"5. Read logs at /.machine/logs/services/.",
		"6. Fix root cause; repeat.",
	].join("\n");
	const llmB64 = Buffer.from(llmTxt).toString("base64");
	const contextB64 = Buffer.from(contextMd).toString("base64");
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_AGENT_DOCS_DIR} ${VM_MACHINE_HOME}/logs/services && ` +
			`echo ${llmB64} | base64 -d > ${VM_AGENT_HOME}/llm.txt && ` +
			`echo ${contextB64} | base64 -d > ${VM_AGENT_DOCS_DIR}/agent-context.md && ` +
			`ln -sfn ${VM_AGENT_HOME} /.agent && ` +
			`ln -sfn ${VM_MACHINE_HOME} /.machine && ` +
			`ln -sfn ${VM_GATEWAY_LOG} ${VM_MACHINE_HOME}/logs/services/agent-gateway.log && ` +
			`ln -sfn ${VM_APP_HOME}/logs/dashboard.log ${VM_MACHINE_HOME}/logs/services/agent-dashboard.log`,
	);
}

async function installCursorBridge(input: BootstrapInput): Promise<void> {
	const { client, machineId, repoRoot, cursorApiKey } = input;
	if (!cursorApiKey) {
		dim("  CURSOR_API_KEY not set; skipping optional cursor-bridge build");
		return;
	}
	if (
		await check(
			client,
			machineId,
			`[ -x ${VM_BRIDGE_DIR}/dist/server.js ] && [ -d ${VM_BRIDGE_DIR}/node_modules ]`,
		)
	) {
		dim("  cursor-bridge already built");
		return;
	}
	await exec(client, machineId, `mkdir -p ${VM_BRIDGE_DIR}`);
	const bridgeRoot = resolvePath(repoRoot, "mcp", "cursor-bridge");
	const result = await uploadKnowledge(
		client,
		machineId,
		bridgeRoot,
		VM_BRIDGE_DIR,
	);
	dim(`  uploaded bridge: ${(result.sizeBytes / 1024).toFixed(1)} KB`);
	// `set -o pipefail` is critical here: without it, a broken `npm install`
	// pipes its error into `tail -30` which exits 0, masking the real failure
	// and leaving the gateway with no bridge to connect to. We saw this fail
	// silently in production -- the bridge dir had source but no node_modules
	// or dist, the gateway failed its 3 MCP connection retries, and the deploy
	// only noticed because the gateway's port-bind raced with our check.
	//
	// `chmod +x dist/server.js` after build because the package.json declares
	// `bin: { "cursor-bridge": "./dist/server.js" }`, but npm only sets the
	// executable bit when the package is *installed* (linked), not when its
	// own `npm run build` finishes. Skipping this leaves the file readable
	// but not executable, which trips the `[ -x ... ]` check below and
	// fails the entire deploy mid-bootstrap.
	await exec(
		client,
		machineId,
		`set -o pipefail; ${SHELL_ENV} && cd ${VM_BRIDGE_DIR} && rm -rf node_modules dist && ` +
			`npm install --no-audit --no-fund 2>&1 | tail -30 && ` +
			`npm run build 2>&1 | tail -10 && ` +
			`chmod +x dist/server.js`,
		{ timeoutMs: 600_000 },
	);
	// Hard-fail if the build artifact isn't where we expect it.
	const built = await check(
		client,
		machineId,
		`[ -x ${VM_BRIDGE_DIR}/dist/server.js ] && [ -d ${VM_BRIDGE_DIR}/node_modules/@cursor/sdk ]`,
	);
	if (!built) {
		throw new Error(
			`cursor-bridge build artifact missing at ${VM_BRIDGE_DIR}/dist/server.js after install. ` +
				`Inspect ${VM_BRIDGE_DIR} on the VM to debug.`,
		);
	}
}

async function registerMcpServers(input: BootstrapInput): Promise<void> {
	const { client, machineId, cursorApiKey, repoRoot } = input;
	const catalog = loadMcpCatalog(repoRoot);
	const ctx = defaultMcpRegisterContext();
	const scriptPath = `${VM_HERMES_HOME}/.register-mcp-servers.py`;
	const scriptBody = buildMcpRegisterScript(catalog.servers, ctx);
	const scriptB64 = Buffer.from(scriptBody).toString("base64");
	await exec(
		client,
		machineId,
		`echo ${scriptB64} | base64 -d > ${scriptPath}`,
	);
	const stdout = await execOut(
		client,
		machineId,
		`${SHELL_ENV} && python3 ${scriptPath}`,
	);
	if (stdout) dim(`  ${stdout.split("\n")[0]}`);

	if (cursorApiKey) {
		const line = `CURSOR_API_KEY=${cursorApiKey}`;
		await exec(
			client,
			machineId,
			`touch ${VM_HERMES_HOME}/.env && ` +
				`grep -v '^CURSOR_API_KEY=' ${VM_HERMES_HOME}/.env > ${VM_HERMES_HOME}/.env.tmp || true && ` +
				`echo '${line}' >> ${VM_HERMES_HOME}/.env.tmp && ` +
				`mv ${VM_HERMES_HOME}/.env.tmp ${VM_HERMES_HOME}/.env && ` +
				`chmod 600 ${VM_HERMES_HOME}/.env`,
		);
	} else {
		dim("  CURSOR_API_KEY not set; cursor-bridge registers only when key is present");
	}
}

const KEEPALIVE_SCRIPT = `${VM_HOME}/.machine/keepalive.sh`;
const KEEPALIVE_CRON_ID = "dedalus-keepalive";

async function configureAutosleep({
	client,
	machineId,
	config,
}: BootstrapInput): Promise<void> {
	if (config.autosleep) {
		await exec(
			client,
			machineId,
			`rm -f ${KEEPALIVE_SCRIPT} && ` +
				`(crontab -l 2>/dev/null | grep -v '${KEEPALIVE_CRON_ID}' | crontab - 2>/dev/null) || true`,
		);
		dim("  keepalive removed (if present)");
		return;
	}
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_HOME}/.machine && cat > ${KEEPALIVE_SCRIPT} << 'KEEPALIVE_EOF'\n` +
			`#!/bin/sh\n` +
			`# ${KEEPALIVE_CRON_ID}: ping every 3 min to prevent Dedalus autosleep (300s idle)\n` +
			`echo "keepalive $(date -Is)" >> ${VM_HOME}/.machine/keepalive.log\n` +
			`KEEPALIVE_EOF\n` +
			`chmod +x ${KEEPALIVE_SCRIPT}`,
	);
	await exec(
		client,
		machineId,
		`(crontab -l 2>/dev/null | grep -v '${KEEPALIVE_CRON_ID}'; ` +
			`echo '*/3 * * * * ${KEEPALIVE_SCRIPT} # ${KEEPALIVE_CRON_ID}') | crontab -`,
	);
	dim("  cron keepalive every 3 min installed");
}

export async function runBootstrap(input: BootstrapInput): Promise<void> {
	await phase("Migrate legacy paths (~/.hermes -> ~/.agent-machines)", () =>
		migrateLegacyPaths(input),
	);
	await phase("Install system deps (curl, git, build-essential)", () => systemDeps(input));
	await phase("Install uv (Python package manager)", () => installUv(input));
	await phase("Install Hermes Agent (this can take a few minutes)", () => installHermes(input));
	await phase(`Install Node.js ${NODE_MAJOR}.x (for the Cursor SDK bridge)`, () => installNode(input));
	await phase("Install closed-loop dev tools (browser, API, DB, network)", () =>
		installClosedLoopTools(input),
	);
	await phase("Write machine context docs (/.agent + /.machine)", () =>
		writeAgentEnvironmentDocs(input),
	);
	await phase("Seed knowledge base (skills, persona, memory)", () => seedKnowledge(input));
	await phase("Install git-backed reload helper (for dashboard)", () => installGitReload(input));
	await phase("Build cursor-bridge MCP server (Cursor SDK)", () => installCursorBridge(input));
	await phase("Configure Hermes (provider, model, API server, memory)", () => configureHermes(input));
	await phase("Register MCP servers (playwright, cursor, credential-gated bundled)", () =>
		registerMcpServers(input),
	);
	await phase("Seed scheduled cron automations", () => seedCronJobs(input));
	await phase(`Start gateway + API server on :${PORT_API}`, () => startGateway(input));
	await phase(`Start web dashboard on :${PORT_DASHBOARD}`, () => startDashboard(input));
	await phase(
		input.config.autosleep
			? "Autosleep: enabled (default 300s idle)"
			: "Autosleep: disabled (keepalive installed)",
		() => configureAutosleep(input),
	);
	await phase("Record deploy version", () => recordVersion(input));
}
