# Launch-readiness audit — September 9, 2026

Status: release-candidate preparation. This report distinguishes checked-in
fixes from deployed evidence; it is not a blanket production-readiness claim.

## Observed end-to-end behavior

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

Post-deployment signup, output retrieval, pause/resume, and cross-provider
migration must still be recorded against the release's exact revision before
this report can be treated as a launch sign-off.

## Production authentication remains a separate check

The owner reports an existing production Clerk instance. At 06:59 UTC on
September 9, the public `.com` sign-in page still loaded
`loving-seasnail-3.clerk.accounts.dev`. Existing production instance availability
does not establish that this Vercel Production deployment uses its keys.
At 07:24 UTC, a fresh read of this Vercel project's Production environment still
classified both Clerk keys as development keys (values withheld).
No Clerk instance or user identity was silently switched. Production key
connection and a fresh-account test on that deployment remain outstanding.

No API keys, passwords, browser sessions, or cookies belong in this report.
