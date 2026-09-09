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
