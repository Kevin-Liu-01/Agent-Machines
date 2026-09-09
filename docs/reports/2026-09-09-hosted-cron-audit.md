# Hosted cron launch audit — September 9, 2026

## Scope and isolation

The audit used the authenticated hosted application and a dedicated disposable E2B Worker. No commands, lifecycle changes, or scheduled tasks were run on the main launch QA machine.

- Worker: `ed074605-68c0-422b-ba2e-b97af47812c9`
- Machine: `inhhzbntovc0yik89pe4f`
- Runtime: Claude Code, native Anthropic model `claude-sonnet-4-6`
- Resources requested: 1 vCPU, 1 GiB RAM; barebones loadout
- Cron: `1125a99f-fdb8-42dc-8145-90fa097f1ba7`

## Live evidence

1. Created the Worker through `POST /api/dashboard/control-plane/workers`; its lifecycle operation reached `succeeded` and the Worker reached `running`.
2. Created the cron through `POST /api/dashboard/crons`, initially pinned to January 1 so the normal scheduler could not duplicate the manual proof.
3. Invoked `POST /api/dashboard/crons/<id>/run` once. The native runtime completed with exit code 0 in approximately 11 seconds of runtime execution.
4. Independently read `/home/user/.agent-machines/artifacts/cron-launch-proof.txt` through the machine-scoped exec API. Its exact contents were `AGENT-MACHINES-CRON-PROOF-20260909` followed by a newline.
5. Independently read the on-box `~/.agent-machines/cron/runs.jsonl`. It recorded the cron ID, native Claude runtime, E2B substrate, model, start/end timestamps, and exit code 0.
6. Calendar-pinned the same cron to `2026-09-09T06:20:00Z` with a different output file, then observed the normal production scheduler without invoking the global internal tick endpoint. The native runtime started at `06:20:30.698Z` and finished at `06:20:46.565Z` with exit code 0. Independent exec readback at `06:29:19Z` confirmed `/home/user/.agent-machines/artifacts/cron-scheduled-proof.txt` contains exactly `AGENT-MACHINES-SCHEDULED-PROOF-20260909` followed by a newline, and the second on-box run record matches those timestamps.
7. The existing deployment still returned `lastStatus: running` and `lastSummary: dispatched` after that successful automatic completion. This directly reproduced the status-projection defect fixed below; the new deployment was verified as described below.

## Reproduced defects and fixes

- Invalid schedules such as `61 * * * *`, malformed numbers, and silently clamped shorthand intervals were accepted. Parsing now rejects them instead of creating schedules that never run or run at a different cadence.
- Overlapping ticks used their wall-clock milliseconds as occurrence IDs. Dispatch now uses the actual scheduled UTC minute, preserving idempotency for duplicate ticks.
- The cron list displayed dispatch-time `running` indefinitely. List/detail APIs now derive status and inspectable run history from the tenant's durable operation journal.
- Queued schedules could run after removal, pause, or reassignment. The control-plane kernel checks current schedule intent, and the hosted driver independently re-reads the tenant cron registry immediately before paid execution.
- A long dispatch/run could overwrite newer cron edits or resurrect a deleted schedule. Status updates now merge into freshly read configuration rather than replacing it with the pre-run snapshot.
- Scheduled executions used provider waits longer than the route lifetime. Run-now and scheduler recovery now use bounded execution deadlines and the existing guest-side process timeout.
- UI mutation failures could close the editor without explaining the failure. The cron manager now checks mutation responses and retains the error.
- Scheduler user enumeration stopped after the first 500 users. It now follows pagination.

## Verification

- 50 focused web tests passed across cron parsing, authentication, cadence, route behavior, tick dispatch, and the hosted execution guard, including expired log-append budgets and failure evidence.
- 14 control-plane tests passed, including the new queued-schedule revocation regression.
- Root TypeScript check and whitespace/diff validation passed. Concurrent unrelated web type changes were still in progress at the last web-wide check.

Run history is bounded to the most recent 100 returned scheduled operations. Disabling or deleting a schedule prevents future or queued execution; it is not a claim to cancel a task that has already begun executing. Existing completed journal evidence is retained when a schedule is deleted.

## Cleanup status

The disposable Worker and test cron were initially retained after post-deployment verification. Permanent cleanup was subsequently authorized for only cron `1125a99f-fdb8-42dc-8145-90fa097f1ba7`, Worker `ed074605-68c0-422b-ba2e-b97af47812c9`, and machine `inhhzbntovc0yik89pe4f` under the old QA account `user_3J4rO7BDLBYI7e2QrMDljAQsiVD`.

The cleanup attempt on September 9 stopped before any mutation because that account's identity could not be verified. The old `launch-cron` and `launch-signup` browser sessions were absent. An explicitly authorized saved-state fallback, opened in a fresh isolated cleanup browser, also exposed no signed-in Clerk identity after page load. No cron deletion, Worker deletion, provider destruction, model call, or account change was performed. The existing newer QA browser sessions were not touched.

An independent, non-waking E2B `getInfo` at `2026-09-09T08:46:36.678Z` confirmed the exact machine still exists and is `paused`, with legacy `onTimeout: kill` and `autoResume: false`. There is no deletion operation or provider-absence proof to report.

At `2026-09-09T09:38:32Z`, a read-only Clerk Backend API lookup verified the exact old QA user and test email. Its private cron registry still contains this one schedule, enabled with expression `20 6 9 9 *` and last run at `2026-09-09T06:20:28.435Z`. That five-field expression is annual, not a year-specific one-shot; its next matching date is September 9, 2027. No metadata or provider mutation was performed. Explicit Clerk write scopes are not configured, so the backend checklist requires administrator confirmation before disabling it. That narrow confirmation has been requested; cleanup is not represented as complete.

## Post-deployment verification

Verified release `520a853199560a6a18d696624a6c7322814392da`, deployment `dpl_FgKKEp6rmqiP7hfzXhUHYxeBVxjE`, on the authenticated `www.agent-machines.com` dashboard at approximately `07:28–07:33Z`.

1. Before any Wake, E2B's non-waking status API confirmed the machine paused. Visiting its artifact page displayed **Machine paused**, the explicit **Wake machine** button, and the legacy timeout warning. Three pairs of actual chat/artifact GETs returned `machine_asleep` for the correct machine. Provider state remained paused at `07:29:22Z`.
2. `/api/dashboard/crons` returned `lastStatus: success`, `lastSummary: Completed successfully`, and both actual completed runs. The Cron page displayed the same status, both expandable history entries, their output, exact operation IDs, and exit code 0. It did not require waking compute to read the journal.
3. The manual operation `168a68f4-2439-4708-9a19-e9b64e2f8d28` and scheduled operation `044b5d60-f315-4595-8adf-f77d820be80f` each independently appeared as `succeeded`, exit code 0, with finished timestamps in the Worker's control-plane operation endpoint. History matched those records, rather than only stale cron metadata.
4. Clicking **Wake machine** explicitly submitted operation `5e74c29c-6a3b-4969-8dd0-72928a72758a`, which succeeded at `07:30:10.851Z`. The same machine resumed; no new Worker was provisioned.
5. The artifact page discovered both original shell-created proof files without adding an upload index or metadata. Both previews showed the expected contents. Authenticated, explicitly machine-scoped downloads returned HTTP 200 with the original exact bytes and no inventory warnings:

   | File | Bytes | SHA-256 |
   | --- | ---: | --- |
   | cron-launch-proof.txt | 35 | 1a8e9ddfe5304178426d050fa9f7755adcd7b8f7125935bfa5a4f7beed9c85c5 |
   | cron-scheduled-proof.txt | 40 | 392ebdf72bcd969ff18660d9286b01e9c2685b31ed50884a0dc6afa6cd2257cf |

6. Explicit hosted Sleep operation `0e3fc7b7-2681-4130-acfb-8a9223e5c24f` succeeded at `07:31:42.778Z`. Worker desired/observed state both became sleeping; independent E2B reads at `07:31:55Z` and `07:32:36Z` confirmed paused. Reopening the artifact page and reading artifacts again did not wake it. The browser was then returned to `about:blank`.
7. The journal still contained exactly the original two paid runs. No cron rerun or additional model call was needed for these checks.

Screenshots are retained in `/tmp/agent-machines-launch-20260909/`: `release-paused-artifacts.png`, `release-cron-artifacts.png`, `release-cron-expanded-history.png`, and `release-repaused-artifacts.png`. They contain only the dedicated QA account and synthetic evidence.

The browser reported no application page errors during this flow. Its console did warn that Clerk development keys are deployed on the live site, plus warnings about Clerk structural CSS and a deprecated Three.js clock. Those warnings are reported separately rather than misrepresented as production authentication readiness. Two screenshot-automation expressions initially failed due to command quoting; the corrected expression expanded the actual history controls successfully and made no server-side mutation.
