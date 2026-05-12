/**
 * Centralized constants for paths, ports, and timing inside the agent VM.
 *
 * Everything we install lives under /home/machine, the persistent volume
 * that survives sleep/wake. The root filesystem resets on wake, so toolchains
 * (uv, Hermes venv, skills, sessions DB) all live here too.
 */

export const VM_HOME = "/home/machine";
export const VM_AGENT_HOME = `${VM_HOME}/.agent`;
export const VM_AGENT_DOCS_DIR = `${VM_AGENT_HOME}/docs`;
export const VM_MACHINE_HOME = `${VM_HOME}/.machine`;
export const VM_HERMES_HOME = `${VM_HOME}/.hermes`;
export const VM_VENV = `${VM_HOME}/.venv`;
export const VM_UV_CACHE = `${VM_HOME}/.uv-cache`;
export const VM_LOCAL_BIN = `${VM_HOME}/.local/bin`;
export const VM_NODE_DIR = `${VM_HOME}/node`;
export const VM_NPM_PREFIX = `${VM_HOME}/.npm-global`;
export const VM_NPM_CACHE = `${VM_HOME}/.npm-cache`;
export const VM_PLAYWRIGHT_BROWSERS = `${VM_HOME}/.cache/ms-playwright`;
export const VM_AGENT_BROWSER_HOME = `${VM_HOME}/.agent-browser`;
export const VM_BRIDGE_DIR = `${VM_HOME}/cursor-bridge`;
export const VM_BRIDGE_DROP = `${VM_HOME}/.cursor-bridge-payload.tar.gz`;

export const VM_KNOWLEDGE_DROP = `${VM_HOME}/.knowledge-payload.tar.gz`;
export const VM_GATEWAY_LOG = `${VM_HERMES_HOME}/logs/gateway.log`;
export const VM_DEPLOY_MARKER = `${VM_HERMES_HOME}/.hermes-machines-version`;

/**
 * Persistent git checkout of the agent-machines repo, used by the
 * dashboard's reload route. The bootstrap clones the repo here on first
 * deploy; the reload script `git pull`s and re-syncs knowledge into
 * ~/.hermes/. This is what makes "edit on GitHub, click reload, agent
 * picks it up" possible without ever running the local CLI.
 *
 * The on-disk directory is preserved as `hermes-machines/` (not
 * `agent-machines/`) so existing machines from before the rename keep
 * resolving the same path. GitHub auto-redirects the old repo URL to
 * the new one, so the clone URL works either way; we use the new name
 * here for clarity. Override with `AGENT_MACHINES_REPO_URL` if you fork.
 */
export const VM_REPO_DIR = `${VM_HOME}/hermes-machines`;
export const VM_RELOAD_SCRIPT = `${VM_HERMES_HOME}/scripts/reload-from-git.sh`;
export const REPO_CLONE_URL =
	process.env.AGENT_MACHINES_REPO_URL ??
	process.env.HERMES_MACHINES_REPO_URL ?? // legacy override
	"https://github.com/Kevin-Liu-01/agent-machines.git";
export const REPO_BRANCH =
	process.env.AGENT_MACHINES_REPO_BRANCH ??
	process.env.HERMES_MACHINES_REPO_BRANCH ?? // legacy override
	"main";

/** Hermes API server (OpenAI-compatible) port. */
export const PORT_API = 8642;

/** Hermes web dashboard port (FastAPI + React SPA). */
export const PORT_DASHBOARD = 9119;

/** Local state file storing the current machine ID and API key. */
export const STATE_FILE = ".machine-state.json";

/** Bumped whenever bootstrap logic changes; triggers re-bootstrap on deploy. */
export const DEPLOY_VERSION = "1.3.0";

/** Pinned Node major for the cursor-bridge MCP server. Cursor SDK needs Node 20+. */
export const NODE_MAJOR = "22";

export const DEFAULTS = {
	vcpu: 1,
	memoryMib: 2048,
	storageGib: 10,
	model: "anthropic/claude-sonnet-4-6",
	dedalusBaseUrl: "https://dcs.dedaluslabs.ai",
	dedalusChatBaseUrl: "https://api.dedaluslabs.ai/v1",
} as const;

/** Shell prefix that puts every agent command on the right path with the right env. */
export const SHELL_ENV = [
	`export HOME=${VM_HOME}`,
	`export HERMES_HOME=${VM_HERMES_HOME}`,
	`export VIRTUAL_ENV=${VM_VENV}`,
	`export UV_CACHE_DIR=${VM_UV_CACHE}`,
	`export NPM_CONFIG_PREFIX=${VM_NPM_PREFIX}`,
	`export NPM_CONFIG_CACHE=${VM_NPM_CACHE}`,
	`export PLAYWRIGHT_BROWSERS_PATH=${VM_PLAYWRIGHT_BROWSERS}`,
	`export AGENT_BROWSER_DATA_DIR=${VM_AGENT_BROWSER_HOME}`,
	`export PATH=${VM_NPM_PREFIX}/bin:${VM_NODE_DIR}/bin:${VM_LOCAL_BIN}:${VM_VENV}/bin:$PATH`,
].join(" && ");
