# Final startup and terminal isolation checks — September 9, 2026

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

## One-shot history regression — reproduced

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
Independent review found no concrete blocker. Deployed retest and fixture
cleanup must still be recorded before claiming the one-shot check passed.

The complete `pnpm check` then passed: 863 SDK/source tests, 1,786 web tests in
167 files, 37 explicit skips, both TypeScript checks, the production build,
and isolated SDK packaging. These counts include the focused tests above.
