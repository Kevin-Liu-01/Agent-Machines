/**
 * Canonical Agent Machines runtime paths for the web app.
 *
 * Loadout/harness counts live in `./harness.ts` (registry-derived).
 * Paths stay aligned with `src/lib/constants.ts`.
 */

export { HARNESS, HARNESS_DEPLOY_LINE, HARNESS_LAYERS, HARNESS_SUMMARY, HARNESS_TOOLS_ANSWER, PRODUCT, nativeToolsLabel } from "./harness";

import { HARNESS, HARNESS_SUMMARY } from "./harness";

export const RUNTIME = {
	productName: "Agent Machines",
	wordmark: "agent-machines",

	runtimeHome: "~/.agent-machines",
	runtimeHomeAbs: "/home/machine/.agent-machines",
	repoDirAbs: "/home/machine/agent-machines",
	repoUrl: "https://github.com/Kevin-Liu-01/agent-machines.git",
	repoBranch: "main",

	legacyRuntimeHome: "~/.hermes",
	legacyRepoDir: "hermes-machines",

	gatewayLog: "~/.agent-machines/logs/gateway.log",
	reloadScript: "~/.agent-machines/scripts/reload-from-git.sh",

	/** @deprecated Use HARNESS.* — registry-derived, not static. */
	skillCount: HARNESS.skillCount,
	/** @deprecated Use HARNESS.mcpServerCount */
	mcpCatalogCount: HARNESS.mcpServerCount,
	/** @deprecated Agent-native count varies — use HARNESS.nativeToolsByAgent */
	builtinToolCount: HARNESS.rigToolSurfaceCount,

	agentKinds: ["hermes", "openclaw", "claude-code", "codex"] as const,
	providersLive: HARNESS.providersLive,
} as const;

/** @deprecated Prefer HARNESS_SUMMARY */
export const LOADOUT_SUMMARY = HARNESS_SUMMARY;

export const PROVIDER_LABELS: Record<(typeof RUNTIME.providersLive)[number], string> = {
	dedalus: "Dedalus Machines",
	e2b: "E2B Sandbox",
	sprites: "Sprites.dev",
};

export function migrateLegacyPathsShell(home: string, runtimeHome: string): string {
	// Each fragment must be a single `&&`-joinable unit — no multiline if/fi
	// blocks, or bash sees `then &&` after join and fails.
	return [
		`mkdir -p ${runtimeHome}/logs ${runtimeHome}/skills ${runtimeHome}/scripts`,
		`if [ -d ${home}/.hermes ] && [ ! -f ${runtimeHome}/.migrated-from-hermes ]; then (command -v rsync >/dev/null && rsync -a ${home}/.hermes/ ${runtimeHome}/) || cp -a ${home}/.hermes/. ${runtimeHome}/ || true; touch ${runtimeHome}/.migrated-from-hermes; fi`,
		`ln -sfn ${runtimeHome} ${home}/.hermes`,
		`if [ -d ${home}/hermes-machines/.git ] && [ ! -e ${home}/agent-machines ]; then ln -sfn ${home}/hermes-machines ${home}/agent-machines; fi`,
	].join(" && ");
}
