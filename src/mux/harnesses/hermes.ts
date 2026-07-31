/**
 * Hermes harness adapter (NousResearch hermes-agent v0.19.1).
 *
 * Python 3.11+ tool distributed via a curl installer, NOT npm. Pure
 * command recipe: no vendor SDK is required, so nothing is imported
 * lazily -- the adapter only builds shell strings and parses stdout.
 *
 * Wire format: plain text. `hermes chat --quiet -q` prints the answer as
 * ordinary lines with no machine-readable final marker, so parseLine
 * wraps every non-empty line as a text delta. The router accumulates
 * RunResult.text from text deltas and synthesizes the done event when
 * the process exits, so no result event is emitted here.
 */

import { Buffer } from "node:buffer";
import type { MuxAgentEvent } from "../events.js";
import type {
	HarnessAdapter,
	HarnessCommand,
	HarnessRunOptions,
	UpstreamKeys,
} from "../types.js";

/**
 * The installer drops the binary in ~/.local/bin, which is not on PATH
 * in non-login/non-interactive shells. Prefix PATH in the command string
 * (not in env: the tmux fallback single-quotes env values, so "$HOME"
 * and "$PATH" would not expand there).
 */
const PATH_PREFIX = `PATH="$HOME/.local/bin:$PATH"`;

const INSTALLER_URL = "https://hermes-agent.nousresearch.com/install.sh";

function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Hermes also honors NOUS_API_KEY, but UpstreamKeys has no nous field,
 * so only the anthropic/openai upstreams can be wired from mux config.
 */
function upstreamEnv(keys: UpstreamKeys): Record<string, string> {
	const env: Record<string, string> = {};
	if (keys.openai) env.OPENAI_API_KEY = keys.openai;
	if (keys.anthropic) env.ANTHROPIC_API_KEY = keys.anthropic;
	return env;
}

export const hermesHarness: HarnessAdapter = {
	kind: "hermes",
	requiredUpstream: "any",

	isInstalledCommand(): string {
		return `command -v hermes >/dev/null 2>&1 || test -x "$HOME/.local/bin/hermes"`;
	},

	installCommand(): string {
		// SLOW: the installer bootstraps a python venv, node 22 and
		// ripgrep -- the first run takes minutes (budget accordingly; the
		// router allows 240s). Guarded so re-runs are instant no-ops,
		// keeping the command idempotent on a single line.
		return `command -v hermes >/dev/null 2>&1 || test -x "$HOME/.local/bin/hermes" || curl -fsSL ${INSTALLER_URL} | bash`;
	},

	versionCommand(): string {
		// PATH prefix so the probe works even before ~/.local/bin is on
		// the shell's default PATH.
		return `${PATH_PREFIX} hermes --version`;
	},

	runCommand(
		prompt: string,
		keys: UpstreamKeys,
		options: HarnessRunOptions = {},
	): HarnessCommand {
		const b64 = Buffer.from(prompt, "utf8").toString("base64");
		// The prompt travels as base64 expanded through a double-quoted
		// command substitution: -q "$(echo <b64> | base64 -d)". Safe
		// inside bash -lc because the payload is confined to the base64
		// alphabet ([A-Za-z0-9+/=]); none of those characters are special
		// inside double quotes (only $, backtick, backslash and " are),
		// so arbitrary prompt bytes round-trip without quoting bugs.
		// Note: options.model and options.sessionId have no documented
		// hermes CLI mapping; pass vendor flags via extraArgs instead.
		let command = `${PATH_PREFIX} hermes chat --quiet -q "$(echo ${b64} | base64 -d)"`;
		if (options.extraArgs && options.extraArgs.length > 0) {
			command += ` ${options.extraArgs.join(" ")}`;
		}
		if (options.cwd) {
			command = `cd ${shq(options.cwd)} && ${command}`;
		}
		return { command, env: upstreamEnv(keys) };
	},

	interactiveCommand(
		keys: UpstreamKeys,
		_options: HarnessRunOptions = {},
	): HarnessCommand {
		return { command: `${PATH_PREFIX} hermes`, env: upstreamEnv(keys) };
	},

	parseLine(line: string): MuxAgentEvent[] {
		// Plain-text passthrough: every non-empty line is a text delta.
		// There is no reliable final-result marker in hermes output, so
		// no result event is emitted; RunResult.text accumulates from
		// these deltas in the router and done is synthesized on exit.
		if (line.trim().length === 0) return [];
		return [{ type: "text", delta: `${line}\n` }];
	},
};
