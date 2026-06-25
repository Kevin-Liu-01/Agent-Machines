/**
 * Reload script content for web bootstrap (paths parameterized per provider home).
 */

import { RUNTIME } from "@/lib/platform/runtime";

export const REPO_CLONE_URL = RUNTIME.repoUrl;
export const REPO_BRANCH = RUNTIME.repoBranch;

export function buildWebReloadScript(home: string, runtimeHome: string): string {
	const repoDir = `${home}/agent-machines`;
	const legacyRepo = `${home}/hermes-machines`;
	return [
		"#!/usr/bin/env bash",
		"set -euo pipefail",
		`RUNTIME=${runtimeHome}`,
		`if [ -d ${repoDir}/.git ]; then REPO_DIR=${repoDir}`,
		`elif [ -d ${legacyRepo}/.git ]; then REPO_DIR=${legacyRepo}`,
		"else",
		'  echo "[reload] no repo checkout" >&2',
		"  exit 2",
		"fi",
		"if ! command -v rsync >/dev/null 2>&1; then USE_CP=1; else USE_CP=0; fi",
		'echo "[reload] git fetch + reset"',
		'cd "$REPO_DIR"',
		"git fetch --depth 1 origin main",
		"git reset --hard origin/main",
		'echo "[reload] purge private local-only docs"',
		'rm -f "$REPO_DIR/yc-application-s26.md" "$REPO_DIR/knowledge/YC-PARTNER-PREP.md"',
		'echo "[reload] sync -> ~/.agent-machines"',
		'mkdir -p "$RUNTIME/skills" "$RUNTIME/crons" "$RUNTIME/mcps" "$RUNTIME/scripts"',
		'if [ "$USE_CP" -eq 0 ]; then',
		'  rsync -a --delete "$REPO_DIR/knowledge/skills/" "$RUNTIME/skills/"',
		'  rsync -a "$REPO_DIR/knowledge/crons/" "$RUNTIME/crons/" || true',
		'  rsync -a "$REPO_DIR/knowledge/mcps/" "$RUNTIME/mcps/" || true',
		"else",
		'  rm -rf "$RUNTIME/skills" && cp -r "$REPO_DIR/knowledge/skills" "$RUNTIME/skills"',
		'  cp -r "$REPO_DIR/knowledge/crons/." "$RUNTIME/crons/" 2>/dev/null || true',
		'  cp -r "$REPO_DIR/knowledge/mcps/." "$RUNTIME/mcps/" 2>/dev/null || true',
		"fi",
		'for f in SOUL.md USER.md MEMORY.md AGENTS.md; do',
		'  if [ -f "$REPO_DIR/knowledge/$f" ]; then cp "$REPO_DIR/knowledge/$f" "$RUNTIME/$f"; fi',
		"done",
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
		`${runtimeHome}/venv/bin/python ${runtimeHome}/.register-mcp-servers.py || python3 ${runtimeHome}/.register-mcp-servers.py`,
	].join(" && ");
}
