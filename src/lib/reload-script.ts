/**
 * Shared reload-from-git.sh content for CLI and web bootstrap.
 * Syncs knowledge/{skills,crons,mcps,persona} into ~/.agent-machines/.
 */

import { REPO_BRANCH, VM_APP_HOME, VM_REPO_DIR, VM_REPO_DIR_LEGACY } from "./constants.js";

export function buildReloadScript(): string {
	return [
		"#!/usr/bin/env bash",
		"# Refresh ~/.agent-machines from the agent-machines repo checkout.",
		"# Invoked by dashboard Reload and installed at bootstrap.",
		"set -euo pipefail",
		`RUNTIME=${VM_APP_HOME}`,
		`if [ -d ${VM_REPO_DIR}/.git ]; then REPO_DIR=${VM_REPO_DIR}`,
		`elif [ -d ${VM_REPO_DIR_LEGACY}/.git ]; then REPO_DIR=${VM_REPO_DIR_LEGACY}`,
		"else",
		'  echo "[reload] no repo checkout found" >&2',
		"  exit 2",
		"fi",
		"if ! command -v rsync >/dev/null 2>&1; then",
		'  echo "rsync not installed; falling back to cp -r" >&2',
		"  USE_CP=1",
		"else",
		"  USE_CP=0",
		"fi",
		'echo "[reload] git fetch + reset"',
		'cd "$REPO_DIR"',
		`git fetch --depth 1 origin ${REPO_BRANCH}`,
		`git reset --hard origin/${REPO_BRANCH}`,
		'echo "[reload] purge private local-only docs"',
		'rm -f "$REPO_DIR/yc-application-s26.md" "$REPO_DIR/knowledge/YC-PARTNER-PREP.md"',
		'echo "[reload] sync skills + crons + mcps + persona -> ~/.agent-machines"',
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
		'  if [ -f "$REPO_DIR/knowledge/$f" ]; then',
		'    cp "$REPO_DIR/knowledge/$f" "$RUNTIME/$f"',
		"  fi",
		"done",
		'echo "[reload] done at $(date -Iseconds)"',
		'echo "[reload] HEAD: $(git rev-parse --short HEAD)"',
		'date -Iseconds > "$RUNTIME/.last-reload"',
		'git rev-parse HEAD > "$RUNTIME/.last-reload-sha"',
	].join("\n");
}
