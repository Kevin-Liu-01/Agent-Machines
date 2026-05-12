/**
 * Browser-callable bootstrap runner.
 *
 * This is the web equivalent of the CLI's `runBootstrap`, but driven
 * through the provider abstraction instead of the Dedalus SDK. It keeps
 * the commands intentionally conservative and phase-aligned with
 * `BOOTSTRAP_PHASES` so the dashboard can show real progress while we
 * continue to move the heavier CLI installer into reusable pieces.
 */

import type { MachineProvider } from "@/lib/providers";
import {
	BOOTSTRAP_PHASES,
	type BootstrapPhaseId,
	type BootstrapState,
	type MachineRef,
	type UserConfig,
} from "@/lib/user-config/schema";

const HOME = "/home/machine";
const AGENT_HOME = `${HOME}/.agent`;
const MACHINE_HOME = `${HOME}/.machine`;
const HERMES_HOME = `${HOME}/.hermes`;
const APP_HOME = `${HOME}/.agent-machines`;
const OPENCLAW_HOME = `${HOME}/.openclaw`;
const NPM_PREFIX = `${HOME}/.npm-global`;
const NPM_CACHE = `${HOME}/.npm-cache`;
const PLAYWRIGHT_BROWSERS = `${HOME}/.cache/ms-playwright`;
const AGENT_BROWSER_HOME = `${HOME}/.agent-browser`;
const HERMES_PORT = 8642;
const OPENCLAW_PORT = 18789;
const CLOUDFLARED_BIN = `${HOME}/.local/bin/cloudflared`;

type StateSink = (state: BootstrapState) => Promise<void>;

export type BootstrapResult = {
	apiUrl: string | null;
	apiKey: string;
};

export async function runWebBootstrap({
	machine,
	provider,
	config,
	onState,
}: {
	machine: MachineRef;
	provider: MachineProvider;
	config: UserConfig;
	onState: StateSink;
}): Promise<BootstrapResult> {
	const completed: BootstrapPhaseId[] = [];
	const startedAt = new Date().toISOString();
	const apiKey = machine.apiKey ?? crypto.randomUUID();
	await onState({
		phase: "running",
		current: BOOTSTRAP_PHASES[0],
		completed,
		startedAt,
		finishedAt: null,
		lastError: null,
	});

	try {
		for (const phase of BOOTSTRAP_PHASES) {
			await onState({
				phase: "running",
				current: phase,
				completed: [...completed],
				startedAt,
				finishedAt: null,
				lastError: null,
			});
			await runPhase(phase, machine, provider, config, apiKey);
			completed.push(phase);
		}
		const apiUrl = await exposeGateway(machine, provider);
		await onState({
			phase: "succeeded",
			current: null,
			completed,
			startedAt,
			finishedAt: new Date().toISOString(),
			lastError: null,
		});
		return { apiUrl, apiKey };
	} catch (err) {
		await onState({
			phase: "failed",
			current: null,
			completed,
			startedAt,
			finishedAt: new Date().toISOString(),
			lastError: err instanceof Error ? err.message : "bootstrap failed",
		});
		throw err;
	}
}

async function runPhase(
	phase: BootstrapPhaseId,
	machine: MachineRef,
	provider: MachineProvider,
	config: UserConfig,
	apiKey: string,
): Promise<void> {
	const command = commandFor(phase, machine, config, apiKey);
	if (command === null) return;
	const result = await provider.exec(machine.id, command, { timeoutMs: 900_000 });
	if (result.exitCode !== 0) {
		throw new Error(
			`${phase} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
		);
	}
}

function commandFor(
	phase: BootstrapPhaseId,
	machine: MachineRef,
	config: UserConfig,
	apiKey: string,
): string | null {
	const agent = machine.agentKind;
	const model = shell(machine.model);
	const gatewayKey = shell(apiKey);
	const upstreamApiKey = shell(config.providers.dedalus?.apiKey ?? "");
	const cursorKey = config.cursorApiKey ? shell(config.cursorApiKey) : null;

	switch (phase) {
		case "system-deps":
			return [
				"set -e",
				`mkdir -p ${APP_HOME}/chats ${APP_HOME}/artifacts ${HERMES_HOME}/logs ${OPENCLAW_HOME}/logs ${MACHINE_HOME}/logs/services`,
				"apt-get update -qq >/dev/null",
				"apt-get install -y -qq curl git build-essential ca-certificates jq sqlite3 dnsutils iproute2 netcat-openbsd >/dev/null",
			].join(" && ");
		case "install-uv":
			return [
				"set -e",
				`export HOME=${HOME}`,
				"command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh",
			].join(" && ");
		case "clone-hermes":
			return agent === "hermes"
				? `mkdir -p ${HERMES_HOME}/skills ${HERMES_HOME}/crons ${HERMES_HOME}/logs`
				: null;
		case "install-hermes":
			return agent === "hermes"
				? [
						"set -e",
						`export HOME=${HOME}`,
						`export PATH=${HOME}/.local/bin:$PATH`,
						`apt-get update -qq >/dev/null && apt-get install -y -qq python3-venv python3-pip >/dev/null`,
						`rm -rf ${HERMES_HOME}/venv && python3 -m venv ${HERMES_HOME}/venv`,
						`${HERMES_HOME}/venv/bin/python -m pip install --upgrade pip`,
						`${HERMES_HOME}/venv/bin/pip install 'hermes-agent[web,mcp] @ git+https://github.com/NousResearch/hermes-agent.git@main'`,
					].join(" && ")
				: null;
		case "install-node":
			return [
				"set -e",
				"command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs)",
				"node --version",
			].join(" && ");
		case "seed-knowledge":
			return [
				"set -e",
				`mkdir -p ${HERMES_HOME}/skills ${HERMES_HOME}/crons ${APP_HOME}`,
				`cat > ${APP_HOME}/settings.json <<'EOF'\n${machineSettingsJson(machine, config)}\nEOF`,
				`test -d ${HERMES_HOME}/skills`,
			].join(" && ");
		case "install-git-reload":
			return [
				"set -e",
				`mkdir -p ${HERMES_HOME}/scripts`,
				`cat > ${HERMES_HOME}/scripts/reload-from-git.sh <<'EOF'\n#!/usr/bin/env bash\nset -euo pipefail\necho '[reload] browser bootstrap placeholder: git reload installed'\nEOF`,
				`chmod +x ${HERMES_HOME}/scripts/reload-from-git.sh`,
			].join(" && ");
		case "install-cursor-bridge":
			return cursorKey
				? `mkdir -p ${APP_HOME}/cursor && printf %s ${cursorKey} > ${APP_HOME}/cursor/.configured`
				: `mkdir -p ${APP_HOME}/cursor && touch ${APP_HOME}/cursor/.disabled`;
		case "configure-hermes":
			if (agent === "openclaw") {
				return configureOpenClaw(model, gatewayKey, upstreamApiKey);
			}
			return configureHermes(model, gatewayKey, upstreamApiKey);
		case "register-cursor-mcp":
			return `mkdir -p ${HERMES_HOME} && touch ${HERMES_HOME}/mcp-registered`;
		case "seed-cron-jobs":
			return `mkdir -p ${HERMES_HOME}/crons && touch ${HERMES_HOME}/crons/.seeded`;
		case "start-gateway":
			return agent === "openclaw" ? startOpenClaw() : startHermes();
		case "install-closed-loop-tools":
			return installClosedLoopTools();
	}
}

function installClosedLoopTools(): string {
	return [
		"set -e",
		`mkdir -p ${NPM_PREFIX} ${NPM_CACHE} ${PLAYWRIGHT_BROWSERS} ${AGENT_BROWSER_HOME} ${AGENT_HOME}/docs ${MACHINE_HOME}/logs/services`,
		`export HOME=${HOME}`,
		`export NPM_CONFIG_PREFIX=${NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${AGENT_BROWSER_HOME}`,
		`export PATH=${NPM_PREFIX}/bin:${HOME}/.local/bin:$PATH`,
		"npm install -g --no-audit --no-fund --loglevel=error agent-browser playwright @playwright/mcp",
		"playwright install --with-deps chromium",
		"agent-browser install",
		"uv tool install 'httpx[cli]' || python3 -m pip install --user 'httpx[cli]'",
		`cat > ${AGENT_HOME}/llm.txt <<'EOF'\nAgent Machines runtime context.\n\nRead /.agent/docs/agent-context.md before assuming which tools exist. Close the loop with browser automation, curl/httpx+jq, sqlite3, service logs, and network probes.\nEOF`,
		`cat > ${AGENT_HOME}/docs/agent-context.md <<'EOF'\n# Agent Machine Context\n\nThis machine is built for closed-loop agent development. Write code, start the service, hit the endpoint, inspect logs, fix, and retry.\n\n## Tools\n\n- Browser/UI: agent-browser, Playwright, and npx @playwright/mcp with Chromium cached under /home/machine/.cache/ms-playwright.\n- API: curl, jq, and httpx.\n- Database: sqlite3.\n- Network: ss, dig, curl -v, and nc.\n- Logs: /.machine/logs/services/ plus runtime originals under /home/machine.\n\nKeep toolchains and caches under /home/machine because the root filesystem can reset on wake.\nEOF`,
		`ln -sfn ${AGENT_HOME} /.agent`,
		`ln -sfn ${MACHINE_HOME} /.machine`,
		`ln -sfn ${HERMES_HOME}/logs/gateway.log ${MACHINE_HOME}/logs/services/hermes-gateway.log`,
		`ln -sfn ${HERMES_HOME}/logs/dashboard.log ${MACHINE_HOME}/logs/services/hermes-dashboard.log`,
	].join("\n");
}

function configureHermes(
	model: string,
	gatewayKey: string,
	upstreamApiKey: string,
): string {
	return [
		"set -e",
		hermesEnv(),
		`hermes config set model.provider custom`,
		`hermes config set model.base_url ${shell("https://api.dedaluslabs.ai/v1")}`,
		`hermes config set model.api_key ${upstreamApiKey}`,
		`hermes config set model.default ${model}`,
		`hermes config set first_run_complete true`,
		`cat > ${HERMES_HOME}/.env <<EOF\nAPI_SERVER_ENABLED=true\nAPI_SERVER_KEY=${gatewayKey}\nAPI_SERVER_HOST=0.0.0.0\nAPI_SERVER_PORT=${HERMES_PORT}\nEOF`,
	].join(" && ");
}

function configureOpenClaw(
	model: string,
	gatewayKey: string,
	upstreamApiKey: string,
): string {
	return [
		"set -e",
		openClawEnv(),
		`mkdir -p ${HOME}/.npm-global ${HOME}/.npm-cache ${HOME}/.tmp ${OPENCLAW_HOME}/logs`,
		`NPM_CONFIG_PREFIX=${HOME}/.npm-global NPM_CONFIG_CACHE=${HOME}/.npm-cache TMPDIR=${HOME}/.tmp npm install -g openclaw@latest --no-audit --no-fund --loglevel=error`,
		`openclaw config set gateway.mode local`,
		`openclaw config set gateway.http.endpoints.chatCompletions.enabled true`,
		`openclaw config set gateway.bind "0.0.0.0"`,
		`openclaw config set gateway.auth.mode none`,
		`openclaw config set agent.model ${model}`,
		`openclaw config set env.vars.ANTHROPIC_API_KEY ${upstreamApiKey}`,
		`openclaw config set env.vars.OPENAI_API_KEY ${upstreamApiKey}`,
		`openclaw config set env.vars.ANTHROPIC_BASE_URL ${shell("https://api.dedaluslabs.ai/v1")}`,
		`cat > ${OPENCLAW_HOME}/.env <<EOF\nOPENCLAW_API_KEY=${gatewayKey}\nOPENCLAW_MODEL=${model}\nEOF`,
	].join(" && ");
}

function machineSettingsJson(machine: MachineRef, config: UserConfig): string {
	const agentProfile =
		config.agentProfiles.find((profile) => profile.id === machine.agentProfileId) ??
		config.agentProfiles.find((profile) => profile.agentKind === machine.agentKind) ??
		null;
	const loadoutPreset =
		config.loadoutPresets.find(
			(preset) => preset.id === config.activeLoadoutPresetId,
		) ??
		config.loadoutPresets[0] ??
		null;
	const sourceIds = new Set(loadoutPreset?.sourceIds ?? []);
	const customEntryIds = new Set(loadoutPreset?.customEntryIds ?? []);
	const settings = {
		version: 1,
		machineId: machine.id,
		agentKind: machine.agentKind,
		model: machine.model,
		agentProfile,
		loadoutPreset,
		loadoutSources: config.loadoutSources.filter((source) =>
			sourceIds.has(source.id),
		),
		customLoadout: config.customLoadout.filter((entry) =>
			customEntryIds.has(entry.id),
		),
		createdAt: new Date().toISOString(),
	};
	return JSON.stringify(settings, null, 2);
}

function startHermes(): string {
	return [
		"set -e",
		`ps -eo pid,cmd | awk '/hermes gateway/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null || true`,
		hermesEnv(),
		`cat > ${HOME}/start-hermes-gateway.sh <<'EOF'\n#!/usr/bin/env bash\nset -euo pipefail\nexport HOME=${HOME}\nexport HERMES_HOME=${HERMES_HOME}\nexport NPM_CONFIG_PREFIX=${NPM_PREFIX}\nexport NPM_CONFIG_CACHE=${NPM_CACHE}\nexport PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS}\nexport AGENT_BROWSER_DATA_DIR=${AGENT_BROWSER_HOME}\nexport PATH=${NPM_PREFIX}/bin:${HERMES_HOME}/venv/bin:${HOME}/.local/bin:$PATH\nmkdir -p ${MACHINE_HOME}/logs/services\nln -sfn ${HERMES_HOME}/logs/gateway.log ${MACHINE_HOME}/logs/services/hermes-gateway.log\nsource ${HERMES_HOME}/.env\nexec hermes gateway >> ${HERMES_HOME}/logs/gateway.log 2>&1\nEOF`,
		`chmod +x ${HOME}/start-hermes-gateway.sh`,
		`(setsid ${HOME}/start-hermes-gateway.sh </dev/null &>/dev/null &) && sleep 12`,
		`ss -tlnp 2>/dev/null | grep ':${HERMES_PORT}'`,
		`echo gateway:${HERMES_PORT}`,
	].join(" && ");
}

function startOpenClaw(): string {
	return [
		"set -e",
		`ps -eo pid,cmd | awk '/openclaw gateway run/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null || true`,
		openClawEnv(),
		`cat > ${HOME}/start-openclaw-gateway.sh <<'EOF'\n#!/usr/bin/env bash\nset -euo pipefail\nexport HOME=${HOME}\nexport NPM_CONFIG_PREFIX=${NPM_PREFIX}\nexport NPM_CONFIG_CACHE=${NPM_CACHE}\nexport PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS}\nexport AGENT_BROWSER_DATA_DIR=${AGENT_BROWSER_HOME}\nexport PATH=${NPM_PREFIX}/bin:${HOME}/.npm-global/bin:$PATH\nexport OPENCLAW_STATE_DIR=${OPENCLAW_HOME}\nexport OPENCLAW_NO_RESPAWN=1\nmkdir -p ${MACHINE_HOME}/logs/services\nln -sfn ${OPENCLAW_HOME}/logs/gateway.log ${MACHINE_HOME}/logs/services/openclaw-gateway.log\nsource ${OPENCLAW_HOME}/.env\nexec openclaw gateway run > ${OPENCLAW_HOME}/logs/gateway.log 2>&1\nEOF`,
		`chmod +x ${HOME}/start-openclaw-gateway.sh`,
		`(setsid ${HOME}/start-openclaw-gateway.sh </dev/null &>/dev/null &) && sleep 14`,
		`ss -tlnp 2>/dev/null | grep ':${OPENCLAW_PORT}'`,
		`echo gateway:${OPENCLAW_PORT}`,
	].join(" && ");
}

function shell(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function hermesEnv(): string {
	return [
		`export HOME=${HOME}`,
		`export HERMES_HOME=${HERMES_HOME}`,
		`export NPM_CONFIG_PREFIX=${NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${AGENT_BROWSER_HOME}`,
		`export PATH=${NPM_PREFIX}/bin:${HERMES_HOME}/venv/bin:${HOME}/.local/bin:$PATH`,
	].join(" && ");
}

function openClawEnv(): string {
	return [
		`export HOME=${HOME}`,
		`export NPM_CONFIG_PREFIX=${NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${AGENT_BROWSER_HOME}`,
		`export PATH=${NPM_PREFIX}/bin:${HOME}/.npm-global/bin:$PATH`,
		`export OPENCLAW_STATE_DIR=${OPENCLAW_HOME}`,
		`export OPENCLAW_NO_RESPAWN=1`,
	].join(" && ");
}

async function exposeGateway(
	machine: MachineRef,
	provider: MachineProvider,
): Promise<string | null> {
	const port = machine.agentKind === "openclaw" ? OPENCLAW_PORT : HERMES_PORT;
	const name = machine.agentKind === "openclaw" ? "openclaw" : "hermes";
	if (provider.kind !== "dedalus" && provider.kind !== "fly") return null;
	await ensureCloudflared(machine, provider);
	const logPath = `${APP_HOME}/cloudflared-${name}.log`;
	const pidPath = `${APP_HOME}/cloudflared-${name}.pid`;
	const launcher = `${HOME}/start-tunnel-${name}.sh`;
	const launcherBody = [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`exec ${CLOUDFLARED_BIN} tunnel --no-autoupdate --url http://127.0.0.1:${port} --metrics 127.0.0.1:0 >> ${logPath} 2>&1`,
	].join("\n");
	await provider.exec(
		machine.id,
		[
			"set -e",
			`mkdir -p ${APP_HOME}`,
			`rm -f ${logPath}`,
			`cat > ${launcher} <<'EOF'\n${launcherBody}\nEOF`,
			`chmod +x ${launcher}`,
			`(setsid ${launcher} </dev/null &>/dev/null & echo $! > ${pidPath})`,
		].join(" && "),
		{ timeoutMs: 30_000 },
	);
	for (let attempt = 0; attempt < 30; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		const result = await provider.exec(
			machine.id,
			`grep -oE 'https://[a-z0-9-]+\\.trycloudflare\\.com' ${logPath} | head -1 || true`,
			{ timeoutMs: 15_000 },
		);
		if (result.stdout) return `${result.stdout.trim().replace(/\/$/, "")}/v1`;
	}
	const tail = await provider.exec(machine.id, `tail -80 ${logPath} || true`, {
		timeoutMs: 15_000,
	});
	throw new Error(`cloudflared tunnel did not announce a URL: ${tail.stdout || tail.stderr}`);
}

async function ensureCloudflared(
	machine: MachineRef,
	provider: MachineProvider,
): Promise<void> {
	const check = await provider.exec(machine.id, `[ -x ${CLOUDFLARED_BIN} ]`, {
		timeoutMs: 15_000,
	});
	if (check.exitCode === 0) return;
	const result = await provider.exec(
		machine.id,
		`mkdir -p ${HOME}/.local/bin && curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ${CLOUDFLARED_BIN} && chmod +x ${CLOUDFLARED_BIN} && ${CLOUDFLARED_BIN} --version`,
		{ timeoutMs: 180_000 },
	);
	if (result.exitCode !== 0) {
		throw new Error(`cloudflared install failed: ${result.stderr || result.stdout}`);
	}
}
