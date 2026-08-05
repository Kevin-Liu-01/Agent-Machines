# Mux live matrix -- measured results

Every number below came from `npx tsx scripts/mux-live-test.ts` against
real provider APIs with real model keys. No synthetic or demo values.
Each section carries the date it was measured; the newest full matrix is
[2026-08-05](#the-4x4-matrix-measured-2026-08-05-current) and every
section above it is history that is kept, not refreshed. Re-run to
refresh; the script exits non-zero if any credentialed cell fails, if a
sandbox refuses to be destroyed, or if the post-matrix sweep finds a
sandbox the run created still alive.

Prompt for every cell: `Reply with exactly the text MUX-OK and nothing
else. Do not use any tools.` A cell is `ok` only when BOTH hold: the
harness exits 0 AND the normalized text contains `MUX-OK`
(case-insensitive, so a model that shifts case is not a false red). When
the sentinel is missing, `row.error` names what did come back -- an empty
string points at event classification, a diagnostic points at the
harness. The script gated on the exit code alone until 2026-08-03, which
was fail-open: an empty text, or a vendor banner reported as agent text
(the hermes classifier bug found that same day), still printed `ok`.
Matrix numbers recorded before that date were gated on the exit code
only; "returned the sentinel" for those rows is an operator observation.

## The 4x4 matrix, measured 2026-08-05 (current)

Full run of `npx tsx scripts/mux-live-test.ts`, script exit 1. This is the
first table in this file taken under the sentinel-asserting gate, so unlike
every dated section below it, "returned the sentinel" here is an assertion
rather than an operator's reading: every one of the 14 green cells was
required to carry `MUX-OK` in its normalized text, and no cell passed on
its exit code alone.

| Agent | Sandbox | Result | create | install | first event | run |
| --- | --- | --- | --- | --- | --- | --- |
| claude-code | e2b | ok | 553 | 7953 | 1035 | 3913 |
| codex | e2b | ok | 120 | 10293 | 696 | 3972 |
| openclaw | e2b | ok | 383 | 27218 | 16317 | 16939 |
| hermes | e2b | ok | 525 | 5599 | 2716 | 14307 |
| claude-code | sprites | ok | 2137 | 293 | 1561 | 4395 |
| codex | sprites | ok | 669 | 293 | 2660 | 4962 |
| openclaw | sprites | ok | 639 | 17541 | 12465 | 12880 |
| hermes | sprites | ok | 752 | 5233 | 3770 | 18169 |
| claude-code | vercel | ok | 2394 | 5641 | 855 | 3978 |
| codex | vercel | ok | 414 | 6035 | 394 | 7666 |
| openclaw | vercel | ok | 643 | 17524 | 8756 | 9324 |
| hermes | vercel | ok | 592 | 5084 | 3492 | 13834 |
| claude-code | dedalus | failed | 13365 | 20778 | 7359 | 7431 |
| codex | dedalus | failed | 4228 | -- | -- | -- |
| openclaw | dedalus | failed | 3367 | -- | -- | -- |
| hermes | dedalus | failed | 10884 | 16074 | 15671 | 15674 |

Two of those four dedalus rows are red for a DIFFERENT reason than the other
two, and the distinction matters. `codex` and `openclaw` failed the RUN. But
`claude-code` and `hermes` ran green -- they exited 0 and returned the sentinel,
which is why their timings are real -- and then failed to DESTROY their sandbox
with the same vendor 500. The verdict column carries the script's own
vocabulary (`ok` / `failed` / `skipped`, with teardown as its own column), and
under the rule this change installed (`scripts/live-matrix-report.ts`:
`teardown === "failed"` demotes the cell) a leaked sandbox is a red cell --
because a harness that reports one as a pass leaks money silently.

**12 of 16 cells pass under the corrected accounting**, and getting that number
right is the point of the section below. The run's own table printed `ok` for 14
because the harness hid teardown failures -- and two of those fourteen,
`claude-code @ dedalus` and `hermes @ dedalus`, ended with a FAILED destroy
after a passing run (the same dedalus 500 quoted below). The teardown fix landed
in the SAME change that recorded this run, so the honest reading of these rows
is 12 green, 2 red on the run, 2 red on teardown, and dedalus 0 of 4 rather than
2 of 4. The published number was 14 for part of 2026-08-05; an adversarial pass
caught it against this changeset's own corrected rule.

The two cells that failed THE RUN are on dedalus, and they are the
same vendor defect twice, not two problems: dedalus rejects an execution
with `machine_not_found` on a machine its own machines API reports as
`phase: "running"`, `reason: "DesiredStateReached"`. It is intermittent --
**4 of 9** create-then-exec sequences hit it on 2026-08-05 (44%), and the
same machine answered a plain `echo` probe in 685ms before failing a write
seconds later. Both red cells died in the install write, and what the
matrix printed was:

```
dedalus writeFile failed for /tmp/am-install-codex-msgdqt1y.sh (exit 1):
```

The empty tail is ours, not the vendor's: this adapter discards the vendor's
execution payload, so the operator gets a truncated diagnosis of somebody
else's split brain. A separate change is in flight for that half; nothing
here claims it is fixed, and the number above is what the vendor did, not
what we did about it.

### Teardown is part of the verdict now (2026-08-05)

The same run exposed a defect in the harness itself. `machine.destroy()` was
the last statement inside each cell's `try`, so a destroy that threw was
caught by the run's own catch: it set `row.error` and never touched the
outcome the passing run had already written. Measured against the script as
it stood at commit `ab920c2`, with a stub whose `destroy()` throws the real
dedalus 500 below: the cell printed `ok`, the sweep did not exist, and
`process.exit` saw zero failures. **A live-test harness that hides teardown
failures leaks money silently**, because a green run is never re-read.

Now: teardown has its own column and its own verdict, a teardown failure
demotes the cell to `failed` and exits 1, and after the matrix each lane
that ran is asked what it still has. The row names the sandbox id and the
vendor's message, so the follow-up is a copy-paste and not an
investigation.

Both halves are load-bearing, and the reason is a real 2026-08-05
observation rather than symmetry: dedalus answered a teardown with

```
dedalus destroy 500: {"title":"Internal Server Error","status":500,
  "detail":"failed to close storage usage before deleting machine spec",
  "errors":[{"message":"query latest storage bucket: usage ledger query
  returned 400: column org_metering_buckets.stripe_submitted_at does not
  exist"}]}
```

and the machine was **gone anyway**. Twice, on two different machines: the
one in the diagnostic run had its record read back as `phase: "destroyed",
reason: "DesiredStateReached"` immediately after the failing remove, and the
one in migration b5 was absent from `list()` afterwards
(`sourceId=dm-019fd311-71d0-7572-b001-293525eee808 listed=false`). So a
destroy that throws is not proof of a leak, and a destroy that resolves is
not proof of teardown either. The row reports what the call did; the sweep
reports what the vendor still has; neither is asked to stand in for the
other.

The matrix itself predates the sweep code, so the lanes were swept by a
separate read-only probe at 18:28Z the same day -- `list()` per credentialed
lane, creating and destroying nothing:

| Lane | `list()` | What it still had |
| --- | --- | --- |
| e2b | ok, 384ms | 2 sandboxes, from 2026-06-14 and 2026-05-30, both sleeping -- neither created by this run |
| sprites | ok, 140ms | nothing (0 entries under the `am-mux-` prefix) |
| dedalus | ok, 1224ms | 2 machines, from 2026-06-15 and 2026-05-25 -- neither created by this run |
| vercel | **failed** | unavailable at the time, so nothing on this lane was proven gone |

**At sweep time, the four vercel sandboxes of this run could not be
independently proven gone.** `list()` on that lane answered

```
vercel list failed: Missing credentials parameters to access the Vercel API: token, teamId
```

under OIDC-only auth. Each of the four cells' own `destroy()` had resolved,
`describe()` afterwards returned `{"state":"destroyed","rawPhase":null}` for
the lane's ad-hoc machine, and Vercel's published Hobby runtime ceiling of 45
minutes (vercel.com/docs/sandbox/pricing, read 2026-08-01) bounds the
exposure -- but none of that is a vendor-side inventory, so the honest report
was NOT SWEPT.

That gap was closed later the same day, and the correction is worth recording
because the cause was ours: `list()` derived a `projectId` from the OIDC JWT
and passed it alongside otherwise-empty credentials, which the SDK reads as a
partial triple and refuses. Passing nothing makes it read all three from the
JWT. Measured 18:47Z on 2026-08-05, after that change, `list()` answered in
4307ms with 3 sandboxes: one from 2026-05-28 and two created at 18:30Z and
18:35Z by unrelated probes. **None of the matrix's four are there**, and the
listing spans both sides of the matrix window (17:44-17:48Z), so this is not
a truncated page. A vendor list cannot tell "destroyed" from "never existed",
so what it settles is the only question that costs money -- nothing that run
created is still alive.

A lane the sweep cannot read is reported `NOT SWEPT` and deliberately does
**not** fail the run: every cell's `destroy()` had already resolved, so the
lane is unconfirmed rather than known-leaking, and a script that exits 1
forever while a vendor's `list()` is broken is a script whose exit code
stops being read -- which would cost the money signal above. The accounting
rules are unit-tested in `src/lib/live-matrix-report.test.ts` against these
captured strings, and each rule was mutation-checked.

## The vercel lifecycle, live for the first time (2026-08-05)

The four vercel matrix cells have run live since 2026-08-02. Everything else
this adapter declares had not: `park()`, no-wake `describe()`/`remove()`,
resume-on-`connect()`, the public-URL gate and the idempotent remove were
written against the SDK's types and unit tests, which is a reading of the
vendor and not a measurement of it. On 2026-08-05 that lane ran end to end
against the live API, on one sandbox (`am-vercel-live`), and every step
held.

| Step | Measured | What it proves |
| --- | --- | --- |
| `create` | 1239ms | `attempts: vercel=ok`, OIDC-only auth (the token triple was absent) |
| `ensureInstalled` (claude-code) | 7786ms | `installed: true` on a lane declared `detachedWork: "reliable"` |
| `run` #1 | 3767ms, first event 1061ms, 4 events, exit 0, `$0.0016045` | `text: "MUX-OK"` -- both gates, asserted |
| `publicUrl(3000)` / `publicUrl(9999)` | URL / `null` | a port declared at create is reachable; an undeclared one is refused, not invented |
| `describe()` while running | 214ms | `state: "ready"`, `rawPhase: "running"`, `resources: {vcpu: 2}` |
| `park()` | 6458ms | `rawPhase` went `running` -> `stopped`; a second `park()` while parked resolved in 164ms without a vendor stop |
| `connect()` (resume) | 379ms | back to `ready`, and `command -v claude` still exits 0 -- filesystem-snapshot persistence carried the install |
| `run` #2 | 4401ms, first event 1424ms, exit 0 | `text: "MUX-OK"` on the resumed sandbox |
| `remove()` | 349ms | `{removed: true, resumed: false}`, then `describe()` reads `destroyed`; a second `remove()` on the gone id resolved in 138ms |

The no-wake trio is proven by construction rather than by inference: a spy
wrapped the vendor SDK and recorded the `resume` flag of all 21 calls the
run made. Of the 13 `Sandbox.get` calls issued by `describe`, `park` and
`remove`, **every one passed `resume: false`**; the single `resume: true`
call in the whole trace is call #13, the `connect()` that deliberately
resumes because a reconnect is a write. `park()` on an id the vendor no
longer knows THREW (`Status code 404 is not ok`), which is what the
contract says it must do -- an unknown id is an error the caller should
see, not a satisfied request -- while `remove()` on the same gone id
resolved.

Two vendor facts worth keeping from the raw getters: the sandbox reported
`region: "iad1"`, `runtime: "node24"`, `vcpus: 2`, `memory: 4096` with a
1-hour `timeout` and an `expiresAt` exactly one hour after creation, and
while parked it reported `totalActiveCpuDurationMs: 10416` against
`totalDurationMs: 17020` -- the gap between the two is why the modeled
$0.0503 for a 10-minute run is described in
[MUX.md](./MUX.md#price) as an upper bound rather than a price.

## Substrate migration: 5 live runs, 4 directed pairs (2026-08-05)

Before this, exactly one directed pair had ever moved live: e2b -> sprites.
Five runs now have, covering four directed pairs -- three of them new -- and
each wrote a 4096-byte random marker into `~/.agent-machines/state/` on the
source and compared sha256 on both ends:

| Run | Move | Options | Result |
| --- | --- | --- | --- |
| b1 | sprites -> e2b | defaults | 10/10 checks, migrate 11528ms, 8447 bytes |
| b2 | e2b -> dedalus | defaults | died inside `migrate`'s own `create()` on the dedalus defect above; re-run passed 10/10, migrate 22193ms, 4567 bytes |
| b3 | e2b -> sprites | `source: "keep"` | 10/10 checks, migrate 2768ms, 4569 bytes |
| b4 | sprites -> e2b | `moveState: false` | 11/11 checks, migrate 8020ms, 0 bytes |
| b5 | dedalus -> e2b | defaults | migrate 20293ms, 4584 bytes, 9/10 -- see below |

What that buys, beyond a count:

- **The marker arrived byte-identical on every pair that moved state**
  (sha256 compared local, source and target), the agent answered `MUX-OK`
  on the new sandbox (3606-7717ms), and the placement moved while keeping
  its harness -- `migrate` never switches an agent.
- **`moveState: false` really ships nothing.** b4's target had no marker at
  all (`shasum: ... No such file or directory`), `verified.marker` came
  back `"skipped"` rather than `true`, `state.moved` was empty, `bytes` was
  0, and the report enumerated the **whole 19-entry allowlist** under
  `lost`. That contract had only unit coverage before.
- **`source: "keep"` really leaves the source running.** b3's source was
  still listed by its provider afterwards (`listed=true`), where b1's and
  b4's destroyed sources were not (`listed=false`). `lostState()` is
  genuinely source-dependent: b1 (from sprites) listed 4 losses, b2 and b3
  (from e2b) listed 5 -- the extra one is e2b's RAM state, which no file
  copy captures.
- **b5's one failed check is the honest one.** `source.action` came back
  `"kept"` with `destroy failed, orphaning dedalus:dm-019fd311-...`, the
  same metering 500 quoted above -- and the sweep then found that machine
  absent from dedalus's own list. The report was right to refuse to call it
  destroyed, and the sweep was right that nothing leaked. Two signals, one
  event, neither redundant.

## Anomaly: sprites dropped 2 of 15 exec stdout lines (2026-08-05)

Recorded because it is unexplained, not because it is understood.

b1's migration report skipped 2 of the 15 allowlist paths with
`"presence probe returned no verdict for this path"`
(`.agent-machines/artifacts` and `.agent-machines/mcps`). The presence probe
prints one `AM_MOVE` line per path in a single exec; sprites' exec stdout
came back missing two of those 15 lines. Nothing was lost -- both paths were
genuinely absent on a fresh sprite, so the correct verdict and the missing
verdict agreed -- but the mechanism is unknown, and **the same exec stdout
channel carries the tar export**. Twelve subsequent identical probes on two
fresh sprites (six each) returned all 15 verdicts every time, so it does not
reproduce on demand.

This is why `exportTar`'s sha256 check is load-bearing rather than
belt-and-braces: on the one substrate where exec stdout has been observed to
arrive incomplete, a byte-level comparison on both ends is the only thing
standing between a truncated stream and a migration that reports success.

## The 4x4 matrix, measured 2026-08-01 (superseded)

Full run of `npx tsx scripts/mux-live-test.ts`, plus a re-run of the two
sprites install cells after the detached-work fix below. Superseded by the
[2026-08-05 matrix](#the-4x4-matrix-measured-2026-08-05-current); kept for
the two cells whose character changed, and because its numbers are the ones
the findings below were measured against.

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

**16 of these 16 cells passed on 2026-08-01.** Every harness on every substrate:
16 runs, all exit 0. These rows predate 2026-08-03, when the script still gated on
the exit code alone -- the per-cell text was printed and read while the matrix ran,
but not asserted, so for THESE recorded numbers "returned the sentinel" is an
operator observation. The [2026-08-05 run](#the-4x4-matrix-measured-2026-08-05-current)
asserts the sentinel and is the current state of the matrix at 12 of 16 under
the corrected teardown accounting (14 by the run's own printed table); this
section is not the headline and a reader should not take it as one.

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
