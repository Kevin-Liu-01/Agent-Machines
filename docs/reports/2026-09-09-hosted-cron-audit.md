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
7. The existing deployment still returned `lastStatus: running` and `lastSummary: dispatched` after that successful automatic completion. This directly reproduces the status-projection defect fixed below; verification of the new deployment's run-history display is pending.

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

The disposable Worker and test cron remain temporarily available for verifying the next deployed dashboard/history changes. Cleanup is pending and must target only the IDs listed above.
