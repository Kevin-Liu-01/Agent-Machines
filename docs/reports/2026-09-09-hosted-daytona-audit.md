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

## Corrective hosted execution and lifecycle proof

Release `6bbfdfd54ae43d2938aceb6d9dc7900dc74cc71c` became ready at approximately
10:10 UTC (`dpl_DQdSSkoenoEgXUXhvK6uz8i1HGkL`), with production aliases verified.
The original Worker and sandbox were reused, not replaced or repaired out of band.
Explicit hosted repair `e04f0cae-b70e-4918-8162-9e5cf276f4c1` completed at
10:11:15 UTC. The subsequent real native-Anthropic Claude task completed through
the hosted SDK at 10:11:34 UTC, in 17,130 ms end to end. Its managed operation was
`badaec80-4492-4184-bc64-0b8e3a419ff5`.

Independent provider execution read `/home/daytona/agent-machines/daytona-proof.txt`:

- Exact content: `DAYTONA-HOSTED-WORKER-VERIFIED` followed by one newline.
- Size: 31 bytes.
- SHA-256: `62271826347d9ef2b053af25d7c516217bc339e1a758572c1325640121a56ec5`.

Hosted sleep operation `23234d82-e889-421e-bc8e-341e285c7235` then stopped the
same sandbox. Independent Daytona inspection reported `stopped`. Passive hosted
machine and fleet reads left it stopped. Explicit wake operation
`c1931346-fc75-4aff-ac11-4a7b6eb172c0` returned the same Worker and placement to
running; independent reads at 10:16:58 UTC verified the identical file bytes and
hash. This proves filesystem persistence across stop/start, not process or RAM
migration. Initial creation was on `556efba`; repaired execution and this lifecycle
test were on `6bbfdfd`, not an immutable single-release creation test.

At 10:19 UTC, the actual hosted Terminal page connected to the same sandbox and
its Launch Claude Code CLI action opened version 2.1.220. After the native CLI's
theme, supplied-key, and trusted-project prompts, it displayed a ready Sonnet 4.6
prompt in `~/agent-machines`. No additional paid task was submitted in this UI
check. First-use native prompts are not represented as unattended onboarding;
the managed Console task above completed independently.

## Provider migration and continued execution

On the same `6bbfdfd` deployment, a separate E2B Worker migrated to Daytona with
its stable Worker identity, exact file bytes, four canonical documents, saved
Claude JSONL, and Git state independently verified. The retained E2B source was
explicitly paused after comparison. The [migration audit](2026-09-09-daytona-live-migration.md)
records IDs, hashes, exclusions, the 62-second observation, and the legacy
name-keyed placement warning. Zero managed runs were active at cutover; this is
not a live-process or in-flight paid-task migration claim.

A subsequent real Claude task on Daytona target
`e83e6f53-f98d-45af-acd4-7ce04498fa55` completed through operation
`910044da-1fde-4002-a42a-2e46bd20e4a6`, reporting 19,114 ms runtime duration.
It used tools to read the migrated `sdk-proof.txt` and current working directory.
Independent filesystem reads retained SHA-256
`0175109c6f7010890c31a2154d77bfbb1c19c967764a616f48154a121d79fdf3`.
At 10:28:04 UTC, the hosted native Sessions API independently exposed the new
Claude JSONL with both the file-read result and `/home/daytona/agent-machines`
working-directory result, without truncation. This is continued real execution
after a provider move, not native `--resume` of the source's session.

## Remaining checks at this checkpoint

OpenClaw on the observed 2 GiB allocation remains pending. Its switch operation
`f66987cf-dd6a-42d9-85bb-58708afbc94d` failed configuration before any paid task:
the image's preinstalled OpenClaw 2026.2.1 did not support `--batch-file`.
The operation correctly failed rather than reporting a ready runtime. Its
compatibility-probe and pinned-installer correction is being verified separately.
Public desktop and 390-pixel mobile
checks verified Daytona's official logo in both themes, no horizontal overflow,
masked empty credential inputs, the four active provider choices, and the real
Worker's observed allocation. The same pass found an unrelated malformed Vercel
SVG in Settings; its namespace correction is included with the CLI fix.
No completion claim is made for the pending runtime/lifecycle checks.

The production hostname still uses a Clerk development instance. Existing
production-instance availability, reported by the owner, is separate from
correct production deployment wiring; that handoff remains outstanding.
