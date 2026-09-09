/**
 * Reload script content for web bootstrap (paths parameterized per provider home).
 */

import { RUNTIME } from "@/lib/platform/runtime";
import { knowledgeSyncCommand } from "./knowledge-sync";

export const REPO_CLONE_URL = RUNTIME.repoUrl;
export const REPO_BRANCH = RUNTIME.repoBranch;

function quote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Run before Git: a managed checkout must not alias the Worker's own files. */
export function managedCheckoutGuard(runtimeHome: string): string {
	const paths = [runtimeHome, `${runtimeHome}/knowledge-source`, `${runtimeHome}/knowledge-source/.git`];
	return `if ${paths.map((path) => `[ -L ${quote(path)} ]`).join(" || ")}; then echo 'Managed knowledge checkout must not be a symlink.' >&2; exit 2; fi`;
}

export function buildWebReloadScript(home: string, runtimeHome: string): string {
	const repoDir = `${runtimeHome}/knowledge-source`;
	return [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`RUNTIME=${quote(runtimeHome)}`,
		managedCheckoutGuard(runtimeHome),
		`if [ -d ${quote(`${repoDir}/.git`)} ]; then REPO_DIR=${quote(repoDir)}`,
		"else",
		'  echo "[reload] no managed knowledge checkout; run Repair boot to install it" >&2',
		"  exit 2",
		"fi",
		`export PATH="${home}/.agent-machines/node/bin:$PATH"`,
		'echo "[reload] refresh managed knowledge checkout (workspace untouched)"',
		'cd "$REPO_DIR"',
		`git fetch origin ${REPO_BRANCH}`,
		"git merge --ff-only FETCH_HEAD",
		'echo "[reload] sync -> ~/.agent-machines"',
		'mkdir -p "$RUNTIME/skills" "$RUNTIME/crons" "$RUNTIME/mcps" "$RUNTIME/scripts"',
		knowledgeSyncCommand(`${repoDir}/knowledge`, runtimeHome),
		'echo "[reload] done at $(date -Iseconds)"',
		'echo "[reload] HEAD: $(git rev-parse --short HEAD)"',
	].join("\n");
}

export function buildMcpRegisterShell(runtimeHome: string, home: string, hasCursorKey: boolean): string {
	const npxBin = `${home}/.npm-global/bin/npx`;
	const nodeBin = `${home}/node/bin/node`;
	const bridgeJs = `${home}/cursor-bridge/dist/server.js`;
	const lines = [
		"import os, yaml",
		`config_path = ${JSON.stringify(`${runtimeHome}/config.yaml`)}`,
		`env_paths = [${JSON.stringify(`${runtimeHome}/.env`)}]`,
		"merged_env = {}",
		"for p in env_paths:",
		"    if not os.path.exists(p): continue",
		"    for line in open(p):",
		"        line = line.strip()",
		"        if not line or line.startswith('#') or '=' not in line: continue",
		"        k, _, v = line.partition('=')",
		"        merged_env[k.strip()] = v.strip()",
		"data = yaml.safe_load(open(config_path).read()) if os.path.exists(config_path) else {}",
		"data.setdefault('mcp_servers', {})",
		`data['mcp_servers']['playwright'] = {'command': ${JSON.stringify(npxBin)}, 'args': ['-y', '@playwright/mcp'], 'env': {'PLAYWRIGHT_BROWSERS_PATH': ${JSON.stringify(`${home}/.cache/ms-playwright`)}}, 'timeout': 120}`,
	];
	if (hasCursorKey) {
		const nodeDir = `${home}/node/bin`;
		lines.push(
			"if merged_env.get('CURSOR_API_KEY'):",
			`    data['mcp_servers']['cursor'] = {'command': ${JSON.stringify(nodeBin)}, 'args': [${JSON.stringify(bridgeJs)}], 'env': {'HERMES_HOME': ${JSON.stringify(runtimeHome)}, 'PATH': ${JSON.stringify(`${nodeDir}:/usr/local/bin:/usr/bin:/bin`)}}, 'timeout': 600}`,
		);
	}
	lines.push(
		"open(config_path, 'w').write(yaml.safe_dump(data, sort_keys=False))",
		"print('registered', len(data.get('mcp_servers', {})))",
	);
	const py = lines.join("\n");
	// base64 write, not a heredoc: this command is `&&`-joined, so a heredoc
	// whose closing `PYEOF` isn't alone on its line never terminates.
	const pyB64 = Buffer.from(py, "utf8").toString("base64");
	return [
		"set -e",
		`printf '%s' '${pyB64}' | base64 -d > ${runtimeHome}/.register-mcp-servers.py`,
		`if [ -x ${home}/.local/share/uv/tools/hermes-agent/bin/python ]; then ${home}/.local/share/uv/tools/hermes-agent/bin/python ${runtimeHome}/.register-mcp-servers.py; elif [ -x ${runtimeHome}/venv/bin/python ]; then ${runtimeHome}/venv/bin/python ${runtimeHome}/.register-mcp-servers.py; else python3 ${runtimeHome}/.register-mcp-servers.py; fi`,
	].join(" && ");
}
