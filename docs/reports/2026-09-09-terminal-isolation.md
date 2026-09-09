# Final startup and terminal isolation checks — September 9, 2026

## Current checkpoint

The corrective one-shot terminal behavior passed real browser retesting on
deployed `ce2d418`. The subsequent startup-diagnostic correction passed both its
aggregate gate and a real production retest on `e4627ce`. Final non-waking
provider checks confirmed the disposable fixture absent and the original Worker
stopped, with its verification artifact retained. These are bounded release
checks, not an exhaustive concurrency, provider, or latency guarantee.

## Live fixture scope

On deployed `e38fe69`, the final browser checks used the owner's existing
Daytona Worker `b99cf49a-f0dd-4f13-9785-58bec785b3ce` and exactly one disposable
Daytona Worker:

- Recipe: `d8c78ae3-7861-48ae-a909-62c8f403fe5f`
- Machine: `d9cb71f4-7c7b-4635-94b5-08d0cede6119`
- Name: `QA startup and terminal e38fe69-03fe5f`
- Runtime/model: Codex CLI / `gpt-5.6-sol`
- Observed allocation: 1 vCPU, 2 GiB RAM, 10 GiB disk

The original Worker was deliberately woken for comparison, not destroyed or
replaced. No Workers or provider/model credentials were added to the Princeton
isolation account. These terminal probes were read-only shell commands, not
additional model tasks.

## Reload during startup — passed

The browser submitted **Save & deploy** once. While the page showed
**Intent accepted · provisioning**, its URL contained
`launch=fc21701f-04e8-4a1e-95c2-3f5964dde8a4`. Reloading that exact URL at
23:03:23 UTC reattached to the same operation and showed bootstrapping progress
against the same new machine. It later opened the ready machine's view.

The subsequent recipe journal showed successful reconciles with prefixes
`fc21701f` and `560f729c`; this is not a claim that the entire flow created only
one journal entry. The Fleet contained the original Worker and exactly one new
machine, not a duplicate allocation caused by the reload. A separate non-waking
provider inventory at 23:12:28 UTC matched the exact fixture name, machine ID,
and allocation, and found only one matching disposable resource without hitting
the bounded inventory limit.

## Native PTY switching — passed

Through the real machine dropdown in one browser tab, the test switched from
the disposable Worker to the original Worker and back. Read-only `printf` and
`hostname` commands were entered through each native PTY after confirming a
shell prompt. Each returned its own machine ID. Returning to the disposable
Worker restored its own marker and terminal output, without the owner's marker.

This proves bounded native input/output targeting and preserved tmux output,
not a universal latency claim. One owner-side sample displayed 128 ms; no
sub-50-ms guarantee is inferred from this test.

## One-shot history regression — historical reproduction

The same browser tab executed a one-shot command on the original Worker:
`TERMINAL_SCOPE_OWNER_e38fe69`, its hostname, and confirmation that the original
verification artifact exists. All output was read-only and the command exited 0.

After switching to the disposable Worker and reopening one-shot mode, the
original Worker's command and output appeared under the disposable Worker's
heading. A new command on the disposable Worker correctly returned
`TERMINAL_SCOPE_DISPOSABLE_e38fe69`, its distinct hostname, and absence of the
owner's artifact. Actual remounted command targeting worked; displayed history
was incorrectly shared.

The cause was global browser-session history/scrollback keys. Inspection and
executed-component regressions also exposed a captured initial machine ID when
the component is reused, stale request completions, and interrupted output
being labeled completed without an exit confirmation. The corrective change
is scoped to the one-shot terminal; the native PTY implementation is unchanged.

## Corrective implementation

The terminal now owns a keyed session per explicit machine ID: draft, command
history, scrollback, timers, and stream requests cannot follow a different
Worker. Browser storage keys include that identity. Legacy unscoped keys are
left unread, not silently attributed or deleted. Missing machine context makes
no request; the Fleet shortcut already redirects to an explicit machine route.

Unmount aborts the old client request and ignores late headers, JSON, and
stream events. It stops further batch diagnostics, not commands already running
remotely. Restored pending commands and streams ending without a confirmed
integer exit code say completion was not confirmed; they are not labeled
successful. Startup diagnostics do not duplicate a command entered first.

Nine executed-component tests failed before correction; a further startup-timer
race test was also observed failing before its fix. All 16 terminal tests then
passed, as did 43 focused terminal/session/input checks and TypeScript.
Independent review found no concrete blocker. At this implementation checkpoint,
deployed retest and fixture cleanup remained outstanding; the later evidence
below supersedes that status.

The complete `pnpm check` then passed: 863 SDK/source tests, 1,786 web tests in
167 files, 37 explicit skips, both TypeScript checks, the production build,
and isolated SDK packaging. These counts include the focused tests above.

## Deployed one-shot retest on `ce2d418` — passed

Real browser checks executed distinct per-machine markers and `hostname` through
the one-shot terminal on the original Worker (A) and disposable Worker (B).
Each returned its own marker and hostname; the two measured command durations
were 534 ms and 584 ms. These are individual observations, not a latency SLA.
Separate machine transitions retained the correct machine's history and output.
Legacy unscoped browser history was not restored into either keyed session.

A confirmed 20-second command was then started on B before switching to A.
A's draft remained intact, and B's output did not appear in A's terminal.
Returning to B showed that the interrupted command's completion was unconfirmed,
rather than inventing a successful exit. This verifies client-side isolation
and honest interrupted-state presentation, not cancellation of B's remote
command or proof of its final remote exit status.

Together with the earlier native PTY check, these observations close the
bounded two-Worker input/output and one-shot-history targeting checks. They do
not claim that every concurrent terminal scenario or provider was retested.

## Startup diagnostic follow-up — passed

The final startup-diagnostic inspection found a separate mismatch: automatic
diagnostics still assumed Hermes and a hardcoded home path, despite the selected
Workers using Codex. The narrow correction replaces those assumptions
with lightweight checks of files under the actual `HOME`, without invoking a
model or treating an unrelated runtime probe as readiness evidence.

Independent review of the frozen startup correction found no concrete blocker.
The first aggregate attempt failed only the existing
`web/lib/dashboard/runtime-sessions.test.ts` case **lists retained histories from
all four runtimes without inventing configured sessions**, at its default
5,000 ms limit. That same case passed in 1,432 ms when rerun. An intervening
file-level retry hit the WAL fixture's existing 5,000 ms child-process budget;
the WAL case subsequently passed alone in 678 ms and in 591 ms within the full
unchanged 33-test file, which passed in 10.98 seconds. This is observed
intermittent timing sensitivity; system load was not established as its cause.
No source, configuration, or timeout changes were made to obtain these rerun
passes.

The aggregate retry of `pnpm check` completed with exit 0: 863 SDK/source tests,
1,787 web tests in 167 files, 37 explicit skips, both TypeScript checks, the
Next.js production build, and isolated SDK packaging passed. These are the
latest aggregate counts, not additions to the earlier 1,786-test checkpoint.

Commit `e4627ce1b4534d7d2784c1e6e69a1671629b80f6` records the startup correction
and was pushed to `origin/main`. Production deployment
`dpl_BLRgrQviNshVj9pZaAfCK7X9hbkk`
(`agent-machines-qvmy0nia4-kl01s-projects.vercel.app`) reached Ready and was
independently resolved through `https://www.agent-machines.dev`.
Health returned 200; unsigned machine access remained 401.

A new authenticated Chrome tab opened the original Worker's terminal and
selected one-shot mode. Exactly one automatic diagnostic completed with exit 0
in 554 ms. It printed the correct machine ID, `HOME=/home/daytona`, and the
existing Worker directory names, including `artifacts`, `chats`, `crons`, and
`state`. It did not print secret file contents, invoke an agent CLI, or claim
Hermes was missing. This is one observed command duration, not a sub-50-ms SLA
or a controlled speed comparison with the old startup command.

## Cleanup checkpoint — 23:31:03 UTC

An independent provider read at 23:31:03 UTC on September 9 returned HTTP 404
for exact disposable machine `d9cb71f4-7c7b-4635-94b5-08d0cede6119`, confirming
its absence. Its disposable disk is not retained; this is separate from the
original Worker's preserved verification artifact and filesystem.

The original Worker remained started for the final startup retest. At
23:33:54 UTC, a read-only provider filesystem check verified that
`/home/daytona/.agent-machines/artifacts/auth-launch-verification.md` was still
428 bytes, SHA-256
`916475208b15ab174044a8e1eeceeaa9a6c01fe6fb7a3efd34526e9307f3d629`.

After the deployed retest, the original Worker's normal UI **sleep** action was
used. Independent non-waking reads at 23:36:44 UTC confirmed original machine
`b99cf49a-f0dd-4f13-9785-58bec785b3ce` stopped, disposable B still absent (404),
and the old E2B QA resource `inhhzbntovc0yik89pe4f` paused. The owner's active
selection returned to the original Worker after B's deletion. Retained original
and old-QA disks may still incur storage charges; they were not deleted.
