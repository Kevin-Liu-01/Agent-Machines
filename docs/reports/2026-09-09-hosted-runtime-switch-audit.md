# Hosted runtime-switch audit — September 9, 2026

## Scope

Use the authenticated hosted control plane to switch one disposable QA Worker from Claude Code to Hermes, then OpenClaw, preserving its machine identity and existing file. Each target runtime must subsequently read that file through a real managed agent run. Two successful small model calls are the maximum; no model matrix or user-owned fleet changes are in scope.

- Worker: `e312bf07-1d08-45f4-bf82-447cace77c4e`.
- E2B machine: `i8o0b5gs0tdsbpr8gqfxm`.
- Existing file: `/home/user/agent-machines/paused-model-proof.txt`.
- Exact contents: `PAUSED-MODEL-STATE-VERIFIED` followed by one newline.
- SHA-256: `b5b2bfb792e5d72398ba8e9ed926bfd126399dce60c6bb4d7b686eeced840120`.
- E2B timeout policy: `onTimeout: pause`, `autoResume: false`.

Credentials were loaded privately for the dedicated QA account. No credentials are included in this report. Every mutation was submitted once; operation polling did not replay a mutation.

## First live result: a real Hermes readiness blocker

At 08:31:11 UTC, the hosted machine response and non-waking E2B description agreed that this Worker was running Claude Code, with model `claude-opus-4-8` and successful bootstrap.

`POST /api/dashboard/machines/i8o0b5gs0tdsbpr8gqfxm/agent`, with Hermes and `claude-sonnet-4-6`, returned HTTP 202. Operation `a827a492-c62f-4d4e-9e53-cb5e12ca51e7` reached `succeeded` at 08:31:42.874 UTC. The same Worker and E2B allocation were retained. Its recorded runtime became `hermes`, model `anthropic/claude-sonnet-4-6`, and phase `running`.

However, the first managed file-read request returned HTTP 409 `runtime_not_ready` at 08:32:05 UTC, before any model invocation. The subsequent readiness GET returned `ok: false`, while the machine record still said bootstrap had succeeded. This was a reproducible product defect, not a successful agent run.

The readiness helper hardcoded `~/.agent-machines/venv/bin/hermes`. The current pinned installer instead created the executable symlink `~/.local/bin/hermes`, pointing into `~/.local/share/uv/tools/hermes-agent/bin/hermes`. A read-only CLI check confirmed Hermes v0.19.0. The expected `.agent-machines/.env`, `.agent-env`, and `config.yaml` existed; the obsolete venv executable did not.

## Narrow fix and verification

`web/lib/bootstrap/bootstrap-repair.ts` now resolves Hermes through the same supported launch locations: the current uv tool path, legacy durable venv, and pre-baked `/opt/hermes/bin`. It requires an executable file, the runtime environment file, a successful probe exit status, and the exact success marker.

The executable regression suite runs the actual generated shell against isolated filesystem fixtures. Current uv and pre-baked installs failed before the fix; legacy venv already passed. All six cases now pass, including missing executable, non-executable file, and missing configuration failures. A plain `command -v` check was insufficient: the non-executable fixture caught Bash returning such a path, so the final probe also verifies executable permission.

Validation: 47 focused tests passed across readiness, installation, managed Console, runtime environment, and execution deadlines. Web TypeScript and whitespace checks passed. At 08:36:14 UTC, the actual updated helper was executed read-only against the existing QA machine; it returned `ready: true`, exit code 0, and `ok`, without changing installation or making a paid model call.

At 08:36:45 UTC, an independent file read confirmed the original exact bytes and SHA-256 were unchanged. A hosted pause was then submitted as operation `f040d974-e87b-4407-b05d-d4a6087f5cf3` to retain the QA state while awaiting deployment. It succeeded at 08:36:48.274 UTC; at 08:37:30 UTC the non-waking provider read still reported `paused`, and the hosted GET correctly showed `sleeping`.

## Deployed Hermes proof

Release `ebc9459a00f42efc750f932d0173932043839305` was deployed before these checks. Explicit Wake `5507746b-2fbf-4f4a-9f01-24b12e775713` succeeded at 08:43:48 UTC. At 08:44:12, the hosted readiness GET returned `ok: true` for the same Hermes Worker, demonstrating the deployed change from the earlier false readiness result.

The subsequent managed file-read operation `dc334dbb-938c-403c-847c-1967281ab4f0` succeeded once: HTTP 200, exit code 0, 14.868 seconds of runtime execution and 20.315 seconds for the request. It reported `/home/user/agent-machines` and the exact original contents. The native Hermes history, inspected independently through the hosted Sessions API, records the real `read_file` call for `./paused-model-proof.txt`, its 28-byte tool result, and the final answer. The session key is `20260909_084426_f787c6` in `~/.agent-machines/state.db`.

The runtime surfaced a nonfatal warning: the optional tirith security scanner was unavailable, so scanning used pattern matching only. No output artifacts were created by this deliberately read-only task. The original file hash was independently unchanged at 08:45:07 UTC.

## OpenClaw: successful switch, failed tool execution

Switch operation `ed565430-b557-4331-9e43-240f0ba93e98` succeeded at 08:46:05 UTC. Runtime `openclaw`, model `anthropic/claude-sonnet-4-6`, Worker identity, and E2B allocation were preserved; the deployed readiness GET returned true at 08:46:46.

The actual managed task did **not** succeed. Operation `0c57acc9-2dc0-4a4b-a85a-690613216033` failed once, with HTTP 502 and exit code 1 at 08:47:09 UTC. Its journal records one attempt. The native Anthropic request returned HTTP 200, so this failure may still have incurred model usage. No automatic retry was made.

The saved OpenClaw session `129f759f-d288-44de-9334-75c3ad656786` records the model's first `exec` tool request, then no tool result or final answer. It also exposes a separate workspace mismatch: OpenClaw selected `~/.openclaw/workspace`, despite the hosted shell starting in `~/agent-machines`. The installed CLI is the pinned OpenClaw `2026.7.1-2`.

Read-only kernel evidence identifies the execution failure: the 512 MiB E2B allocation (478 MiB usable) ran out of memory and killed `openclaw-agent`; the OpenClaw supervisor translated the child's SIGKILL into exit code 1. There was no leftover Hermes/OpenClaw gateway or duplicate agent consuming memory.

This was reproduced without further paid calls using isolated temporary OpenClaw configurations, fake-only credentials, and a localhost Anthropic SSE fixture that requested the same read-only tool. Both the default and explicitly corrected workspace cases failed before a tool result. V8 heap caps of 192 and 256 MiB also failed; disabling OpenClaw's respawn wrapper with a 192 MiB heap did not resolve the failure. These experiments did not modify the real runtime configuration or file. The original SHA-256 remained unchanged after every experiment, and each temporary fixture was removed.

## Capacity and workspace corrections

The pending code now rejects OpenClaw on an allocation whose provider reports 512 MiB or less. Admission checks run before Console readiness, managed submission, direct/scheduled managed execution, the hosted bootstrap shortcut, and direct bootstrap used by scheduled placement or migration. They use observed provider memory, never the requested machine size. The error asks for a larger allocation and explains that reinstalling or changing the requested RAM cannot resize the existing machine. Unknown RAM is explicitly unverified rather than treated as the requested allocation. This check is separate from missing-install detection, so it cannot cause a reinstall loop.

Managed OpenClaw prompts now include the authoritative Worker project path and instruct tools to use absolute paths or an explicit working directory. This is a contextual instruction, not hard filesystem isolation or a guarantee that a model will obey. OpenClaw's canonical memory workspace remains intact, and the project `AGENTS.md` is not overwritten. An executable generated-shell fixture checks the emitted project context, actual shell cwd, and preservation of both instruction files. Runtime errors now retain parsed native error messages even when stderr also contains harmless model-transport logs.

The actual readiness route initially returned true for an installed OpenClaw fixture with observed 512 MiB and requested 8192 MiB; its regression now rejects it without paid execution. Direct bootstrap regressions failed before admission was added and now stop before installation or success signoff. The workspace and structured-error regressions also failed before their corrections. At 09:20 UTC, all 92 focused tests passed across nine files, covering capacity, direct bootstrap, actual GET/POST admission, managed execution, runtime environment, deadlines, credential isolation, and native model behavior. Whitespace checks passed. These local tests do not establish that the pending fixes are deployed.

## Positive 2 GiB OpenClaw tool fixture

A separate authorized disposable Daytona sandbox, `24b471d1-4025-4f0f-808c-e22099d6f38a`, reported one CPU and 2 GiB of RAM. The actual pinned OpenClaw harness installed `2026.7.1-2`. The image's existing Node `v25.9.0` satisfied its engine requirement. The first fixture incorrectly dropped that NVM path and exited before making any HTTP request; preserving the same PATH that the real harness uses corrected the test fixture, without a product Node change.

At 09:18:03 UTC, the native OpenClaw CLI completed a tool cycle using only a localhost Anthropic SSE fixture and fake-only credentials. The fixture returned an `exec` tool request, received the actual tool result in the second HTTP request, then returned a final answer. OpenClaw exited 0, recorded one tool call and zero failures, and reported 2.304 seconds of native execution. Its normal respawn behavior was retained and no heap cap was applied.

The tool read an isolated temporary 28-byte copy of the proof file; its before/after SHA-256 matched the original. The temporary project, config, and native session were removed after assertions. The pinned runtime remains installed on the dedicated Daytona sandbox for subsequent QA. No real model call occurred, and the original E2B Worker was untouched by this fixture.

At 09:20:24 UTC, non-waking provider and hosted reads agreed that the original E2B QA Worker was still paused/sleeping, with `onTimeout: pause`, `autoResume: false`, and observed memory 512 MiB. It was not resumed or deleted.

At 09:24:25 UTC, the new Daytona adapter explicitly parked only the separate 2 GiB QA sandbox. A fresh provider instance then described it as `sleeping`, raw phase `stopped`, with the same one CPU, 2048 MiB RAM, and 3 GiB disk allocation. Its files and runtime installation were retained; no sandbox was deleted.

## Hosted Daytona switch exposed an older preinstalled OpenClaw

After the real hosted Claude task and sleep/wake proof on release `6bbfdfd54ae43d2938aceb6d9dc7900dc74cc71c`, this audit received a different, newly created Daytona Worker: `7c595405-e315-4260-8d81-5fa9d766569c`, machine `e4f3dde3-c174-407b-9a55-5901eecb0e34`. Its observed allocation was one CPU, 2048 MiB RAM, and 10 GiB disk. At 10:20:44 UTC, independent provider and hosted reads agreed on the running Claude placement and successful bootstrap. Its existing `~/agent-machines/daytona-proof.txt` contained 31 bytes, `DAYTONA-HOSTED-WORKER-VERIFIED` followed by one newline, SHA-256 `62271826347d9ef2b053af25d7c516217bc339e1a758572c1325640121a56ec5`.

One OpenClaw switch was submitted with Sonnet 4.6. Operation `f66987cf-dd6a-42d9-85bb-58708afbc94d` was accepted at 10:21:00 and failed at 10:21:34 with `configure-hermes failed: exit 1`, one attempt. The Worker retained its actual Claude placement while the failed desired runtime remained inspectable; it did not falsely report a completed switch. No OpenClaw model request was made. An independent read at 10:22:13 confirmed the original file and hash were unchanged.

The actual configuration log identified `error: unknown option '--batch-file'`. The image contained OpenClaw `2026.2.1` at `/usr/local/share/nvm/current/bin/openclaw`; the installed-name check accepted it and skipped the pinned `2026.7.1-2` installer. Configuration failed before the OpenClaw environment file or provider configuration existed. This was a CLI compatibility defect, separate from the earlier 512 MiB OOM failure.

The correction checks the actual CLI configuration and headless protocol: batch configuration, strict JSON, merge, local execution, session key, message/model/JSON arguments, and auth-provider selection. Help probes are bounded and never invoke a model or change configuration. The same check is used for SDK installation, cached bootstrap phases, configuration admission, and final hosted readiness. Compatible versions stay installed; incompatible versions use the existing pinned installer. The standalone configuration failure guard remains in place.

Five SDK cases reproduced false compatibility before the fix; all six now pass. Executable hosted fixtures cover fresh incompatible installation, cached incompatible installation, preserving compatible binaries, and an actual installer failure. Readiness also rejects old or failed-help CLIs even with an environment file present. The focused web suite passed 72 tests, including the existing Claude, shared final-state, capacity, and managed Console checks. SDK build, both TypeScript checks, and whitespace checks passed.

### No-model validation of the complete configuration

The separate existing QA machine `24b471d1-4025-4f0f-808c-e22099d6f38a` was explicitly resumed at 10:28:04. It already contained the pinned OpenClaw from the earlier fake-model fixture, so this was not claimed as a new old-to-new installation. Independent CLI help confirmed the pinned version supports every required configuration and headless argument.

At 10:33:03, the exact shell emitted by `runWebBootstrap` completed against an isolated temporary HOME and fake-only credentials. It successfully applied all six gateway settings, pasted the fake Anthropic profile, configured its model catalog, selected `anthropic/claude-sonnet-4-6`, and wrote the runtime environment file. The phase exited 0 after 27.967 seconds. The fixture, including its fake auth/config files, was removed afterward; the real Worker configuration was untouched. No model endpoint was called.

A subsequent direct probe of the old global CLI failed closed with exit 124, the help timeout. The diagnostic script initially expected the narrower exit code 1 and therefore stopped before its redundant private-install check; this is recorded as a diagnostic assertion mismatch, not a successful complete rerun. The pinned shared probe had already passed inside the actual configuration sequence above. The cleanup `finally` block explicitly stopped the QA machine, and a fresh non-waking description at 10:34:11 reported `sleeping` / `stopped`, with its original allocation intact. No sandbox was deleted, and the hosted failure target was not upgraded out of band.

## Deployed Daytona repair and real OpenClaw tool execution passed

Release `d1eb6d9ef1f6b3a5a2c991208973de60c6d6aea5` was independently verified deployed before the next mutation. The original switch was not resubmitted. A single normal `POST /api/dashboard/admin/bootstrap` with `force: true` repaired the already-recorded desired OpenClaw intent on the same machine. Operation `3793a08f-7197-450d-adbd-9365ea7398a7` succeeded at 10:41:29.624 UTC, one attempt, approximately 81.5 seconds after it started. Only then did the actual placement become OpenClaw. Independent version inspection later resolved `~/.agent-machines/pkgs/node_modules/.bin/openclaw`, `2026.7.1-2`, confirming the hosted repair replaced the incompatible image CLI through the normal path.

At 10:42:01, the hosted machine, Worker journal, and provider description agreed on OpenClaw, `anthropic/claude-sonnet-4-6`, the same Worker/machine IDs, successful bootstrap, and observed 2048 MiB RAM. An independent file read matched the exact original bytes and SHA-256. The deployed readiness GET returned true at 10:42:06, taking 6.040 seconds. Its message correctly qualified that model credentials are checked when an actual run starts.

The authorized real native-Anthropic managed task then succeeded at 10:42:54.105 through operation `8c842a28-84db-4b2d-8180-9e0bb7b4c730`: HTTP 200, exit code 0, one attempt, 12.615 seconds of runtime execution and 27.616 seconds for the request. It returned the correct project directory and file contents. No retry was submitted. There were no run warnings or new artifacts, as expected for the read-only task.

The independent native transcript is `~/.openclaw/agents/main/sessions/814a3870-d0d6-4aa2-b03a-a698c3bb7d80.jsonl`. It records the actual `exec` tool call `cat /home/daytona/agent-machines/daytona-proof.txt` at 10:42:51.650, its correct tool result at 10:42:51.884, then the final answer. The hosted Sessions API returned these messages without truncation at 10:43:27. The model used the authoritative absolute project path; this is actual tool evidence, not just a claimed answer. The original Claude native transcript remained listed after the switch. A separate post-run provider read at 10:43:11 again matched the original proof-file SHA-256.

The Sessions surface also displayed a nonfatal, overly broad SQLite-history warning even though this pinned JSONL was readable, and listed OpenClaw's companion trajectory JSONL separately. That presentation limitation does not invalidate the retrieved tool transcript, but this audit does not claim complete decoding of every native history format. The machine was left running for the parent's coordinated cleanup; this audit did not delete it.

A bounded read-only follow-up at 10:46:53 confirmed both presentation defects. The warning was triggered solely by `~/.openclaw/agents/main/agent/openclaw-agent.sqlite`. An isolated snapshot of that database and its WAL contained auth-profile, cache, and memory-index tables, not conversation/session/message tables; no table contents or credentials were printed, and the temporary snapshot was removed. The 168,196-byte `814a3870-d0d6-4aa2-b03a-a698c3bb7d80.trajectory.jsonl` contained seven diagnostic trace records with the same `sessionId` as the real 3,323-byte conversation JSONL, including `session.started`, `context.compiled`, and `model.completed`. It was not a second conversation. The proposed narrow correction is to exclude these companion trace files from conversation inventory and stop inferring unsupported conversation storage from this non-conversation database; no such code change was made during this read-only follow-up.

The subsequent approved correction changes only those two classification rules. OpenClaw `*.trajectory.jsonl` files are omitted from the conversation index and totals, without deletion; the known auth/cache/memory SQLite file is no longer inspected or used to infer conversation storage. Other runtimes' filenames, safe descriptor-relative reads, payload limits, and actual JSONL/Hermes corruption warnings remain unchanged. Five executable regressions failed before the correction, covering SQLite coexistence/metadata-only, trace companion/trace-only, and a corrupt real conversation alongside its trace. All 33 actual-reader tests and 14 hosted Sessions route tests then passed; web TypeScript and whitespace checks passed. Those tests also verify the metadata database and trace bytes are unchanged and that real corrupted history still produces warnings. Deployed verification of this presentation correction remains pending; no additional provider or paid-model calls were made while implementing it.

## Final deployed Sessions verification and cleanup

Release `48408dc30ec8fb72d260b59e72f24c6b5e6df906` became ready on both production
domains. At 10:58:31 UTC, the actual hosted Sessions API returned zero warnings,
exactly one OpenClaw conversation, and the earlier Claude conversation. The
OpenClaw detail returned four readable messages, no truncation or warnings, and
the actual file-read tool call/result. Its diagnostic trajectory was not listed.
The authenticated Sessions page independently displayed that same saved
conversation and tool evidence, with a screenshot retained. No model call was
made for this verification. The original hosted fixture was then deleted through
the normal lifecycle, with provider absence and hosted HTTP 404 independently
confirmed at 10:59:33 UTC; see the [cleanup audit](2026-09-09-qa-cleanup.md).

## Limits and next checks

Hermes has a completed hosted runtime-switch/model/tool proof on E2B. OpenClaw has a proven 512 MiB E2B capacity failure and now a successful normal hosted repair, runtime switch, and real native-Anthropic tool task on 2 GiB Daytona, with the original file and Claude history retained through verification. This is not a complete runtime/provider matrix, does not establish that 1 GiB is sufficient, and does not guarantee capacity for arbitrary workloads. The managed workspace prefix is contextual guidance, not filesystem isolation. The narrowly corrected native-history presentation also passed deployed verification. No further paid retry is needed for this bounded proof.
