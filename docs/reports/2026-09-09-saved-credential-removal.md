# Saved credential removal — September 9, 2026

## Current cleanup follow-up — completed at 22:37 UTC

After explicit owner approval, administrator access removed the six saved secret
fields from the two old development QA accounts and disabled their exact annual
test schedule. One metadata PATCH per account was followed by fresh reads proving
the selected removals, disabled schedule, and unchanged unrelated metadata.
The [cleanup report](2026-09-09-qa-cleanup.md) records exact users, fields, and
retained-resource boundaries; the private receipt is
`/tmp/agent-machines-launch-20260909/qa-admin-cleanup-receipt.json`.

This closes the separately approved administrator-cleanup item. It does not
revoke original vendor keys, change production owner credentials, delete disks,
or prove the Settings button's real-browser removal flow: cleanup used Clerk
administrator metadata PATCH, not the user-facing DELETE route described below.
The original implementation and deterministic test evidence remain distinct.

## Original product gap

The final QA cleanup found a product gap: blank Settings inputs intentionally
preserved existing provider/model credentials, but there was no explicit removal
control. The privacy page nevertheless directed users to remove keys from setup.
Clearing a local merged object would not prove deletion from storage: Clerk's
metadata update deep-merges objects and requires explicit null values for removed
fields. [Clerk metadata update documentation](https://clerk.com/docs/reference/backend/user/update-user-metadata)

## Bounded correction

Settings now provides a configured-credential selector and a separate, explicitly
confirmed removal action. Blank input preservation and ordinary key rotation stay
unchanged. The privacy instruction points to Settings and explains the limits.

The new `DELETE /api/dashboard/admin/settings` accepts only an allowlisted array
of credential selectors. It requires a real Clerk session, derives the user from
that session, and accepts no caller-provided user ID or administrative fallback.
The selectable slots are saved sandbox credentials, model credentials, and the
Cursor key. Retired Dedalus credentials can be removed, never newly configured.

The server writes only the selected private-metadata fields as null tombstones,
without spreading stale metadata or running the full configuration writer. It
then rereads the actual user metadata and verifies absence before returning
success. Public/unsafe metadata, unrelated credentials, schedules, Worker state,
and the user's Agent Machines SDK key are not changed. Errors return no private
metadata or provider keys, and an unverified write is not reported as success.

The response distinguishes removed account copies from access still supplied by
owner-only deployment defaults. This does not change Vercel environment variables,
revoke a key at its vendor, terminate compute, or erase credentials already copied
into Workers, gateway profiles, or environment profiles. Existing in-flight work
and short-lived configuration caches are not a global revocation boundary.

## Verification and live-write boundary

Focused executable route tests model Clerk's documented deep-merge semantics,
including exact null removal, authenticated ownership, invalid input, unrelated
field preservation, failed or unverified persistence, and deployment-default
distinctions. All 33 route cases passed. The 22 UI cases execute the actual
Settings handlers and hook state with external visual components and network
responses replaced by deterministic fixtures; they cover selection, confirmation,
cancellation, pending inputs, and overlapping writes. They are not browser or live
Clerk mutation evidence. An independent security review found no concrete blocker.
At approximately 11:16 UTC, the full gate passed with 863 SDK/source tests, 1,585
web tests (37 explicit platform-specific skips), both typechecks, production build,
and isolated SDK package verification. The [launch audit](2026-09-09-launch-readiness.md)
keeps these checks separate from earlier real Worker execution.

At the implementation checkpoint, no administrator cleanup request or live
credential-removal call was made while implementing this correction. The separately requested permission to clear the
two disposable QA accounts and disable the older QA-only schedule was still
outstanding. The approved 22:37 UTC follow-up above supersedes that status;
this feature was not used to bypass approval. Existing QA SDK
key revocation and provider-resource cleanup are recorded separately in the
[cleanup audit](2026-09-09-qa-cleanup.md).
