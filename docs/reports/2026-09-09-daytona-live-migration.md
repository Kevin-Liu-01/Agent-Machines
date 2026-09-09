# Hosted E2B → Daytona migration — September 9, 2026

**Result: passed for this explicitly authorized QA Worker.** The hosted live
migration preserved its stable Worker ID, SDK proof file, four canonical Worker
documents, existing Claude transcript, and an isolated Git repository including
uncommitted and untracked content. Independent provider reads verified the data;
a successful migration journal alone was not treated as proof.

This test made no model calls and did not delete the source. It is a durable-state
and managed-cutover proof, not process-memory migration or an all-provider matrix.
The separate follow-up native task is recorded in the
[hosted Daytona audit](2026-09-09-hosted-daytona-audit.md).

## Exact scope

| Object | Identifier |
| --- | --- |
| Production commit | `6bbfdfd54ae43d2938aceb6d9dc7900dc74cc71c` |
| Ready deployment | `dpl_DQdSSkoenoEgXUXhvK6uz8i1HGkL` |
| Stable Worker | `1d66553c-e9d0-458f-ad15-f6ca77b56616` |
| Retained E2B source | `im6lw0tt18o61tbql1df9` |
| New Daytona target | `e83e6f53-f98d-45af-acd4-7ce04498fa55` |
| Explicit wake operation | `c2514570-3dd2-4cac-b58c-882a7daca59e` |
| Migration operation | `c0a2c83d-da64-473e-a16c-bf07f5f0880f` |

Requests used only the isolated QA account's scoped API key. The owner's fleet
and unrelated test resources were not changed. Credential values were neither
printed nor included in this report.

## Actual sequence

1. Read-only preparation confirmed the source was paused and the target provider
   was credentialed. The hosted wake request was accepted at 10:19:04 UTC and its
   journal succeeded at 10:19:08 UTC.
2. Independent E2B inspection confirmed the exact source was running. Its finite
   timeout was extended to a verified 10:39:09 UTC deadline for this test, retaining
   `onTimeout: pause` and `autoResume: false`. The migration was not started with
   an expiring or destructive source lease.
3. At 10:19:09 UTC, bounded provider-side reads hashed the existing SDK proof,
   canonical documents, and native history. A tiny, separately authorized
   `~/agent-machines/am-migration-git-qa` fixture was created only after confirming
   that path did not exist. It contains one commit, a modified tracked file, and
   an untracked file; no remote, hook, or external network operation was used.
4. One hosted migration request was submitted at 10:19:30 UTC with
   `{ to: "daytona", source: "keep", moveState: true, mode: "live" }`.
   Its idempotency key was recorded before submission. No migration POST was
   replayed. The target ID was recorded as soon as the journal exposed it.
5. The migration journal succeeded at 10:20:33 UTC, approximately 62 seconds
   after acceptance. This is one measured result, not a migration latency SLA.
6. Independent target checks passed at 10:20:57 UTC. Daytona reported `started`
   with **1 vCPU, 2,048 MiB RAM, and 10 GiB disk**. Its actual home was
   `/home/daytona`, replacing the source's `/home/user`. Hosted bootstrap and
   migration state both reported success. The shared native-Claude capability
   probe also returned exit code zero, including support for the managed flags.

## Independent state checks

The proof at `~/agent-machines/sdk-proof.txt` retained all 24 bytes:
`SDK-CREATE-RUN-VERIFIED` followed by a newline. Its source and target SHA-256 was
`0175109c6f7010890c31a2154d77bfbb1c19c967764a616f48154a121d79fdf3`.

All four canonical documents retained their exact byte counts and hashes:

| Document | Bytes | Source and target SHA-256 |
| --- | ---: | --- |
| `SOUL.md` | 958 | `795a551fc25a91cbe3594b13cf413383e9a6360ed352daeb3af524f7f4badb15` |
| `AGENTS.md` | 1,870 | `0bc002ca8250008ba794422491859851f2760f3c12f68a47b12ff6d83e62d472` |
| `MEMORY.md` | 3,557 | `aad5add70ab056ea58f9a703505cff193bedd78bdf31b4a988ae627a47656a7f` |
| `USER.md` | 1,112 | `5dfe5e89ab3a82dfc1a8c58c67bfc47fce4b9e91b89aa981b221d64b06785476` |

The existing 11,203-byte Claude JSONL transcript retained SHA-256
`60b0c5b32d062e632ca5b8884f316d99e5c3738b4299afabc169bb1ee1ecf6fd`.
Its original project-directory name was preserved. This proves transcript file
preservation, not that a resumed CLI automatically selects a transcript whose
directory name encodes the former home path.

The Git fixture retained:

- HEAD `db54fc69ac0b03123c494047ea88bb11ab4ed2f5` and branch `migration-proof`.
- Exact refs, all three Git objects, index bytes, and working-tree status.
- The modified 54-byte `tracked.txt`, SHA-256
  `b96952a65f254d3e3d9ac5210c51c35904a5eb78104a1caf9a1096cc83a7a731`.
- The untracked 26-byte `untracked.txt`, SHA-256
  `834b7c6a86a0d105688f695938bf7151dc888f266b010ad70cf96166b63008d7`.

A separate final read compared actual tracked and untracked file contents, not
just Git status. Source `.git/config` existed; target `.git/config` was absent,
as required by the credential-sensitive local/remote configuration exclusion.

## Cutover semantics and limitations

The actual journal recorded 588,618 baseline bytes and 339 delta bytes, totaling
588,957 transferred bytes. Managed runs were drained, the migration gate was
released, and the Worker-ID control-plane placement was recorded successfully.
There were **zero active managed runs** at cutover; this does not prove draining
an in-flight paid task. Target processes were restarted, not memory-migrated.

The legacy name-keyed mux placement mirror returned `recorded: false` because
both retained source and target share the generated machine name. It correctly
refused an ambiguous name lookup instead of choosing whichever record wrote
last. This warning did **not** prevent the authoritative stable Worker-ID
placement from switching to the exact Daytona target. Callers must use the
Worker ID or exact machine ID, not assume that retained placements have unique
names.

The migration result explicitly excludes process RAM, tmux scrollback, `/tmp`,
ad-hoc system packages, unsupported external workspaces, dependency caches,
known credential files, and Git local/remote configuration. Toolchains and
combined runtime instructions are regenerated. Arbitrary absolute paths in
project files or transcripts are not rewritten. Filename-based credential
exclusions are not a content secret scanner; embedded secrets in files or Git
history still require review.

## Retained-resource handoff

At **10:26:12 UTC**, the exact E2B source was independently re-identified and then
explicitly paused through its provider API. A fresh non-waking `getInfo` confirmed
`paused`. No source data was deleted. This provider-only pause did not alter the
stable Worker's new target placement.

At the same time, a read-only Daytona description confirmed the target remained
`ready` / `started`. It was retained for one separate bounded
native-runtime check and was not mutated by this cleanup. The target continues
to consume compute while running; retained source and target state may incur
storage charges. Neither placement has been deleted.

Private local evidence is retained under
`/tmp/agent-machines-launch-20260909/daytona-migration-*`: the execution journal,
before/after inventories, verified result, and scoped test scripts. The checked-in
report contains only the allowlisted proof, not credentials or transcript bodies.
