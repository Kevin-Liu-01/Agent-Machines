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
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; export HERMES_HOME="$HOME/.agent-machines"; export PATH="$HOME/.agent-machines/venv/bin:$PATH"; hermes chat`;
		case "openclaw":
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; export PATH="$HOME/.npm-global/bin:$PATH"; export OPENCLAW_STATE_DIR="$HOME/.openclaw"; export OPENCLAW_NO_RESPAWN=1; openclaw chat`;
		default:
			return null;
	}
}

/**
 * Short command the browser terminal injects. The API route installs this
 * launcher before sending it, so the visible terminal input stays readable
 * and the machine can persist whether the agent CLI was running.
 */
export function agentTerminalLauncherCommand(
	agentKind: string | null | undefined,
): string | null {
	switch (agentKind) {
		case "codex":
		case "claude-code":
		case "hermes":
		case "openclaw":
			return `~/.agent-machines/bin/am-launch-agent ${agentKind}`;
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
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; export HERMES_HOME="$HOME/.agent-machines"; export PATH="$HOME/.agent-machines/venv/bin:$PATH"; hermes chat --query "$AM_CRON_PROMPT" --quiet`;
		case "openclaw":
			return `${cd} source ~/.agent-machines/.agent-env 2>/dev/null; export PATH="$HOME/.npm-global/bin:$PATH"; export OPENCLAW_STATE_DIR="$HOME/.openclaw"; export OPENCLAW_NO_RESPAWN=1; openclaw infer model run --prompt "$AM_CRON_PROMPT" --json`;
		default:
			return null;
	}
}
