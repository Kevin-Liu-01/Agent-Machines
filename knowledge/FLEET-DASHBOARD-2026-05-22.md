# Fleet dashboard research & live-fire runs — 2026-05-22

Session goal: run the full machine → agent → gateway → chat flow end-to-end, then make **fleet split + interact + visibility** work from the dashboard (not just curl/API).

Related: [POSTMORTEM-2026-05-18-live-fire-qa.md](./POSTMORTEM-2026-05-18-live-fire-qa.md)

---

## Executive summary

| Layer | Before | After this session |
|-------|--------|-------------------|
| Bootstrap / gateway | Broken shell syntax, wrong systemd unit, 503 on preview URL | Custom `agent-hermes-gateway.service`, `waitForGatewayUrl`, wake-time gateway restart |
| Dashboard scoping | Header/gateway/AutoWake always used **active** machine | URL-scoped machine wins via `?machineId=` + `useScopedMachineId` |
| Fleet interact | Cards only linked to full-page routes | Split view: `/dashboard/machines?focus=<id>` embeds `ChatShell` beside fleet cards |
| Fleet visibility | Live state only | Bootstrap phase badges on cards; gateway strip scoped per machine |

---

## Working machine (reference)

| Field | Value |
|-------|-------|
| Machine ID | `dm-019e4e57-dacf-735d-af02-f1dda20444b0` |
| Agent | Hermes on Dedalus |
| Gateway | `https://wprev-733a878b97e388d00d6346131bd9462d2c5aad4b.vm.dedaluslabs.ai/v1` |
| Dev env | `ALLOW_DEV_AUTH=1`, Next on **port 3210**, config `web/.dev-user-config.json` |

**Failed machine (do not use):** `dm-019e4e52-134b-7af5-b4a4-30ca60514931` — bootstrap died on bad systemd install (`DHV process exited unexpectedly`).

---

## Run 6 — Sprites gateway green (2026-05-24)

**Working reference machine:** `am-hermes-sprites-o7ayjx4o` (Hermes · Sprites)

| Check | Result |
|-------|--------|
| `GET /api/dashboard/gateway?machineId=…` | `ok: true`, ~130ms |
| `POST /api/dashboard/admin/finalize-gateway` | `ok: true` in ~7s |
| `bootstrapState.phase` | `succeeded` |
| Fleet split chat (`?focus=`) | Send enabled, streams via `/api/chat` |

### Root bugs fixed this run

1. **Storage path + machine scoping** — chat/artifact exec used hardcoded `/home/machine` and `activeMachineId` instead of provider home (`/home/sprite`) + focused `machineId`. Fixed via `machine-paths.ts` + `MachineStorageContext`.
2. **Chat gateway probe** — `Chat.tsx` called `/api/dashboard/gateway` without `machineId`, so fleet split view probed the wrong machine. Now scoped.
3. **Bootstrap stuck on `start-gateway`** — Sprites exec had no timeout; kill/restart loop hung. Added `withTimeout` on Sprites exec + fast-path skip when port already listening.
4. **Post-gateway phases block chat** — `install-closed-loop-tools` (playwright install) timed out and failed entire bootstrap. Split into `POST_GATEWAY_BOOTSTRAP_PHASES` — gateway marks `succeeded` first; post phases are best-effort.
5. **Bootstrap state loss on failure** — failed runs wiped `completed[]`. Route now preserves progress.
6. **`/api/chat` machine scoping** — passes `body.machineId` to `resolveGatewayForUser`.

### Provider testing cheatsheet

| Provider | Gateway probe | Logs on VM | Public URL |
|----------|---------------|------------|------------|
| **Sprites** | `GET …/v1/models` on `*.sprites.app` | `tail ~/.agent-machines/logs/gateway.log` under `/home/sprite` | `GET https://api.sprites.dev/v1/sprites/<name>` → `url` proxies :8080 |
| **Dedalus** | preview URL `/v1/models` | `tail ~/.agent-machines/logs/gateway.log` under `/home/machine` | `createPreview(machineId, 8642)` |
| **E2B** | `https://8642-<sandboxId>.e2b.app/v1/models` | `/home/user/.agent-machines/logs/gateway.log` | deterministic port URL |

**Repair API:** `POST /api/dashboard/admin/finalize-gateway` `{ "machineId": "…" }` — restart gateway + probe + persist `apiUrl` without re-running full bootstrap.

### Dedalus fleet status (blocked on provider)

- `dm-019e4e52`, `dm-019e4e57`, `dm-019e4336` — 404 or `SNAPSHOT_LAUNCH_GUEST_RUNTIME_TIMEOUT`
- Overlay FS resets on sleep/wake; stale `bootstrapState: succeeded` ≠ artifacts present — use `needsBootstrapRepair` + re-bootstrap on wake (CLI `wake.ts` already does this; dashboard AutoWake should trigger bootstrap when repair needed).

---

### Run 1 — End-to-end API proof

1. `POST /api/dashboard/admin/setup` — Hermes + Dedalus credentials
2. `POST /api/dashboard/admin/provision-machine` → `dm-019e4e57-…`
3. `POST /api/dashboard/admin/bootstrap` — **failed v1** (shell `then &&` joining multiline `if/fi`)
4. Fixed `migrateLegacyPathsShell()` in `web/lib/platform/runtime.ts` + `src/lib/bootstrap.ts`
5. Bootstrap **retry succeeded** (~68s after systemd fix)
6. `GET /api/dashboard/gateway` → `ok: true`, ~103ms, model count populated
7. `POST /api/chat` — SSE stream connected; empty content deltas (likely upstream model/key on VM, not gateway connectivity)
8. Setup wizard `/dashboard/setup` showed **Machine bootstrapped** on Done step

### Run 2 — Gateway durability investigation

- Preview URL returned **503** during bootstrap until local gateway was up
- Manual `bash /home/machine/start-hermes-gateway.sh` briefly returned 200, then **502** when process died
- Root cause: `hermes gateway service install` targeted `dm-guest-agent.service` (Dedalus platform daemon), not a dedicated Hermes unit
- Fix: `web/lib/bootstrap/gateway-lifecycle.ts` — `installGatewayUnitCommand`, `ensureGatewayRunning`, `waitForGatewayUrl`
- Wake path now restarts gateway when machine returns to `ready` after sleep

### Run 3 — Dashboard fleet gap analysis

Exploration found per-machine routes and wake/sleep APIs already existed. Gaps were scoping (header/gateway/AutoWake), no split-pane chat on fleet page, and bootstrap state not shown on cards.

### Run 4 — Dashboard fleet implementation

Implemented scoping + split interact UI (see **Files changed** below).

---

## Bugs fixed (with root cause)

### 1. Bootstrap shell syntax (`then &&`)

**Symptom:** Bootstrap failed mid-script on Dedalus VMs.  
**Cause:** Multiline `if/fi` blocks joined with `&&` produced invalid shell.  
**Fix:** Single-line `if` blocks in `migrateLegacyPathsShell()`.  
**Files:** `web/lib/platform/runtime.ts`, `src/lib/bootstrap.ts`

### 2. Gateway not durable after bootstrap

**Symptom:** Preview URL 503/502; chat showed gateway offline after wake.  
**Cause:** Hermes systemd unit pointed at wrong service name on Dedalus.  
**Fix:** Dedicated `agent-hermes-gateway.service` + start script.  
**Files:** `web/lib/bootstrap/gateway-lifecycle.ts`, `web/lib/bootstrap/runner.ts`

### 3. Bootstrap completing before gateway reachable

**Symptom:** Bootstrap marked success while preview still 503.  
**Fix:** `waitForGatewayUrl()` polls `/v1/models` until 200.  
**Files:** `web/lib/bootstrap/runner.ts`

### 4. Gateway not restarted after sleep/wake

**Fix:** `ensureGatewayRunning()` on wake.  
**Files:** `web/lib/dashboard/active-machine.ts`, per-id wake routes

### 5. Logo crash on unknown marks

**Fix:** Defensive fallback in `web/components/Logo.tsx`

---

## Dashboard fleet UX (implemented)

### URL-scoped machine focus

When pathname matches `/dashboard/machines/[machineId]/*`, the dashboard treats **that** machine as in focus for status header polling, model/agent switchers, and AutoWake.

**Hook:** `web/lib/dashboard/use-scoped-machine-id.ts`  
**API:** `GET /api/dashboard/machine?machineId=` → `fetchMachineSummary(machineId)`

### Fleet split + interact

On `/dashboard/machines`:

- Click **Chat** on a card → `?focus=<machineId>` opens right-hand `FleetInteractPane` with embedded `ChatShell`
- **Open** still navigates to full machine workspace
- **Close** clears `focus` query param

### Bootstrap visibility

Each fleet card shows `BootstrapPhaseBadge` from `machine.bootstrapState`.

---

## Dashboard flow (how to use)

```
/dashboard/setup          → provision + bootstrap (wizard)
/dashboard/machines       → fleet board; Chat = split interact
/dashboard/machines?focus=  → same + embedded chat pane
/dashboard/machines/[id]    → machine hub
/dashboard/machines/[id]/chat → full-page chat for that machine
```

---

## Known gaps / follow-ups

1. Per-card live gateway latency (header only probes focused machine)
2. Chat empty deltas — verify model key on VM
3. Archive/destroy failed machine `dm-019e4e52-…`
4. Global `/dashboard/chat` still active-machine-only
5. Playwright E2E for fleet split + scoped header

---

## Files changed (dashboard fleet session)

| File | Change |
|------|--------|
| `web/lib/dashboard/use-scoped-machine-id.ts` | New — URL > activeMachineId |
| `web/lib/dashboard/active-machine.ts` | `fetchMachineSummary`, `wakeMachine` with optional id |
| `web/app/api/dashboard/machine/route.ts` | Honor `?machineId=` |
| `web/lib/dashboard/use-machine-control.ts` | Per-id wake/sleep endpoints |
| `web/components/dashboard/AutoWake.tsx` | Scoped auto-wake |
| `web/components/dashboard/StatusHeader.tsx` | Scoped gateway + switchers |
| `web/components/dashboard/MachinesPanel.tsx` | Split layout + `?focus=` |
| `web/components/dashboard/FleetInteractPane.tsx` | New — embedded chat |
| `web/components/dashboard/MachineFleetCard.tsx` | Chat button, bootstrap badge |
| `web/components/dashboard/BootstrapPhaseBadge.tsx` | New |
| `web/lib/bootstrap/gateway-lifecycle.ts` | Gateway systemd + health wait |
