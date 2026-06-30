/**
 * `npm run doctor` -- fully end-to-end health check for every moving part.
 *
 * Sections:
 *   1. Local environment   (Node, npm, tsx, deps, .env, state file, typecheck)
 *   2. Dedalus API         (key valid, machine exists, phase, shape, previews)
 *   3. VM system deps      (curl git gcc jq sqlite3 dig ss nc rsync cron)
 *   4. VM toolchain        (uv, Python venv, hermes binary + extras, Node.js)
 *   5. VM services          (gateway :8642 process + port, dashboard :9119, OpenClaw :18789, logs, .env, config.yaml)
 *   6. VM knowledge         (skills, SOUL/USER/MEMORY/AGENTS, cron seed, cron jobs)
 *   7. VM closed-loop       (agent-browser, playwright, httpx, chromium, cloudflared)
 *   8. VM cursor bridge     (build artifact, MCP config, CURSOR_API_KEY in .env)
 *   9. VM git-reload        (repo clone, reload script)
 *  10. VM persistent paths  (directory tree, disk usage, symlinks)
 *  11. VM app data          (chats, artifacts, sessions, settings)
 *  12. VM autosleep/cron    (keepalive script if autosleep=off, system crontab)
 *  13. Fleet + multi-machine (machine-state.json fields, all preview URLs reachable)
 *  14. API health external  (/v1/models, auth enforcement, response shape)
 *  15. End-to-end chat      (real chat completion through the gateway)
 *  16. Web dashboard        (deps, .env.local, all required keys, skills.json freshness, typecheck)
 *  17. Live-fire QA checks  (dpkg lock readiness, gateway log recency, quota headroom, routing sanity)
 *
 * Every check runs a real bash command. The doctor never modifies state.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { probeApi } from "../lib/api.js";
import { loadState, makeClient } from "../lib/client.js";
import {
	DEPLOY_VERSION,
	NODE_MAJOR,
	PORT_API,
	PORT_DASHBOARD,
	SHELL_ENV,
	VM_AGENT_BROWSER_HOME,
	VM_AGENT_DOCS_DIR,
	VM_AGENT_HOME,
	VM_BRIDGE_DIR,
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
	VM_VENV,
} from "../lib/constants.js";
import { loadConfig, type Config } from "../lib/env.js";
import { check, execOut } from "../lib/exec.js";
import { getMachine } from "../lib/machine.js";
import { dim, fail, header, success, warn } from "../lib/progress.js";

function repoRoot(): string {
	const here = fileURLToPath(import.meta.url);
	return resolve(here, "..", "..", "..");
}

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(name: string, detail = ""): void {
	passCount++;
	success(`${name}${detail ? `  ${detail}` : ""}`);
}

function FAIL(name: string, detail: string): void {
	failCount++;
	fail(`${name}  ${detail}`);
}

function WARN(name: string, detail: string): void {
	warnCount++;
	warn(`${name}  ${detail}`);
}

function localCmd(cmd: string, cwd?: string): string | null {
	try {
		return execSync(cmd, {
			encoding: "utf8",
			timeout: 30_000,
			stdio: ["pipe", "pipe", "pipe"],
			cwd: cwd ?? repoRoot(),
		}).trim();
	} catch {
		return null;
	}
}

type JsonObject = Record<string, unknown>;

type ChatProbe = {
	content: string;
	streamed: boolean;
	parsedJson: boolean;
	id?: string;
	model?: string;
	usageTokens?: number;
	error?: unknown;
};

function isRecord(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstChoice(payload: JsonObject): JsonObject | null {
	const choices = payload.choices;
	if (!Array.isArray(choices)) return null;
	const [choice] = choices;
	return isRecord(choice) ? choice : null;
}

function chatContentFrom(choice: JsonObject | null): string {
	if (!choice) return "";
	const delta = isRecord(choice.delta) ? choice.delta : null;
	const message = isRecord(choice.message) ? choice.message : null;
	const deltaContent = typeof delta?.content === "string" ? delta.content : "";
	const messageContent = typeof message?.content === "string" ? message.content : "";
	return deltaContent || messageContent;
}

function parseChatProbe(raw: string): ChatProbe {
	const probe: ChatProbe = {
		content: "",
		streamed: false,
		parsedJson: false,
	};
	const collect = (payload: JsonObject): void => {
		if (payload.error) probe.error = payload.error;
		if (!probe.id && typeof payload.id === "string") probe.id = payload.id;
		if (!probe.model && typeof payload.model === "string") probe.model = payload.model;
		const usage = isRecord(payload.usage) ? payload.usage : null;
		if (usage && typeof usage.total_tokens === "number") {
			probe.usageTokens = usage.total_tokens;
		}
		probe.content += chatContentFrom(firstChoice(payload));
	};

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (isRecord(parsed)) {
			probe.parsedJson = true;
			collect(parsed);
			return probe;
		}
	} catch {
		// Fall through to streaming SSE parsing.
	}

	probe.streamed = true;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith("data:")) continue;
		const payload = line.slice(5).trim();
		if (!payload || payload === "[DONE]") continue;
		try {
			const parsed = JSON.parse(payload) as unknown;
			if (isRecord(parsed)) collect(parsed);
		} catch {
			// Ignore malformed progress lines and keep reading the stream.
		}
	}
	return probe;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Local environment
// ═══════════════════════════════════════════════════════════════════

async function checkLocalEnv(): Promise<Config | null> {
	header("1 · Local environment");

	const nodeVersion = localCmd("node --version");
	if (nodeVersion) {
		const major = Number.parseInt(nodeVersion.replace("v", ""), 10);
		major >= 20
			? pass("Node.js", nodeVersion)
			: FAIL("Node.js", `${nodeVersion} -- need >=20`);
	} else {
		FAIL("Node.js", "not found in PATH");
	}

	localCmd("npm --version")
		? pass("npm", `v${localCmd("npm --version")}`)
		: FAIL("npm", "not found");

	localCmd("npx tsx --version 2>/dev/null")
		? pass("tsx", localCmd("npx tsx --version 2>/dev/null")!)
		: FAIL("tsx", "not found -- run npm install");

	existsSync(resolve(repoRoot(), "node_modules"))
		? pass("node_modules")
		: FAIL("node_modules", "missing -- run npm install");

	const lockAge = (() => {
		try {
			const stat = statSync(resolve(repoRoot(), "node_modules/.package-lock.json"));
			const days = (Date.now() - stat.mtimeMs) / 86_400_000;
			return days;
		} catch {
			return null;
		}
	})();
	if (lockAge !== null) {
		lockAge < 30
			? pass("node_modules freshness", `${Math.round(lockAge)}d old`)
			: WARN("node_modules freshness", `${Math.round(lockAge)}d old -- consider npm install`);
	}

	existsSync(resolve(repoRoot(), ".env"))
		? pass(".env file")
		: FAIL(".env file", "copy .env.example to .env");

	let config: Config | null = null;
	try {
		config = loadConfig();
		pass("DEDALUS_API_KEY", "loaded, non-placeholder");
	} catch (err) {
		FAIL("DEDALUS_API_KEY", (err instanceof Error ? err.message : String(err)).split("\n")[0]);
	}

	if (config) {
		pass("Model configured", config.model);
		pass("Chat gateway", config.chatBaseUrl);
		pass("Machine spec", `${config.vcpu} vCPU · ${config.memoryMib} MiB · ${config.storageGib} GiB`);
		config.autosleep ? pass("Autosleep", "on") : WARN("Autosleep", "off -- keepalive cron should be installed");

		config.cursorApiKey ? pass("CURSOR_API_KEY", "set") : dim("  CURSOR_API_KEY not set (optional)");
		config.anthropicApiKey ? pass("ANTHROPIC_API_KEY", "set") : dim("  ANTHROPIC_API_KEY not set (optional)");
		config.openaiApiKey ? pass("OPENAI_API_KEY", "set") : dim("  OPENAI_API_KEY not set (optional)");
		process.env.AI_GATEWAY_API_KEY
			? pass("AI_GATEWAY_API_KEY", "set")
			: dim("  AI_GATEWAY_API_KEY not set (preferred)");
		process.env.OPENROUTER_API_KEY
			? pass("OPENROUTER_API_KEY", "set")
			: dim("  OPENROUTER_API_KEY not set (fallback)");
		config.aiGatewayUrl ? pass("AI_GATEWAY_URL", config.aiGatewayUrl) : dim("  AI_GATEWAY_URL not set (optional)");
	}

	const stateFile = resolve(repoRoot(), ".machine-state.json");
	if (existsSync(stateFile)) {
		try {
			const state = JSON.parse(readFileSync(stateFile, "utf8"));
			if (state.machineId) {
				pass(".machine-state.json", `machine: ${state.machineId}`);
				state.deployVersion === DEPLOY_VERSION
					? pass("Deploy version", `${state.deployVersion} (current)`)
					: WARN("Deploy version", `${state.deployVersion} -- current is ${DEPLOY_VERSION}, redeploy recommended`);
				state.apiPreviewUrl
					? pass("Saved API URL", state.apiPreviewUrl)
					: WARN("Saved API URL", "not recorded");
				state.dashboardPreviewUrl
					? pass("Saved dashboard URL", state.dashboardPreviewUrl)
					: WARN("Saved dashboard URL", "not recorded");
			} else {
				WARN(".machine-state.json", "no machineId");
			}
		} catch {
			FAIL(".machine-state.json", "parse failed");
		}
	} else {
		WARN(".machine-state.json", "not found -- run npm run deploy");
	}

	const typecheck = localCmd("npx tsc --noEmit 2>&1");
	typecheck !== null && !typecheck.includes("error TS")
		? pass("TypeScript (CLI)", "tsc --noEmit clean")
		: FAIL("TypeScript (CLI)", typecheck?.split("\n").slice(0, 3).join(" | ") ?? "failed");

	return config;
}

// ═══════════════════════════════════════════════════════════════════
// 2. Dedalus API + machine
// ═══════════════════════════════════════════════════════════════════

async function checkDedalusApi(): Promise<{
	machineId: string;
	client: ReturnType<typeof makeClient>;
} | null> {
	header("2 · Dedalus API + machine");

	const state = loadState();
	if (!state?.machineId) {
		FAIL("Machine state", "no machineId -- run npm run deploy");
		return null;
	}

	let config: Config;
	try {
		config = loadConfig();
	} catch {
		FAIL("Config", "cannot load .env");
		return null;
	}
	const client = makeClient(config);

	let machine;
	try {
		machine = await getMachine(client, state.machineId);
		pass("Machine reachable", `${state.machineId}`);
	} catch (err) {
		FAIL("Machine reachable", (err instanceof Error ? err.message : String(err)).slice(0, 200));
		return null;
	}

	if (machine.status.phase === "running") {
		pass("Machine phase", "running");
	} else {
		FAIL("Machine phase", `${machine.status.phase} -- run npm run wake`);
		return null;
	}

	pass("Machine shape", `${machine.vcpu} vCPU, ${machine.memory_mib} MiB, ${machine.storage_gib} GiB`);

	// Check all preview URLs
	try {
		const previews = await client.machines.previews.list({ machine_id: state.machineId });
		const items = previews.items ?? [];
		if (items.length > 0) {
			pass("Preview URLs", `${items.length} configured`);
			for (const p of items) {
				p.status === "ready"
					? pass(`  Preview :${p.port}`, p.url ?? "ready")
					: WARN(`  Preview :${p.port}`, `status: ${p.status}`);
			}
		} else {
			WARN("Preview URLs", "none configured");
		}
	} catch {
		WARN("Preview URLs", "could not list (org may not support previews)");
	}

	return { machineId: state.machineId, client };
}

// ═══════════════════════════════════════════════════════════════════
// 3. VM system deps
// ═══════════════════════════════════════════════════════════════════

async function checkVmSystemDeps(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("3 · VM system deps");

	const bins = [
		"curl", "git", "gcc", "jq", "sqlite3", "dig", "ss", "nc",
		"tar", "gzip", "base64", "awk", "xargs", "setsid", "crontab",
	] as const;
	for (const bin of bins) {
		(await check(client, id, `command -v ${bin}`))
			? pass(bin)
			: FAIL(bin, "missing");
	}

	// rsync is used by reload-from-git.sh but optional
	(await check(client, id, `command -v rsync`))
		? pass("rsync")
		: WARN("rsync", "missing -- reload will fall back to cp");
}

// ═══════════════════════════════════════════════════════════════════
// 4. VM toolchain
// ═══════════════════════════════════════════════════════════════════

async function checkVmToolchain(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("4 · VM toolchain");

	if (await check(client, id, `${SHELL_ENV} && command -v uv`)) {
		pass("uv", (await execOut(client, id, `${SHELL_ENV} && uv --version 2>/dev/null`)).split("\n")[0]);
	} else {
		FAIL("uv", "not found");
	}

	if (await check(client, id, `[ -d ${VM_VENV} ] && [ -x ${VM_VENV}/bin/python ]`)) {
		pass("Python venv", (await execOut(client, id, `${VM_VENV}/bin/python --version`)).split("\n")[0]);
	} else {
		FAIL("Python venv", "not found");
	}

	if (await check(client, id, `${SHELL_ENV} && [ -x ${VM_VENV}/bin/hermes ] && hermes --version >/dev/null 2>&1`)) {
		pass("Hermes binary", (await execOut(client, id, `${SHELL_ENV} && hermes --version 2>/dev/null`)).split("\n")[0]);
	} else {
		FAIL("Hermes binary", "not found or broken");
	}

	const imports = ["fastapi", "mcp", "aiohttp", "uvicorn", "yaml"];
	for (const mod of imports) {
		(await check(client, id, `${SHELL_ENV} && ${VM_VENV}/bin/python -c 'import ${mod}' 2>/dev/null`))
			? pass(`Python ${mod}`)
			: FAIL(`Python ${mod}`, "import failed");
	}

	if (await check(client, id, `[ -x ${VM_NODE_DIR}/bin/node ]`)) {
		const nVer = (await execOut(client, id, `${VM_NODE_DIR}/bin/node --version`)).split("\n")[0];
		nVer.includes(`v${NODE_MAJOR}`)
			? pass("Node.js (VM)", nVer)
			: WARN("Node.js (VM)", `${nVer} -- expected v${NODE_MAJOR}.x`);
	} else {
		FAIL("Node.js (VM)", "not found");
	}

	if (await check(client, id, `[ -x ${VM_NODE_DIR}/bin/npm ]`)) {
		pass("npm (VM)", (await execOut(client, id, `${VM_NODE_DIR}/bin/npm --version 2>/dev/null`)).split("\n")[0]);
	} else {
		WARN("npm (VM)", "not found");
	}
}

// ═══════════════════════════════════════════════════════════════════
// 5. VM services
// ═══════════════════════════════════════════════════════════════════

async function checkVmServices(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("5 · VM services");

	// Gateway
	const gwBound = await check(client, id, `ss -tlnp | grep ':${PORT_API}'`);
	gwBound ? pass(`Gateway :${PORT_API}`, "bound") : FAIL(`Gateway :${PORT_API}`, "not bound");

	const gwProc = await check(client, id, `ps -eo cmd | grep -q '[h]ermes gateway'`);
	gwProc ? pass("Gateway process", "alive") : FAIL("Gateway process", "not running");

	// Internal loopback health
	if (gwBound) {
		const state = loadState();
		if (state?.apiServerKey) {
			const internal = await check(
				client, id,
				`${SHELL_ENV} && curl -sf --max-time 5 ` +
					`-H "Authorization: Bearer ${state.apiServerKey}" ` +
					`http://127.0.0.1:${PORT_API}/v1/models >/dev/null`,
			);
			internal ? pass("Gateway loopback /v1/models", "200 OK") : FAIL("Gateway loopback", "failed");
		}
	}

	// Dashboard
	const dashBound = await check(client, id, `ss -tlnp | grep ':${PORT_DASHBOARD}'`);
	dashBound ? pass(`Dashboard :${PORT_DASHBOARD}`, "bound") : WARN(`Dashboard :${PORT_DASHBOARD}`, "not bound (non-fatal)");

	// OpenClaw (optional)
	const ocBound = await check(client, id, `ss -tln 2>/dev/null | awk '{print $4}' | grep -q ':18789$'`);
	if (ocBound) {
		pass("OpenClaw :18789", "bound");
		const ocProc = await check(client, id, `ps -eo cmd | grep -q '[o]penclaw gateway'`);
		ocProc ? pass("OpenClaw process") : WARN("OpenClaw process", "port bound but no process?");
	} else {
		dim("  OpenClaw :18789 not bound (not installed or not selected)");
	}

	// Cloudflared tunnels
	const cfPids = await execOut(client, id, `pgrep -c cloudflared 2>/dev/null || echo 0`);
	const cfCount = Number.parseInt(cfPids.trim(), 10) || 0;
	if (cfCount > 0) {
		pass("Cloudflared tunnels", `${cfCount} process(es)`);
	} else {
		dim("  No cloudflared tunnels running (using Dedalus previews)");
	}

	// Gateway log health
	const logPath = `${VM_HERMES_HOME}/logs/gateway.log`;
	if (await check(client, id, `[ -s ${logPath} ]`)) {
		const errors = await execOut(client, id, `grep -ci 'ERROR\\|CRITICAL\\|Traceback' ${logPath} 2>/dev/null || echo 0`);
		const count = Number.parseInt(errors.trim(), 10) || 0;
		count === 0
			? pass("Gateway log", "no errors")
			: WARN("Gateway log", `${count} error lines`);

		const lastLine = await execOut(client, id, `tail -1 ${logPath} 2>/dev/null`);
		if (lastLine) dim(`  last log: ${lastLine.slice(0, 120)}`);
	} else {
		WARN("Gateway log", "empty or missing");
	}

	// Hermes .env completeness
	if (await check(client, id, `[ -f ${VM_HERMES_HOME}/.env ]`)) {
		const envKeys = ["API_SERVER_ENABLED", "API_SERVER_KEY", "API_SERVER_HOST", "API_SERVER_PORT", "GATEWAY_ALLOW_ALL_USERS"];
		for (const key of envKeys) {
			(await check(client, id, `grep -q '^${key}=' ${VM_HERMES_HOME}/.env`))
				? pass(`VM .env ${key}`)
				: FAIL(`VM .env ${key}`, "missing");
		}
	} else {
		FAIL("Hermes .env", "file not found");
	}

	// config.yaml validation
	if (await check(client, id, `[ -f ${VM_HERMES_HOME}/config.yaml ]`)) {
		pass("config.yaml", "exists");
		const modelSet = await check(client, id, `grep -q 'model' ${VM_HERMES_HOME}/config.yaml`);
		modelSet ? pass("config.yaml model") : WARN("config.yaml model", "not found in config");
		const providerSet = await check(client, id, `grep -q 'provider' ${VM_HERMES_HOME}/config.yaml`);
		providerSet ? pass("config.yaml provider") : WARN("config.yaml provider", "not found in config");
	} else {
		FAIL("config.yaml", "not found");
	}

	// Start scripts
	for (const script of ["start-gateway.sh", "start-dashboard.sh"] as const) {
		(await check(client, id, `[ -x ${VM_HOME}/${script} ]`))
			? pass(`${script}`, "executable")
			: WARN(`${script}`, "missing or not executable");
	}
}

// ═══════════════════════════════════════════════════════════════════
// 6. VM knowledge
// ═══════════════════════════════════════════════════════════════════

async function checkVmKnowledge(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("6 · VM knowledge + persona");

	const skillCount = await execOut(client, id, `ls -1d ${VM_HERMES_HOME}/skills/*/ 2>/dev/null | wc -l`);
	const count = Number.parseInt(skillCount.trim(), 10) || 0;
	count > 0 ? pass("Skills", `${count} loaded`) : FAIL("Skills", "0 found");

	for (const file of ["SOUL.md", "USER.md", "MEMORY.md", "AGENTS.md"] as const) {
		(await check(client, id, `[ -s ${VM_HERMES_HOME}/${file} ]`))
			? pass(file)
			: WARN(file, "missing or empty");
	}

	(await check(client, id, `[ -f ${VM_HERMES_HOME}/crons/.seeded ]`))
		? pass("Cron seed marker")
		: WARN("Cron seed marker", "not applied");

	const cronCount = await execOut(client, id, `${SHELL_ENV} && hermes cron list 2>/dev/null | grep -c '^' || echo 0`);
	const crons = Number.parseInt(cronCount.trim(), 10) || 0;
	crons > 0 ? pass("Cron jobs", `${crons} registered`) : WARN("Cron jobs", "0 registered");
}

// ═══════════════════════════════════════════════════════════════════
// 7. VM closed-loop tools
// ═══════════════════════════════════════════════════════════════════

async function checkVmClosedLoop(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("7 · VM closed-loop tools");

	const tools = [
		{ name: "agent-browser", cmd: `${SHELL_ENV} && command -v agent-browser` },
		{ name: "playwright", cmd: `${SHELL_ENV} && command -v playwright` },
		{ name: "httpx", cmd: `${SHELL_ENV} && command -v httpx` },
		{ name: "@playwright/mcp", cmd: `${SHELL_ENV} && npm list -g @playwright/mcp 2>/dev/null | grep -q playwright` },
	] as const;

	for (const tool of tools) {
		(await check(client, id, tool.cmd))
			? pass(tool.name)
			: FAIL(tool.name, "not installed");
	}

	(await check(client, id, `ls ${VM_PLAYWRIGHT_BROWSERS}/chromium-* >/dev/null 2>&1`))
		? pass("Chromium cache")
		: FAIL("Chromium cache", "missing");

	// Chromium system deps (lives on resettable root fs)
	const chromiumLibs = await check(
		client, id,
		`ldd /usr/lib/*/libatk-1.0.so.0 >/dev/null 2>&1 || ldconfig -p 2>/dev/null | grep -q libatk`,
	);
	chromiumLibs
		? pass("Chromium system libs")
		: WARN("Chromium system libs", "possibly missing -- playwright install-deps chromium");

	(await check(client, id, `[ -x ${VM_LOCAL_BIN}/cloudflared ]`))
		? pass("cloudflared binary")
		: dim("  cloudflared not installed (uses Dedalus previews instead)");
}

// ═══════════════════════════════════════════════════════════════════
// 8. VM cursor bridge
// ═══════════════════════════════════════════════════════════════════

async function checkVmCursorBridge(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("8 · VM cursor bridge");

	let config: Config;
	try {
		config = loadConfig();
	} catch {
		WARN("Cursor bridge", "cannot load config");
		return;
	}

	if (!config.cursorApiKey) {
		dim("  CURSOR_API_KEY not set; bridge checks skipped");
		return;
	}

	(await check(client, id, `[ -x ${VM_BRIDGE_DIR}/dist/server.js ]`))
		? pass("Build artifact", "dist/server.js")
		: FAIL("Build artifact", "missing");

	(await check(client, id, `[ -d ${VM_BRIDGE_DIR}/node_modules/@cursor/sdk ]`))
		? pass("@cursor/sdk installed")
		: FAIL("@cursor/sdk", "node_modules missing");

	(await check(client, id, `grep -q 'cursor' ${VM_HERMES_HOME}/config.yaml 2>/dev/null`))
		? pass("MCP registered in config.yaml")
		: FAIL("MCP registered", "not in config.yaml");

	(await check(client, id, `grep -q '^CURSOR_API_KEY=' ${VM_HERMES_HOME}/.env 2>/dev/null`))
		? pass("CURSOR_API_KEY in VM .env")
		: FAIL("CURSOR_API_KEY in VM .env", "missing");
}

// ═══════════════════════════════════════════════════════════════════
// 9. VM git-reload
// ═══════════════════════════════════════════════════════════════════

async function checkVmGitReload(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("9 · VM git-reload helper");

	if (await check(client, id, `[ -d ${VM_REPO_DIR}/.git ]`)) {
		const sha = (await execOut(client, id, `cd ${VM_REPO_DIR} && git rev-parse --short HEAD`)).split("\n")[0];
		const branch = (await execOut(client, id, `cd ${VM_REPO_DIR} && git branch --show-current 2>/dev/null || echo detached`)).split("\n")[0];
		pass("Repo cloned", `${branch} @ ${sha}`);
	} else {
		FAIL("Repo cloned", `${VM_REPO_DIR} missing`);
	}

	(await check(client, id, `[ -x ${VM_RELOAD_SCRIPT} ]`))
		? pass("Reload script", "executable")
		: FAIL("Reload script", "missing or not executable");

	// Check last reload timestamp
	if (await check(client, id, `[ -f ${VM_HERMES_HOME}/.last-reload ]`)) {
		const ts = (await execOut(client, id, `cat ${VM_HERMES_HOME}/.last-reload`)).trim();
		pass("Last reload", ts);
	} else {
		dim("  No reload timestamp (never reloaded from git)");
	}
}

// ═══════════════════════════════════════════════════════════════════
// 10. VM persistent paths
// ═══════════════════════════════════════════════════════════════════

async function checkVmPersistence(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("10 · VM persistent paths");

	const dirs = [
		[VM_HOME, "/home/machine"],
		[VM_HERMES_HOME, "~/.agent-machines"],
		[`${VM_HERMES_HOME}/skills`, "~/.agent-machines/skills"],
		[`${VM_HERMES_HOME}/logs`, "~/.agent-machines/logs"],
		[`${VM_HERMES_HOME}/crons`, "~/.agent-machines/crons"],
		[VM_AGENT_HOME, "~/.agent"],
		[VM_AGENT_DOCS_DIR, "~/.agent/docs"],
		[VM_MACHINE_HOME, "~/.machine"],
		[`${VM_MACHINE_HOME}/logs/services`, "~/.machine/logs/services"],
		[VM_VENV, "~/.venv"],
		[VM_NODE_DIR, "~/node"],
		[VM_NPM_PREFIX, "~/.npm-global"],
		[VM_NPM_CACHE, "~/.npm-cache"],
		[VM_PLAYWRIGHT_BROWSERS, "~/.cache/ms-playwright"],
		[VM_AGENT_BROWSER_HOME, "~/.agent-browser"],
	] as const;

	for (const [path, label] of dirs) {
		(await check(client, id, `[ -d ${path} ]`))
			? pass(label)
			: FAIL(label, "missing");
	}

	// Symlinks
	(await check(client, id, `[ -L /.agent ]`))
		? pass("/.agent symlink")
		: WARN("/.agent symlink", "missing");

	(await check(client, id, `[ -L /.machine ]`))
		? pass("/.machine symlink")
		: WARN("/.machine symlink", "missing");

	// Disk
	const diskUsage = (await execOut(client, id,
		`df -h ${VM_HOME} 2>/dev/null | tail -1 | awk '{print "used: "$3" / "$2" ("$5" full)"}'`,
	)).trim();
	if (diskUsage) pass("Disk usage", diskUsage);

	const venvSize = (await execOut(client, id, `du -sh ${VM_VENV} 2>/dev/null | awk '{print $1}'`)).trim();
	if (venvSize) dim(`  venv size: ${venvSize}`);

	const chromiumSize = (await execOut(client, id, `du -sh ${VM_PLAYWRIGHT_BROWSERS} 2>/dev/null | awk '{print $1}'`)).trim();
	if (chromiumSize) dim(`  chromium cache: ${chromiumSize}`);
}

// ═══════════════════════════════════════════════════════════════════
// 11. VM app data
// ═══════════════════════════════════════════════════════════════════

async function checkVmAppData(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("11 · VM app data (~/.agent-machines)");

	const appHome = `${VM_HOME}/.agent-machines`;

	(await check(client, id, `[ -d ${appHome} ]`))
		? pass("App data root")
		: WARN("App data root", "not yet created (first chat creates it)");

	// Chats
	const chatCount = await execOut(client, id, `ls -1 ${appHome}/chats/*.json 2>/dev/null | grep -v _index | wc -l`);
	const chats = Number.parseInt(chatCount.trim(), 10) || 0;
	if (chats > 0) {
		pass("Persisted chats", `${chats} files`);
		(await check(client, id, `[ -f ${appHome}/chats/_index.json ]`))
			? pass("Chat index")
			: WARN("Chat index", "missing -- will rebuild on next list");
	} else {
		dim("  No persisted chats yet");
	}

	// Artifacts
	const artifactCount = await execOut(client, id, `find ${appHome}/artifacts -type f 2>/dev/null | wc -l`);
	const artifacts = Number.parseInt(artifactCount.trim(), 10) || 0;
	if (artifacts > 0) {
		pass("Artifacts", `${artifacts} files`);
	} else {
		dim("  No artifacts yet");
	}

	// Sessions (Hermes SQLite)
	const sessionCount = await execOut(client, id, `find ${appHome}/sessions -name '*.db' 2>/dev/null | wc -l`);
	const sessions = Number.parseInt(sessionCount.trim(), 10) || 0;
	if (sessions > 0) {
		pass("Session DBs", `${sessions} files`);
	} else {
		dim("  No session DBs yet");
	}

	// Settings
	(await check(client, id, `[ -f ${appHome}/settings.json ]`))
		? pass("settings.json")
		: dim("  No settings.json yet (web bootstrap writes this)");

	// Memory persistence
	if (await check(client, id, `[ -d ${VM_HERMES_HOME}/sessions ]`)) {
		const memFiles = await execOut(client, id, `ls -1 ${VM_HERMES_HOME}/sessions/ 2>/dev/null | wc -l`);
		const memCount = Number.parseInt(memFiles.trim(), 10) || 0;
		memCount > 0
			? pass("Hermes session store", `${memCount} entries`)
			: dim("  Hermes session store empty");
	}
}

// ═══════════════════════════════════════════════════════════════════
// 12. VM autosleep / system cron
// ═══════════════════════════════════════════════════════════════════

async function checkVmAutosleep(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("12 · VM autosleep + system cron");

	let config: Config;
	try {
		config = loadConfig();
	} catch {
		return;
	}

	const keepaliveScript = `${VM_MACHINE_HOME}/keepalive.sh`;
	const hasKeepalive = await check(client, id, `[ -x ${keepaliveScript} ]`);
	const keepaliveCron = await check(client, id, `crontab -l 2>/dev/null | grep -q 'dedalus-keepalive'`);

	if (config.autosleep) {
		if (hasKeepalive || keepaliveCron) {
			WARN("Autosleep", "enabled but keepalive still installed -- redeploy to clean up");
		} else {
			pass("Autosleep", "enabled, no keepalive (correct)");
		}
	} else {
		if (hasKeepalive && keepaliveCron) {
			pass("Keepalive", "script + cron installed (autosleep disabled)");
		} else {
			WARN("Keepalive", `autosleep off but keepalive incomplete (script: ${hasKeepalive}, cron: ${keepaliveCron})`);
		}
	}

	// Show full crontab
	const crontab = await execOut(client, id, `crontab -l 2>/dev/null || echo "(empty)"`);
	if (crontab.trim() && crontab.trim() !== "(empty)") {
		dim(`  system crontab:\n${crontab.split("\n").map((l) => `    ${l}`).join("\n")}`);
	}
}

// ═══════════════════════════════════════════════════════════════════
// 13. Fleet + multi-machine
// ═══════════════════════════════════════════════════════════════════

async function checkFleet(): Promise<void> {
	header("13 · Fleet consistency");

	const state = loadState();
	if (!state) {
		WARN("Fleet", "no state file");
		return;
	}

	// Cross-check: .env AGENT_MACHINE_ID vs .machine-state.json
	const envMachineId = process.env.AGENT_MACHINE_ID ?? process.env.HERMES_MACHINE_ID;
	if (envMachineId && envMachineId !== "dm-replace-me") {
		envMachineId === state.machineId
			? pass("AGENT_MACHINE_ID consistency", "matches state file")
			: WARN("AGENT_MACHINE_ID drift", `env=${envMachineId} state=${state.machineId}`);
	}

	// Cross-check: API URL in .env vs state
	const envApiUrl = process.env.AGENT_API_URL ?? process.env.HERMES_API_URL;
	if (envApiUrl && state.apiPreviewUrl) {
		const normalizedEnv = envApiUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
		const normalizedState = state.apiPreviewUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
		normalizedEnv === normalizedState
			? pass("AGENT_API_URL consistency", "matches state file")
			: WARN("AGENT_API_URL drift", `env points elsewhere than state file`);
	}

	// Verify preview URLs are actually reachable
	if (state.apiPreviewUrl) {
		try {
			const resp = await fetch(state.apiPreviewUrl.replace(/\/v1\/?$/, ""), { method: "HEAD", signal: AbortSignal.timeout(10_000) });
			pass("API URL reachable", `HTTP ${resp.status}`);
		} catch (err) {
			FAIL("API URL reachable", (err instanceof Error ? err.message : String(err)).slice(0, 100));
		}
	}
	if (state.dashboardPreviewUrl) {
		try {
			const resp = await fetch(state.dashboardPreviewUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
			pass("Dashboard URL reachable", `HTTP ${resp.status}`);
		} catch (err) {
			WARN("Dashboard URL reachable", (err instanceof Error ? err.message : String(err)).slice(0, 100));
		}
	}

	// API key format
	if (state.apiServerKey) {
		state.apiServerKey.startsWith("hp-") && state.apiServerKey.length > 10
			? pass("API key format", "hp-* prefix, valid length")
			: WARN("API key format", "unexpected format");
	}
}

// ═══════════════════════════════════════════════════════════════════
// 14. API health (external)
// ═══════════════════════════════════════════════════════════════════

async function checkApiHealth(): Promise<void> {
	header("14 · API health (external)");

	const state = loadState();
	if (!state?.apiPreviewUrl || !state?.apiServerKey) {
		WARN("API probe", "no preview URL or key");
		return;
	}

	const probe = await probeApi({ apiUrl: state.apiPreviewUrl, apiKey: state.apiServerKey });
	probe.ok
		? pass("/v1/models", `HTTP ${probe.status}`)
		: FAIL("/v1/models", `HTTP ${probe.status}: ${probe.body.slice(0, 200)}`);

	// Verify response shape
	if (probe.ok && probe.body) {
		try {
			const parsed = JSON.parse(probe.body);
			if (parsed.data && Array.isArray(parsed.data)) {
				pass("Models response shape", `${parsed.data.length} model(s)`);
			} else if (parsed.object === "list") {
				pass("Models response shape", "OpenAI-compatible list");
			} else {
				WARN("Models response shape", "unexpected structure");
			}
		} catch {
			WARN("Models response shape", "not valid JSON");
		}
	}

	// Auth enforcement
	try {
		const noAuth = await fetch(`${state.apiPreviewUrl.replace(/\/$/, "")}/v1/models`, { signal: AbortSignal.timeout(10_000) });
		(noAuth.status === 401 || noAuth.status === 403)
			? pass("Auth enforcement", `rejects unauthenticated (${noAuth.status})`)
			: WARN("Auth enforcement", `expected 401/403, got ${noAuth.status}`);
	} catch (err) {
		WARN("Auth enforcement", (err instanceof Error ? err.message : String(err)).slice(0, 100));
	}

	// Wrong key
	try {
		const wrongKey = await fetch(`${state.apiPreviewUrl.replace(/\/$/, "")}/v1/models`, {
			headers: { Authorization: "Bearer wrong-key-12345" },
			signal: AbortSignal.timeout(10_000),
		});
		(wrongKey.status === 401 || wrongKey.status === 403)
			? pass("Invalid key rejected", `(${wrongKey.status})`)
			: WARN("Invalid key rejected", `expected 401/403, got ${wrongKey.status}`);
	} catch (err) {
		WARN("Invalid key rejected", (err instanceof Error ? err.message : String(err)).slice(0, 100));
	}
}

// ═══════════════════════════════════════════════════════════════════
// 15. End-to-end chat
// ═══════════════════════════════════════════════════════════════════

async function checkEndToEnd(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("15 · End-to-end chat");

	const state = loadState();
	if (!state?.apiServerKey) {
		WARN("E2E chat", "no API key");
		return;
	}

	try {
		const response = await execOut(
			client, id,
			`${SHELL_ENV} && curl -sS --max-time 45 ` +
				`-H "Authorization: Bearer ${state.apiServerKey}" ` +
				`-H "Content-Type: application/json" ` +
				`http://127.0.0.1:${PORT_API}/v1/chat/completions ` +
				`-d '{"model":"hermes-agent","messages":[{"role":"user","content":"reply with exactly the word: DOCTOR_OK"}],"stream":true}'`,
			{ timeoutMs: 90_000 },
		);

		const parsed = parseChatProbe(response);
		if (parsed.error) {
			FAIL("Chat completion", `API error: ${JSON.stringify(parsed.error).slice(0, 200)}`);
			return;
		}
		const content = parsed.content.trim();
		if (content.toLowerCase().includes("doctor_ok")) {
			pass("Chat completion", `agent replied: ${content.slice(0, 80)}`);
		} else if (content.length > 0) {
			pass("Chat completion", `agent replied (inexact): ${content.slice(0, 80)}`);
		} else {
			FAIL("Chat completion", "empty response");
		}
		parsed.id ? pass("Response has id field") : WARN("Response id", "missing");
		parsed.model ? pass("Response has model field", parsed.model) : WARN("Response model", "missing");
		parsed.usageTokens ? pass("Response has usage field", `${parsed.usageTokens} tokens`) : dim("  No usage field");
	} catch (err) {
		FAIL("Chat completion", (err instanceof Error ? err.message : String(err)).slice(0, 300));
	}
}

// ═══════════════════════════════════════════════════════════════════
// 16. Web dashboard
// ═══════════════════════════════════════════════════════════════════

async function checkWebDashboard(): Promise<void> {
	header("16 · Web dashboard");

	const webDir = resolve(repoRoot(), "web");
	if (!existsSync(webDir)) {
		WARN("web/ directory", "not found");
		return;
	}

	existsSync(resolve(webDir, "node_modules"))
		? pass("web/ node_modules")
		: FAIL("web/ node_modules", "run cd web && npm install");

	// .env.local
	const envLocalPath = resolve(webDir, ".env.local");
	if (existsSync(envLocalPath)) {
		pass("web/.env.local");

		const envContent = readFileSync(envLocalPath, "utf8");
		const checks: Array<{ key: string; required: boolean; placeholders: string[] }> = [
			{ key: "DEDALUS_API_KEY", required: true, placeholders: ["dsk-live-replace-me"] },
			{ key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", required: true, placeholders: ["pk_test_replace_me"] },
			{ key: "CLERK_SECRET_KEY", required: true, placeholders: ["sk_test_replace_me"] },
			{ key: "AGENT_MACHINE_ID", required: false, placeholders: ["dm-replace-me"] },
			{ key: "AGENT_API_URL", required: false, placeholders: [] },
			{ key: "AGENT_API_KEY", required: false, placeholders: ["hp-replace-me"] },
			{ key: "AGENT_MODEL", required: false, placeholders: [] },
			{ key: "ALLOW_DEV_AUTH", required: false, placeholders: [] },
		];

		for (const { key, required, placeholders } of checks) {
			const regex = new RegExp(`^${key}=(.+)$`, "m");
			const match = envContent.match(regex);
			if (match) {
				const value = match[1].trim();
				const isPlaceholder = placeholders.some((p) => value === p);
				if (isPlaceholder) {
					required ? FAIL(`web/ ${key}`, "still placeholder") : WARN(`web/ ${key}`, "placeholder");
				} else {
					pass(`web/ ${key}`, required ? "set" : `set (${value.slice(0, 30)}${value.length > 30 ? "..." : ""})`);
				}
			} else {
				required ? WARN(`web/ ${key}`, "not found") : dim(`  web/ ${key} not set (optional)`);
			}
		}

		// Dev auth bypass check
		if (envContent.includes("ALLOW_DEV_AUTH=1")) {
			WARN("Dev auth bypass", "ALLOW_DEV_AUTH=1 is set -- only works in NODE_ENV=development");
		}
	} else {
		WARN("web/.env.local", "not found -- copy web/.env.local.example");
	}

	// Skills.json freshness
	const skillsJson = resolve(webDir, "data", "skills.json");
	if (existsSync(skillsJson)) {
		try {
			const stat = statSync(skillsJson);
			const age = (Date.now() - stat.mtimeMs) / 3_600_000;
			age < 24
				? pass("web/data/skills.json", `${Math.round(age)}h old`)
				: WARN("web/data/skills.json", `${Math.round(age)}h old -- run npm run sync-skills in web/`);

			const content = JSON.parse(readFileSync(skillsJson, "utf8"));
			const skillCount = Array.isArray(content) ? content.length : 0;
			pass("Synced skill count", `${skillCount} skills`);
		} catch {
			WARN("web/data/skills.json", "parse error");
		}
	} else {
		WARN("web/data/skills.json", "not found -- run npm run sync-skills in web/");
	}

	// TypeScript
	const webTypecheck = localCmd("npx tsc --noEmit 2>&1", webDir);
	webTypecheck !== null && !webTypecheck.includes("error TS")
		? pass("web/ TypeScript", "clean")
		: WARN("web/ TypeScript", webTypecheck?.split("\n").slice(0, 2).join(" | ") ?? "failed");
}

// ═══════════════════════════════════════════════════════════════════
// 17. Live-fire QA checks
// ═══════════════════════════════════════════════════════════════════

async function checkLiveFireQa(
	client: ReturnType<typeof makeClient>,
	id: string,
): Promise<void> {
	header("17 · Live-fire QA checks");

	// 1. dpkg lock readiness
	const dpkgLocked = await check(
		client, id,
		`fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1`,
	);
	if (dpkgLocked) {
		WARN("dpkg lock", "held by another process -- apt operations may fail");
	} else {
		pass("dpkg lock", "free");
	}

	// 2. Gateway log recency (last entry within 5 minutes)
	const logPath = `${VM_HERMES_HOME}/logs/gateway.log`;
	const hasLog = await check(client, id, `test -s ${logPath}`);
	if (hasLog) {
		const recent = await check(
			client, id,
			`find ${logPath} -mmin -5 | grep -q .`,
		);
		recent
			? pass("Gateway log recency", "updated within 5 min")
			: WARN("Gateway log recency", "no writes in last 5 minutes -- possible crash or stall");

		const crashIndicator = await check(
			client, id,
			`head -20 ${logPath} | grep -qi 'traceback\\|CRITICAL\\|segfault'`,
		);
		if (crashIndicator) {
			WARN("Gateway startup", "crash indicators in first 20 lines");
		} else {
			pass("Gateway startup", "no crash in early log");
		}
	} else {
		WARN("Gateway log", "empty or missing -- gateway may not have started");
	}

	// 3. Machine quota headroom
	let config: Config;
	try {
		config = loadConfig();
	} catch {
		WARN("Quota check", "cannot load config");
		return;
	}
	try {
		const listClient = makeClient(config);
		const machines = await listClient.machines.list();
		const items = machines.items ?? [];
		const total = items.length;
		if (total >= 4) {
			WARN("Machine quota", `${total}/5 slots used -- near capacity`);
		} else {
			pass("Machine quota", `${total}/5 slots used`);
		}
	} catch (err) {
		WARN("Machine quota", `could not list machines: ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`);
	}

	// 4. Per-machine routing sanity
	const state = loadState();
	if (state?.machineId) {
		const match = state.machineId === id;
		match
			? pass("Routing sanity", "active machine matches doctor target")
			: WARN("Routing sanity", `state file has ${state.machineId} but doctor is checking ${id} -- potential drift`);
	}
}

// ═══════════════════════════════════════════════════════════════════
// Flags + main
// ═══════════════════════════════════════════════════════════════════

function parseFlags(args: string[]): { quick: boolean; localOnly: boolean; vmOnly: boolean } {
	return {
		quick: args.includes("--quick") || args.includes("-q"),
		localOnly: args.includes("--local"),
		vmOnly: args.includes("--vm"),
	};
}

export async function doctor(args: string[]): Promise<void> {
	const flags = parseFlags(args);
	const start = Date.now();

	console.log("");
	header("Agent Machines Doctor");
	dim("  Full end-to-end diagnostic across every layer.");
	if (flags.quick) dim("  --quick: skipping e2e chat + typecheck");
	if (flags.localOnly) dim("  --local: local environment only");
	if (flags.vmOnly) dim("  --vm: VM checks only");
	console.log("");

	// ── Local ──
	if (!flags.vmOnly) {
		await checkLocalEnv();
	}

	// ── Machine ──
	if (!flags.localOnly) {
		const ctx = await checkDedalusApi();
		if (ctx) {
			const { client, machineId } = ctx;
			await checkVmSystemDeps(client, machineId);
			await checkVmToolchain(client, machineId);
			await checkVmServices(client, machineId);
			await checkVmKnowledge(client, machineId);
			await checkVmClosedLoop(client, machineId);
			await checkVmCursorBridge(client, machineId);
			await checkVmGitReload(client, machineId);
			await checkVmPersistence(client, machineId);
			await checkVmAppData(client, machineId);
			await checkVmAutosleep(client, machineId);
		}

		// ── Fleet ──
		await checkFleet();

		// ── API ──
		await checkApiHealth();

		// ── E2E ──
		if (!flags.quick && ctx) {
			await checkEndToEnd(ctx.client, ctx.machineId);
		}

		// ── Live-fire QA ──
		if (!flags.quick && ctx) {
			await checkLiveFireQa(ctx.client, ctx.machineId);
		}
	}

	// ── Web ──
	if (!flags.vmOnly && !flags.quick) {
		await checkWebDashboard();
	}

	// ── Summary ──
	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	header("Summary");
	console.log(`  ${passCount} passed · ${failCount} failed · ${warnCount} warnings  (${elapsed}s)`);
	console.log("");

	if (failCount > 0) {
		fail(`${failCount} check(s) failed. Fix the issues above and re-run \`npm run doctor\`.`);
		process.exit(1);
	} else if (warnCount > 0) {
		console.log("  All critical checks passed. Warnings are non-blocking.");
	} else {
		success("All checks passed. Machine is fully healthy.");
	}
}
