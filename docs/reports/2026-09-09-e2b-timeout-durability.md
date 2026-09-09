# E2B timeout durability defect and verification — September 9, 2026

## Cause and impact

The hosted E2B binding requests a one-hour sandbox lifetime. The shared E2B adapter previously omitted the lifecycle setting when creating the sandbox. E2B's default timeout action is `kill`, not `pause`; expiry can therefore permanently remove the sandbox filesystem even though the Worker record still exists. This contradicted the SDK's own timeout contract, which describes parking the sandbox.

Read-only provider evidence showed:

- Earlier launch QA machine `irp4tieosalpj2p3tdpp3` was no longer found. Wake does not recover its deleted disk. No provider deletion audit log was available from that status response, so the precise deletion event is not independently asserted here.
- Dedicated cron QA machine `inhhzbntovc0yik89pe4f` reported `startedAt: 2026-09-09T06:03:46.106Z`, `endAt: 2026-09-09T07:03:46.106Z`, and `lifecycle: { onTimeout: "kill", autoResume: false }`.
- An explicit `setTimeout(3_600_000)` succeeded but did not change that provider-reported deadline. It was not treated as proof of an extended lease. The SDK implements this as a timeout API request; provider maximum-lifetime constraints can still apply.
- After all isolated filesystem checks finished, the cron QA machine was explicitly paused at `06:46:16Z`, before its destructive deadline. Its identity and evidence remain available for post-deployment checks; it was not deleted.

## Fix

All new sandboxes created through the shared Agent Machines E2B adapter explicitly request `lifecycle: { onTimeout: "pause", autoResume: false }`. An expired compute lease therefore requests a durable pause. Reads remain non-waking; an explicit `connect()` or `wake()` resumes the sandbox. Explicit destruction remains a separate operation.

No lifecycle mutation API was available in the inspected SDK for changing already-created sandboxes. Existing Workers are not falsely labeled repaired. Their provider-reported `endAt` and `lifecycle` now pass through the no-wake description to the hosted summary. The UI can distinguish safe pause-on-timeout Workers from legacy kill-on-timeout Workers.

Hosted migration rejects a deleted E2B source and checks legacy timeout safety before creating a paid target. Unknown policies, unknown deadlines, paused legacy sources, or running legacy sources with less than 15 minutes remaining are refused with an explicit preservation instruction. A legacy source with a verified longer initial lease may migrate, but its report records that the source policy was not changed or extended. This is a preflight risk guard, not a guarantee against an arbitrarily long migration or an external deletion. New E2B destinations receive the corrected pause policy.

## Actual timeout → pause → wake proof

A tiny disposable sandbox was created through the updated adapter, with no model call:

- ID: `i32204s2yvc1eazfnti46`
- Initial test creation observed: `2026-09-09T06:47:24.354Z`
- Wrote exact workspace evidence plus a durable Worker JSON record.
- Reduced the actual timeout to one second, then polled only the non-waking status API.
- Observed automatic `paused` state at `06:47:25.886Z`, with the new pause policy.
- Explicitly woke the same ID and verified both files byte-for-byte at `06:47:26.919Z`.
- Evidence SHA-256: `e4aa63e0ec157b70ad04a677c46fbdfd8af27637fd18a8aa91e03a10b7eaf134`.
- The resumed sandbox still reported `onTimeout: pause`.
- Deleted only that tiny test sandbox and verified it was destroyed. The paused cron QA sandbox was left intact.

Two creation-policy regressions were observed failing before the fix and passing afterward. No-wake tests cover the new lifecycle fields without calling connect. Hosted binding and migration tests cover field propagation and refusal before target provisioning.

The lifecycle contract was checked against the installed SDK types/implementation and the [E2B SDK source](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/sandboxApi.ts), which documents the default kill policy and explicit pause option. This proof establishes file and Worker-state survival across one real timeout/wake cycle; it does not establish an uptime SLA or universal process migration.

## Passive dashboard reads must preserve Pause

The deployed dashboard could undo an explicit pause: the shared storage helper woke a sleeping machine during chat/artifact reads, and the machine-control hook and dashboard layout also issued automatic Wake requests. Real-handler regressions reproduced three passive polls causing three Wake calls before the fix. The storage helper now returns an explicit `machine_asleep` result without waking or executing anything; destroyed machines return `machine_missing`, not a perpetual starting state. The hook and layout no longer wake automatically. Chat and artifact views present a real paused state and an explicit Wake action. The polling hook also rejects stale responses after switching Workers and clears pending actions when a machine reaches a terminal state.

Eighteen focused storage, UI-polling, and hook tests passed, including actual GET handlers, repeated sleeping reads, explicit user-triggered Wake, destroyed machines, and stale cross-Worker responses. Web type checking and whitespace checks passed. This removes the identified automatic Wake paths; it does not claim to make a provider status check and subsequent execution atomic against a simultaneous pause from another client.

During verification against the still-old deployed dashboard, the paused cron QA sandbox was later found running, with a new `startedAt` of `07:00:27.457Z` and a five-minute kill-policy deadline. Neither QA agent had requested a Wake. The status API does not identify the caller, so the exact triggering request is not independently asserted. The machine was explicitly paused again at `07:03:41.641Z` and confirmed still paused at `07:04:29.840Z`. Both QA browser sessions were moved off the dashboard. Through the hosted API, only the dedicated QA account's active selection was moved back to its already-destroyed original QA machine; the cron QA machine remained sleeping. No real user's selection or data was changed. The cron evidence remains retained for post-deployment verification.
