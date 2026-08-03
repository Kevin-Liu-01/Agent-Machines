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
 * wraps every non-empty line as a text delta -- except for the recorded
 * vendor diagnostics below. The router accumulates RunResult.text from
 * text deltas and synthesizes the done event when the process exits, so
 * no result event is emitted here.
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
 * Lines hermes prints on its own behalf, which are not part of the answer.
 *
 * The rule is deliberately narrow, and this is why. Hermes emits no marker
 * that separates its own chatter from the model's answer, so the only
 * filter that is safe is one that cannot fire on an answer. Both conditions
 * have to hold before a line is reclassified:
 *
 * 1. The line STARTS with one of the phrases below. No severity heuristic --
 *    not a "warning:"/"error:" prefix, not shouting case, not a leading
 *    glyph. An agent asked about a warning answers in exactly those words,
 *    so a filter that reads tone instead of a known string eventually eats
 *    an answer.
 * 2. The turn has not produced any answer text yet. Every phrase below is a
 *    startup or housekeeping print, and on this lane all of them land ahead
 *    of the answer: `chat --quiet` prints the response exactly once, after
 *    run_conversation returns (hermes 0.19.0 cli.py:15981-16050). Once real
 *    output has begun every later line is the answer, including one that
 *    quotes a banner back at the user.
 *
 * Yes, this is a phrase list, and on this lane a phrase list is the only
 * thing available. Hermes does tag severity internally -- _emit_warning
 * fires status_callback("warn", message) (run_agent.py:915-930) and the TUI
 * gateway turns that into a typed status.update -- but none of that taxonomy
 * is exposed on `chat -q` stdout. The one machine-readable alternative the
 * same wheel ships is `hermes-acp` (dist-info/entry_points.txt:
 * `hermes-acp = acp_adapter.entry:main`), which speaks JSON-RPC on stdout
 * and pushes every incidental agent print to stderr
 * (acp_adapter/session.py:658 replaces agent._print_fn). That is separation
 * by construction instead of by phrase and it is the right long-term shape,
 * but it is a different lane with its own handshake and nobody has run it
 * here, so it is recorded rather than half-built.
 *
 * What changed on 2026-08-03 is where the phrases come from. The list used
 * to hold one entry: the single line somebody had happened to see. It is now
 * enumerated from hermes 0.19.0's own source -- the pinned wheel, sha256
 * bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f, equal to
 * the digest PyPI publishes for hermes_agent-0.19.0-py3-none-any.whl -- and
 * restricted to print sites that can actually reach this parser. That
 * restriction is load-bearing, because hermes has two print channels that
 * behave in opposite ways under the flags this adapter passes:
 *
 *   _vprint     (run_agent.py:835) returns immediately when
 *               suppress_status_output is set, BEFORE it honors force=True
 *               (:854). `--quiet` sets that flag (cli.py:15971-15972), so
 *               everything routed through _vprint -- which is every
 *               _emit_warning, including "Auxiliary <task> failed" -- never
 *               reaches stdout on a headless run.
 *   _safe_print (run_agent.py:817) and the CLI's _cprint (cli.py:2685) have
 *               no such gate. Those are the lines that do reach us, and they
 *               are why the tirith banner was in RunResult.text at all:
 *               cli.py:6217 prints it through _cprint.
 *   print()     Python's builtin, used directly in ~132 places across the
 *               modules on the `chat -q` turn path. Gated by NOTHING this
 *               adapter sets -- not quiet_mode, not suppress_status_output --
 *               and, unlike _safe_print, it does not route through
 *               agent._print_fn, so prompt_toolkit never touches it either.
 *               builtins.print is never monkeypatched in the wheel.
 *
 * THAT THIRD CHANNEL WAS MISSED. The first version of this list modeled only
 * the two above and called itself the union of the reachable sets. It was not:
 * seven bare-print diagnostics taken from the wheel were fed through this
 * parser and every one came back a text delta, straight into RunResult.text via
 * src/mux/router.ts:420. Two of them leak on runs the router records as a
 * SUCCESS, which is the class this list exists to prevent -- see the
 * `Reached maximum iterations` and `credentials refreshed after 401` entries.
 * The lesson is the one this file keeps relearning: enumerate the vendor's
 * WRITERS, not the sightings, and do not trust a channel model that was not
 * checked against the builtin.
 *
 * So the entries below are the union of three sets, and each says which one it
 * came from: reachable on the headless lane per the vendor source, or
 * captured live as real bytes. Nothing is here because it appeared in prose.
 *
 * Deliberately NOT here, so the omissions are recorded rather than
 * rediscovered:
 *
 *   - The six other _emit_warning heads (compression aborted, concurrent
 *     compression skipped, Codex app-server compaction, the "not agentic"
 *     Nous banner, ...). All are _vprint-gated, so they cannot reach a
 *     `--quiet` run, and none has ever been captured. Adding them would be
 *     writing matchers from documentation again -- the exact mistake
 *     undecorate() below exists to undo.
 *   - The Bedrock twin of the streaming notice
 *     (chat_completion_helpers.py:3525, same ungated _safe_print call). The
 *     mux never injects AWS credentials, so it is unreachable for us.
 *
 * Matched lines become `status`, carrying the text so nothing is lost --
 * never `error`. An error event marks the run as failed, and a
 * degraded-capability notice is not a failure; a vendor line that really
 * does mean the run failed has to stay in the text stream, where the
 * router's exit-code path can still see it.
 */
const VENDOR_DIAGNOSTIC_HEADS: readonly RegExp[] = [
	// Startup check for the tirith command scanner, printed when the scanner
	// is configured but its binary is absent. cli.py:6217, via _cprint
	// (ungated). Captured live on e2b and sprites 2026-08-01.
	/^tirith security scanner enabled but not available\b/i,

	// The auxiliary-work failure FAMILY. run_agent.py:1188-1197 builds every
	// one of these from a single f-string, "\u26a0 Auxiliary {task} failed:
	// {detail}", so one bounded wildcard covers all of them instead of one
	// entry per task. That matters: hermes runs 13 auxiliary tasks (vision,
	// compression, web_extract, approval, mcp, title_generation,
	// memory_query_rewrite, tts_audio_tags, skills_hub, triage_specifier,
	// kanban_decomposer, profile_describer, curator; hermes_cli/main.py's
	// _AUX_TASKS) and NONE of its auxiliary call sites requests streaming (the
	// exact site count did not reproduce under two methodologies, so it is not
	// stated), so any of
	// them can fail the same way against an SSE-only endpoint. The two labels
	// that reach this emitter in 0.19.0 are "title generation"
	// (agent/title_generator.py:157,:260) and "background review"
	// (agent/background_review.py:928).
	//
	// Captured live 2026-08-03 through this adapter's own interactiveCommand()
	// on e2b: "\u26a0 Auxiliary title generation failed: Connection error."
	// -- a BARE U+26A0 and one space, no U+FE0F. A matcher anchored on the
	// decorated "\u26a0\ufe0f" form would have missed the real bytes, which is
	// the tirith failure repeating itself; undecorate() below is what makes
	// both forms match. The detail is truncated by hermes at 217 chars plus
	// "..." (:1195-1196), so there is no closing brace to anchor on and the
	// head is all there is.
	//
	// Prophylactic on the headless lane and load-bearing on the PTY: the
	// emitter is _vprint, so `--quiet` suppresses it in run(), and pty()
	// output is not parsed by the router today. It is here because the bytes
	// are known and because the only thing keeping it out of RunResult.text
	// is one flag in runCommand.
	//
	// The wildcard is the one place this list trades precision for coverage,
	// so state the exposure: an answer whose FIRST line happens to read
	// "Auxiliary <words> failed: <something>" would be reclassified. The
	// bounds are what keep that narrow -- the task may not contain
	// punctuation, " failed: " must follow it, and a non-space must follow
	// that -- and the alternative is worse. Enumerating 13 task labels means
	// the 14th ships as a text delta, which is the bug this entry fixes, and
	// the line is preserved as a status label either way.
	/^Auxiliary [\w -]{1,40} failed: \S/i,

	// Primary provider auth failed and hermes silently continued on a
	// configured fallback. hermes_cli/cli_agent_setup_mixin.py:73, via
	// _cprint (ungated), inside _ensure_runtime_credentials -- which the
	// quiet branch calls directly at cli.py:15907, so this IS on our lane.
	// Worth classifying rather than losing: it means the run did not use the
	// provider providerFlag() pinned.
	/^Primary auth failed\b/i,

	// ---- bare print(), the channel the first version of this list missed ----
	// Every entry below is ungated by --quiet. The first two are the dangerous
	// ones: they leak on runs that EXIT 0 with a real answer, so without them a
	// successful run's RunResult.text silently gains a vendor line.

	// agent/chat_completion_helpers.py:1905, the first statement of
	// handle_max_iterations(), reached from agent/turn_finalizer.py:141. The
	// function then requests a summary and RETURNS the answer, and that path
	// only runs when `failed` is already False (turn_finalizer.py:100), so the
	// exit code is 0. Note the vendor suppresses the POLITE twin of this same
	// message two lines earlier behind `if not agent.quiet_mode`
	// (turn_finalizer.py:135-141) and then prints this ungated one anyway.
	/^Reached maximum iterations \(/i,

	// agent/conversation_loop.py:2961, then `continue` -- the retry succeeds and
	// the run exits 0 with the real answer. Specific to OUR wiring: the branch
	// needs api_mode == "anthropic_messages", which providerFlag()'s
	// `--provider anthropic` produces via an exact hostname match on
	// api.anthropic.com (hermes_cli/runtime_provider.py:132). The vendor uses a
	// GATED _buffer_vprint for the vertex (:2907) and copilot (:2949) twins of
	// this message and a bare print() for anthropic, so our provider is the
	// unlucky one.
	/^Anthropic credentials refreshed after 401\b/i,

	// The Anthropic 401 diagnostic block, agent/conversation_loop.py:2965-2987.
	// PARTIAL COVERAGE, stated rather than implied: it is thirteen separate
	// print() calls, and the continuation lines are indented fragments
	// ("Auth method: ...", bulleted "Check ANTHROPIC_TOKEN in ..."). The head
	// and the distinctive continuations are covered below; a locale change or a
	// reworded bullet would leak that bullet as text. Lower severity than the
	// two above because this block precedes a failing run, not a passing one.
	/^Anthropic 401 [\u2014-] authentication failed\b/i,
	/^Auth method: /i,
	/^Token (?:prefix|:)/i,
	/^Troubleshooting:$/i,
	/^Check ANTHROPIC_(?:TOKEN|API_KEY) in /i,
	/^For (?:API keys|Claude Code): /i,
	/^(?:Legacy cleanup|Clear stale keys): hermes config set\b/i,
	/^Run `hermes doctor` for credential-chain diagnostics\b/i,

	// agent/conversation_loop.py:4440. The run fails after this, but the line
	// still belongs in the status stream rather than the answer.
	/^All API retries exhausted with no successful response\b/i,

	// agent/tool_executor.py:346, printed when an interrupt arrives before the
	// tool batch runs.
	/^Interrupt: skipping \d+ tool call/i,

	// hermes_cli/cli_agent_setup_mixin.py:114 and :118, both inside
	// _ensure_runtime_credentials -- the function the `Primary auth failed`
	// entry above already certifies as on-lane (cli.py:15907 calls it directly).
	// The first pass walked this function, took the _cprint, and left these two
	// bare prints sitting a few lines below it. Both end in sys.exit(1), so the
	// exit code still fails the run.
	/^Provider resolver returned an empty (?:API key|base URL)\b/i,

	// Context-window probe result, persisted and announced.
	// agent/conversation_loop.py:2270, via _safe_print (ungated).
	/^Cached context length: /i,

	// Mid-turn compaction notice. agent/conversation_loop.py:5143, via
	// _safe_print (ungated). The vendor literal is a complete fixed string,
	// so unlike the heads above the tail is anchored too -- reading the wheel
	// is what makes that possible. The ellipsis is U+2026 in the source; the
	// ASCII spelling is accepted in case a locale-mangled build emits it.
	/^compacting context(\u2026|\.\.\.)?$/i,

	// Streaming unsupported, silently downgraded to non-streaming.
	// agent/chat_completion_helpers.py:3529-3532, via _safe_print (ungated).
	// This is a MULTI-LINE print, so the second physical line arrives on its
	// own with no sigil and reads like prose; it needs its own head or it
	// becomes the first line of the answer.
	/^Streaming is not supported for this model\/provider\b/i,
	/^To avoid this delay, set display\.streaming\b/i,
];

/**
 * Remove ANSI escape sequences before matching a diagnostic phrase.
 *
 * This is the second layer of the same trap undecorate() was written for,
 * and it is worse because it is invisible in a transcript. Hermes wraps these
 * lines in styling -- cli.py:2452 defines _DIM as "\x1b[2;3m" and cli.py:6217
 * prints the tirith banner as `f"  {_DIM}...{_RST}"` -- and _DIM is an
 * unconditional constant, not something the vendor turns off. The filter has
 * only ever worked because the headless lane's stdout is a pipe, where
 * prompt_toolkit renders the parsed styling as plain text.
 *
 * On a lane that carries the escapes it fails open, and undecorate() alone
 * cannot save it: a CSI escape body contains DIGITS, and undecorate stops at
 * the first digit. Measured 2026-08-03 against the shipped matcher, using the
 * exact prefix captured from a mux-driven PTY run on e2b ("\u001b[0m" then
 * U+26A0):
 *
 *   "\u26a0 tirith security scanner ..."           -> undecorate -> MATCH
 *   "\u001b[0m\u26a0 tirith security scanner ..."  -> "0m\u26a0 tirith ..."  -> MISS
 *   "  \u001b[2;3m\u26a0 tirith ...\u001b[0m"      -> "2;3m\u26a0 tirith ..." -> MISS
 *
 * So the filter's correctness depended on a property of the transport rather
 * than of the line, and any substrate whose exec allocates a TTY would have
 * silently reverted the 2026-08-01 fix. Stripping first makes the phrase list
 * lane-independent instead of accidentally correct.
 *
 * CSI is the family hermes actually emits (colors via _DIM at cli.py:2452,
 * cursor moves from prompt_toolkit). The OSC arm is DEFENSIVE, not observed: an
 * earlier version of this comment claimed agent/display.py "builds a clickable
 * OSC 8 hyperlink", which is false -- that file contains ZERO escape bytes and
 * exactly one textual mention of OSC 8, in a section-header comment (verified
 * 2026-08-03 against the pinned wheel, sha256 bd0bac01...3bef327f). hermes in
 * fact STRIPS OSC before printing (cli.py:3473/3505). The arm stays because a
 * terminal-bound vendor may add one and stripping costs a regex, but do not
 * read it as evidence that anything emits OSC today.
 *
 * Stripping is used for MATCHING and for the status label only; a text delta
 * keeps its bytes, because escapes inside an answer are part of the answer.
 */
const ANSI_OSC = /[\u001b\u009b]\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)/g;
const ANSI_CSI = /[\u001b\u009b]\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(line: string): string {
	return line.replace(ANSI_OSC, "").replace(ANSI_CSI, "");
}

/**
 * Strip a leading decoration before matching a diagnostic phrase.
 *
 * The first version of this filter anchored on the phrase itself and did not
 * fire in production. The live line begins with a warning glyph and a space
 * (U+26A0, sometimes followed by the U+FE0F variation selector), so "^tirith"
 * never matched:
 *
 *   "\u26a0\ufe0f tirith security scanner enabled but not available \u2014 ..."
 *
 * The phrase had only ever been read from docs/MUX-RESULTS.md, which is ASCII
 * by house rule -- the glyph was gone and the em-dash had become "--", so the
 * matcher was written against sanitized text and silently failed open on the
 * real bytes. Verified 2026-08-01 by capturing RunResult.text from live hermes
 * runs on e2b and sprites.
 *
 * The vendor is not consistent about the decoration, which is why matching
 * cannot depend on it: run_agent.py:1197 emits a BARE U+26A0 plus one space,
 * cli_agent_setup_mixin.py:73 emits U+26A0 U+FE0F plus two, and
 * conversation_loop.py:2270/5143 use U+1F4BE and U+27F3 instead.
 *
 * Only leading NON-LETTER, non-digit characters are removed, so this cannot
 * swallow an answer: a real reply that opens with a word is untouched, and a
 * reply that opens with punctuation still has to match the full phrase.
 */
function undecorate(line: string): string {
	return line.replace(/^[^\p{L}\p{N}]+/u, "");
}

/**
 * Per-turn parser state. Only the "has this turn produced answer text yet"
 * latch, which is condition 2 above.
 */
type ParseState = { sawText: boolean };

function newParseState(): ParseState {
	return { sawText: false };
}

/**
 * Backing state for the singleton parseLine. The router calls
 * newTurnParser() first and only falls back to parseLine for adapters that
 * do not offer one, so this serves direct callers; its latch is never
 * reset, which is exactly why newTurnParser exists.
 */
const singletonState = newParseState();

function parseLineWith(state: ParseState, line: string): MuxAgentEvent[] {
	const trimmed = line.trim();
	if (trimmed.length === 0) return [];
	// Strip styling BEFORE the decoration, because a CSI body contains digits
	// and undecorate() stops at the first one -- see stripAnsi() above for the
	// measurement. The label is de-styled too: it exists to be read in a log or
	// a UI, where a raw escape is noise rather than information.
	const bare = stripAnsi(trimmed);
	if (
		!state.sawText &&
		VENDOR_DIAGNOSTIC_HEADS.some((head) => head.test(undecorate(bare)))
	) {
		return [{ type: "status", label: bare.trim() }];
	}
	state.sawText = true;
	// The raw line, not the trimmed one: hermes indents code blocks and
	// list items, and that indentation is part of the answer.
	return [{ type: "text", delta: `${line}\n` }];
}

/**
 * These two keys are the whole surface, and the corrected reason is worth
 * recording because the note that used to sit here was wrong.
 *
 * It said hermes "also honors NOUS_API_KEY", implying a `nous` field on
 * UpstreamKeys would unlock a third upstream. It would not, in 0.19.0:
 * the nous provider is auth_type="oauth_device_code"
 * (plugins/model-providers/nous/__init__.py:55), and every consumer that
 * feeds an INFERENCE path skips anything that is not auth_type="api_key"
 * (hermes_cli/auth.py:455, hermes_cli/config.py:9116, doctor.py:548). One
 * consumer does NOT gate -- provider_catalog.py:143-144 reads nous's env_vars
 * into ProviderDescriptor.api_key_env_vars -- but that feeds labels and a
 * signup URL, not a credential, so the conclusion holds and only the earlier
 * "both consumers skip" phrasing was wrong. Meanwhile the
 * hand-written PROVIDER_REGISTRY["nous"] entry declares no key env vars at
 * all (hermes_cli/auth.py:177 -- AST-checked kwargs: id, name, auth_type,
 * portal_base_url, inference_base_url, client_id, scope). The variable
 * survives only in two display lists (doctor.py:39, dump.py:370), so setting
 * it resolves no credential on any inference path; nous needs `hermes auth`
 * and ~/.hermes/auth.json. Verified 2026-08-03 against the pinned wheel.
 * Keeping the false note cost a phantom item on the provider-convergence
 * work and would have sent the next reader to add a field that does nothing.
 *
 * These keys also cover hermes's AUXILIARY traffic, which matters because an
 * auxiliary call is what produced the one hermes failure report we have (a
 * non-streaming title-generation request rejected with HTTP 400
 * "streaming_required"). Auxiliary tasks default to provider "auto"
 * (hermes_cli/config.py:1688), and "auto" step 1 is the MAIN runtime
 * (agent/auxiliary_client.py:4383-4392), so they follow --provider. Measured
 * 2026-08-03 on e2b through this adapter: hermes logged "Auxiliary
 * title_generation: using auto (claude-fable-5) at https://api.anthropic.com"
 * and a CONNECT-logging proxy inside the sandbox saw api.anthropic.com:443 as
 * the only host dialed in the turn -- where the title call SUCCEEDED. There is
 * therefore no base URL for this adapter to align and nothing here to fix: a
 * FastAPI-shaped {"detail": ...} envelope with a "code" field is not
 * Anthropic's, and hermes's own Anthropic auxiliary path prefers streaming
 * anyway (agent/anthropic_adapter.py:2769-2806, prefer_stream=true), so a
 * "streaming_required" 400 is unreachable through it. The reported failure came
 * from a runtime this wiring did not choose. All this adapter owes such a line
 * is classification, which VENDOR_DIAGNOSTIC_HEADS now does.
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
		//
		// `--quiet` is load-bearing, not merely terse: do not drop it to get
		// richer progress output. In hermes 0.19.0 it sets
		// suppress_status_output (cli.py:15971-15972), which makes _vprint
		// return before it honors force=True (run_agent.py:854) and so drops
		// every _emit_warning -- including the "Auxiliary <task> failed"
		// family -- before it reaches stdout. It also sets quiet_mode, which is
		// what actually keeps the per-tool progress line out of the answer:
		// tool_executor.py:930-940 tries _should_emit_quiet_tool_messages()
		// first (already false, because cli_agent_setup_mixin.py:396 passes
		// tool_progress_callback unconditionally and that predicate requires
		// its absence), then an `elif not agent.quiet_mode && ...` that
		// short-circuits on quiet_mode before it ever reads
		// tool_progress_mode. An earlier version of this comment credited
		// tool_progress_mode="off" as "the only thing" suppressing that line;
		// it is the third gate of three, and the least load-bearing.
		//
		// Dropping --quiet would also route the turn through HermesCLI.chat()
		// (cli.py:16076) instead of run_conversation (cli.py:15979), and only
		// the chat() path starts the auxiliary title request on OUR lane.
		// Note it is not the only caller of maybe_auto_title -- there are four
		// (cli.py:12308, tui_gateway/server.py:10300, acp_adapter/server.py:1625,
		// gateway/run.py:21160), which also means switching to hermes-acp would
		// NOT remove the aux title call, contrary to what the structural-fix
		// note elsewhere implied.
		//
		// Endpoint/lane behavior above was measured on e2b 2026-08-03 by a
		// separate investigation in this session, not by the author of this
		// comment: a mux-driven machine.run() returned RunResult.text exactly
		// "MUX-OK\n" with the tirith line as a status event, while the same
		// wiring driven through interactiveCommand() on a PTY did print the
		// auxiliary warning, and the aux call resolved to api.anthropic.com:443
		// and SUCCEEDED there (hermes's own log plus a CONNECT-logging proxy in
		// the sandbox). Those console results were not retained as artifacts, so
		// treat the endpoint detail as reported-and-unarchived rather than
		// reproducible from this repo.
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
		//
		// This lane carries diagnostics the headless one suppresses -- with no
		// --quiet there is no suppress_status_output, so every _emit_warning
		// reaches the terminal, and it is where the "Auxiliary title generation
		// failed" report came from. The router does not run parseLine over PTY
		// output (pty() goes straight to sandbox.openPty), so those lines are
		// the user's to read and cannot reach RunResult.text today. Anything
		// that starts parsing this stream must reuse newTurnParser(), which is
		// why VENDOR_DIAGNOSTIC_HEADS already covers the family.
		return {
			command: `${PATH_PREFIX} hermes${providerFlag(keys)}`,
			env: upstreamEnv(keys),
		};
	},

	parseLine(line: string): MuxAgentEvent[] {
		// Plain-text passthrough: every non-empty line is a text delta,
		// apart from the recorded vendor diagnostics. There is no reliable
		// final-result marker in hermes output, so no result event is
		// emitted; RunResult.text accumulates from these deltas in the
		// router and done is synthesized on exit.
		return parseLineWith(singletonState, line);
	},

	newTurnParser(): (line: string) => MuxAgentEvent[] {
		const state = newParseState();
		return (line) => parseLineWith(state, line);
	},
};
