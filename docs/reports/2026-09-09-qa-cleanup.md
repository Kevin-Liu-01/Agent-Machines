# Disposable launch QA cleanup — September 9, 2026

These deletions apply only to resources created for the explicitly authorized
launch checks. The owner's real fleet and retired-provider records were not
deleted, migrated, or relabeled. Deletion removes disposable provider disks;
checked-in evidence and private verification screenshots remain, not recoverable
copies of every sandbox filesystem.

## Approved administrator cleanup — completed at 22:37 UTC

The owner explicitly approved removing the two development QA accounts' saved
credential copies and disabling their annual test schedule. Immediately before
each write, fresh Clerk reads matched the exact QA identity and metadata
fingerprint. One `PATCH /v1/users/{id}/metadata` was issued per account; neither
write was replayed. Independent GETs verified the complete expected metadata.

| QA user | Removed server-only secret fields |
| --- | --- |
| `user_3J583f03iTTmxiyOeSVDHQHe48i` | Daytona, E2B, and Sprites `apiKey`; Anthropic model key |
| `user_3J4rO7BDLBYI7e2QrMDljAQsiVD` | E2B `apiKey`; Anthropic model key |

Schedule `1125a99f-fdb8-42dc-8145-90fa097f1ba7` on the second account now has
`enabled: false`. Its expression, target, history, and every other field were
preserved. Public and unsafe metadata, non-secret provider settings, and all
unrelated private metadata were independently confirmed unchanged.

These six field removals do not revoke the original keys at their providers,
delete users or disks, or change the production owner's configuration. The old
E2B resource remains retained; its latest non-waking observation was `paused`.
The production proof Worker `b99cf49a-f0dd-4f13-9785-58bec785b3ce` remains stopped
with its artifact retained. No already-running task was canceled by this cleanup.

## Hosted cleanup on `d1eb6d9`

The isolated QA account was pinned to `user_3J583f03iTTmxiyOeSVDHQHe48i`. Before
any deletion, each exact machine ID, name, provider, and Worker placement was
checked. No selected Worker had an enabled schedule or a queued/running operation.
Each deletion used the normal hosted journal, a stable idempotency key, and an
independent provider absence check after the operation completed. Its hosted
machine read then returned HTTP 404. No mutation was blindly replayed.

| Disposable resource | Provider | Delete operation | Independently absent, UTC |
| --- | --- | --- | --- |
| `im6lw0tt18o61tbql1df9` | E2B, retained migration source | `3c1928e8-95f1-4d65-9ed7-4c16bbb041a5` | 10:45:35 |
| `e83e6f53-f98d-45af-acd4-7ce04498fa55` | Daytona, verified migration target | `534a8be1-f99c-41c0-9ec3-b590e7065906` | 10:45:43 |
| `i8o0b5gs0tdsbpr8gqfxm` | E2B, runtime-switch fixture | `f35b71a5-d6cc-45ab-b243-9cca2169ec26` | 10:45:51 |
| `am-mux-coding-agent-d11810-mttt57h941` | Sprites, earlier migration target | `b046c426-a46e-4c55-aad9-2987205907e4` | 10:45:56 |

After deleting the retained E2B source, its stable Worker's Daytona placement
was independently checked unchanged and running. Only then was that destination
explicitly deleted as a separate cleanup action. The migration's `source: keep`
promise was honored during verification; this later deletion was not part of
the migration transaction.

The earlier local Daytona fixture `c5b11be3-342d-45c0-8f01-61c10a13f381` was
independently matched by ID, QA name, and stopped state, then deleted at
10:31:29 UTC. Its provider description returned `destroyed`. The sized local
fixture `24b471d1-4025-4f0f-808c-e22099d6f38a` was independently matched to
`am-daytona-sized-qa-20260909` and stopped state, then deleted once. A fresh
provider GET confirmed HTTP 404 at 10:48:02 UTC. Both local adapter fixtures are
now removed; their verification evidence remains.

## Retained at the earlier checkpoint — historical

- The old, separate Clerk QA account's schedule `1125a99f-fdb8-42dc-8145-90fa097f1ba7`
  remains enabled; its next matching date is September 9, 2027. Its E2B placement
  `inhhzbntovc0yik89pe4f` was last independently confirmed paused. Disabling the
  schedule through Clerk administrator metadata requires the pending explicit
  approval because backend write scopes are absent. Neither the account nor its
  schedule was silently changed. See the [cron audit](2026-09-09-hosted-cron-audit.md).

Stopped retained disks may continue incurring storage charges. No credential
values are included here.

## Final hosted Daytona fixture

After deployment `48408dc`, the original hosted Daytona Worker's native Sessions
API and actual browser page were checked without another model call. They showed
one OpenClaw conversation, the earlier Claude conversation, no false warning or
duplicate trajectory, and the untruncated real file-read tool result. Screenshots
were saved before cleanup.

Worker `7c595405-e315-4260-8d81-5fa9d766569c` and exact Daytona placement
`e4f3dde3-c174-407b-9a55-5901eecb0e34` were rechecked with the original QA name,
no enabled schedules, and no active operations. Normal hosted deletion
`99dcaf77-df63-4d50-b5e3-ee7348998927` succeeded; a fresh provider description
returned `destroyed` and the hosted machine API returned HTTP 404 at 10:59:33 UTC.
This removes the last current-account hosted test fixture, including its disk.
The old, separately permission-gated QA account above remains distinct.

## Current QA SDK credential

At 11:00:34 UTC, the browser's Clerk identity was checked against the exact
current QA account. The Settings API's key metadata matched the privately stored
QA key, and a cookie-free bearer request returned HTTP 200. The actual Settings
page's **Revoke** action then removed that account's SDK key; it did not rotate
the key or modify another account. At 11:01:35 UTC, the signed-in metadata read
reported `configured: false`, and the old bearer alone returned HTTP 401.
This revokes the disposable Agent Machines SDK credential, not the owner-supplied
Daytona or model-provider credentials used by the deployment.

At this earlier checkpoint, saved vendor/model credential copies in the two
disposable Clerk QA accounts were a separate cleanup item, not covered by SDK-key
revocation. The administrator cleanup above subsequently removed those copies
and disabled the old QA-only schedule after explicit approval. The exact QA IDs are
`user_3J583f03iTTmxiyOeSVDHQHe48i` and `user_3J4rO7BDLBYI7e2QrMDljAQsiVD`.
The owner's actual account and Vercel Production environment are excluded.
