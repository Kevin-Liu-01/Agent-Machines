# Launch-readiness audit — September 9, 2026

Status: revision `ebc9459a` is deployed and checked; the Daytona replacement
candidate has passed the aggregate release gate and awaits deployment. This report
distinguishes checked-in fixes from deployed evidence; it is not a blanket
production-readiness claim.

## Observed end-to-end behavior

Revision `520a853` was deployed to the production `.com` and `.dev` aliases.
A fresh, isolated account completed the actual sign-up UI using Clerk's supported
development-instance testing token and test-email verification. This verifies
the deployed flow, not production-instance authentication.

The account selected a Coding Agent, E2B, Claude Code, and Sonnet 4.6, supplied
its own test credentials through onboarding, and reached the scoped Console.
Bootstrap completed at 07:41:05 UTC, about 95 seconds after bootstrap started;
the cold install included browser downloads. No instant-start claim is made.
Provider inspection confirmed pause-on-timeout with implicit auto-resume disabled.
At 08:40:44 UTC, a non-waking provider inspection found that same retained E2B
source paused after its 08:39:30 deadline, rather than deleted. No post-timeout
filesystem read or implicit wake was performed in that check.

Its first managed task completed and automatically exported `release-proof.txt`:

- Exact content: `agent-machines-release-520a853` followed by one newline.
- Size: 31 bytes.
- SHA-256: `71d7083bff44fe246cedfe2171b7970ca64113ca502683903d0a5f8f9367836d`.
- A fresh browser actually clicked the download link and saved matching bytes.
  An earlier recorded browser canceled the download; this was not reproduced
  in the independent unrecorded browser, and security headers were unchanged.
- Reloading the Console restored both turns and all six execution events.
- The native Sessions page independently displayed the saved Claude conversation,
  Bash command, read-back result, and answer from its JSONL history.

### Migration, continued work, and configuration changes

The account subsequently moved that Worker from E2B to Sprites through the hosted
Fleet UI, keeping the source for independent comparison. The move completed at
08:01:17 UTC. The stable Worker identity, output artifact, committed/staged/unstaged
Git state, untracked files, canonical memory, and original native session bytes
were independently compared. Dependency caches were intentionally excluded.
Deployment changed from `520a853` to `a1a976a` during migration startup; this was
not an immutable single-revision test. Full scope and hashes are recorded in the
[hosted migration audit](2026-09-09-hosted-migration-audit.md).

On Sprites, a new managed run correctly recalled the earlier conversation and
read the transferred output from the new home directory. The native terminal
also launched Claude successfully. This proves logical conversation continuity
and saved native history, not native `--resume` of the original session, nor
process or RAM migration.

On deployed `a1a976a`, selecting Opus 4.8 reconciled runtime configuration. A new
managed run independently reported `claude-opus-4-8` and returned the requested
`MODEL-SWITCH-VERIFIED` response. An already-open native CLI stayed on its earlier
model; the next candidate explicitly tells users to relaunch that CLI. Existing
interactive sessions are not silently interrupted.

A separate E2B Worker then verified deferred configuration while truly paused:

- Pause operation `ae31766d-a569-41dd-b37b-ae0c820f3019` reached provider state
  `paused`, with `onTimeout: pause` and `autoResume: false`.
- Model operation `3edbedf7-eae9-408a-883a-060229e2c552` changed the desired model
  to Opus 4.8 but left the provider paused and observed model at Sonnet 4.6.
  Passive machine reads did not wake it.
- Explicit wake `65593d0c-1870-4281-9c49-e0cd7ced9e01` resumed the same sandbox
  and applied Opus 4.8 to the runtime model file and observed machine record.
  The pre-pause fixture retained SHA-256
  `b5b2bfb792e5d72398ba8e9ed926bfd126399dce60c6bb4d7b686eeced840120`.

This test is distinct from the earlier Sprites pause defect: the deployed UI
offered manual Sleep, while its adapter performed a no-op and reported success.
The false sleeping intent was explicitly returned to running. The corrective
candidate derives manual-pause support from a real provider operation, rejects
unsupported requests before journaling or connecting, and withholds the button.
Sprites automatic idle suspension is not presented as a manual stop guarantee.

Public desktop and mobile checks passed on both domains: no failed images,
page errors, or horizontal overflow. Registry checks showed the exact target and
command before execution; clearing the target disabled execution. Usage with no
observations displayed unknown cost rather than zero.

### Earlier revision and the timeout defect

On the earlier deployed revision `a4c051d`, an isolated Clerk test account
provisioned a Claude Code Worker on E2B. A native terminal task and a managed
Console task each wrote a file; independent reads verified their bytes and
SHA-256 hashes. Reloading the Console retained its conversation and tool events,
and a follow-up used the earlier conversation correctly. Runtime inspection
reported the installed Claude version, selected model, skills, and sessions.

The two task-output hashes were:

- Native task: `d27f900e6a78dec33e3b0270f4e4d3a6c4704bdd1dc73758b2f97ce75f061e08`.
- Console task: `2f3f880d95e276034dcd3418cec548b6ab9d3a2f79c248c3d0b7237322fc5061`.

These are historical execution proofs, not proof that the files remain on the
provider. That disposable sandbox was subsequently no longer found after its
one-hour timeout window. The adapter omitted E2B's lifecycle setting, and a
second sandbox from the same path explicitly reported **kill**, not pause.
This exposes a real durability defect. The first sandbox's exact deletion event
was not independently available from an audit log; its lost disk cannot be
restored by waking it.

## Corrective work in the candidate

- E2B creation explicitly requests pause on timeout, without implicit auto-resume.
  A separate short-timeout Linux fixture auto-paused, resumed with the same ID,
  and retained exact workspace bytes and Worker JSON. Existing sandboxes are not
  retroactively upgraded. Their deadline and lifecycle are surfaced, and hosted
  migration rejects unsafe legacy lifetimes before provisioning a destination.
- Vercel creation never replaces a persistent sandbox with an empty one when its
  backing snapshot is missing. New persistent snapshots have no automatic
  expiration. Deletion explicitly warns that retained snapshots may continue
  incurring charges and links to provider cleanup; it does not silently prune
  recoverable history.
- Repair and knowledge reload no longer reset or replace the Worker's working
  repository. Knowledge uses a separate managed checkout. A content manifest
  updates unchanged bundled skills while preserving modified and custom files.
  Selected memory is seeded before defaults, and existing memory is retained.
- Migration includes both supported working directories, Git object/index
  state, untracked files, native histories, cron evidence, and knowledge ownership.
  It excludes dependency caches and known credential paths. Restored canonical
  memory is authoritative; runtime entrypoints are regenerated from those files,
  not stale templates. There is no process/RAM migration claim.
- Artifact links pin the viewed Worker. Upload/list/read/delete behavior uses
  validated metadata and bounded filesystem operations. Downloads are attachments
  with non-executable content handling. Managed runs capture bounded changed
  files and expose incomplete-capture warnings, without rerunning paid work.
- Native Sessions reads Claude/Codex/OpenClaw JSONL and supported Hermes SQLite
  history. Reads are descriptor-relative and bounded; Hermes DB/WAL snapshots
  preserve committed WAL messages without modifying the original database.
- Automatic and manually triggered cron execution have separate verified
  evidence in the cron audit. The candidate projects terminal run outcomes into
  history, rechecks schedule state, and respects execution deadlines.
- Usage distinguishes observations, allocation-based estimates, and unknown
  provider costs. Missing samples and unsupported billing models are not zero.
- First-use onboarding opens the managed Console. Starter tasks are portable;
  selected abilities are not presented as verified tools. Native runtimes do
  not show fictitious gateway requirements.
- Model selection uses the endpoint actually resolved from the tenant's keys.
  OpenAI-only accounts do not inherit the default Claude model. Known router
  model aliases are translated at their API boundary; opaque custom IDs remain
  intact across creation, edits, deployment, and runtime switches. The wizard
  and Worker library expose a model field for custom/Google connections.
- Console storage failures retry independently of runtime health, without
  overlapping slow requests or applying a previous machine's response.
- Registry saves and command execution are separate operations. Commands are
  visible before execution and target an explicitly chosen owned Worker. Saved
  entries can be retried; offline installs are not fictitiously queued. MCP
  server launch commands are not run as installers. Setup requirements remain
  visible instead of showing unverified success.
- Public manifest imports reject private addresses and unsafe redirects, pin
  validated DNS results, and bound time and response bytes. Cursor machine scan
  results are request-local, not shared in a process-global cache.
- Passive page reads do not wake compute or undo an explicit Pause. Missing
  sandboxes receive a terminal missing-state message instead of an endless
  “waking” state.
- The hosted SDK waits for asynchronous provision and bootstrap, resolves the
  final placement after failover, and waits for journaled run results. It uses
  bounded waits, respects local aborts, and does not replay mutations. A real
  new-Worker SDK test completed creation in about 60 seconds and its first task
  in about 13 seconds, issuing one provision POST and one run POST, with no
  redundant bootstrap. The initial failed client attempt still created its
  Worker remotely; that resource was identified and retained for the pause test,
  not lost or blindly retried. Local timeout is not remote cancellation.
- Native model pickers use their own authenticated catalogs, normalize duplicate
  aliases, and exclude incompatible or non-text APIs. Public fallback models are
  suggestions, not verified availability. Custom opaque text-model IDs remain
  intact, and stale requests cannot replace a different Worker's catalog.
- Fleet resources distinguish requested intent from observed provider allocation.
  E2B uses template-defined resources; ignored create-time sizing options were
  removed. Missing allocation observations display unknown rather than requested
  values as if they were provisioned.
- Credential-entry fields use password inputs and disable browser text correction;
  endpoint URLs and ordinary labels stay readable. Blank saved-key fields retain
  the existing secret, with regression coverage for isolated key replacement.
- Hermes readiness resolves the same executable paths as its managed launcher.
  A real runtime switch installed the current uv-based CLI successfully, but the
  deployed readiness check searched only an obsolete virtualenv location and
  blocked runs. The corrected probe accepts the installed executable, retains
  legacy layouts, and still rejects missing or non-executable installations.
  On deployed `ebc9459a`, a paid Hermes task subsequently completed, with the
  resulting file independently read back. OpenClaw reached a successful native
  Anthropic response but was killed by the E2B sandbox's observed 512 MiB memory
  limit before completing the task. This is a failed OpenClaw run, not a pass.
  The next candidate rejects that known insufficient allocation before paid work;
  unknown allocation remains a warning, not a memory guarantee. See the
  [runtime-switch audit](2026-09-09-hosted-runtime-switch-audit.md).
- Archived machines accept explicit deletion without enabling other lifecycle
  actions. Deletion validates the exact requested sandbox placement before
  changing intent. A retained source whose legacy ID now identifies a migrated
  Worker's destination fails closed instead of deleting that destination.
  This protects the destination; it does not implement automatic cleanup of
  that conflicting legacy source. Executable route/kernel/driver regressions
  cover both archived deletion and the retained-source hazard.

## Verification boundaries

Filesystem security fixtures for artifacts, capture, and knowledge have been
executed on an actual Linux E2B sandbox; macOS-only test runs explicitly skip
Linux descriptor requirements. Memory and Sessions tests execute their generated
programs against real files and SQLite/WAL fixtures. SDK migration tests execute
archive transfer and restore against real temporary workspaces.

At 07:20 UTC, the checked-in reload and capture suites ran unchanged under real
Vitest 3.2.7 on a separate E2B Linux fixture: **14 tests passed**, with only the
non-Linux fail-closed assertion skipped. This included a shallow Git checkout
refresh, preserved workspace/memory, the 5,001-entry enumeration bound, and all
eight adversarial capture fixture cases. The fixture was deleted and its absence
independently checked; no model call or existing Worker was involved.

At 07:25 UTC, the complete `pnpm check` gate passed: **802 SDK tests**, **1,245
web tests** (37 explicit platform-specific skips), both typechecks, the production
Next.js build, and isolated SDK import/require package verification. Linux-only
evidence is recorded separately above and in the focused reports.

At 07:56 UTC, the follow-up model/router reconciliation and onboarding-copy
changes passed `pnpm check`: **802 SDK tests**, **1,281 web tests** (37 explicit
platform-specific skips), typechecks, production build, and SDK package verification.
The model picker now waits for a journaled runtime update instead of only changing
the stored label; paused configuration changes are deferred until explicit wake.
Revision `a1a976a` subsequently became ready on the production aliases. Actual
switching and pause/wake evidence is recorded above; migration's deployment
transition is explicitly scoped. The additional SDK, catalog, allocation, and
manual-pause corrections, Hermes readiness, and archived-deletion protections
passed the final aggregate `pnpm check` at approximately 08:41 UTC: **845
SDK/source tests**, **1,393 web tests** (37 explicit platform-specific skips),
both typechecks, a 204-page production build, and isolated SDK package
verification. Revision `ebc9459a` became ready at approximately 08:43 UTC.
Post-deployment checks confirmed that Sprites has no manual Sleep action and
rejects both unsupported sleep routes without mutating Worker intent; E2B still
supports explicit pause. The real allocation remained 2 vCPU / 512 MiB rather
than the requested 1 vCPU / 2 GiB. The native Anthropic model catalog returned
11 unique Claude IDs. Credential fields were masked, with no saved secret shown.
Explicit deletion of the archived, retained E2B QA source was independently
confirmed absent, while the migrated Sprites destination and Worker survived.

At approximately 09:30 UTC, the Daytona candidate passed the complete
`pnpm check` gate: **847 SDK/source tests**, **1,469 web tests** (37 explicit
platform-specific skips), both typechecks, production build, and isolated SDK
package verification. After partial-creation recovery and crawler-copy corrections,
the final aggregate gate passed again at approximately 09:39 UTC: **854 SDK/source
tests**, **1,473 web tests** (37 platform-specific skips), both typechecks,
production build, and isolated package verification. These counts establish the
candidate gate, not a hosted Daytona success claim.

## Daytona replacement

The active provider set is Daytona, E2B, Sprites, and Vercel Sandbox. New Dedalus
creation and credential submission are rejected; its adapter is a retired,
no-network compatibility shim. Existing persisted Dedalus placements and
historical costs retain their original discriminator and IDs. They are not
silently relabeled as Daytona or hidden from the owner.

Daytona uses its official SDK and brand SVG. Local live checks verified private
creation, actual allocation, filesystem preservation across stop/start, no wake
on passive inspection, streaming command output and exit status, bounded timeout
and cancellation, native PTY reconnect, and expiring private previews. Requested
resources are verified against the provider's observed allocation. Daytona
pricing and benchmark figures remain unknown until measured; historical Dedalus
figures are not reused. Full evidence and scope are in the
[Daytona adapter audit](2026-09-09-daytona-adapter-audit.md).

Both disposable local Daytona fixtures were stopped after their checks; runtime
QA stopped the 2 GiB fixture at 09:24:25 UTC. Stopped disk may still incur storage
charges. Production Daytona credentials were saved server-side in the scoped
Vercel project; hosted provisioning and real model execution on the new provider
remain pending deployment. No secret is included in the repository or this report.

## Production authentication remains a separate check

The owner reports an existing production Clerk instance. At 06:59 UTC on
September 9, the public `.com` sign-in page still loaded
`loving-seasnail-3.clerk.accounts.dev`. Existing production instance availability
does not establish that this Vercel Production deployment uses its keys.
At 07:24 UTC, a fresh read of this Vercel project's Production environment still
classified both Clerk keys as development keys (values withheld).
An independent environment refresh at 08:27 UTC found the same classification.
No Clerk instance or user identity was silently switched. Production key
connection and a fresh-account test on that deployment remain outstanding.

The remaining configuration handoff is to set the existing production instance's
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in this Vercel project's
Production environment, then deploy again. Secrets must not be pasted into
reports or chat. Account configuration and machine ownership are keyed by Clerk
user ID; switching instances must not assume that development users, saved keys,
or Worker ownership automatically transfer. Confirm the intended production
owner identity before updating any owner/API-user environment mapping, and test
a new production account separately.

No API keys, passwords, browser sessions, or cookies belong in this report.
