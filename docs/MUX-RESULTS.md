# Mux live matrix -- measured results

Every number below came from `npx tsx scripts/mux-live-test.ts` against
real provider APIs with real model keys on 2026-07-31. No synthetic or
demo values. Re-run it to refresh; the script exits non-zero if any
credentialed cell fails.

Prompt for every cell: `Reply with exactly the text MUX-OK and nothing
else. Do not use any tools.` A cell is `ok` when the harness exits 0 --
that is the entire pass criterion in the script
(`row.outcome = result.exitCode === 0 ? "ok" : "failed"`). The normalized
text is captured and printed per cell for a human to read, but it is not
asserted, so a cell whose text came back empty, or as a vendor banner
instead of the answer, would still print `ok`. Corrected 2026-08-03: this
line used to say the text was part of the gate.

## The 4x4 matrix, measured 2026-08-01

Full run of `npx tsx scripts/mux-live-test.ts`, plus a re-run of the two
sprites install cells after the detached-work fix below.

| Agent | Sandbox | Result | create | install | first event | run |
| --- | --- | --- | --- | --- | --- | --- |
| claude-code | e2b | ok | 425 | 6953 | 993 | 3487 |
| codex | e2b | ok | 333 | 10130 | 365 | 2909 |
| openclaw | e2b | ok | 134 | 25719 | 13452 | 13946 |
| hermes | e2b | ok | 163 | 5125 | 2647 | 14591 |
| claude-code | sprites | ok | 719 | 222 | 2097 | 4678 |
| codex | sprites | ok | 615 | 298 | 2890 | 9992 |
| openclaw | sprites | ok | 1375 | 13595 | 12258 | 13151 |
| hermes | sprites | ok | 536 | 4535 | 3868 | 18642 |
| claude-code | dedalus | ok | 3232 | 11007 | 4947 | 4949 |
| codex | dedalus | ok | 2957 | 12241 | 8183 | 8185 |
| openclaw | dedalus | ok | 3115 | 25979 | 10723 | 10723 |
| hermes | dedalus | ok | 3506 | 8729 | 12866 | 12869 |
| claude-code | vercel | ok | 961 | 5805 | 826 | 2889 |
| codex | vercel | ok | 385 | 6397 | 882 | 2930 |
| openclaw | vercel | ok | 425 | 16047 | 8580 | 9266 |
| hermes | vercel | ok | 380 | 4086 | 2826 | 12809 |

**16 of 16 cells pass.** Every harness on every substrate: 16 runs, all exit 0. The
per-cell text was printed and read while the matrix ran, but it is not recorded in this
table and the script does not assert it, so "returned the sentinel" is an operator
observation rather than something these rows back (corrected 2026-08-03).

Two cells changed character completely:

- **Hermes was the one permanently red harness.** The vendor curl installer
  exhausted E2B's base sandbox (478 MB) and the VM stopped answering RPCs;
  on sprites it was still fetching ffmpeg's ~190 apt packages when a
  15-minute budget expired. Installing the published wheel with uv instead
  takes 5.1s on e2b and 4.5s on sprites.
- **openclaw on sprites** went from never finishing to 13.6s.

### Sprites throttles detached work

The openclaw-on-sprites failure took three attempts to diagnose because the
first two explanations were guesses. Tracing the install with `set -x` on a
live sprite showed what actually happens inside a detached session: a
version check against a Node binary that works interactively fails, and a
`curl` that takes 0.11s via a normal exec stalls indefinitely.

Measured directly: the identical openclaw install finishes in **16.9s in the
foreground** and **does not finish in 15 minutes detached**.

So `detachedWork: "reliable" | "throttled"` is now a declared substrate
capability, and `ensureInstalled` runs the install on the open connection
for throttled lanes. Detaching exists to survive request budgets (E2B's
sandbox lifetime), not as an end in itself, and applying it universally was
the error. The fix also made hermes on sprites 100x faster -- 4.5s
foreground against 455s detached -- so the throttling had been silently
taxing the cells that did pass.

### Dedalus, added 2026-08-02

All four harnesses run on Dedalus. Two things worth recording.

Its `create` is the slowest of the three working substrates (~3s against
E2B's ~0.4s), which matches the batch-REST design: there is no streaming
primitive, so every exec is submit-then-poll.

**Teardown returns a vendor 500 that is not ours.** `destroy` answered:

```
500 failed to close storage usage before deleting machine spec
  query latest storage bucket: usage ledger query returned 400:
  column org_metering_buckets.stripe_submitted_at does not exist
```

That is a missing column in Dedalus's own metering ledger. The machine spec was
deleted anyway -- a follow-up list showed only two pre-existing machines from
June and May, so nothing leaked against the 5-machine Hobby quota. It did expose
a real flaw in our own code, now fixed: `Mux.remove()` forgot the placement in a
`finally`, so an ambiguous teardown failure would have made a possibly-alive
machine invisible by name. It now forgets only when the substrate says the
sandbox is gone, and rethrows otherwise so the removal can be retried.

### Vercel Sandbox, closed 2026-08-02

The last four cells, opened with `VERCEL_OIDC_TOKEN` from
`vercel env pull` (docs/VERCEL-SANDBOX-AUTH.md). No code changed to make them
pass: the adapter, its twelve declared capability axes and its no-wake lifecycle
were already written and unit-tested, which is what "blocked on a credential"
meant.

It is now the FASTEST lane measured: create 380-961ms and 826ms to first event
for claude-code, against E2B's 425ms/993ms. Worth noting given it is also the
lane with no native PTY -- terminals there run through tmux-over-exec -- so raw
provisioning speed and interactive fidelity are independent axes.

One thing the run confirmed that had only been inferred: the harness install
figures (4.1-16.0s) prove `detachedWork: "reliable"` is right for this
substrate. Sprites remains the only lane that throttles detached work.

### Fixed: the hermes diagnostic leaked into the answer

Hermes prints a startup check for the tirith command scanner, and its
plain-text parser passed it through as a text delta, so it landed in
`RunResult.text` ahead of the answer. Filtered now, and the fix is worth
recording because the FIRST attempt passed its unit tests and still failed in
production.

The matcher was anchored on the phrase (`/^tirith security scanner.../`). The
real line begins with a warning glyph and a space (U+26A0 U+FE0F), so it never
matched. The phrase had only ever been read from THIS FILE, which is ASCII by
house rule -- the glyph was gone and the em-dash had become `--`, so the
matcher was written against sanitized text and failed open on the real bytes.

The fix strips leading non-letter, non-digit characters before matching, so a
decoration cannot hide a diagnostic, while a real answer that merely opens with
punctuation still has to match the full distinctive phrase to be filtered.
Test fixtures now carry the exact wire bytes as escapes.

Verified live on e2b after the fix: `text: "MUX-OK"`, with no diagnostic. The
lesson generalizes -- a fixture copied out of prose documentation is not the
wire, and a filter tested only against prose will pass while doing nothing.

Scope correction, 2026-08-03: what shipped on 2026-08-01 fixed **one line**, not
the class. The filter held exactly one phrase, so it was a record of sightings
rather than of the vendor's behaviour, and two further layers of the same trap
were still live. See below.

### Fixed: the same trap, two layers down (2026-08-03)

A user running hermes in an e2b sandbox saw the main chat answer normally and
then this:

```
U+26A0 Auxiliary title generation failed: HTTP 400: Error code: 400 - {'detail': {'error':
{'message': 'This request requires streaming. Set "stream": true and retry.', 'type':
'invalid_request_error', 'code': 'streaming_required', ...
```

`U+26A0` above is the NAME of the leading codepoint, not text hermes prints. This
file is ASCII by house rule, and sanitizing that glyph away silently is precisely
how the 2026-08-01 matcher was written wrong -- so from here on this file names
codepoints instead of dropping them, and **fixtures come from a capture or from
the vendor's source, never from this page**. The wire form is a bare U+26A0 and
one space, with no U+FE0F: a different decoration from the tirith line above,
from the same vendor, in the same release.

Fed to `hermesHarness.parseLine`, that line came back as a **text delta** -- the
vendor's warning about its own failed background task, reported as the model's
answer. Three things came out of chasing it, all checked against the pinned
wheel (`hermes_agent-0.19.0-py3-none-any.whl`, sha256 `bd0bac01...3bef327f`,
equal to the digest PyPI publishes) and against live runs on e2b.

**1. The phrase list was a list of sightings.** It is now enumerated from the
vendor's source, restricted to print sites that can reach the parser. The
restriction is the point: hermes has two print channels that behave in opposite
ways under our flags. `_vprint` (`run_agent.py:835`) returns as soon as
`suppress_status_output` is set, *before* it honours `force=True` (`:854`), and
`--quiet` sets that flag (`cli.py:15971`) -- so every `_emit_warning` is dropped
on a headless run. `_safe_print` (`run_agent.py:817`) and the CLI's `_cprint`
have no such gate, and those are the lines that reach us. That is also why the
tirith banner was in `RunResult.text` at all: `cli.py:6217` prints it through
`_cprint`. Four more ungated writers are now covered, each cited in the code:
the context-probe line, the compaction notice, and the streaming-unsupported
notice *with its second physical line* (one `print` containing newlines, so the
hint arrives sigil-less and reads like prose).

The auxiliary warning itself is one **family**, not one line:
`run_agent.py:1188-1197` builds all of them from a single f-string with the task
interpolated, hermes runs 13 auxiliary tasks, and none of its auxiliary call
sites requests streaming -- so any of them can fail this exact way against an
SSE-only endpoint. One bounded-wildcard entry covers all 13 instead of a list
that grows once per incident report.

**2. `undecorate()` was defeated by ANSI styling, and that was luck, not
design.** Hermes wraps these lines in colour (`_DIM = "\x1b[2;3m"`,
`cli.py:2452`), and a CSI escape body contains **digits** -- so `undecorate()`,
which strips leading non-letter/non-digit characters, stops at the first one.
Measured against the shipped matcher using the exact prefix captured from a live
PTY run:

| line as it arrives | after `undecorate()` | matched? |
| --- | --- | --- |
| `U+26A0 tirith security scanner ...` | `tirith security scanner ...` | yes |
| `ESC[0mU+26A0 tirith security scanner ...` | `0mU+26A0 tirith security ...` | **no** |
| `  ESC[2;3mU+26A0 tirith ...ESC[0m` | `2;3mU+26A0 tirith ...` | **no** |

The 2026-08-01 fix worked only because the headless lane's stdout is a pipe,
where the styling is rendered away. Any substrate whose exec allocated a TTY
would have silently reverted it. Escapes are now stripped before matching, which
makes the phrase list a property of the line instead of a property of the
transport.

**3. The 400 was not ours, and there is nothing here to align.** Auxiliary tasks
default to provider `auto`, and `auto` step 1 is the main runtime
(`agent/auxiliary_client.py:4383-4392`), so they follow `--provider`. Measured
2026-08-03 on e2b through this adapter: hermes logged `Auxiliary
title_generation: using auto (claude-fable-5) at https://api.anthropic.com`, a
CONNECT-logging proxy inside the sandbox saw `api.anthropic.com:443` as the only
host dialled in the turn, and the title call **succeeded**. A FastAPI-shaped
`{'detail': ...}` envelope with a `code` field is not Anthropic's, and hermes's
Anthropic auxiliary transport prefers streaming anyway
(`agent/anthropic_adapter.py:2769-2806`), so `streaming_required` is unreachable
through it. The reported failure came from a runtime this wiring did not choose.
Correctly classifying the line is the whole of what this adapter owes it -- there
is no base URL, env var or flag on our side to change, and inventing one would be
guessing at someone else's endpoint. Hermes's only real kill switch is
`auxiliary.title_generation.enabled: false` in its `config.yaml`; there is no env
var and no CLI flag, so turning auxiliary work off would mean writing a config
file into every sandbox, which is a bigger decision than this bug.

Two facts worth keeping for whoever reads this next. `--quiet` is **load-bearing**
in `runCommand`, not just terse: it sets `suppress_status_output`, which drops
every `_emit_warning`, and `quiet_mode`, which is what actually keeps the
per-tool progress line out of the answer (`tool_executor.py:930-940` reaches a
`not agent.quiet_mode` guard before it ever reads `tool_progress_mode`, and the
branch above that is already dead because `cli_agent_setup_mixin.py:396` always
passes a `tool_progress_callback`). Without `--quiet` the turn routes through
`HermesCLI.chat()` (`cli.py:16076`) instead of `run_conversation`
(`cli.py:15979`), and only that path starts the auxiliary title request on this
lane -- it is NOT the only caller of `maybe_auto_title`, which has four
(`cli.py:12308`, `tui_gateway/server.py:10300`, `acp_adapter/server.py:1625`,
`gateway/run.py:21160`). That last one matters for planning: because the ACP
server calls it too, switching this adapter to `hermes-acp` would not remove the
auxiliary title call.

And the auxiliary warning reaches a **PTY** today, not a headless run: `pty()`
goes straight to `sandbox.openPty` and the router never runs `parseLine` over it.
The family entry is therefore load-bearing on the PTY lane and prophylactic on
the headless one, held there by one flag.

The first pass at that head list modeled only two print channels and missed
Python's builtin `print()`, which nothing this adapter passes can gate. Seven
bare-print diagnostics from the wheel were reaching `RunResult.text` as text
deltas, two of them on runs that exit 0 with a real answer
(`chat_completion_helpers.py:1905` and `conversation_loop.py:2961`). Covered as
of 2026-08-03, each head mutation-checked.

### Substrate primitives

| Substrate | create | exec (cold) | exec (warm) |
| --- | --- | --- | --- |
| e2b | 265ms | 122ms | -- |
| sprites | 401ms | 296ms | 87ms |

The Sprites warm number is the `execFileHTTP` fast path. The old
WebSocket-per-exec path measured ~5.3s in the May 2026 benchmarks.

## Findings that changed the implementation

1. **Sandbox images ship old Node.** E2B base is Node v20.9.0, below
   Claude Code's floor of 22 and OpenClaw's 24.15. Rather than depend on
   the image or sudo, harnesses bootstrap a private Node 24.18.1 into
   `~/.agent-machines/node` and prefix `PATH`
   (`src/mux/harnesses/node-runtime.ts`).
2. **A `PATH=... cmd` prefix does not survive a pipeline.** `PATH=x echo
   | claude` applies the assignment only to `echo`, so the harness died
   with exit 127. Fixed by wrapping in a brace group with `export`.
3. **OpenClaw requires a session target even for `--local` one-shots**
   (`Pass --to, --session-key, --session-id, or --agent`). The adapter
   now always passes `--session-key`, mapping `sessionId` onto it.
4. **OpenClaw `--json` is pretty-printed, not NDJSON.** Line-at-a-time
   parsing never saw a complete object, so the adapter has a per-run
   parser that accumulates lines until brace depth balances (string-aware).
5. **Sprites `create` returns intermittent 500s that still create the
   sprite.** 2 of 3 identical requests failed; a naive retry then hit
   409. The provider retries transients with backoff and adopts an
   existing sprite on conflict, making named creates get-or-create.
6. **`npm -g` is not portable across substrates.** E2B installs to
   `/usr/local` (on PATH), while Sprites routes Node through nvm whose
   global bin is *not* on PATH -- `npm install -g openclaw` reported
   success and left `openclaw` unfindable. Pinning `npm_config_prefix`
   fixes the path but nvm hard-refuses that variable, so harnesses now
   install into `$HOME/.agent-machines/pkgs` with `npm install --prefix`
   and that `node_modules/.bin` is always on the harness PATH.
7. **Long installs must not be held on a connection.** A foreground
   install outlived E2B's sandbox budget and tripped Sprites' WebSocket
   keepalive. Installs now write a script to the sandbox, launch it
   detached, and poll for an exit-code sentinel, so duration is
   independent of any connection limit and re-running is idempotent.
8. **Sprites' HTTP exec waits for the whole process group**, so
   `setsid`/`nohup`/closed-fd detachment does not return early: a
   `sleep 45` payload returned in 45.2s. Background work is now handed to
   the sprite's tmux server (`tmux new-session -d`), which returns in
   ~250ms. Two follow-on gotchas: a detachable *exec session* is not a
   substitute (closing its socket reaps the payload), and the launcher
   must go through the base64-wrapped `exec` path -- passing its own
   quoting as raw argv made tmux report success while running nothing.
9. **Sprites auto-suspends on idle and background work does not keep it
   awake.** A detached payload plus a fully idle client froze before
   finishing; the same payload completed when the client kept touching
   the sprite. The install poll loop (1.5s) is what keeps it warm, so do
   not lengthen that interval without adding an explicit keepalive.
10. **Hermes needs a pre-baked image, not a per-machine install.** On E2B
   the installer (curl script, Python venv, Node browser deps) exhausts
   the base sandbox -- 478 MB and 2 vCPU -- and the VM stops answering
   RPCs after ~150s; `CreateSandboxOptions` now carries `template` and
   `resources`, but E2B ignored the sizing request on this plan. On
   Sprites it does not run out of memory and progresses correctly
   (uv-managed Python 3.11 installed in 1m50s, then git, Node, then apt),
   but it was still fetching ffmpeg's ~190 packages when the 15-minute
   budget expired. The adapter now declares a 40-minute budget so a first
   run is not cut off mid-apt, and marks itself heavy-install. Treat a
   cold Hermes install as a template-build step, not a request-time one.
   The other three harnesses install in 6-29s.

## Interfaces verified live

- PTY (`openPty`): open 108-201ms, first byte 149-246ms, keystroke echo
  round-trip 49-103ms on both e2b and sprites. Resize applied without a
  reconnect.
- Named PTY reattach: after `close()`, reopening the same session name
  replays the visible pane and the background process is still running --
  on both substrates. This is what caught a real defect: the tmux
  fallback used to kill the session on close, so E2B lost the process
  while Sprites (native detachable sessions) passed.
- CLI: `am mux run --agent claude-code --sandbox e2b "..."` streamed the
  answer and reported `claude-code on e2b: 3615ms, $0.0107`.
- Package build: `npm run build:sdk` emits declarations for the mux with
  no type errors, so `createMux` is importable from the published entry
  point.
7. **A `vck_` key is not Vercel Sandbox auth.** The Vercel provider fails
   closed with that exact explanation and asks for
   `VERCEL_TOKEN`+`VERCEL_TEAM_ID`+`VERCEL_PROJECT_ID` or
   `VERCEL_OIDC_TOKEN`.

## Uncredentialed lanes

`vercel` and `dedalus` report `skipped` with the precise missing
variables rather than erroring. That is the fail-closed contract: the
router never routes to a provider it cannot authenticate, and the skip
reason is carried in `machine.attempts` so the UI can explain the route.

## Resolved: the "reattach delivers no live output" report was a test bug

Recorded here because the wrong conclusion was documented first.

There was never a defect in `openTmuxPty`. Reattach delivers live output
correctly; what was broken was the probe used to check it, which called
`for await (const b of pty.output)` twice on the same handle. `output` is
an async generator, so the second loop's `next()` queued behind the
first's still-pending one: chunks went to the abandoned consumer and the
second loop saw nothing. That is indistinguishable from a frozen
terminal.

Proven on a live E2B sandbox:

- The tail command and offset were never at fault. Running the exact
  watchdog tail (`tail -c +117 -f` at offset 116) through `execStream`
  after a reattach delivered the delta, and so did a plain `tail -f`.
- With one continuous consumer per handle: attach 1 live output arrives,
  attach 2 replays the snapshot, and attach 2's own write arrives live.

`PtyHandle.output` now throws a clear error on a second iteration instead
of silently misdelivering, with a regression test in
`src/mux/pty/tmux.test.ts`. A live byte stream has no buffer to replay
from, so one consumer per handle is the contract; fan out from it if
several readers are needed.


## openclaw on sprites: two real bugs fixed, cell still unconfirmed

Chased through four consecutive live runs. Two genuine defects were found
and fixed; the cell is still not confirmed green, and the remaining
failures look like Sprites-side flakiness rather than our code.

Real bugs, both fixed:

1. **A shim `node` hung every install.** `/.sprite/bin/node` is not a
   binary -- it is an nvm shim that sources nvm.sh and runs `nvm use
   default`. Launched from the detached install it hangs forever
   (measured: first probe still running at 1m45s, more piling up behind
   it, zero bytes in the log, no sentinel), so the install stalled until
   the budget expired. The version probe is now time-bounded, so an
   unresponsive `node` is treated as unsuitable and the bootstrap fetches
   a real binary -- which also drops the nvm dependency for every npm
   harness. Ruled out first: Node is v24.18.0, the version comparison is
   correct, the script is written, the tmux launch session does start.
2. **A partial tree made the failure permanent.** With the hang fixed the
   install ran and died with `ENOTEMPTY: directory not empty, rmdir
   .../@mistralai/mistralai/esm/hooks` (exit 217) -- npm could not
   replace the tree the hung attempts had left behind. Sprites keep their
   filesystem and named sprites are adopted on create, so that state
   persisted across runs. Installs now clear that package's directory
   first (only that package, so sibling harnesses survive).

The other three failures were transport-level and each differed:
`sprite not found` (self-inflicted -- a concurrent run destroyed the same
deterministically-named sprite), `fetch failed`, and `exec timed out`.
That matches Sprites behaviors already recorded above: create returns
intermittent 500s, and sprites auto-suspend, so an adopted sprite may need
to wake before it answers. Add a retry/wake path around transport errors
on this substrate before trusting the cell either way.

e2b is unaffected throughout: openclaw installs there in 25.4s and the run
returns MUX-OK.
