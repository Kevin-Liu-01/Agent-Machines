# Agent Machines Web

Next.js public site + Clerk-gated **control plane**. **OpenRouter for agents and containers** — route runtime + substrate, provision specialist presets, supervise the fleet.

Five jobs:

1. **Marketing**: landing (dual-gear hero: runtime × substrate), capabilities, fleet demo, FAQ, architecture.
2. **Control plane**: setup, fleet, workers, memory bundles, registry, loadout, settings, usage, benchmarks.
3. **Browser Agent Console**: live PTY to agent CLIs over tmux-over-exec + SSE (see below).
4. **Gateway proxy**: optional HTTP chat via API routes; console is primary; bearers never `NEXT_PUBLIC_*`.
5. **Observation + scheduler**: Supabase metrics/usage, user crons, Vercel Cron tick every 5 minutes.

## Current status

- **Four substrates:** E2B, Sprites.dev, Dedalus Machines, Vercel Sandbox (`lib/providers/*`). Dedalus benchmarks best on boot/sleep; all four are first-class.
- **Four runtimes:** Hermes, OpenClaw, Claude Code, Codex CLI (`lib/agents.ts`).
- **Model routers:** Vercel AI Gateway first, OpenRouter second, then native Anthropic/OpenAI or other supported OpenAI-compatible gateways — credential gate before provision.
- **Registry:** 1,400+ installable items (MCP registry cache, skills.sh, npm, bundled loadout, Cursor plugins).
- **Workers + Memory:** presets and portable persona bundles; deploy onto any machine/substrate.
- **Metrics + crons:** Supabase persistence; `/api/internal/cron/tick` (see `vercel.json`) runs scheduled jobs and metrics collection.
- Harness counts are **registry-derived** — `lib/platform/harness.ts` (run `sync-skills` before release builds).

Canonical paths: `lib/platform/runtime.ts` ↔ `../src/lib/constants.ts`.

## Quick start

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev
```

Open <http://localhost:3210>.

For authenticated routes, configure Clerk:

```txt
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

Optional owner fallback env vars (legacy `HERMES_*` names still accepted):

```txt
DEDALUS_API_KEY=...
AGENT_MACHINE_ID=...
AGENT_API_URL=...
AGENT_API_KEY=...
AGENT_MODEL=anthropic/claude-sonnet-4-6
```

## Scripts

```bash
npm run dev          # sync skills, start Next on :3210
npm run build        # sync skills, build
npm run typecheck    # sync skills, tsc --noEmit
npm run sync-skills  # regenerate data/skills.json from ../knowledge/skills
```

## Public routes

| Route | Purpose |
|---|---|
| `/` | landing page with hero, capabilities, runtime visuals, loadout, skills, architecture |
| `/faq` | product FAQ backed by `lib/seo/config.ts` |
| `/terms` | terms of service |
| `/privacy` | privacy policy |
| `/sign-in` | Clerk sign-in |
| `/onboarding` | first-run flow |

## Dashboard routes

Sidebar groups: **Fleet** (overview, machines, workers, usage, benchmarks) · **Harness** (memory, skills, MCPs, cron, registry) · **System** (settings, setup).

| Route | Purpose |
|---|---|
| `/dashboard` | overview — fleet stats, activity, gateway strip |
| `/dashboard/setup` | credentials, runtime, substrate, spec, provision |
| `/dashboard/machines` | fleet cards, heatmaps, `?focus=` split chat |
| `/dashboard/machines/[machineId]` | detail, usage charts, metrics collect on load |
| `/dashboard/machines/[machineId]/terminal` | Browser Agent Console (interactive + one-shot) |
| `/dashboard/machines/[machineId]/chat` | gateway chat (scoped to machine) |
| `/dashboard/machines/[machineId]/agents` | runtime context for the machine |
| `/dashboard/workers` | deployable presets (runtime + router + Memory) |
| `/dashboard/memory` | Memory bundles — persona, rules, abilities |
| `/dashboard/registry` | search/install catalog (≠ loadout) |
| `/dashboard/loadout` | active stack on a machine |
| `/dashboard/skills` | synced SKILL.md library |
| `/dashboard/mcps` | MCP servers and tools |
| `/dashboard/cron` | scheduled jobs (server tick executes them) |
| `/dashboard/usage` | cost + utilization (requires Supabase) |
| `/dashboard/benchmarks` | cross-provider capability matrix |
| `/dashboard/settings` | per-user API keys and defaults |
| `/dashboard/sessions` | agent session DB inventory |
| `/dashboard/logs` | gateway log tail from `~/.agent-machines/logs/` |
| `/dashboard/cursor` | cursor-bridge run history |
| `/dashboard/artifacts` | machine artifact storage |

**Command palette** (`⌘K` / `Ctrl+K`): quick navigation across the above.

### Loadout vs registry

- **Loadout** — what is already wired on a machine (skills, MCPs, service routes, task routes).
- **Registry** — browse and add from external catalogs; changes apply on deploy/reload/sync.

## Browser Agent Console

Operate the real agent CLI (Codex, Claude Code, Hermes, OpenClaw) from a browser tab, on a remote worker, with no local terminal and no tunnel.

A serverless control plane cannot host a long-lived WebSocket PTY server (Vercel functions time out and have no sticky sessions), so the session is inverted onto the worker:

- **Session on the box:** a persistent `tmux` session (`amconsole`) with `pipe-pane` to `/tmp/am-console.log`.
- **Stateless control plane:** HTTP for input, SSE for output. No WebSocket, no tunnel on the console path.
- **Input:** `POST /api/dashboard/terminal/input` runs `tmux send-keys -H <hex>`.
- **Output:** `GET /api/dashboard/terminal/stream` streams an unbuffered `tail -f` of the pane log from a byte offset.
- **Attach:** `POST /api/dashboard/terminal/session` ensures tmux, returns a `capture-pane` snapshot + byte offset for instant first paint.
- **Resize:** `POST /api/dashboard/terminal/resize` runs `tmux resize-window`.

`exec` is the only substrate requirement, so the same UI works on E2B, Sprites, Vercel Sandbox, and Dedalus. Full write-up: [`docs/sandbox-terminal-gateway.md`](docs/sandbox-terminal-gateway.md) and [`../knowledge/BROWSER-AGENT-CONSOLE.md`](../knowledge/BROWSER-AGENT-CONSOLE.md).

## Data boundaries

- Clerk private metadata stores provider keys, Cursor key, gateway bearers, and full `UserConfig`.
- Clerk public metadata only exposes redacted setup and machine state.
- All agent state (runtime, app data, skills, sessions, crons, config) lives under `/home/machine/.agent-machines/`.
- The VM repo checkout lives at `/home/machine/agent-machines/` and is only used for reloads.

## Scheduler and metrics

- **Vercel Cron** (`vercel.json`): `GET /api/internal/cron/tick` every 5 minutes with `Authorization: Bearer $CRON_SECRET`.
- **Tick duties:** evaluate user cron definitions, exec on target machines, collect usage/activity metrics into Supabase.
- **On-demand:** `POST /api/dashboard/metrics/collect` and machine detail page trigger a collect pass.
- Without **Supabase** env vars, usage/benchmarks/activity panels stay empty (Clerk-only fallback).

## Important files

```txt
lib/platform/runtime.ts              canonical paths + loadout counts (sync with src/)
lib/platform/harness.ts              registry-derived harness stats + PRODUCT copy
app/page.tsx                         public landing (HeroBlock gears, StatsRow, loadout)
components/HeroBlock.tsx             dual-gear runtime × substrate hero
components/three/HeroOrbitScene.tsx  flat gear wheels + substrate core (WebGL)
app/api/chat/route.ts                SSE chat proxy (degrades to console when no gateway URL)
app/api/dashboard/*                  authenticated dashboard APIs
app/api/dashboard/terminal/*         Browser Agent Console
app/api/dashboard/registry/*         unified catalog search + add/remove
app/api/internal/cron/tick           scheduler + metrics
lib/dashboard/terminal-session.ts    tmux-over-exec
lib/dashboard/registry/*             catalog adapters (mcp-registry, skills-sh, npm, bundled)
lib/metrics/collector.ts             Supabase metrics + activity
components/dashboard/CommandPalette.tsx   ⌘K navigation
components/dashboard/RegistryBrowser.tsx  install catalog UI
components/dashboard/WorkersLibrary.tsx   worker presets
components/dashboard/MemoryLibrary.tsx    memory bundles
lib/dashboard/exec-stream.ts         capability-tiered exec streaming
lib/providers/stream-util.ts         bridgeExecStream
lib/bootstrap/runner.ts              browser bootstrap
lib/user-config/*                    Clerk-backed config (+ request-scoped cache)
lib/providers/*                      MachineProvider implementations
lib/dashboard/loadout.ts             service/task registry
lib/seo/config.ts                    site metadata and FAQ
public/llms.txt                      AI crawler summary
docs/README.md                       internal doc index
docs/sandbox-terminal-gateway.md     streaming + console spec
```

## Design notes

The UI uses the Reticle/Sigil system: visible rails, hairline borders, hatching, cross marks, Nacelle for UI text, Geist Mono for machine data, and Instrument Serif only for the wordmark. Keep public copy direct and operational.
