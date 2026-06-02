/**
 * Per-agent install adapter: turn a memory bundle into the shell command that
 * writes its persona/memory docs into the files each runtime reads.
 *
 * Canonical owned-memory root is `~/.agent-machines/{SOUL,AGENTS,MEMORY,USER}.md`
 * (what Hermes/OpenClaw read and the reload script syncs). For runtimes that
 * read a different entrypoint we also write a combined doc:
 *   - claude-code -> ~/.claude/CLAUDE.md + ~/CLAUDE.md
 *   - codex       -> ~/.codex/AGENTS.md + ~/AGENTS.md
 *   - openclaw    -> ~/.openclaw/workspace/{SOUL,AGENTS}.md
 *   - hermes      -> the canonical root only
 *
 * Skills/tools/MCPs aren't file-installed here (they're already synced to the
 * box via the reload script + MCP registration); a bundle's ability selection
 * drives the loadout + export, not this doc install.
 */

import type { AgentKind, MemoryBundle } from "@/lib/user-config/schema";

const ROOT = "$HOME/.agent-machines";

const DOCS: ReadonlyArray<[keyof MemoryBundle["docs"], string]> = [
	["soul", "SOUL.md"],
	["agentDocs", "AGENTS.md"],
	["memory", "MEMORY.md"],
	["user", "USER.md"],
];

function b64(s: string): string {
	return Buffer.from(s ?? "", "utf8").toString("base64");
}

/** A shell line that writes `content` to `path` via base64 (no escaping pain). */
function writeFile(path: string, content: string): string {
	return `printf %s '${b64(content)}' | base64 -d > "${path}"`;
}

/** Combined single-doc form for runtimes that read one entrypoint file. */
export function combinedDoc(bundle: MemoryBundle): string {
	const d = bundle.docs;
	const parts: string[] = [];
	if (d.soul.trim()) parts.push(`# Persona & voice\n\n${d.soul.trim()}`);
	if (d.agentDocs.trim()) parts.push(`# Operating rules & agent docs\n\n${d.agentDocs.trim()}`);
	if (d.memory.trim()) parts.push(`# Working memory\n\n${d.memory.trim()}`);
	if (d.user.trim()) parts.push(`# Operator profile\n\n${d.user.trim()}`);
	return parts.join("\n\n");
}

/**
 * The shell lines that install a bundle's memory docs for a runtime. Returned
 * as an array so callers can join with "\n" (standalone exec) or " && " (when
 * embedding into a larger `&&`-chained bootstrap phase).
 */
export function bundleInstallLines(bundle: MemoryBundle, agentKind: AgentKind): string[] {
	const lines: string[] = [`mkdir -p "${ROOT}"`];
	for (const [key, file] of DOCS) {
		lines.push(writeFile(`${ROOT}/${file}`, bundle.docs[key]));
	}

	const combined = combinedDoc(bundle);
	if (agentKind === "claude-code") {
		lines.push('mkdir -p "$HOME/.claude"');
		lines.push(writeFile("$HOME/.claude/CLAUDE.md", combined));
		lines.push(writeFile("$HOME/CLAUDE.md", combined));
	} else if (agentKind === "codex") {
		lines.push('mkdir -p "$HOME/.codex"');
		lines.push(writeFile("$HOME/.codex/AGENTS.md", combined));
		lines.push(writeFile("$HOME/AGENTS.md", combined));
	} else if (agentKind === "openclaw") {
		lines.push('mkdir -p "$HOME/.openclaw/workspace"');
		lines.push(writeFile("$HOME/.openclaw/workspace/SOUL.md", bundle.docs.soul));
		lines.push(writeFile("$HOME/.openclaw/workspace/AGENTS.md", bundle.docs.agentDocs));
	}
	// hermes reads the canonical ~/.agent-machines docs written above.

	lines.push('echo "AM_MEMORY_INSTALLED"');
	return lines;
}

/** The shell command to install a bundle's memory docs for the given runtime. */
export function bundleInstallCommand(bundle: MemoryBundle, agentKind: AgentKind): string {
	return bundleInstallLines(bundle, agentKind).join("\n");
}
