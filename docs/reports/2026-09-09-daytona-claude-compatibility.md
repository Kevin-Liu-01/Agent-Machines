# Daytona preinstalled Claude compatibility — September 9, 2026

## Deployed failure

The first native Claude managed task on the newly hosted Daytona Worker failed before model execution: `unknown option '--bare'`. The Worker was `7c595405-e315-4260-8d81-5fa9d766569c`, machine `e4f3dde3-c174-407b-9a55-5901eecb0e34`, with observed 1 CPU, 2048 MiB RAM, and 10 GiB disk. Creation had succeeded in 50.344 seconds on release `556efba`.

At 09:44:15 UTC, a read-only inspection of the actual managed launch PATH resolved `/usr/local/share/nvm/current/bin/claude`, version `2.1.19`. Its help advertised every required headless flag except `--bare`. The base image's Node was `v25.9.0`. Hosted bootstrap accepted any executable Claude with a successful version command and skipped the newer pinned installer. This was a capability mismatch, not a credential or resource failure.

## Correction

The shared Claude installation probe now checks the actual advertised headless protocol, including `--bare`, streaming output, partial messages, model selection, and resume. Existing compatible runtimes remain installed; the check does not demand an exact version or silently remove `--bare` and change loadout semantics.

Hosted Claude bootstrap uses the existing pinned SDK installer (`@anthropic-ai/claude-code@2.1.220`) when the preinstalled executable is incompatible, then verifies the required capabilities before declaring success. The private Node/package paths take priority over legacy global binaries. Readiness uses the same capability probe and requires a successful exit status plus configuration.

An executable SDK regression failed against the old name-only probe, then passed after correction. Hosted generated-shell fixtures cover missing, incompatible, and compatible preinstalled runtimes, including preserving compatible installs. Readiness fixtures reject missing flags, failed help commands, and missing configuration. Focused validation: 28 SDK tests and 74 web tests passed; SDK build, root and web TypeScript checks, and whitespace checks passed.

## Actual no-model repair proof

The new hosted failure target was deliberately not upgraded out of band. Instead, the previously authorized separate 2 GiB Daytona QA machine `24b471d1-4025-4f0f-808c-e22099d6f38a` was explicitly resumed for this test:

- 09:49:36 UTC: explicit wake completed.
- 09:49:38: its image's Claude `2.1.19` failed the new capability probe with exit 1.
- 09:49:44: the actual shared pinned installation and probe completed with exit 0, reporting `2.1.220`; execution took 5.546 seconds.
- 09:49:45: independent PATH/version checks resolved `~/.agent-machines/pkgs/node_modules/.bin/claude`. The complete required headless argument set, including `--bare`, parsed successfully with `--help`, exit 0.
- 09:49:47: the adapter stopped that exact QA machine. A fresh non-waking description returned `sleeping`, raw phase `stopped`, with its original allocation intact.

No model call or runtime configuration overwrite occurred. Existing files and the other installed runtime were retained; no sandbox was deleted. npm emitted a nonfatal Node 25 engine-range warning for `hosted-git-info` in the existing package tree; installation and direct Claude validation still exited 0.

The remaining check is corrective deployment followed by an explicit normal hosted bootstrap request and the real managed Claude task on the original hosted Worker. The bootstrap should detect and replace the incompatible CLI itself; a managed run does not automatically repair it and should return `runtime_not_ready` until repair succeeds. The no-model proof does not substitute for that end-to-end result.

## Corrective deployment exposed a cached-phase bypass

After release `7b16b676c49081fe48dbd175501eab85455f24c4` deployed, explicit hosted bootstrap operation `1ffb40dd-8d1c-4a76-bbc9-bb4f78e41849` reported success, but the subsequent managed request correctly returned HTTP 409 `runtime_not_ready`. No model ran. A read-only check at 09:57:50 UTC still found the image's Claude `2.1.19` on the original hosted machine.

The first correction covered installation and public readiness but missed the bootstrap phase-resume check. Because runtime and model had not changed, the driver preserved completed phases. `configureHealthProbe` still checked only command presence/version and existing environment, so it skipped the completed configuration phase without reaching the new pinned installer.

The pending follow-up makes that cached-phase probe use the exact shared Claude capability probe and provider-aware HOME/PATH. A new executable regression starts with every phase marked completed, a real existing environment file, and an incompatible CLI. It failed before the change and now runs the pinned installation; the compatible completed-phase case still skips installation. Unlike the earlier fresh-phase fixture, this executes the actual resume probe rather than substituting a canned response.

The final readiness invariant now lives at the deeper shared `runWebBootstrap` boundary, before its first success callback. This covers direct migration and scheduled-bootstrap callers as well as the hosted driver, without a duplicate provider probe. The bounded readiness helper is shared with public readiness and wake repair, without a circular dependency on the bootstrap runner. A failed or unreachable probe persists `bootstrapState.phase = failed` through the existing error path. Eight shared-boundary tests cover all four runtimes, success, probe failure, and native gateway-finalization rejection. Native CLI Workers have no HTTP agent gateway; that legacy finalization shortcut now refuses them before any state write.

Independent review also found that a later terminal-state rewrite could hide a preceding configuration failure in the generated shell. The configuration now runs in a standalone subshell whose exit status is checked before the rewrite. Executable environment-write and selected-model-write regressions failed before the correction and now pass, alongside installer-failure and success controls. These guards preserve the actual configuration failure even when an older healthy CLI and stale environment still exist.

The focused 81-test web suite, additional native-model and credential-isolation checks, TypeScript, and whitespace checks passed. The original hosted Worker has not been modified out of band; deployed repair and a real managed task remain unverified until the next release check.

## Deployed normal repair and actual Claude task passed

On release `6bbfdfd54ae43d2938aceb6d9dc7900dc74cc71c`, explicit hosted bootstrap operation `e04f0cae-b70e-4918-8162-9e5cf276f4c1` repaired the original machine at 10:11:15 UTC. No out-of-band upgrade was applied to that hosted target. The following real native-Anthropic Claude task succeeded at 10:11:34 through managed operation `badaec80-4492-4184-bc64-0b8e3a419ff5`, taking 17.130 seconds end to end.

The task produced `/home/daytona/agent-machines/daytona-proof.txt`: 31 bytes, `DAYTONA-HOSTED-WORKER-VERIFIED` followed by a newline, SHA-256 `62271826347d9ef2b053af25d7c516217bc339e1a758572c1325640121a56ec5`. The coordinated hosted sleep/wake test retained that exact file and the same Worker/placement; independent provider reads passed at 10:16:58. Native Terminal inspection at 10:19 showed Claude Code `2.1.220`, Sonnet 4.6, in `~/agent-machines`, after its real first-use theme/key/trust prompts. This was not unattended first-use terminal onboarding.

Before the separate runtime-switch test, an independent adapter read at 10:20:44 again verified the exact bytes/hash on the original hosted machine, observed 2048 MiB allocation, Claude runtime, successful bootstrap, and matching Worker placement. This closes the specific hosted repair and real Claude execution failure; it is not a claim that every runtime/provider combination has been tested.
