/**
 * Centralized constants for paths, ports, and timing inside the Hermes VM.
 *
 * Everything Hermes touches lives under /home/machine, the persistent volume
 * that survives sleep/wake. The root filesystem resets on wake, so toolchains
 * (uv, Hermes venv, skills, sessions DB) all live here too.
 */

export const VM_HOME = "/home/machine";
export const VM_HERMES_HOME = `${VM_HOME}/.hermes`;
export const VM_VENV = `${VM_HOME}/.venv`;
export const VM_UV_CACHE = `${VM_HOME}/.uv-cache`;
export const VM_LOCAL_BIN = `${VM_HOME}/.local/bin`;

export const VM_KNOWLEDGE_DROP = `${VM_HOME}/.knowledge-payload.tar.gz`;
export const VM_GATEWAY_LOG = `${VM_HERMES_HOME}/logs/gateway.log`;
export const VM_DEPLOY_MARKER = `${VM_HERMES_HOME}/.hermes-persistent-version`;

/** Hermes API server (OpenAI-compatible) port. */
export const PORT_API = 8642;

/** Hermes web dashboard port (FastAPI + React SPA). */
export const PORT_DASHBOARD = 9119;

/** Local state file storing the current machine ID and API key. */
export const STATE_FILE = ".machine-state.json";

/** Bumped whenever bootstrap logic changes; triggers re-bootstrap on deploy. */
export const DEPLOY_VERSION = "1.0.0";

export const DEFAULTS = {
	vcpu: 1,
	memoryMib: 2048,
	storageGib: 10,
	model: "anthropic/claude-sonnet-4-6",
	dedalusBaseUrl: "https://dcs.dedaluslabs.ai",
	dedalusChatBaseUrl: "https://api.dedaluslabs.ai/v1",
} as const;

/** Shell prefix that puts every Hermes command on the right path with the right env. */
export const SHELL_ENV = [
	`export HOME=${VM_HOME}`,
	`export HERMES_HOME=${VM_HERMES_HOME}`,
	`export VIRTUAL_ENV=${VM_VENV}`,
	`export UV_CACHE_DIR=${VM_UV_CACHE}`,
	`export PATH=${VM_LOCAL_BIN}:${VM_VENV}/bin:$PATH`,
].join(" && ");
