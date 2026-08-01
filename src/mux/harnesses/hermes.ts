/**
 * Hermes harness adapter (NousResearch hermes-agent 0.19.0).
 *
 * Python 3.11-3.13 tool. Pure command recipe: no vendor SDK is required,
 * so nothing is imported lazily -- the adapter only builds shell strings
 * and parses stdout.
 *
 * Install strategy: a pinned wheel from PyPI via a pinned uv, NOT the
 * vendor `curl | bash` installer. Verified 2026-08-01 by resolving and
 * downloading `hermes-agent[anthropic]==0.19.0` for
 * x86_64/aarch64-unknown-linux-gnu: 62 packages, every one a wheel (no
 * source builds, so no compiler and no apt), 141 MB unpacked, 50s on a
 * cold uv cache. The wheel carries the `hermes` console script
 * (hermes_cli.main:main), so this is the whole install.
 *
 * Why not the vendor installer (measured 2026-07-31, docs/MUX-RESULTS.md
 * finding 10): install.sh git-clones the repo, bootstraps a uv-managed
 * Python, installs Node, runs `npm install` plus Playwright/Chromium, and
 * apt-installs ripgrep + ffmpeg + build-essential. On E2B's base sandbox
 * (478 MB, 2 vCPU) it exhausted the VM, which stopped answering RPCs
 * after ~150s; on Sprites it was still fetching ffmpeg's ~190 apt
 * packages when a 15-minute budget expired. Its `--skip-browser` flag
 * removes only the Playwright step -- reading scripts/install.sh at
 * v2026.7.30 shows the two apt calls are not behind any flag:
 * install_system_packages() only returns early when `rg` and `ffmpeg` are
 * both already on PATH, and install_deps() apt-installs build-essential
 * whenever `dpkg -s gcc python3-dev libffi-dev` misses one. The wheel
 * needs none of it.
 *
 * What the wheel path deliberately does NOT provide, since the mux drives
 * one-shot and PTY chat rather than the full desktop product: browser
 * tools (no Playwright/Chromium), ripgrep (hermes falls back to grep for
 * file search), ffmpeg (TTS voice conversion is limited), the bundled
 * skill library that install.sh seeds from the git checkout, and
 * git-based `hermes update`. Bake the vendor image (see PREBAKED_IMAGE)
 * when those matter.
 *
 * Known trade-off, deliberately taken: NousResearch classifies PyPI
 * installs as unsupported ("installs via pypi (e.g. uv tool install
 * hermes-agent, pip install hermes-agent)" under Unsupported in
 * docs/getting-started/platform-support; Tier 1 is Hermes Desktop,
 * install.sh, and `docker pull`). Consequences to plan around: hermes
 * prints a "pip installs are no longer an officially supported platform"
 * banner on stderr (harmless -- the router only reads stdout for text),
 * `hermes update` must not be used, and new releases may stop appearing
 * on PyPI, which has already started -- 0.19.1 exists as a git tag with
 * no wheel. The version below is therefore pinned rather than floating,
 * and PREBAKED_IMAGE stays the recommendation for production. The
 * alternative was refusing to install hermes at all, because the two
 * supported request-time paths are the installer that could not finish
 * inside a sandbox budget and an image, and an image is a template
 * decision rather than something an adapter can do.
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
 * Newest published wheel. The repo's pyproject says 0.19.1 and the newest
 * git tag (v2026.7.30) carries it, but PyPI stops at 0.19.0 -- 0.19.1 has
 * never been released -- so 0.19.1 is not installable from an index and
 * pinning it would fail closed on every substrate.
 */
const HERMES_VERSION = "0.19.0";

/**
 * `anthropic` is an optional extra upstream (the core dependency set only
 * carries the OpenAI SDK), and this adapter can be handed an Anthropic
 * key, so the extra is part of the install rather than something hermes
 * has to pip-install mid-run.
 */
const HERMES_SPEC = `hermes-agent[anthropic]==${HERMES_VERSION}`;

/** hermes-agent requires-python is >=3.11,<3.14. */
const HERMES_PYTHON = "3.13";

/** Pinned so an installer regression cannot change what a machine gets. */
const UV_VERSION = "0.11.30";
const UV_INSTALLER_URL = `https://astral.sh/uv/${UV_VERSION}/install.sh`;

/**
 * Private uv prefix, mirroring node-runtime.ts's private Node: never
 * touch a substrate's own uv (an older one may not accept the flags
 * below) and never overwrite a user's ~/.local/bin/uv.
 */
const AM_UV_DIR = `$HOME/.agent-machines/uv`;
const AM_UV = `${AM_UV_DIR}/uv`;

/** Where `uv tool install` is pinned to drop the launcher. */
const HERMES_LOCAL_BIN = `$HOME/.local/bin`;

/**
 * Pre-baked layout: the published container puts an exec shim at
 * /opt/hermes/bin/hermes and prepends that dir to PATH. Checked
 * explicitly because a non-login exec may not inherit the image's PATH.
 */
const HERMES_PREBAKED_BIN = "/opt/hermes/bin";

/**
 * Image to bake when a substrate cannot run the install at all. Newest
 * published tag, so it is one release ahead of the wheel pin above -- the
 * container is a Tier 1 path and has no reason to lag.
 */
const PREBAKED_IMAGE = "nousresearch/hermes-agent:v2026.7.30";

/**
 * The launcher lives in ~/.local/bin, which is not on PATH in
 * non-login/non-interactive shells. Prefix PATH in the command string
 * (not in env: the tmux fallback single-quotes env values, so "$HOME"
 * and "$PATH" would not expand there). Every directory the install probe
 * accepts is listed here, so a probe that reports "installed" can never
 * be followed by a run that cannot find the binary.
 */
const PATH_PREFIX = `PATH="${HERMES_LOCAL_BIN}:${HERMES_PREBAKED_BIN}:$PATH"`;

/**
 * Accept an already-present hermes wherever it can legitimately live: on
 * PATH (system/FHS install, or a template whose PATH is inherited), the
 * uv-tool launcher, or the container's shim.
 */
const INSTALLED_PROBE = [
	`command -v hermes >/dev/null 2>&1`,
	`test -x "${HERMES_LOCAL_BIN}/hermes"`,
	`test -x "${HERMES_PREBAKED_BIN}/hermes"`,
].join(" || ");

/**
 * Emitted only when the machine cannot reach an index at all, so the
 * router surfaces it (as the tail of the install log) in seconds instead
 * of holding a sandbox open for the whole budget.
 */
const PREBAKE_HINT =
	`hermes install needs curl to fetch uv ${UV_VERSION} and the ${HERMES_SPEC} wheel, and this image has none. ` +
	`Use a pre-baked image instead and create with install: false -- either ${PREBAKED_IMAGE}, ` +
	`or your own template built with: uv tool install --python ${HERMES_PYTHON} '${HERMES_SPEC}' (leaves hermes in ~/.local/bin).`;

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

/**
 * Name the provider that matches the key we inject, because hermes's own
 * inference gets it wrong for our env and fails in the worst possible
 * way. Measured on a live sprite 2026-08-01, no config.yaml, one-shot
 * chat:
 *
 *   both keys, no --provider     -> "HTTP 401: Missing Authentication
 *                                   header" AND exit code 0
 *   OPENAI_API_KEY only, no flag -> same 401, exit 0
 *   ANTHROPIC_API_KEY only       -> works (hermes infers anthropic)
 *   --provider anthropic         -> works with either key set
 *   --provider openai-api        -> works with OPENAI_API_KEY
 *
 * Exit 0 on an auth failure is what makes this mandatory rather than
 * cosmetic: the router would hand back the 401 line as the agent's answer.
 * The provider id is `openai-api`, not `openai` -- hermes rejects the
 * latter with "Unknown provider 'openai'" (PROVIDER_REGISTRY in
 * hermes_cli/auth.py). Anthropic first, mirroring upstreams.ts's order.
 *
 * Only `chat` gets this: the top-level `-z` one-shot path additionally
 * refuses --provider without --model (hermes_cli/oneshot.py), which is
 * why this adapter drives `chat -q` instead.
 */
function providerFlag(keys: UpstreamKeys): string {
	if (keys.anthropic) return " --provider anthropic";
	if (keys.openai) return " --provider openai-api";
	return "";
}

export const hermesHarness: HarnessAdapter = {
	kind: "hermes",
	requiredUpstream: "any",

	/**
	 * Wheels only: no apt, no compiler, no Node, no browser download.
	 * Measured end to end on two cold sprites 2026-08-01: 322s and 328s
	 * (uv, a managed CPython 3.13, and 62 wheels; 249 MB under
	 * ~/.local/share/uv). 15 minutes is ~2.7x that -- room for a slow
	 * index, and still short
	 * enough that a wedged install is not billed for the 40 minutes the
	 * vendor installer's apt path forced. Declared rather than inherited
	 * from the router default so the measurement stays attached to the
	 * harness that needs it.
	 */
	installBudgetMs: 900_000,

	isInstalledCommand(): string {
		return INSTALLED_PROBE;
	},

	installCommand(): string {
		// Single line, and guarded by the same probe as isInstalledCommand
		// so a re-run (or a pre-baked image) is an instant no-op.
		//
		// Fail fast when there is no curl: without it neither uv nor the
		// wheel can be fetched, and the actionable answer is a pre-baked
		// image, so say that instead of failing later and vaguely.
		//
		// `curl | sh` reports sh's status, so a 404 or no egress would look
		// like a successful install and hand back a machine that cannot
		// run; `set -o pipefail` in a subshell makes curl's failure the
		// pipeline's.
		//
		// UV_INSTALL_DIR keeps uv out of shared bin dirs, UV_NO_MODIFY_PATH
		// stops the installer from editing shell profiles other harnesses
		// share, and UV_TOOL_BIN_DIR pins where the hermes launcher lands:
		// uv would otherwise honor XDG_BIN_HOME and could put it somewhere
		// the probe and PATH prefix do not look -- the same "install
		// reported success, binary unfindable" trap npm -g sprang on
		// Sprites (docs/MUX-RESULTS.md finding 6).
		//
		// --managed-python (with downloads forced on, in case an image
		// pinned them off): bring our own interpreter rather than trust the
		// image's, since E2B base ships Python below hermes's floor and a
		// substrate `python3` can be a wrapper script rather than a binary.
		// --force because this only runs when the probe found no launcher,
		// so any tool env already there is a partial one from a killed
		// attempt -- and on Sprites that filesystem survives into the next
		// run.
		const fetchUv = `test -x "${AM_UV}" || (set -o pipefail; curl -fsSL ${UV_INSTALLER_URL} | env UV_INSTALL_DIR="${AM_UV_DIR}" UV_NO_MODIFY_PATH=1 sh)`;
		const installHermes = `env UV_TOOL_BIN_DIR="${HERMES_LOCAL_BIN}" UV_PYTHON_DOWNLOADS=automatic "${AM_UV}" tool install --force --managed-python --python ${HERMES_PYTHON} ${shq(HERMES_SPEC)}`;
		return `${INSTALLED_PROBE} || { command -v curl >/dev/null 2>&1 || { echo ${shq(PREBAKE_HINT)} >&2; exit 1; }; ${fetchUv} && ${installHermes}; }`;
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
		// `hermes chat` does accept -m/--model and --resume SESSION_ID
		// (verified against the installed 0.19.0 CLI, 2026-08-01), but they
		// are deliberately not wired: hermes model ids are provider-prefixed
		// ("anthropic/claude-sonnet-4.6") while HarnessRunOptions.model is a
		// bare per-harness id, so mapping it blind would turn a working
		// default into a failing run. Pass either flag via extraArgs.
		// extraArgs go last so a caller can override any flag chosen here
		// (argparse keeps the last occurrence).
		let command = `${PATH_PREFIX} hermes chat${providerFlag(keys)} --quiet -q "$(echo ${b64} | base64 -d)"`;
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
		// Same provider pin as a headless run: --provider is a top-level
		// flag too, so an interactive session cannot silently land on the
		// unauthenticated default and greet the user with a 401.
		return {
			command: `${PATH_PREFIX} hermes${providerFlag(keys)}`,
			env: upstreamEnv(keys),
		};
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
