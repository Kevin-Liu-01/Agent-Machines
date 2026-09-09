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

## Remaining live checks

The readiness fix has local and live-shell evidence, but its deployed API behavior and actual Hermes/OpenClaw managed model runs have not yet been verified in this report. The blocked Hermes request did not invoke a model. No successful runtime-switch model call is claimed yet. Resume only through explicit Wake after the verified fix is deployed; do not disguise an old failed request as a completed run or automatically replay it.
