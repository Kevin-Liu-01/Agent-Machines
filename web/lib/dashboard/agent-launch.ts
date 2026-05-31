/**
 * Client-safe helpers for launching an agent CLI inside the interactive
 * console. Kept free of server imports so both the xterm client component
 * and server routes can use it.
 *
 * All four agents expose an interactive terminal you can "talk to":
 *  - codex / claude-code: the coding-agent CLI (creds in .agent-env).
 *  - hermes:   `hermes chat`   — interactive chat with the agent (venv bin).
 *  - openclaw: `openclaw chat` — local terminal UI (npm-global bin).
 * hermes/openclaw also run as HTTP gateways when deployed; `chat` is the
 * standalone REPL that talks to the configured model directly.
 */

export function agentLaunchCommand(
	agentKind: string | null | undefined,
): string | null {
	// cd into the cloned repo first — the agents expect a working directory.
	const cd = "cd ~/agent-machines 2>/dev/null || cd ~;";
	switch (agentKind) {
		case "codex":
			// .agent-env exports PATH (CLI bin); auth lives in ~/.codex/auth.json.
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; codex`;
		case "claude-code":
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; claude`;
		case "hermes":
			return `${cd} export HERMES_HOME="$HOME/.agent-machines"; export PATH="$HOME/.agent-machines/venv/bin:$PATH"; hermes chat`;
		case "openclaw":
			return `${cd} export PATH="$HOME/.npm-global/bin:$PATH"; openclaw chat`;
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

/**
 * Non-interactive (one-shot) invocation used by scheduled cron runs. The
 * prompt is expected in the `$AM_CRON_PROMPT` env var so callers can pass it
 * safely (base64-decoded) without shell-escaping headaches. Flags are
 * best-effort per CLI and easy to adjust here in one place if a given
 * agent's headless syntax changes.
 */
export function agentOneShotInvocation(
	agentKind: string | null | undefined,
): string | null {
	const cd = "cd ~/agent-machines 2>/dev/null || cd ~;";
	switch (agentKind) {
		case "codex":
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; codex exec "$AM_CRON_PROMPT"`;
		case "claude-code":
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; claude -p "$AM_CRON_PROMPT"`;
		case "hermes":
			return `${cd} export HERMES_HOME="$HOME/.agent-machines"; export PATH="$HOME/.agent-machines/venv/bin:$PATH"; hermes run "$AM_CRON_PROMPT"`;
		case "openclaw":
			return `${cd} export PATH="$HOME/.npm-global/bin:$PATH"; openclaw run "$AM_CRON_PROMPT"`;
		default:
			return null;
	}
}
