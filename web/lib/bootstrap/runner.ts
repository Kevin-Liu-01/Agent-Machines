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
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { ROUTER_PRESETS } from "@/lib/agents/upstreams";
import {
	buildMcpRegisterShell,
	buildWebReloadScript,
	REPO_BRANCH,
	REPO_CLONE_URL,
} from "@/lib/bootstrap/reload-script";
import {
	ensureGatewayRunning,
	installGatewayUnitCommand,
	waitForGatewayUrl,
} from "@/lib/bootstrap/gateway-lifecycle";
import {
	bootstrapLogPath,
	wrapPhaseCommand,
} from "@/lib/bootstrap/bootstrap-log";
import { migrateLegacyPathsShell } from "@/lib/platform/runtime";
import {
	BOOTSTRAP_PHASES,
	CORE_BOOTSTRAP_PHASES,
	POST_GATEWAY_BOOTSTRAP_PHASES,
	type BootstrapPhaseId,
	type BootstrapState,
	type GatewayProfile,
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
		providerKind === "vercel" ? "/vercel/sandbox" :
		"/home/machine";
	return {
		HOME,
		AGENT_HOME: `${HOME}/.agent`,
		MACHINE_HOME: `${HOME}/.machine`,
		HERMES_HOME: `${HOME}/.agent-machines`,
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

const WAIT_FOR_APT =
	'for i in $(seq 1 90); do pgrep -x apt-get >/dev/null 2>&1 || pgrep -x apt >/dev/null 2>&1 || pgrep -x dpkg >/dev/null 2>&1 || break; echo "waiting for apt ($i/90)..."; sleep 2; done';

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
	force = false,
}: {
	machine: MachineRef;
	provider: MachineProvider;
	config: UserConfig;
	onState: StateSink;
	force?: boolean;
}): Promise<BootstrapResult> {
	const credCheck = validateAgentCredentials(machine.agentKind, config);
	if (!credCheck.ok) {
		throw new Error(credCheck.message);
	}

	const priorCompleted = machine.bootstrapState.completed ?? [];
	const completed: BootstrapPhaseId[] = force ? [] : [...priorCompleted];
	const startedAt = machine.bootstrapState.startedAt ?? new Date().toISOString();
	const paths = pathsFor(machine.providerKind);
	const apiKey = await resolveGatewayApiKey(machine, provider, paths);
	await onState({
		phase: "running",
		current: CORE_BOOTSTRAP_PHASES[0],
		completed,
		startedAt,
		finishedAt: null,
		lastError: null,
	});

	const skipPhases = force ? new Set<BootstrapPhaseId>() : new Set(priorCompleted);

	try {
		for (const phase of CORE_BOOTSTRAP_PHASES) {
			if (skipPhases.has(phase)) {
				if (phase === "install-hermes" && machine.agentKind === "hermes") {
					const hermesBin = `${paths.HERMES_HOME}/venv/bin/hermes`;
					const probe = await provider.exec(
						machine.id,
						`${hermesBin} --version >/dev/null 2>&1 && echo ok || echo broken`,
						{ timeoutMs: 20_000 },
					);
					if (probe.stdout.trim() !== "ok") {
						skipPhases.delete(phase);
					} else {
						if (!completed.includes(phase)) completed.push(phase);
						continue;
					}
				} else if (phase === "configure-hermes") {
					const probeCmd = configureHealthProbe(machine.agentKind, paths);
					if (probeCmd) {
						const probe = await provider.exec(machine.id, probeCmd, {
							timeoutMs: 20_000,
						});
						if (probe.stdout.trim() !== "ok") {
							skipPhases.delete(phase);
						} else {
							if (!completed.includes(phase)) completed.push(phase);
							continue;
						}
					} else {
						if (!completed.includes(phase)) completed.push(phase);
						continue;
					}
				} else {
					if (!completed.includes(phase)) completed.push(phase);
					continue;
				}
			}
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
		const apiUrl = await exposeGateway(machine, provider, config, paths, apiKey);
		await onState({
			phase: "succeeded",
			current: null,
			completed,
			startedAt,
			finishedAt: new Date().toISOString(),
			lastError: null,
		});

		for (const phase of POST_GATEWAY_BOOTSTRAP_PHASES) {
			if (skipPhases.has(phase)) continue;
			try {
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
				await onState({
					phase: "succeeded",
					current: null,
					completed,
					startedAt,
					finishedAt: new Date().toISOString(),
					lastError: null,
				});
			} catch (postErr) {
				const message =
					postErr instanceof Error ? postErr.message : "post-bootstrap failed";
				await onState({
					phase: "succeeded",
					current: null,
					completed,
					startedAt,
					finishedAt: new Date().toISOString(),
					lastError: message,
				}).catch(() => {});
			}
		}

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

async function resolveGatewayApiKey(
	machine: MachineRef,
	provider: MachineProvider,
	paths: BootstrapPaths,
): Promise<string> {
	if (machine.apiKey) return machine.apiKey;
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") {
		return crypto.randomUUID();
	}
	const envFile =
		machine.agentKind === "openclaw"
			? `${paths.OPENCLAW_HOME}/.env`
			: `${paths.HERMES_HOME}/.env`;
	const keyName =
		machine.agentKind === "openclaw" ? "OPENCLAW_API_KEY" : "API_SERVER_KEY";
	const probe = await provider.exec(
		machine.id,
		`grep -E '^${keyName}=' ${envFile} 2>/dev/null | head -1 | cut -d= -f2- || true`,
		{ timeoutMs: 20_000 },
	);
	const fromEnv = probe.stdout.trim();
	if (fromEnv) return fromEnv;
	return crypto.randomUUID();
}

/** Start gateway + wire public URL when Hermes is already installed (fast repair path). */
export async function finalizeGatewayBootstrap({
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
	const paths = pathsFor(machine.providerKind);
	const apiKey = await resolveGatewayApiKey(machine, provider, paths);
	const startedAt = machine.bootstrapState.startedAt ?? new Date().toISOString();
	const completed = [...(machine.bootstrapState.completed ?? [])];

	await onState({
		phase: "running",
		current: "start-gateway",
		completed,
		startedAt,
		finishedAt: null,
		lastError: null,
	});

	const isSandbox =
		machine.providerKind === "e2b" ||
		machine.providerKind === "sprites" ||
		machine.providerKind === "vercel";
	if (isSandbox) {
		await startGatewaySandbox(machine, provider, paths);
	} else {
		await ensureGatewayRunning(machine, provider);
	}
	if (!completed.includes("start-gateway")) {
		completed.push("start-gateway");
	}

	const apiUrl = await exposeGateway(machine, provider, config, paths, apiKey);
	await onState({
		phase: "succeeded",
		current: null,
		completed,
		startedAt,
		finishedAt: new Date().toISOString(),
		lastError: null,
	});
	return { apiUrl, apiKey };
}

async function runPhase(
	phase: BootstrapPhaseId,
	machine: MachineRef,
	provider: MachineProvider,
	config: UserConfig,
	apiKey: string,
	paths: BootstrapPaths,
): Promise<void> {
	const isSandbox =
		machine.providerKind === "e2b" ||
		machine.providerKind === "sprites" ||
		machine.providerKind === "vercel";

	if (phase === "start-gateway" && isSandbox) {
		await startGatewaySandbox(machine, provider, paths);
		return;
	}

	const command = commandFor(phase, machine, config, apiKey, paths);
	if (command === null) return;
	const logPath = bootstrapLogPath(machine.providerKind);
	const wrapped = wrapPhaseCommand(phase, command, logPath);
	const result = await provider.exec(machine.id, wrapped, { timeoutMs: 900_000 });
	if (result.exitCode !== 0) {
		throw new Error(
			`${phase} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
		);
	}
}

type UpstreamProvider = { key: string; baseUrl: string };

const DEDALUS_BASE = "https://api.dedaluslabs.ai/v1";
const DEDALUS_DCS_HOST = "dcs.dedaluslabs.ai";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const VERCEL_AI_GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

/**
 * Machine control plane (dcs.dedaluslabs.ai) ≠ LLM router (api.dedaluslabs.ai/v1).
 * Provider creds often store the DCS URL — normalize before writing Hermes config.
 */
export function normalizeDedalusLlmBaseUrl(baseUrl: string | undefined): string {
	if (!baseUrl || baseUrl.includes(DEDALUS_DCS_HOST)) {
		return DEDALUS_BASE;
	}
	const trimmed = baseUrl.trim().replace(/\/$/, "");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

/**
 * Resolve the LLM upstream (key + base URL) for a machine's agent.
 *
 * - codex / claude-code are locked to their native API (OpenAI Responses /
 *   Anthropic Messages); no router can substitute, so we use the native key.
 * - hermes / openclaw are OpenAI-compatible gateways: they honor the
 *   machine's chosen gateway profile (gatewayProfileId), so users can route
 *   through Dedalus, Vercel AI Gateway, or any custom OpenAI-compatible
 *   endpoint instead of being locked to Dedalus. Falls back to the first
 *   configured key (Dedalus-first) for back-compat when no profile resolves.
 */
function resolveUpstream(machine: MachineRef, config: UserConfig): UpstreamProvider {
	const agent = machine.agentKind;
	const ai = config.aiProviderKeys ?? {};

	if (agent === "codex") {
		return { key: ai.openai ?? "", baseUrl: OPENAI_BASE };
	}
	if (agent === "claude-code") {
		return { key: ai.anthropic ?? "", baseUrl: ANTHROPIC_BASE };
	}

	// hermes / openclaw: use the explicitly chosen router when it resolves —
	// a saved gateway profile first, then a built-in router preset by id.
	const profile = machine.gatewayProfileId
		? config.gatewayProfiles.find((p) => p.id === machine.gatewayProfileId)
		: null;
	if (profile) {
		const chosen = gatewayProfileToUpstream(profile, config);
		if (chosen.key) return chosen;
	}
	if (machine.gatewayProfileId) {
		const preset = resolveRouterPreset(machine.gatewayProfileId, config);
		if (preset?.key) return preset;
	}

	return firstConfiguredUpstream(config);
}

/** Resolve a built-in router preset id to a concrete upstream key + base URL. */
function resolveRouterPreset(
	id: string,
	config: UserConfig,
): UpstreamProvider | null {
	const preset = ROUTER_PRESETS.find((p) => p.id === id);
	if (!preset) return null;
	const ai = config.aiProviderKeys ?? {};
	switch (preset.source) {
		case "dedalus":
			return {
				key: config.providers.dedalus?.apiKey ?? "",
				baseUrl: normalizeDedalusLlmBaseUrl(config.providers.dedalus?.baseUrl),
			};
		case "vercelAiGateway":
			return {
				key: ai.vercelAiGateway ?? process.env.VERCEL_OIDC_TOKEN?.trim() ?? "",
				baseUrl: preset.baseUrl ?? VERCEL_AI_GATEWAY_BASE,
			};
		case "openai":
			return { key: ai.openai ?? "", baseUrl: preset.baseUrl ?? OPENAI_BASE };
		case "openrouter":
			return { key: ai.openrouter ?? "", baseUrl: preset.baseUrl ?? OPENROUTER_BASE };
		case "google":
			return { key: ai.google ?? "", baseUrl: preset.baseUrl ?? OPENAI_BASE };
		case "custom":
			return { key: ai.custom?.key ?? "", baseUrl: ai.custom?.url ?? "" };
		default:
			return null;
	}
}

/** Map a gateway profile to a concrete upstream key + base URL. */
function gatewayProfileToUpstream(
	profile: GatewayProfile,
	config: UserConfig,
): UpstreamProvider {
	const ai = config.aiProviderKeys ?? {};
	if (profile.kind === "dedalus") {
		return {
			key: config.providers.dedalus?.apiKey ?? "",
			baseUrl: normalizeDedalusLlmBaseUrl(config.providers.dedalus?.baseUrl),
		};
	}
	if (profile.kind === "vercel-ai-gateway") {
		return {
			key:
				profile.apiKey ??
				ai.vercelAiGateway ??
				process.env.VERCEL_OIDC_TOKEN?.trim() ??
				"",
			baseUrl: profile.baseUrl ?? VERCEL_AI_GATEWAY_BASE,
		};
	}
	// openai-compatible: explicit profile key, else infer from the base URL.
	const baseUrl = profile.baseUrl ?? OPENAI_BASE;
	let key = profile.apiKey ?? "";
	if (!key) {
		if (baseUrl.includes("openrouter")) key = ai.openrouter ?? "";
		else if (baseUrl.includes("openai.com")) key = ai.openai ?? "";
		else if (baseUrl.includes("dedalus")) key = config.providers.dedalus?.apiKey ?? "";
		else if (baseUrl.includes("ai-gateway.vercel")) key = ai.vercelAiGateway ?? "";
		else key = ai.custom?.key ?? "";
	}
	return { key, baseUrl };
}

/** Back-compat fallback: first configured upstream, Dedalus-first. */
function firstConfiguredUpstream(config: UserConfig): UpstreamProvider {
	const ai = config.aiProviderKeys ?? {};
	const dedalus = config.providers.dedalus?.apiKey;
	if (dedalus) {
		return { key: dedalus, baseUrl: normalizeDedalusLlmBaseUrl(config.providers.dedalus?.baseUrl) };
	}
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
	const upstream = resolveUpstream(machine, config);
	const upstreamApiKey = shell(upstream.key);
	const upstreamBaseUrl = shell(upstream.baseUrl);
	const cursorKey = config.cursorApiKey ? shell(config.cursorApiKey) : null;

	const providerKind = machine.providerKind;
	const isE2B = providerKind === "e2b";
	const isSprites = providerKind === "sprites";
	const isVercel = providerKind === "vercel";
	const isSandbox = isE2B || isSprites || isVercel;
	// E2B, Sprites, and Vercel run as non-root users with sudo available
	const sudo = isSandbox ? "sudo " : "";

	switch (phase) {
		case "system-deps":
			const migrate = migrateLegacyPathsShell(p.HOME, p.APP_HOME);
			if (isVercel) {
				return [
					"set -e",
					migrate,
					`mkdir -p ${p.APP_HOME}/chats ${p.APP_HOME}/artifacts ${p.HERMES_HOME}/logs ${p.OPENCLAW_HOME}/logs ${p.MACHINE_HOME}/logs/services`,
					`${sudo}dnf install -y -q jq sqlite >/dev/null 2>&1 || true`,
				].join(" && ");
			}
			if (isSandbox) {
				return [
					"set -e",
					migrate,
					`mkdir -p ${p.APP_HOME}/chats ${p.APP_HOME}/artifacts ${p.HERMES_HOME}/logs ${p.OPENCLAW_HOME}/logs ${p.MACHINE_HOME}/logs/services`,
					`${sudo}apt-get update -qq >/dev/null 2>&1 || true`,
					`${sudo}apt-get install -y -qq jq sqlite3 >/dev/null 2>&1 || true`,
				].join(" && ");
			}
			return [
				"set -e",
				`mkdir -p ${p.HOME} ${p.HOME}/.local/bin`,
				migrate,
				`mkdir -p ${p.APP_HOME}/chats ${p.APP_HOME}/artifacts ${p.HERMES_HOME}/logs ${p.OPENCLAW_HOME}/logs ${p.MACHINE_HOME}/logs/services`,
				WAIT_FOR_APT,
				`${sudo}apt-get update -qq >/dev/null`,
				`${sudo}apt-get install -y -qq curl git build-essential ca-certificates jq sqlite3 dnsutils iproute2 netcat-openbsd >/dev/null`,
			].join(" && ");
		case "install-uv":
			if (agent !== "hermes") return null;
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
				`if ${p.HERMES_HOME}/venv/bin/hermes --version >/dev/null 2>&1; then exit 0; fi`,
				WAIT_FOR_APT,
				`${sudo}apt-get update -qq >/dev/null && ${sudo}apt-get install -y -qq python3-venv python3-pip >/dev/null`,
				`rm -rf ${p.HERMES_HOME}/venv`,
				`uv venv ${p.HERMES_HOME}/venv --python python3`,
				`uv pip install --python ${p.HERMES_HOME}/venv/bin/python 'hermes-agent[web,mcp] @ git+https://github.com/NousResearch/hermes-agent.git@main' aiohttp`,
			].join(" && ");
		case "install-node":
			if (isSandbox && machine.agentKind === "openclaw") {
				return [
					"set -e",
					`node -e 'process.exit(Number(process.version.slice(1).split(".")[0]) >= 22 ? 0 : 1)' && node --version && exit 0 || true`,
					`export FNM_DIR="${p.HOME}/.local/share/fnm"`,
					`export PATH="$FNM_DIR:$PATH"`,
					`if ! command -v fnm >/dev/null; then curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$FNM_DIR" --skip-shell; fi`,
					`eval "$(fnm env)"`,
					`fnm install 22`,
					`fnm use 22`,
					`node --version`,
				].join(" && ");
			}
			if (isSandbox) {
				return "set -e && node --version";
			}
			return [
				"set -e",
				"command -v node >/dev/null 2>&1 && node --version && exit 0",
				WAIT_FOR_APT,
				"curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
				"DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs",
				"node --version",
			].join(" && ");
		case "seed-knowledge":
			return [
				"set -e",
				`mkdir -p ${p.HERMES_HOME}/skills ${p.HERMES_HOME}/crons ${p.HERMES_HOME}/mcps ${p.APP_HOME}`,
				`cat > ${p.APP_HOME}/settings.json <<'EOF'\n${machineSettingsJson(machine, config)}\nEOF`,
			].join(" && ");
		case "install-git-reload": {
			const reloadBody = buildWebReloadScript(p.HOME, p.APP_HOME);
			const repoDir = `${p.HOME}/agent-machines`;
			const legacyRepo = `${p.HOME}/hermes-machines`;
			return [
				"set -e",
				`if [ ! -d ${repoDir}/.git ]; then ` +
					`if [ -d ${legacyRepo}/.git ]; then ln -sfn ${legacyRepo} ${repoDir}; ` +
					`else rm -rf ${repoDir} && git clone --depth 1 --branch ${REPO_BRANCH} ${REPO_CLONE_URL} ${repoDir}; fi; ` +
					`else cd ${repoDir} && git fetch --depth 1 origin ${REPO_BRANCH} && git reset --hard origin/${REPO_BRANCH}; fi`,
				`mkdir -p ${p.HERMES_HOME}/scripts ${p.APP_HOME}/scripts`,
				// base64 write, not a heredoc: this command is `&&`-joined, and a
				// heredoc whose closing `EOF` isn't alone on its line ("EOF && ...")
				// never terminates -> "unexpected end of file". writeRemoteFile is safe.
				writeRemoteFile(`${p.HERMES_HOME}/scripts/reload-from-git.sh`, reloadBody),
				`chmod +x ${p.HERMES_HOME}/scripts/reload-from-git.sh`,
				// HERMES_HOME === APP_HOME on every provider, so this symlink would
				// point a file at itself ("are the same file", exit 1 under set -e).
				// Only link when the paths actually differ.
				`[ "${p.HERMES_HOME}/scripts/reload-from-git.sh" = "${p.APP_HOME}/scripts/reload-from-git.sh" ] || ln -sfn ${p.HERMES_HOME}/scripts/reload-from-git.sh ${p.APP_HOME}/scripts/reload-from-git.sh`,
				`${p.HERMES_HOME}/scripts/reload-from-git.sh`,
			].join(" && ");
		}
		case "install-cursor-bridge":
			return cursorKey
				? `mkdir -p ${p.APP_HOME}/cursor && printf %s ${cursorKey} > ${p.APP_HOME}/cursor/.configured`
				: `mkdir -p ${p.APP_HOME}/cursor && touch ${p.APP_HOME}/cursor/.disabled`;
		case "configure-hermes": {
			// Sprites proxies the sprite URL to port 8080; E2B uses per-port URLs
			const gwPort = isSprites ? 8080 : HERMES_PORT;
			if (agent === "openclaw") {
				const ocPort = isSprites ? 8080 : OPENCLAW_PORT;
				return configureOpenClaw(model, gatewayKey, upstreamApiKey, upstreamBaseUrl, p, ocPort, upstream.baseUrl);
			}
			if (agent === "claude-code" || agent === "codex") {
				return configureCliAgent(agent, upstream.key, upstream.baseUrl, p, isSandbox);
			}
			return configureHermes(model, gatewayKey, upstreamApiKey, upstreamBaseUrl, p, gwPort, upstream.baseUrl);
		}
		case "register-cursor-mcp":
			// buildMcpRegisterShell writes into hermes' config.yaml via the hermes
			// venv python. openclaw has no venv and uses its own MCP config
			// (`openclaw config set`), so this phase is both useless and fatal for
			// it (NO-VENV + system python3 lacks PyYAML -> exit 1). Hermes only.
			return agent === "hermes"
				? buildMcpRegisterShell(p.APP_HOME, p.HOME, Boolean(cursorKey))
				: null;
		case "seed-cron-jobs":
			return `mkdir -p ${p.HERMES_HOME}/crons && touch ${p.HERMES_HOME}/crons/.seeded`;
		case "start-gateway":
			if (agent === "openclaw") return startOpenClaw(p, machine);
			if (agent === "claude-code" || agent === "codex") return null;
			return startHermes(p, machine);
		case "install-closed-loop-tools":
			return installClosedLoopTools(p, isSandbox);
	}
}

function installClosedLoopTools(p: BootstrapPaths, isSandbox = false): string {
	// Sprites/E2B: run as the sandbox user — sudo strips PATH and often lacks npm.
	const envBlock = [
		"set -e",
		`export HOME=${p.HOME}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.local/bin:$PATH`,
	].join("\n");
	const npmGlobal = isSandbox
		? `npm install -g --prefix=${p.NPM_PREFIX} --no-audit --no-fund --loglevel=error agent-browser playwright @playwright/mcp`
		: "npm install -g --no-audit --no-fund --loglevel=error agent-browser playwright @playwright/mcp";
	const playwrightInstall = isSandbox
		? "npx playwright install --with-deps chromium"
		: [
				WAIT_FOR_APT,
				"playwright install --with-deps chromium",
			].join("\n");
	const rootLinks = isSandbox
		? [
				`mkdir -p /.agent /.machine 2>/dev/null || true`,
				`ln -sfn ${p.AGENT_HOME} /.agent 2>/dev/null || true`,
				`ln -sfn ${p.MACHINE_HOME} /.machine 2>/dev/null || true`,
			]
		: [
				`ln -sfn ${p.AGENT_HOME} /.agent || true`,
				`ln -sfn ${p.MACHINE_HOME} /.machine || true`,
			];
	return [
		envBlock,
		`mkdir -p ${p.NPM_PREFIX} ${p.NPM_CACHE} ${p.PLAYWRIGHT_BROWSERS} ${p.AGENT_BROWSER_HOME} ${p.AGENT_HOME}/docs ${p.MACHINE_HOME}/logs/services`,
		npmGlobal,
		playwrightInstall,
		"agent-browser install || true",
		"uv tool install 'httpx[cli]' || python3 -m pip install --user 'httpx[cli]' || true",
		`cat > ${p.AGENT_HOME}/llm.txt <<'EOF'\nAgent Machines runtime context.\n\nRead /.agent/docs/agent-context.md before assuming which tools exist. Close the loop with browser automation, curl/httpx+jq, sqlite3, service logs, and network probes.\nEOF`,
		`cat > ${p.AGENT_HOME}/docs/agent-context.md <<'EOF'\n# Agent Machine Context\n\nThis machine is built for closed-loop agent development. Write code, start the service, hit the endpoint, inspect logs, fix, and retry.\n\n## Tools\n\n- Browser/UI: agent-browser, Playwright, and npx @playwright/mcp with Chromium cached under ${p.HOME}/.cache/ms-playwright.\n- API: curl, jq, and httpx.\n- Database: sqlite3.\n- Network: ss, dig, curl -v, and nc.\n- Logs: /.machine/logs/services/ plus runtime originals under ${p.HOME}.\n\nKeep toolchains and caches under ${p.HOME} because the root filesystem can reset on wake.\nEOF`,
		...rootLinks,
		`ln -sfn ${p.APP_HOME}/logs/gateway.log ${p.MACHINE_HOME}/logs/services/agent-gateway.log || true`,
		`ln -sfn ${p.APP_HOME}/logs/dashboard.log ${p.MACHINE_HOME}/logs/services/agent-dashboard.log || true`,
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
		const port = machine.providerKind === "sprites" ? 8080 : OPENCLAW_PORT;
		return {
			port,
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

	const alreadyUp = await provider.exec(
		machine.id,
		`ss -ltn 2>/dev/null | grep -q ":${gw.port} " && echo ready || echo waiting`,
		{ timeoutMs: 15_000 },
	);
	if (alreadyUp.stdout.trim() === "ready") return;

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

/**
 * Map an upstream base URL to a hermes-agent provider id. Built-in providers
 * (openrouter/openai/anthropic) are registered as pooled credentials via
 * `hermes auth add`; everything else (Dedalus, Vercel AI Gateway, custom) is a
 * `custom` OpenAI-compatible endpoint configured with base_url + api_key.
 */
function hermesProviderId(rawBaseUrl: string): { id: string; builtin: boolean } {
	const b = rawBaseUrl.toLowerCase();
	if (b.includes("openrouter")) return { id: "openrouter", builtin: true };
	if (b.includes("api.openai.com")) return { id: "openai", builtin: true };
	if (b.includes("api.anthropic.com")) return { id: "anthropic", builtin: true };
	return { id: "custom", builtin: false };
}

function configureHermes(
	model: string,
	gatewayKey: string,
	upstreamApiKey: string,
	upstreamBaseUrl: string,
	p: BootstrapPaths,
	port = HERMES_PORT,
	rawBaseUrl = "",
): string {
	// hermes-agent @main: the default model lives at `model.model` (not the old
	// `model.default`), and built-in providers take a pooled credential via
	// `hermes auth add`. Writing the old schema left the gateway with "No LLM
	// provider configured". This builds the current schema.
	const { id, builtin } = hermesProviderId(rawBaseUrl);
	const cmds = ["set -e", hermesEnv(p)];
	if (builtin) {
		cmds.push(
			`hermes auth add ${id} --type api-key --api-key ${upstreamApiKey} --label agent-machines --no-browser 2>/dev/null || true`,
			`hermes config set model.provider ${id}`,
		);
	} else {
		cmds.push(
			`hermes config set model.provider custom`,
			`hermes config set model.base_url ${upstreamBaseUrl}`,
			`hermes config set model.api_key ${upstreamApiKey}`,
		);
	}
	cmds.push(
		`hermes config set model.model ${model}`,
		`hermes config set first_run_complete true`,
		`cat > ${p.HERMES_HOME}/.env <<EOF\nAPI_SERVER_ENABLED=true\nAPI_SERVER_KEY=${gatewayKey}\nAPI_SERVER_HOST=0.0.0.0\nAPI_SERVER_PORT=${port}\nGATEWAY_ALLOW_ALL_USERS=true\nEOF`,
	);
	return cmds.join(" && ");
}

/**
 * Map an upstream base URL to an openclaw provider. openclaw bundles
 * openrouter/openai/anthropic (auth via a pasted API key); any other
 * OpenAI-compatible router (Dedalus / Vercel AI Gateway / custom) is registered
 * as a `models.providers` custom provider with api=openai-completions.
 */
function openclawProviderFor(rawBaseUrl: string): { id: string; builtin: boolean } {
	const b = rawBaseUrl.toLowerCase();
	if (b.includes("openrouter")) return { id: "openrouter", builtin: true };
	if (b.includes("api.openai.com")) return { id: "openai", builtin: true };
	if (b.includes("api.anthropic.com")) return { id: "anthropic", builtin: true };
	return { id: "router", builtin: false };
}

function configureOpenClaw(
	model: string,
	gatewayKey: string,
	upstreamApiKey: string,
	upstreamBaseUrl: string,
	p: BootstrapPaths,
	gatewayPort = OPENCLAW_PORT,
	rawBaseUrl = "",
): string {
	const stripShell = (value: string) => value.replace(/^'|'$/g, "");
	const rawKey = stripShell(upstreamApiKey);
	const rawBase = stripShell(upstreamBaseUrl);
	const rawModel = stripShell(model);
	const { id, builtin } = openclawProviderFor(rawBaseUrl || rawBase);
	// openclaw splits model refs on the first "/"; routers keep the upstream
	// provider prefix (e.g. openrouter/openai/gpt-4o-mini). Don't double-prefix.
	const modelRef = rawModel.startsWith(`${id}/`) ? rawModel : `${id}/${rawModel}`;
	const shortName = rawModel.includes("/")
		? rawModel.slice(rawModel.lastIndexOf("/") + 1)
		: rawModel;

	// Gateway transport config only. openclaw does NOT inject config env.vars
	// into its own LLM client, so provider creds go through auth profiles /
	// custom providers below (an env.vars-only setup 401s against api.openai.com).
	const batch = JSON.stringify([
		{ path: "gateway.mode", value: "local" },
		{ path: "gateway.port", value: gatewayPort },
		{ path: "gateway.http.endpoints.chatCompletions.enabled", value: true },
		{ path: "gateway.bind", value: "lan" },
		{ path: "gateway.auth.mode", value: "token" },
		{ path: "gateway.auth.token", value: stripShell(gatewayKey) },
	]);
	const batchPath = `${p.OPENCLAW_HOME}/bootstrap-config.batch.json`;
	// Sprites ships nvm; NPM_CONFIG_PREFIX breaks npm/nvm — use --prefix instead.
	const npmInstall =
		`if test -x ${p.NPM_PREFIX}/bin/openclaw; then :; else ` +
		`rm -rf ${p.NPM_PREFIX}/lib/node_modules/openclaw ${p.NPM_PREFIX}/lib/node_modules/.openclaw-* 2>/dev/null || true; ` +
		`(NPM_CONFIG_CACHE=${p.NPM_CACHE} TMPDIR=${p.HOME}/.tmp npm install -g openclaw@latest --prefix=${p.NPM_PREFIX} --no-audit --no-fund --loglevel=error); fi`;
	// Built-in providers: paste the API key into an auth profile (key on stdin).
	// Custom OpenAI-compatible routers: register a models.providers entry.
	const providerSetup = builtin
		? `printf '%s\\n' '${rawKey}' | openclaw models auth paste-api-key --provider ${id}`
		: `openclaw config set models.providers.${id} '${JSON.stringify({ baseUrl: rawBase, apiKey: rawKey, api: "openai-completions", models: [{ id: rawModel, name: shortName }] })}' --strict-json --merge`;
	return [
		"set -e",
		`mkdir -p ${p.HOME}/.npm-global ${p.HOME}/.npm-cache ${p.HOME}/.tmp ${p.OPENCLAW_HOME}/logs`,
		npmInstall,
		openClawEnv(p),
		writeRemoteFile(batchPath, batch),
		`openclaw config set --batch-file ${batchPath}`,
		providerSetup,
		`openclaw models set ${modelRef}`,
		writeRemoteFile(
			`${p.OPENCLAW_HOME}/.env`,
			`OPENCLAW_API_KEY=${stripShell(gatewayKey)}\nOPENCLAW_MODEL=${modelRef}\n`,
		),
	].join(" && ");
}

function configureCliAgent(
	agent: string,
	upstreamApiKey: string,
	upstreamBaseUrl: string,
	p: BootstrapPaths,
	isSandbox: boolean,
): string {
	const isClaude = agent === "claude-code";
	const keyVar = isClaude ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
	const baseVar = isClaude ? "ANTHROPIC_BASE_URL" : "OPENAI_BASE_URL";
	const configDir = isClaude ? `${p.HOME}/.claude` : `${p.HOME}/.codex`;
	const pathLine = `export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.local/bin:$PATH`;
	const profileSnippet = [
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.local/bin:$PATH`,
		`export ${keyVar}=${upstreamApiKey}`,
		`export ${baseVar}=${upstreamBaseUrl}`,
	].join("\n");
	const envWrite = writeRemoteFile(`${p.APP_HOME}/.agent-env`, `${profileSnippet}\n`);

	if (isClaude) {
		const aptWait = isSandbox ? "" : `${WAIT_FOR_APT} && `;
		const claudeInstall = isSandbox
			? `NPM_CONFIG_CACHE=${p.NPM_CACHE} npm install -g @anthropic-ai/claude-code --prefix=${p.NPM_PREFIX} --no-audit --no-fund --loglevel=error`
			: `${aptWait}curl -fsSL https://claude.ai/install.sh | bash`;
		return [
			"set -e",
			`export HOME=${p.HOME}`,
			pathLine,
			`mkdir -p ${configDir} ${p.APP_HOME} ${p.NPM_PREFIX} ${p.NPM_CACHE}`,
			`if ! command -v claude >/dev/null 2>&1 || ! claude --version >/dev/null 2>&1; then ${claudeInstall}; fi`,
			envWrite,
			`chmod 600 ${p.APP_HOME}/.agent-env`,
			`${pathLine} && claude --version`,
		].join(" && ");
	}

	const aptWait = isSandbox ? "" : `${WAIT_FOR_APT} && `;
	return [
		"set -e",
		`export HOME=${p.HOME}`,
		pathLine,
		`mkdir -p ${configDir} ${p.APP_HOME} ${p.NPM_PREFIX} ${p.NPM_CACHE}`,
		`if ! command -v codex >/dev/null 2>&1 || ! codex --version >/dev/null 2>&1; then ` +
			`${aptWait}NPM_CONFIG_CACHE=${p.NPM_CACHE} npm install -g @openai/codex --prefix=${p.NPM_PREFIX} --no-audit --no-fund --loglevel=error; fi`,
		envWrite,
		`chmod 600 ${p.APP_HOME}/.agent-env`,
		`${pathLine} && codex --version`,
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

function startHermes(p: BootstrapPaths, machine: MachineRef): string {
	const hermesBin = `${p.HERMES_HOME}/venv/bin/hermes`;
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
		`exec ${hermesBin} gateway >> ${p.HERMES_HOME}/logs/gateway.log 2>&1`,
	].join("\n");
	const gatewayPaths = {
		HOME: p.HOME,
		HERMES_HOME: p.HERMES_HOME,
		OPENCLAW_HOME: p.OPENCLAW_HOME,
		NPM_PREFIX: p.NPM_PREFIX,
		NPM_CACHE: p.NPM_CACHE,
		PLAYWRIGHT_BROWSERS: p.PLAYWRIGHT_BROWSERS,
		AGENT_BROWSER_HOME: p.AGENT_BROWSER_HOME,
		MACHINE_HOME: p.MACHINE_HOME,
	};
	return [
		"set -e",
		`ps -eo pid,cmd | awk '/hermes gateway/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null || true`,
		hermesEnv(p),
		`cat > ${p.HOME}/start-hermes-gateway.sh <<'EOF'\n${script}\nEOF`,
		`chmod +x ${p.HOME}/start-hermes-gateway.sh`,
		installGatewayUnitCommand(machine, gatewayPaths),
		"sleep 12",
		`ss -tlnp 2>/dev/null | grep ':${HERMES_PORT}'`,
		`echo gateway:${HERMES_PORT}`,
	].join("\n");
}

function startOpenClaw(p: BootstrapPaths, machine: MachineRef): string {
	const gwPort = machine.providerKind === "sprites" ? 8080 : OPENCLAW_PORT;
	const script = [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`export HOME=${p.HOME}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export FNM_DIR=${p.HOME}/.local/share/fnm`,
		`if [ -x "$FNM_DIR/fnm" ]; then eval "$($FNM_DIR/fnm env)"; fi`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.npm-global/bin:$PATH`,
		`export OPENCLAW_STATE_DIR=${p.OPENCLAW_HOME}`,
		`export OPENCLAW_NO_RESPAWN=1`,
		`mkdir -p ${p.MACHINE_HOME}/logs/services ${p.OPENCLAW_HOME}/logs`,
		`ln -sfn ${p.OPENCLAW_HOME}/logs/gateway.log ${p.MACHINE_HOME}/logs/services/openclaw-gateway.log`,
		`set -a && source ${p.OPENCLAW_HOME}/.env && set +a`,
		`exec openclaw gateway run >> ${p.OPENCLAW_HOME}/logs/gateway.log 2>&1`,
	].join("\n");
	const gatewayPaths = {
		HOME: p.HOME,
		HERMES_HOME: p.HERMES_HOME,
		OPENCLAW_HOME: p.OPENCLAW_HOME,
		NPM_PREFIX: p.NPM_PREFIX,
		NPM_CACHE: p.NPM_CACHE,
		PLAYWRIGHT_BROWSERS: p.PLAYWRIGHT_BROWSERS,
		AGENT_BROWSER_HOME: p.AGENT_BROWSER_HOME,
		MACHINE_HOME: p.MACHINE_HOME,
	};
	const launcher = [
		"set -e",
		`ps -eo pid,cmd | awk '/openclaw gateway run/ && !/awk/ && !/bash/ {print $1}' | xargs -r kill 2>/dev/null || true`,
		openClawEnv(p),
		`cat > ${p.HOME}/start-openclaw-gateway.sh <<'EOF'\n${script}\nEOF`,
		`chmod +x ${p.HOME}/start-openclaw-gateway.sh`,
	].join("\n");
	if (machine.providerKind === "dedalus") {
		return [
			launcher,
			installGatewayUnitCommand(machine, gatewayPaths),
			"sleep 12",
			`ss -tlnp 2>/dev/null | grep ':${gwPort}'`,
			`echo gateway:${gwPort}`,
		].join("\n");
	}
	return [
		launcher,
		`(setsid ${p.HOME}/start-openclaw-gateway.sh </dev/null &>/dev/null &) && sleep 14`,
		`ss -tlnp 2>/dev/null | grep ':${gwPort}'`,
		`echo gateway:${gwPort}`,
	].join(" && ");
}

function shell(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Avoid heredocs in provider exec — E2B/Sprites multiline scripts break easily when joined. */
function writeRemoteFile(path: string, content: string): string {
	const b64 = Buffer.from(content, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d > ${path}`;
}

function configureHealthProbe(agent: string, p: BootstrapPaths): string | null {
	switch (agent) {
		case "claude-code":
			return `command -v claude >/dev/null 2>&1 && claude --version >/dev/null 2>&1 && test -s ${p.APP_HOME}/.agent-env && echo ok || echo broken`;
		case "codex":
			return `command -v codex >/dev/null 2>&1 && codex --version >/dev/null 2>&1 && test -s ${p.APP_HOME}/.agent-env && echo ok || echo broken`;
		case "openclaw":
			return `test -x ${p.NPM_PREFIX}/bin/openclaw && test -s ${p.OPENCLAW_HOME}/.env && echo ok || echo broken`;
		case "hermes":
			return `test -s ${p.HERMES_HOME}/.env && echo ok || echo broken`;
		default:
			return null;
	}
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
		// Do not set NPM_CONFIG_PREFIX — Sprites nvm rejects it and breaks openclaw CLI.
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export FNM_DIR=${p.HOME}/.local/share/fnm`,
		`if [ -x "$FNM_DIR/fnm" ]; then eval "$($FNM_DIR/fnm env)"; fi`,
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
	apiKey: string,
): Promise<string | null> {
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") {
		return null;
	}
	const port =
		machine.providerKind === "sprites" ? 8080 :
		machine.agentKind === "openclaw" ? OPENCLAW_PORT : HERMES_PORT;
	const name = machine.agentKind === "openclaw" ? "openclaw" : "hermes";
	const localPort = port;
	const waitOpts = {
		provider,
		machineId: machine.id,
		localPort,
	};

	if (provider.kind === "e2b") {
		const e2bProvider = provider as import("@/lib/providers/e2b").E2BProvider;
		const url = await e2bProvider.getPublicUrl(machine.id, port);
		const normalized = url.trim().replace(/\/$/, "");
		const apiUrl = normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
		await waitForGatewayUrl(apiUrl, apiKey, waitOpts);
		return apiUrl;
	}

	if (provider.kind === "sprites") {
		const spritesProvider = provider as import("@/lib/providers/sprites").SpritesProvider;
		const url = await spritesProvider.getPublicUrl(machine.id, port);
		const apiUrl = url ? (url.endsWith("/v1") ? url : `${url}/v1`) : null;
		if (apiUrl) await waitForGatewayUrl(apiUrl, apiKey, waitOpts);
		return apiUrl;
	}

	if (provider.kind === "vercel") {
		const vercelProvider = provider as import("@/lib/providers/vercel").VercelProvider;
		const url = await vercelProvider.getPublicUrl(machine.id, port);
		const normalized = url.trim().replace(/\/$/, "");
		const apiUrl = normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
		await waitForGatewayUrl(apiUrl, apiKey, waitOpts);
		return apiUrl;
	}

	if (provider.kind !== "dedalus") return null;

	const tunnelToken = config.cloudflareTunnelToken;
	if (tunnelToken) {
		await startNamedTunnel(machine, provider, tunnelToken, p);
		const apiUrl = machine.apiUrl ?? null;
		if (apiUrl) await waitForGatewayUrl(apiUrl, apiKey, waitOpts);
		return apiUrl;
	}

	if (provider.kind === "dedalus" && "createPreview" in provider) {
		const dedalus = provider as import("@/lib/providers/dedalus").DedalusProvider;
		const previewUrl = await dedalus.createPreview(machine.id, port);
		if (previewUrl) {
			const normalized = previewUrl.trim().replace(/\/$/, "");
			const apiUrl = normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
			await waitForGatewayUrl(apiUrl, apiKey, { ...waitOpts, maxAttempts: 15 });
			return apiUrl;
		}
	}

	const apiUrl = await exposeViaCloudflared(machine, provider, port, name, p);
	await waitForGatewayUrl(apiUrl, apiKey, { ...waitOpts, maxAttempts: 15 });
	return apiUrl;
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
