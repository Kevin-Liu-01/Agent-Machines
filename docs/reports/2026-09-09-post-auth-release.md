# Post-authentication release checks — September 9, 2026

## Deployment checkpoint

Commit `e38fe69cca0bcfe0170c175a74599167dff14f88` was pushed to `origin/main`.
Vercel deployment `dpl_73cgANhLTpuuAhZLFf712RXLKdY5`
(`agent-machines-8wrssto4j-kl01s-projects.vercel.app`) became Production/Ready
and was independently resolved through the canonical production alias.
Health and the apex Clerk proxy returned 200, unsigned machine access returned
401, the wrong-origin proxy returned 404, and the `.com`/apex redirects retained
the expected target and query. The restored owner's dashboard displayed
**Not measured** for empty latency history. Local health and the real local
dashboard also passed after the release build.

The subsequent explicit startup-reload and two-Worker terminal pass is tracked
in the [terminal isolation report](2026-09-09-terminal-isolation.md), including
a reproduced one-shot history bug and its deployed correction. Final source
`e4627ce1b4534d7d2784c1e6e69a1671629b80f6` passed the full gate and its real
production startup-diagnostic retest on the independently verified Ready
deployment `dpl_BLRgrQviNshVj9pZaAfCK7X9hbkk`. The corrected startup command
returned the actual Worker home and filenames with exit 0 in 554 ms. This is
one observed command duration, not a terminal latency guarantee.

## Local candidate changes and gate

Three reproduced or directly inspected issues were addressed:

- Chat saves validate malformed bodies and messages before accessing storage;
  valid runtime evidence remains intact. This is separate from the earlier,
  self-recovered chats GET 502, whose root cause is still unknown.
- Metrics pin both reads and their history to the selected machine, discard
  stale completions, and keep log polling independent of an unavailable native
  runtime gateway. Missing latency says **Not measured**, not zero. Unrecognized
  log sources are **Other**, not invented Hermes activity.
- The managed-runtime smoke command requires an exact origin, ready machine,
  runtime, and paid-run opt-in. It submits one task, validates its response,
  and never selects, creates, wakes, repairs, or deletes a machine. The obsolete
  automatic matrix entry point now exits with deprecation guidance. See
  [SMOKE.md](../SMOKE.md); no paid smoke invocation was made for this change.

`pnpm check` completed with exit 0: 863 SDK/source tests, 1,770 web tests across
166 files, 37 explicit skips, both TypeScript checks, a Next.js production build,
and isolated SDK package verification. Independent diff review found no
release-blocking targeting, authorization, retry, or false-success defect.
The smoke command may safely reject opaque custom-endpoint model names; this is
a coverage limitation, not proof that every dashboard-valid model is supported.

## Live ordinary-account isolation on `32a8648`

The owner completed Princeton's interactive sign-in for a second ordinary
account. Its Fleet contained zero machines. Hydrated Settings showed no SDK
key and no saved provider/model credentials. Known-owner Worker, Artifacts,
Logs, and Console page URLs all rendered the application's 404 page.

The owner then separately approved creating a temporary SDK key for read-only
checks and revoking it immediately afterward. The one-time key was held in
memory, supplied privately to the API client, and not written into this report
or repository. No Worker or provider/model credential was added.

The target machine was `b99cf49a-f0dd-4f13-9785-58bec785b3ce`. The owner's normal
UI independently showed its existing recipe
`923376da-402b-4eec-aceb-6496f9653158`, the link to that machine, and a succeeded
run with prefix `97bdc0b1`, matching the full operation ID recorded by the
[original completed task](2026-09-09-production-auth-readiness.md).

| Read made with the second account's SDK key | Observed result |
| --- | --- |
| Own machine list | 200, zero machines |
| Known owner machine | 404, `not_found` |
| Known owner machine's artifacts | 200, `ok: false`, `no_active_machine`, empty artifacts |
| Known owner machine's chats | 200, `ok: false`, `no_active_machine`, empty chats |
| Known owner machine's logs | 200, `ok: false`, `machine_offline`, no data |
| Known owner machine's sessions | 404, machine not found in this account |
| Own Settings configuration | 200, provider/model credentials unconfigured; no owner machine |
| Known owner Worker recipe | 404, `not_found` |
| Existing operation `97bdc0b1-2d17-40f6-a981-109e6424a07b` | 404, `not_found` |

The HTTP 200 empty envelopes above are not successful data reads. An exploratory
GET of the runs submission route returned 405 and is **not** isolation evidence.
No mutation/retry/run request was used for the cross-account probes.

The exact Princeton account was reconfirmed before clicking Revoke. Settings
then showed **API key revoked** and **No key yet**. An independent machine-list
request with the old bearer returned **401 unauthorized**, after which the
in-memory secret was cleared. These bounded live checks passed; they are not
an exhaustive authorization audit or evidence of provider-absence cleanup.

## Retention and remaining boundaries

The owner's Daytona proof machine was deliberately woken for the final
two-Worker checks, then stopped through its normal UI. Final non-waking reads
at 23:36:44 UTC confirmed it stopped, the disposable startup/terminal fixture
absent (404), and the old E2B QA resource paused. The original 428-byte artifact
was independently verified intact before the final stop; its checksum and
exact machine IDs are recorded in the terminal report. Retained original and
old-QA disks may incur storage charges.

After the release build, the existing local dev compiler returned 500 with
unresolved SDK exports that already existed on disk. Stale resolution across
the SDK's remove/rebuild window was the leading diagnosis, not a proven
upstream cause. Restarting only the task-owned dev process restored health
and dashboard HTTP 200 and a real browser-rendered dashboard. No cache or user
files were deleted, no SDK rebuild was repeated, and the existing local-only
development-auth configuration was preserved. The server remains available at
`http://127.0.0.1:3210/dashboard`. Completed gate/dead-process ledger entries
were pruned; the replacement development server is registered and retained.
Unrelated concurrent `media/` files were left untouched and excluded from this
release's commits.

The approved six-field QA credential-copy cleanup and annual schedule disable
are documented [separately](2026-09-09-qa-cleanup.md). They do not establish a
live test of the Settings provider-credential removal button. Earlier lifecycle,
migration, runtime, and cron receipts retain their original verification scope;
these checks do not imply that every item in [LAUNCH.md](../LAUNCH.md) was rerun.
The requested 7 a.m. Pacific deadline was not met.
