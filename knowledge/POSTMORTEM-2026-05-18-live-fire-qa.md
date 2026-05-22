# Postmortem: Live-Fire QA Session — 2026-05-18

## Summary

First comprehensive live-fire QA session against the Agent Machines web dashboard and multi-machine infrastructure. Discovered and fixed 6 categories of bugs spanning typography, routing, auth gating, agent labeling, accessibility, and API response handling. Two systemic issues remain open: machine quota visibility and dpkg lock contention on fresh VMs.

## Timeline

| Time  | Event |
|-------|-------|
| 00:00 | Session start — full walkthrough of dashboard, per-machine pages, settings |
| 00:15 | Typography audit — found 48+ misuses of `font-mono` on body text |
| 00:30 | Per-machine routing bug discovered — commands routing to wrong machine |
| 00:50 | Dedalus-only credential gates blocking Sprites/E2B providers |
| 01:10 | Agent label hardcoding found across chat and metrics |
| 01:30 | Quota exhaustion hit — 4 invisible machines consuming slots |
| 01:45 | Gateway bootstrap failure traced to dpkg lock on fresh VMs |
| 02:00 | Accessibility and response.ok fixes |
| 02:30 | All code fixes applied, session wrap |

## Root Causes

### 1. Typography: mono where sans belongs

`OnboardingFlow` and 20+ component files used `font-mono` on descriptions, taglines, hints, and body text. The design system uses Nacelle (sans) for readable text and mono only for code/IDs. Text arrows used `{"->"}` / `{"<-"}` instead of Unicode `→` / `←`.

**Why:** Early scaffolding copy-pasted a mono-heavy pattern without updating when the type system was established.

### 2. Per-machine routing always hit the active machine

All 7 API routes (`logs`, `sessions`, `cursor`, `exec`, `chats`, `artifacts`, `gateway`) called `activeMachine(config)` to resolve the target, ignoring the `machineId` in the request URL. Visiting `/dashboard/machines/<B>/terminal` while machine A was active routed exec commands to machine A.

**Why:** The multi-machine URL scheme was added after the single-machine API routes were built. The routes were never refactored to read `machineId` from the URL.

### 3. Dedalus-specific credential gates

`logs`, `sessions`, and `cursor` API routes checked `config.providers.dedalus?.apiKey` before proceeding. This blocked Sprites and E2B users even when their machine was running and healthy.

**Why:** Auth was added during the Dedalus-only era and never generalized when the provider abstraction was introduced.

### 4. Agent label hardcoding

Per-machine and fleet-level chat pages hardcoded agent labels to `"openclaw"` or `"hermes"`, missing `"claude-code"` and `"codex"`. `MetricsChartPanel` agent breakdown only recognized 2 sources.

**Why:** Agent kinds were expanded without updating all UI consumers. No central `AGENT_LABEL` map existed.

### 5. Machine quota exhaustion (invisible machines)

Dedalus account hit 5/5 machine quota. 4 machines were sleeping/orphaned but still counted. The dashboard had no visibility into quota usage.

**Why:** No GC or quota display in the web UI. Orphaned machines from failed bootstrap runs were never cleaned up.

### 6. Gateway bootstrap failure on fresh VMs

`unattended-upgrades` holds the dpkg lock for 30–60s on fresh Dedalus VMs. The `system-deps` phase runs `apt-get install` immediately, which fails when the lock is held. The gateway never starts because system deps weren't installed.

**Why:** No lock-wait loop before apt-get commands. The CLI bootstrap ran on already-warm machines so this was never hit until fresh-VM provisioning via the web.

## Fixes Applied

### Typography (20+ files)
- Replaced `font-mono` with `font-sans` on all body text, descriptions, taglines, hints
- Replaced `{"->"}` / `{"<-"}` with `→` / `←` across all components

### Per-machine routing (7 API routes + 2 lib functions)
- Plumbed optional `machineId` parameter through `execOnMachine`, `isMachineRunning`, `withActiveMachine`, `resolveGatewayForUser`
- All routes now read machineId from the request URL and fall back to active machine only when absent

### Dedalus credential gates (3 API routes)
- Removed `config.providers.dedalus?.apiKey` checks
- Replaced with provider-agnostic `isMachineRunning(machineId)` 

### Agent labels (3 components)
- Created `AGENT_LABEL` map with all 4 agent kinds
- Updated chat pages and MetricsChartPanel to use `Set` of all known agents

### API response handling (2 components)
- `AgentConsole` gateway probe now checks `response.ok`
- `ChatShell` chats list fetch now checks `response.ok`

### Empty-state routing (per-machine pages)
- Links now point to per-machine pages instead of fleet-level

### Accessibility (2 components)
- Machine card `Space` key handler added
- Registry search input `aria-label` added

### React import (1 file)
- `skills/[slug]` page: added explicit `React` import for `React.ReactNode`

## Recommendations

1. **Add quota indicator to dashboard UI** — show current/max machine count in fleet overview so users can see capacity before hitting the wall.

2. **Add dpkg lock wait to bootstrap** — wrap apt-get commands with a lock-wait loop (up to 60s) so fresh-VM bootstrap survives `unattended-upgrades`.

3. **Run `npm run gc` on a schedule** — or add a "destroy orphaned machines" button to the dashboard.

4. **Centralize agent kind constants** — single source of truth for agent kinds, labels, and capabilities so new agents can't be forgotten in UI code.

5. **Add integration test for per-machine routing** — verify that `/machines/<B>/exec` actually targets machine B, not the globally active machine.

6. **Gateway log rotation** — logs grow unbounded; add logrotate or size cap.

## Successful Live-Fire Bootstrap (3:08 AM)

- Destroyed 2 stale machines (hermes-qa with SNAPSHOT_LAUNCH_GUEST_RUNTIME_TIMEOUT, openclaw-qa sleeping) via `npm run gc`
- Went through the full 6-step onboarding flow in the browser
- Selected Hermes agent, all 161 skills, all 30 MCP servers, all 23 built-in tools, Dedalus provider
- Clicked "Boot rig →" which triggered:
  1. Machine provisioned on Dedalus (machine ID: dm-019e39e7-3d1b-7a85-a772-475990a3bda1)
  2. Bootstrap ran with dpkg lock wait (the fix in runner.ts)
  3. Gateway started on :8642 and was exposed via Dedalus preview URL
  4. Onboarding redirected to /dashboard with "Agent gateway ready"
- Total bootstrap time: ~151 seconds (2.5 minutes)
- Dashboard shows: hermes-dedalus-2026-05-18, active, ready, 161 skills, 30 MCPs, 244 tools
