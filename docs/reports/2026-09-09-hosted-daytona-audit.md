# Hosted Daytona rollout — September 9, 2026

This is an evidence log, not a blanket runtime/provider-matrix claim. It uses an
isolated QA account and explicitly authorized disposable provider resources.
The owner's real fleet was not migrated or deleted.

## Deployment and credentials

- Commit `556efba73e8ccdbc6a1f1e8cc297b705c0187eaa` was pushed to `origin/main`.
- Vercel deployment `dpl_7dc8jVwFwtR2hBQru4TMiDY8jxFQ` became ready at approximately
  09:41 UTC; the `.com` and `.dev` production aliases were independently checked.
- Daytona credentials were saved server-side in the scoped Vercel Production
  project and in ignored, permission-restricted local environment files. The
  repository and checked-in examples contain no credential values.
- The QA account saved its own Daytona credentials through the hosted Settings
  API. HTTP 200 returned configured state without returning the supplied secret.
  This did not grant other tenants access to deployment-owner credentials.
- The unused `DEDALUS_API_KEY` was removed from the exact Vercel Production
  project's environment at approximately 09:46 UTC. This changes subsequent
  deployments; it does not rewrite environment snapshots of old deployments or
  claim to revoke the credential at the retired provider.
- Production requests for a new Dedalus machine, new Dedalus credentials, and a
  non-HTTPS Daytona API URL each returned HTTP 400 at 09:47 UTC, without creating
  a journal operation or changing the saved provider configuration.

## Initial hosted creation

The real packaged SDK submitted one provision request and polled its journal.
Creation, bootstrap, and readiness completed in **50,344 ms**, a single cold-start
observation rather than a performance guarantee.

- Worker: `7c595405-e315-4260-8d81-5fa9d766569c`.
- Daytona sandbox: `e4f3dde3-c174-407b-9a55-5901eecb0e34`.
- Provision operation: `0162d3d9-e62a-4377-b41f-afac4efa79fd`.
- Selected runtime/model: Claude Code / Sonnet 4.6, native Anthropic credentials.
- Provider-reported allocation: **1 vCPU, 2 GiB RAM, 10 GiB disk**, independently
  read from Daytona and matching the requested allocation.
- Home directory: `/home/daytona`.

The first managed task failed before model execution with exit code 1:
`error: unknown option '--bare'`. The preinstalled Claude CLI was version 2.1.19.
Bootstrap accepted any runnable Claude executable, while the managed harness
required a newer command-line capability. This is a reproduced integration
failure; successful provisioning alone is not successful agent execution.

The correction retains the managed-run flags, checks executable capabilities,
and installs the shared pinned CLI only when the existing executable is
incompatible. The failed attempt and its existing Worker are retained; the
follow-up must reuse that Worker rather than provision another one blindly.

The first corrective deployment, `7b16b676c49081fe48dbd175501eab85455f24c4`, became
ready at approximately 09:56 UTC (`dpl_J2UGmS7roqNr4C1LJ93aU9JWiTmr`). The real
readiness endpoint correctly rejected the old CLI. Explicit repair operation
`1ffb40dd-8d1c-4a76-bbc9-bb4f78e41849` nevertheless reported success while the
next managed request returned HTTP 409 `runtime_not_ready`, without a model call.

This exposed a second completion boundary: the cached `configure-hermes` phase
still used the older name/version-only health probe and skipped the new installer.
The shared readiness check prevented paid execution but the lifecycle journal
incorrectly claimed readiness. The follow-up fixes the resumed-phase probe and
adds a regression that starts with a fully completed bootstrap and incompatible
preinstalled CLI, rather than only testing a fresh installation.

The final check is enforced inside the shared bootstrap routine before its first
success state, including direct migration callers. Native CLIs cannot mark
bootstrap complete through gateway finalization. Configuration-write failures
also propagate before a separate terminal-state rewrite can hide the error.
At approximately 10:08 UTC, the aggregate gate passed with 855 SDK/source tests,
1,507 web tests, 37 explicit platform-specific skips, both typechecks, production
build, and isolated SDK packaging. Runtime evidence after that deployment remains
separate from these tests.

## Remaining checks at this checkpoint

Real Claude tool execution after the corrective deployment, hosted stop/start
with independently matching file bytes, OpenClaw on the observed 2 GiB allocation,
and E2B-to-Daytona state migration are pending. Public desktop and 390-pixel mobile
checks verified Daytona's official logo in both themes, no horizontal overflow,
masked empty credential inputs, the four active provider choices, and the real
Worker's observed allocation. The same pass found an unrelated malformed Vercel
SVG in Settings; its namespace correction is included with the CLI fix.
No completion claim is made for the pending runtime/lifecycle checks.

The production hostname still uses a Clerk development instance. Existing
production-instance availability, reported by the owner, is separate from
correct production deployment wiring; that handoff remains outstanding.
