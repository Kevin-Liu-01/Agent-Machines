/**
 * Client-safe helpers for launching an agent CLI inside the interactive
 * console. Kept free of server imports so both the xterm client component
 * and server routes can use it.
 *
 * Only `codex` and `claude-code` are interactive terminal CLIs you "talk
 * to" in a shell. `hermes` and `openclaw` run as gateways (HTTP), so they
 * have no console launch command — the console is just a shell for them.
 */

export function agentLaunchCommand(
	agentKind: string | null | undefined,
): string | null {
	// cd into the cloned repo first: the CLI agents expect a git working
	// directory, and .agent-env exports PATH (CLI bin) + model creds.
	const prep = "cd ~/agent-machines 2>/dev/null || cd ~; source ~/.agent-machines/.agent-env 2>/dev/null;";
	switch (agentKind) {
		case "codex":
			return `${prep} codex`;
		case "claude-code":
			return `${prep} claude`;
		default:
			return null;
	}
}

export function agentLabel(agentKind: string | null | undefined): string {
	switch (agentKind) {
		case "codex":
			return "Codex";
		case "claude-code":
			return "Claude Code";
		case "openclaw":
			return "OpenClaw";
		case "hermes":
			return "Hermes";
		default:
			return "agent";
	}
}

/** True when the agent exposes an interactive CLI to launch in the console. */
export function isCliAgent(agentKind: string | null | undefined): boolean {
	return agentLaunchCommand(agentKind) !== null;
}
