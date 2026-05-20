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
	type ProviderKind,
	type UserConfig,
} from "@/lib/user-config/schema";

type BootstrapPaths = {
	HOME: string;
	AGENT_HOME: string;
	MACHINE_HOME: string;
	HERMES_HOME: string;
	APP_HOME: string;
	OPENCLAW_HOME: string;
	NPM_PREFIX: string;
	NPM_CACHE: string;
	PLAYWRIGHT_BROWSERS: string;
	AGENT_BROWSER_HOME: string;
	CLOUDFLARED_BIN: string;
};

function pathsFor(providerKind: ProviderKind): BootstrapPaths {
	const HOME =
		providerKind === "e2b" ? "/home/user" :
		providerKind === "sprites" ? "/home/sprite" :
		"/home/machine";
	return {
		HOME,
		AGENT_HOME: `${HOME}/.agent`,
		MACHINE_HOME: `${HOME}/.machine`,
		HERMES_HOME: `${HOME}/.hermes`,
		APP_HOME: `${HOME}/.agent-machines`,
		OPENCLAW_HOME: `${HOME}/.openclaw`,
		NPM_PREFIX: `${HOME}/.npm-global`,
		NPM_CACHE: `${HOME}/.npm-cache`,
		PLAYWRIGHT_BROWSERS: `${HOME}/.cache/ms-playwright`,
		AGENT_BROWSER_HOME: `${HOME}/.agent-browser`,
		CLOUDFLARED_BIN: `${HOME}/.local/bin/cloudflared`,
	};
}

const HERMES_PORT = 8642;
const OPENCLAW_PORT = 18789;

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

	const paths = pathsFor(machine.providerKind);

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
			await runPhase(phase, machine, provider, config, apiKey, paths);
			completed.push(phase);
		}
		const apiUrl = await exposeGateway(machine, provider, config, paths);
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
	paths: BootstrapPaths,
): Promise<void> {
	const isSandbox = machine.providerKind === "e2b" || machine.providerKind === "sprites";

	if (phase === "start-gateway" && isSandbox) {
		await startGatewaySandbox(machine, provider, paths);
		return;
	}

	const command = commandFor(phase, machine, config, apiKey, paths);
	if (command === null) return;
	const result = await provider.exec(machine.id, command, { timeoutMs: 900_000 });
	if (result.exitCode !== 0) {
		throw new Error(
			`${phase} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
		);
	}
}

type UpstreamProvider = { key: string; baseUrl: string };

const DEDALUS_BASE = "https://api.dedaluslabs.ai/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const VERCEL_AI_GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

/**
 * Resolve the best upstream LLM API key + base URL for the given agent.
 * Priority: agent-specific AI provider key > Dedalus (routes all models)
 * > any available AI provider key > gateway profile > empty (will fail).
 */
function resolveUpstream(agent: string, config: UserConfig): UpstreamProvider {
	const ai = config.aiProviderKeys ?? {};
	const dedalus = config.providers.dedalus?.apiKey;
	const dedalusBase = config.providers.dedalus?.baseUrl;

	if (agent === "claude-code" && ai.anthropic) {
		return { key: ai.anthropic, baseUrl: ANTHROPIC_BASE };
	}
	if (agent === "codex" && ai.openai) {
		return { key: ai.openai, baseUrl: OPENAI_BASE };
	}
	if (agent === "openclaw") {
		if (ai.anthropic) return { key: ai.anthropic, baseUrl: ANTHROPIC_BASE };
		if (dedalus) return { key: dedalus, baseUrl: dedalusBase ?? DEDALUS_BASE };
		if (ai.vercelAiGateway) return { key: ai.vercelAiGateway, baseUrl: VERCEL_AI_GATEWAY_BASE };
		if (ai.openai) return { key: ai.openai, baseUrl: OPENAI_BASE };
		return { key: "", baseUrl: DEDALUS_BASE };
	}
	if (dedalus) return { key: dedalus, baseUrl: dedalusBase ?? DEDALUS_BASE };
	if (ai.vercelAiGateway) return { key: ai.vercelAiGateway, baseUrl: VERCEL_AI_GATEWAY_BASE };
	if (ai.anthropic) return { key: ai.anthropic, baseUrl: ANTHROPIC_BASE };
	if (ai.openai) return { key: ai.openai, baseUrl: OPENAI_BASE };
	if (ai.openrouter) return { key: ai.openrouter, baseUrl: OPENROUTER_BASE };
	if (ai.custom?.key) return { key: ai.custom.key, baseUrl: ai.custom.url };
	return { key: "", baseUrl: DEDALUS_BASE };
}

function commandFor(
	phase: BootstrapPhaseId,
	machine: MachineRef,
	config: UserConfig,
	apiKey: string,
	p: BootstrapPaths,
): string | null {
	const agent = machine.agentKind;
	const model = shell(machine.model);
	const gatewayKey = shell(apiKey);
	const upstream = resolveUpstream(agent, config);
	const upstreamApiKey = shell(upstream.key);
	const upstreamBaseUrl = shell(upstream.baseUrl);
	const cursorKey = config.cursorApiKey ? shell(config.cursorApiKey) : null;

	const providerKind = machine.providerKind;
	const isE2B = providerKind === "e2b";
	const isSprites = providerKind === "sprites";
	const isSandbox = isE2B || isSprites;
	// E2B and Sprites run as non-root users with sudo available
	const sudo = isSandbox ? "sudo " : "";

	switch (phase) {
		case "system-deps":
			if (isSandbox) {
				return [
					"set -e",
					`mkdir -p ${p.APP_HOME}/chats ${p.APP_HOME}/artifacts ${p.HERMES_HOME}/logs ${p.OPENCLAW_HOME}/logs ${p.MACHINE_HOME}/logs/services`,
					`${sudo}apt-get update -qq >/dev/null 2>&1 || true`,
					`${sudo}apt-get install -y -qq jq sqlite3 >/dev/null 2>&1 || true`,
				].join(" && ");
			}
			return [
				"set -e",
				`mkdir -p ${p.APP_HOME}/chats ${p.APP_HOME}/artifacts ${p.HERMES_HOME}/logs ${p.OPENCLAW_HOME}/logs ${p.MACHINE_HOME}/logs/services`,
				'for i in $(seq 1 30); do fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || break; echo "waiting for dpkg lock ($i/30)..."; sleep 2; done',
				`${sudo}apt-get update -qq >/dev/null`,
				`${sudo}apt-get install -y -qq curl git build-essential ca-certificates jq sqlite3 dnsutils iproute2 netcat-openbsd >/dev/null`,
			].join(" && ");
		case "install-uv":
			return [
				"set -e",
				`export HOME=${p.HOME}`,
				"command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh",
			].join(" && ");
		case "clone-hermes":
			return agent === "hermes"
				? `mkdir -p ${p.HERMES_HOME}/skills ${p.HERMES_HOME}/crons ${p.HERMES_HOME}/logs`
				: null;
		case "install-hermes":
			if (agent !== "hermes") return null;
			if (isSandbox) {
				return [
					"set -e",
					`export HOME=${p.HOME}`,
					`export PATH=${p.HOME}/.local/bin:$PATH`,
					`python3 -m venv ${p.HERMES_HOME}/venv`,
					`${p.HERMES_HOME}/venv/bin/python -m pip install --upgrade pip`,
					`${p.HERMES_HOME}/venv/bin/pip install 'hermes-agent[web,mcp] @ git+https://github.com/NousResearch/hermes-agent.git@main' aiohttp`,
				].join(" && ");
			}
			return [
				"set -e",
				`export HOME=${p.HOME}`,
				`export PATH=${p.HOME}/.local/bin:$PATH`,
				'for i in $(seq 1 30); do fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || break; echo "waiting for dpkg lock ($i/30)..."; sleep 2; done',
				`${sudo}apt-get update -qq >/dev/null && ${sudo}apt-get install -y -qq python3-venv python3-pip >/dev/null`,
				`rm -rf ${p.HERMES_HOME}/venv && python3 -m venv ${p.HERMES_HOME}/venv`,
				`${p.HERMES_HOME}/venv/bin/python -m pip install --upgrade pip`,
				`${p.HERMES_HOME}/venv/bin/pip install 'hermes-agent[web,mcp] @ git+https://github.com/NousResearch/hermes-agent.git@main' aiohttp`,
			].join(" && ");
		case "install-node":
			if (isSandbox) {
				return "set -e && node --version";
			}
			return [
				"set -e",
				'for i in $(seq 1 30); do fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || break; echo "waiting for dpkg lock ($i/30)..."; sleep 2; done',
				"command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs)",
				"node --version",
			].join(" && ");
		case "seed-knowledge":
			return [
				"set -e",
				`mkdir -p ${p.HERMES_HOME}/skills ${p.HERMES_HOME}/crons ${p.APP_HOME}`,
				`cat > ${p.APP_HOME}/settings.json <<'EOF'\n${machineSettingsJson(machine, config)}\nEOF`,
				`test -d ${p.HERMES_HOME}/skills`,
			].join(" && ");
		case "install-git-reload":
			return [
				"set -e",
				`mkdir -p ${p.HERMES_HOME}/scripts`,
				`cat > ${p.HERMES_HOME}/scripts/reload-from-git.sh <<'EOF'\n#!/usr/bin/env bash\nset -euo pipefail\necho '[reload] browser bootstrap placeholder: git reload installed'\nEOF`,
				`chmod +x ${p.HERMES_HOME}/scripts/reload-from-git.sh`,
			].join(" && ");
		case "install-cursor-bridge":
			return cursorKey
				? `mkdir -p ${p.APP_HOME}/cursor && printf %s ${cursorKey} > ${p.APP_HOME}/cursor/.configured`
				: `mkdir -p ${p.APP_HOME}/cursor && touch ${p.APP_HOME}/cursor/.disabled`;
		case "configure-hermes": {
			// Sprites proxies the sprite URL to port 8080; E2B uses per-port URLs
			const gwPort = isSprites ? 8080 : HERMES_PORT;
			if (agent === "openclaw") {
				return configureOpenClaw(model, gatewayKey, upstreamApiKey, upstreamBaseUrl, p);
			}
			if (agent === "claude-code" || agent === "codex") {
				return configureCliAgent(agent, upstreamApiKey, p);
			}
			return configureHermes(model, gatewayKey, upstreamApiKey, upstreamBaseUrl, p, gwPort);
		}
		case "register-cursor-mcp":
			return `mkdir -p ${p.HERMES_HOME} && touch ${p.HERMES_HOME}/mcp-registered`;
		case "seed-cron-jobs":
			return `mkdir -p ${p.HERMES_HOME}/crons && touch ${p.HERMES_HOME}/crons/.seeded`;
		case "start-gateway":
			if (agent === "openclaw") return startOpenClaw(p);
			if (agent === "claude-code" || agent === "codex") return null;
			return startHermes(p);
		case "install-closed-loop-tools":
			return installClosedLoopTools(p, isSandbox);
	}
}

function installClosedLoopTools(p: BootstrapPaths, isSandbox = false): string {
	const sudo = isSandbox ? "sudo " : "";
	return [
		"set -e",
		`mkdir -p ${p.NPM_PREFIX} ${p.NPM_CACHE} ${p.PLAYWRIGHT_BROWSERS} ${p.AGENT_BROWSER_HOME} ${p.AGENT_HOME}/docs ${p.MACHINE_HOME}/logs/services`,
		`export HOME=${p.HOME}`,
		`export NPM_CONFIG_PREFIX=${p.NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.local/bin:$PATH`,
		`${sudo}npm install -g --no-audit --no-fund --loglevel=error agent-browser playwright @playwright/mcp`,
		...(isSandbox
			? [`${sudo}npx playwright install --with-deps chromium`]
			: [
					'for i in $(seq 1 30); do fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || break; echo "waiting for dpkg lock ($i/30)..."; sleep 2; done',
					"playwright install --with-deps chromium",
				]),
		"agent-browser install || true",
		"uv tool install 'httpx[cli]' || python3 -m pip install --user 'httpx[cli]' || true",
		`cat > ${p.AGENT_HOME}/llm.txt <<'EOF'\nAgent Machines runtime context.\n\nRead /.agent/docs/agent-context.md before assuming which tools exist. Close the loop with browser automation, curl/httpx+jq, sqlite3, service logs, and network probes.\nEOF`,
		`cat > ${p.AGENT_HOME}/docs/agent-context.md <<'EOF'\n# Agent Machine Context\n\nThis machine is built for closed-loop agent development. Write code, start the service, hit the endpoint, inspect logs, fix, and retry.\n\n## Tools\n\n- Browser/UI: agent-browser, Playwright, and npx @playwright/mcp with Chromium cached under ${p.HOME}/.cache/ms-playwright.\n- API: curl, jq, and httpx.\n- Database: sqlite3.\n- Network: ss, dig, curl -v, and nc.\n- Logs: /.machine/logs/services/ plus runtime originals under ${p.HOME}.\n\nKeep toolchains and caches under ${p.HOME} because the root filesystem can reset on wake.\nEOF`,
		`${sudo}ln -sfn ${p.AGENT_HOME} /.agent || true`,
		`${sudo}ln -sfn ${p.MACHINE_HOME} /.machine || true`,
		`ln -sfn ${p.HERMES_HOME}/logs/gateway.log ${p.MACHINE_HOME}/logs/services/hermes-gateway.log || true`,
		`ln -sfn ${p.HERMES_HOME}/logs/dashboard.log ${p.MACHINE_HOME}/logs/services/hermes-dashboard.log || true`,
	].join("\n");
}

type GatewayConfig = {
	port: number;
	killPattern: string;
	envSetup: string;
	envFile: string;
	logFile: string;
	startCmd: string;
};

function gatewayConfigFor(machine: MachineRef, paths: BootstrapPaths): GatewayConfig {
	if (machine.agentKind === "openclaw") {
		return {
			port: OPENCLAW_PORT,
			killPattern: "openclaw gateway run",
			envSetup: openClawEnv(paths),
			envFile: `${paths.OPENCLAW_HOME}/.env`,
			logFile: `${paths.OPENCLAW_HOME}/logs/gateway.log`,
			startCmd: "openclaw gateway run",
		};
	}
	return {
		port: machine.providerKind === "sprites" ? 8080 : HERMES_PORT,
		killPattern: "hermes gateway",
		envSetup: hermesEnv(paths),
		envFile: `${paths.HERMES_HOME}/.env`,
		logFile: `${paths.HERMES_HOME}/logs/gateway.log`,
		startCmd: "hermes gateway",
	};
}

async function startGatewaySandbox(
	machine: MachineRef,
	provider: MachineProvider,
	paths: BootstrapPaths,
): Promise<void> {
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") return;

	const gw = gatewayConfigFor(machine, paths);

	// 1. Kill existing gateway
	await provider.exec(machine.id, [
		"set -e",
		gw.envSetup,
		`ps -eo pid,cmd 2>/dev/null | awk '/${gw.killPattern}/ && !/awk/ {print \\$1}' | xargs -r kill 2>/dev/null || true`,
		"sleep 1",
		`mkdir -p ${paths.MACHINE_HOME}/logs/services`,
	].join(" && "), { timeoutMs: 10_000 });

	// 2. Start gateway in background — use the SDK's native background mode
	// when available (E2B), fall back to & disown (Sprites)
	const gatewayCmd = [
		gw.envSetup,
		`source ${gw.envFile}`,
		`${gw.startCmd} >> ${gw.logFile} 2>&1`,
	].join(" && ");

	if (provider.execBackground) {
		await provider.execBackground(machine.id, gatewayCmd);
	} else {
		await provider.exec(machine.id,
			`${gatewayCmd} </dev/null & disown`,
			{ timeoutMs: 5_000 },
		).catch(() => {});
	}

	// 3. Poll for readiness instead of blind sleep
	const MAX_POLLS = 45;
	for (let i = 0; i < MAX_POLLS; i++) {
		const probe = await provider.exec(machine.id,
			`ss -ltn 2>/dev/null | grep -q ":${gw.port}" && echo ready || echo waiting`,
			{ timeoutMs: 5_000 },
		);
		if (probe.stdout.trim() === "ready") return;
		await new Promise(resolve => setTimeout(resolve, 1_000));
	}

	const log = await provider.exec(machine.id,
		`tail -20 ${gw.logFile} 2>/dev/null || echo "no log"`,
		{ timeoutMs: 5_000 },
	);
	throw new Error(
		`Gateway did not start on :${gw.port} after ${MAX_POLLS}s. Log:\n${log.stdout.slice(-300)}`,
	);
}

function configureHermes(
	model: string,
	gatewayKey: string,
	upstreamApiKey: string,
	upstreamBaseUrl: string,
	p: BootstrapPaths,
	port = HERMES_PORT,
): string {
	return [
		"set -e",
		hermesEnv(p),
		`hermes config set model.provider custom`,
		`hermes config set model.base_url ${upstreamBaseUrl}`,
		`hermes config set model.api_key ${upstreamApiKey}`,
		`hermes config set model.default ${model}`,
		`hermes config set first_run_complete true`,
		`cat > ${p.HERMES_HOME}/.env <<EOF\nAPI_SERVER_ENABLED=true\nAPI_SERVER_KEY=${gatewayKey}\nAPI_SERVER_HOST=0.0.0.0\nAPI_SERVER_PORT=${port}\nGATEWAY_ALLOW_ALL_USERS=true\nEOF`,
	].join(" && ");
}

function configureOpenClaw(
	model: string,
	gatewayKey: string,
	upstreamApiKey: string,
	upstreamBaseUrl: string,
	p: BootstrapPaths,
): string {
	return [
		"set -e",
		openClawEnv(p),
		`mkdir -p ${p.HOME}/.npm-global ${p.HOME}/.npm-cache ${p.HOME}/.tmp ${p.OPENCLAW_HOME}/logs`,
		`NPM_CONFIG_PREFIX=${p.HOME}/.npm-global NPM_CONFIG_CACHE=${p.HOME}/.npm-cache TMPDIR=${p.HOME}/.tmp npm install -g openclaw@latest --no-audit --no-fund --loglevel=error`,
		`openclaw config set gateway.mode local`,
		`openclaw config set gateway.http.endpoints.chatCompletions.enabled true`,
		`openclaw config set gateway.bind "0.0.0.0"`,
		`openclaw config set gateway.auth.mode none`,
		`openclaw config set agent.model ${model}`,
		`openclaw config set env.vars.ANTHROPIC_API_KEY ${upstreamApiKey}`,
		`openclaw config set env.vars.OPENAI_API_KEY ${upstreamApiKey}`,
		`openclaw config set env.vars.ANTHROPIC_BASE_URL ${upstreamBaseUrl}`,
		`cat > ${p.OPENCLAW_HOME}/.env <<EOF\nOPENCLAW_API_KEY=${gatewayKey}\nOPENCLAW_MODEL=${model}\nEOF`,
	].join(" && ");
}

function configureCliAgent(
	agent: string,
	upstreamApiKey: string,
	p: BootstrapPaths,
): string {
	const envVar = agent === "claude-code" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
	const configDir = agent === "claude-code" ? `${p.HOME}/.claude` : `${p.HOME}/.codex`;
	return [
		"set -e",
		`mkdir -p ${configDir} ${p.APP_HOME}`,
		`cat > ${p.APP_HOME}/.agent-env <<EOF\nexport ${envVar}=${upstreamApiKey}\nEOF`,
		`chmod 600 ${p.APP_HOME}/.agent-env`,
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

function startHermes(p: BootstrapPaths): string {
	const script = [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`export HOME=${p.HOME}`,
		`export HERMES_HOME=${p.HERMES_HOME}`,
		`export NPM_CONFIG_PREFIX=${p.NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HERMES_HOME}/venv/bin:${p.HOME}/.local/bin:$PATH`,
		`mkdir -p ${p.MACHINE_HOME}/logs/services`,
		`ln -sfn ${p.HERMES_HOME}/logs/gateway.log ${p.MACHINE_HOME}/logs/services/hermes-gateway.log`,
		`source ${p.HERMES_HOME}/.env`,
		`exec hermes gateway >> ${p.HERMES_HOME}/logs/gateway.log 2>&1`,
	].join("\n");
	return [
		"set -e",
		`ps -eo pid,cmd | awk '/hermes gateway/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null || true`,
		hermesEnv(p),
		`cat > ${p.HOME}/start-hermes-gateway.sh <<'EOF'\n${script}\nEOF`,
		`chmod +x ${p.HOME}/start-hermes-gateway.sh`,
		`(setsid ${p.HOME}/start-hermes-gateway.sh </dev/null &>/dev/null &) && sleep 12`,
		`ss -tlnp 2>/dev/null | grep ':${HERMES_PORT}'`,
		`echo gateway:${HERMES_PORT}`,
	].join(" && ");
}

function startOpenClaw(p: BootstrapPaths): string {
	const script = [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`export HOME=${p.HOME}`,
		`export NPM_CONFIG_PREFIX=${p.NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.npm-global/bin:$PATH`,
		`export OPENCLAW_STATE_DIR=${p.OPENCLAW_HOME}`,
		`export OPENCLAW_NO_RESPAWN=1`,
		`mkdir -p ${p.MACHINE_HOME}/logs/services`,
		`ln -sfn ${p.OPENCLAW_HOME}/logs/gateway.log ${p.MACHINE_HOME}/logs/services/openclaw-gateway.log`,
		`source ${p.OPENCLAW_HOME}/.env`,
		`exec openclaw gateway run > ${p.OPENCLAW_HOME}/logs/gateway.log 2>&1`,
	].join("\n");
	return [
		"set -e",
		`ps -eo pid,cmd | awk '/openclaw gateway run/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null || true`,
		openClawEnv(p),
		`cat > ${p.HOME}/start-openclaw-gateway.sh <<'EOF'\n${script}\nEOF`,
		`chmod +x ${p.HOME}/start-openclaw-gateway.sh`,
		`(setsid ${p.HOME}/start-openclaw-gateway.sh </dev/null &>/dev/null &) && sleep 14`,
		`ss -tlnp 2>/dev/null | grep ':${OPENCLAW_PORT}'`,
		`echo gateway:${OPENCLAW_PORT}`,
	].join(" && ");
}

function shell(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function hermesEnv(p: BootstrapPaths): string {
	return [
		`export HOME=${p.HOME}`,
		`export HERMES_HOME=${p.HERMES_HOME}`,
		`export NPM_CONFIG_PREFIX=${p.NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HERMES_HOME}/venv/bin:${p.HOME}/.local/bin:$PATH`,
	].join(" && ");
}

function openClawEnv(p: BootstrapPaths): string {
	return [
		`export HOME=${p.HOME}`,
		`export NPM_CONFIG_PREFIX=${p.NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.npm-global/bin:$PATH`,
		`export OPENCLAW_STATE_DIR=${p.OPENCLAW_HOME}`,
		`export OPENCLAW_NO_RESPAWN=1`,
	].join(" && ");
}

async function exposeGateway(
	machine: MachineRef,
	provider: MachineProvider,
	config: UserConfig,
	p: BootstrapPaths,
): Promise<string | null> {
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") {
		return null;
	}
	const port = machine.agentKind === "openclaw" ? OPENCLAW_PORT : HERMES_PORT;
	const name = machine.agentKind === "openclaw" ? "openclaw" : "hermes";
	if (provider.kind === "e2b") {
		// E2B public URL format is deterministic -- no SDK call needed
		const url = `https://${port}-${machine.id}.e2b.app`;
		return `${url}/v1`;
	}

	if (provider.kind === "sprites") {
		const spritesProvider = provider as import("@/lib/providers/sprites").SpritesProvider;
		const url = await spritesProvider.getPublicUrl(machine.id, port);
		return url ? (url.endsWith("/v1") ? url : `${url}/v1`) : null;
	}

	if (provider.kind !== "dedalus") return null;

	const tunnelToken = config.cloudflareTunnelToken;
	if (tunnelToken) {
		await startNamedTunnel(machine, provider, tunnelToken, p);
		return machine.apiUrl ?? null;
	}

	if (provider.kind === "dedalus" && "createPreview" in provider) {
		const dedalus = provider as import("@/lib/providers/dedalus").DedalusProvider;
		const previewUrl = await dedalus.createPreview(machine.id, port);
		if (previewUrl) {
			const normalized = previewUrl.trim().replace(/\/$/, "");
			return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
		}
	}

	return exposeViaCloudflared(machine, provider, port, name, p);
}

async function startNamedTunnel(
	machine: MachineRef,
	provider: MachineProvider,
	tunnelToken: string,
	p: BootstrapPaths,
): Promise<void> {
	await ensureCloudflared(machine, provider, p);
	const logPath = `${p.APP_HOME}/cloudflared-named.log`;
	const pidPath = `${p.APP_HOME}/cloudflared-named.pid`;
	const launcher = `${p.HOME}/start-tunnel-named.sh`;
	const launcherBody = [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`exec ${p.CLOUDFLARED_BIN} tunnel --no-autoupdate run --token ${tunnelToken} >> ${logPath} 2>&1`,
	].join("\n");
	await provider.exec(
		machine.id,
		[
			"set -e",
			`mkdir -p ${p.APP_HOME}`,
			`cat > ${launcher} <<'LAUNCHEOF'\n${launcherBody}\nLAUNCHEOF`,
			`chmod +x ${launcher}`,
			`(setsid ${launcher} </dev/null &>/dev/null & echo $! > ${pidPath})`,
			"sleep 5",
		].join(" && "),
		{ timeoutMs: 30_000 },
	);
}

async function exposeViaCloudflared(
	machine: MachineRef,
	provider: MachineProvider,
	port: number,
	name: string,
	p: BootstrapPaths,
): Promise<string> {
	await ensureCloudflared(machine, provider, p);
	const logPath = `${p.APP_HOME}/cloudflared-${name}.log`;
	const pidPath = `${p.APP_HOME}/cloudflared-${name}.pid`;
	const launcher = `${p.HOME}/start-tunnel-${name}.sh`;
	const launcherBody = [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`exec ${p.CLOUDFLARED_BIN} tunnel --no-autoupdate --url http://127.0.0.1:${port} --metrics 127.0.0.1:0 >> ${logPath} 2>&1`,
	].join("\n");
	await provider.exec(
		machine.id,
		[
			"set -e",
			`mkdir -p ${p.APP_HOME}`,
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
	p: BootstrapPaths,
): Promise<void> {
	const check = await provider.exec(machine.id, `[ -x ${p.CLOUDFLARED_BIN} ]`, {
		timeoutMs: 15_000,
	});
	if (check.exitCode === 0) return;
	const result = await provider.exec(
		machine.id,
		`mkdir -p ${p.HOME}/.local/bin && curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ${p.CLOUDFLARED_BIN} && chmod +x ${p.CLOUDFLARED_BIN} && ${p.CLOUDFLARED_BIN} --version`,
		{ timeoutMs: 180_000 },
	);
	if (result.exitCode !== 0) {
		throw new Error(`cloudflared install failed: ${result.stderr || result.stdout}`);
	}
}
