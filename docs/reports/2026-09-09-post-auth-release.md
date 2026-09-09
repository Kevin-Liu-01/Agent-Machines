# Post-authentication release checks — September 9, 2026

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

Fresh non-waking reads at 22:53:28 UTC confirmed the owner's Daytona proof
machine stopped and the old E2B QA resource paused. Their disks remain retained
and may incur storage charges. The local server at `http://127.0.0.1:3210`
remains available. No unexpected task-owned long-running process was found.

The approved six-field QA credential-copy cleanup and annual schedule disable
are documented [separately](2026-09-09-qa-cleanup.md). They do not establish a
live test of the Settings provider-credential removal button. Earlier lifecycle,
migration, runtime, and cron receipts retain their original verification scope;
these checks do not imply that every item in [LAUNCH.md](../LAUNCH.md) was rerun.
The requested 7 a.m. Pacific deadline was not met.
