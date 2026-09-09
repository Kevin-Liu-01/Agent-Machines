# Hosted SDK and background-work output audit — September 9, 2026

## Result and method

An independent provider-backed inspection completed successfully from **08:30:57.666Z to 08:31:10.615Z** (01:30:57–01:31:10 Pacific). Both expected workspace files existed, contained exactly their expected UTF-8 text followed by one newline, and matched their automatically captured artifacts byte-for-byte. These assertions came from actual file reads, not from an agent's completion message.

The inspector first read non-waking provider metadata. It used bounded, read-only Linux directory-relative descriptors, rejected symlinks and hard links, checked file stability during reads, calculated SHA-256 independently, and compared artifact metadata with the actual stored bytes. It did not call a model, write remote files, edit configuration, create/delete resources, or explicitly pause or resume either machine. Local executable evidence is `/tmp/agent-machines-launch-20260909/verify-sdk-and-background.ts`.

## SDK-created E2B Worker

- Machine: `im6lw0tt18o61tbql1df9`.
- Workspace file: `/home/user/agent-machines/sdk-proof.txt`.
- Exact content: `SDK-CREATE-RUN-VERIFIED` followed by one newline; **24 bytes**.
- SHA-256: `0175109c6f7010890c31a2154d77bfbb1c19c967764a616f48154a121d79fdf3`.
- File and artifact read: **08:30:58.115–08:30:58.119Z**.
- Automatic artifact: `run-8afdb5522cbd2ecfbcaeeafa0450a442`, created **08:26:04.766Z**, run key `4db96b8c-625f-459d-9746-fdc105084a16`.
- Stored copy: `/home/user/.agent-machines/artifacts/run-8afdb5522cbd2ecfbcaeeafa0450a442/sdk-proof.txt`; exact content, byte count, SHA-256, source path, and metadata all matched.

Before and after inspection, E2B reported `running`, the same expiry **09:24:54.885Z**, and lifecycle `{ onTimeout: "pause", autoResume: false }`. The inspector refused to connect to a non-running E2B machine or one within five minutes of expiry. No paused E2B was resumed in this check. The state preflight and subsequent connection are not an atomic provider operation; this is observed evidence, not a general race-free no-wake guarantee for `Sandbox.connect()`.

The separately retained SDK smoke result (`/tmp/agent-machines-launch-20260909/sdk-live-smoke-verified-result.json`) records creation at **08:24:52.397Z**, completion at **08:26:05.181Z**, **59.543 seconds** for creation and **12.665 seconds** for the task. Its request trace shows provision returning 202, operation polling through `succeeded`, and `/api/agents/run` returning 200 after execution. This inspection independently verifies the resulting file and artifact, not a second SDK creation/run or the model's broader claim that no other files changed.

## Background task on the migrated Sprites Worker

- Machine: `am-mux-coding-agent-d11810-mttt57h941`.
- Workspace file: `/home/sprite/agent-machines/background-proof.txt`.
- Exact content: `BACKGROUND-WORK-VERIFIED` followed by one newline; **25 bytes**.
- SHA-256: `902ff9e0b7ea7a8395f9e1619bac2effba0babd5cd6618dba4c094a016ef19cb`.
- File and artifact read: **08:31:10.469–08:31:10.475Z**.
- Automatic artifact: `run-a72bf31238828ca0457be6ca593d062b`, created **08:12:49.556Z**, run key `evt_mtttlnis_5`.
- Stored copy: `/home/sprite/.agent-machines/artifacts/run-a72bf31238828ca0457be6ca593d062b/background-proof.txt`; exact content, byte count, SHA-256, source path, and metadata all matched.

Contrary to the initial expectation that both machines were running, Sprites metadata at the start of its inspection reported **`cold` / `sleeping`**. A strict running-only preflight initially refused the read. The final inspection allowed the provider's documented automatic-idle behavior: the requested read woke the Sprite, and its final metadata reported **`running` / `ready`**. This was not a successful manual Sleep/Wake test, and the read was not compute-free.

The primary QA session associates this output with background operation `0fdacfbe-e249-4b39-8a1f-343b85b274c3`, completed at **08:12:49.592Z**. That operation status and the browser-away behavior were supplied by the primary QA session, not independently replayed here. This inspection proves the output and inspectable artifact still existed about 18 minutes later; it does not itself prove continuous execution while the browser was closed.

## Boundaries

This is a two-file, two-provider spot check with exact stored evidence. It does not establish an uptime SLA, arbitrary workload correctness, billing accuracy, native-process migration, or general pause support. No application source changed for this audit; the only durable repository addition is this report. The machines and artifacts were retained.
