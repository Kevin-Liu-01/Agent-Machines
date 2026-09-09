# Agent Machines Web

Next.js public site + Clerk-gated **Worker system**. The Worker is durable; runtime, model, sandbox, tools, transport, persistence, and placement are replaceable machinery beneath it. Users can take a specialist off the shelf or assemble one from modular primitives, then supervise its state and evidence from one control plane.

Five jobs:

1. **Marketing**: durable-Worker thesis, route/compose/access layers, specialist catalog, capabilities, fleet demo, FAQ, architecture.
2. **Control plane**: off-the-shelf Workers, modular launch, setup, fleet, memory bundles, registry, loadout, settings, usage, benchmarks.
3. **Browser Agent Console**: direct worker WebSocket PTY with native/SSE fallbacks (see below).
4. **Gateway proxy**: optional HTTP chat via API routes; console is primary; bearers never `NEXT_PUBLIC_*`.
5. **Observation + scheduler**: Supabase metrics/usage, user crons, Vercel Cron tick every 5 minutes.

## Current status

- **Four substrate adapters:** E2B, Sprites.dev, Dedalus Machines, Vercel Sandbox (`lib/providers/*`). The latest strict proof is live-green on E2B, Sprites, and Vercel; Dedalus is adapter-complete and currently blocked by a disclosed upstream vendor incident.
- **Four runtimes:** Hermes, OpenClaw, Claude Code, Codex CLI (`lib/agents.ts`).
- **Model routers:** Vercel AI Gateway first, OpenRouter second, then native Anthropic/OpenAI or other supported OpenAI-compatible gateways — credential gate before provision.
- **Registry:** 2,595 installable items in the 2026-08-14 production audit (MCP registry cache, skills.sh, npm, bundled loadout, Cursor plugins).
- **Workers + Memory:** presets and portable persona bundles; deploy onto any machine/substrate.
- **Metrics + crons:** Supabase persistence; `/api/internal/cron/tick` (see `vercel.json`) runs scheduled jobs and metrics collection.
- Harness counts are **registry-derived** — `lib/platform/harness.ts` (run `sync-skills` before release builds).

Canonical paths: `lib/platform/runtime.ts` ↔ `../src/lib/constants.ts`.

## Quick start

From the repository root, using Node `^20.19` or `>=22.12` and pnpm 10.30.0:

```bash
corepack enable
pnpm install --frozen-lockfile
cp web/.env.local.example web/.env.local
pnpm web
```

Open <http://localhost:3210>.

For authenticated routes, configure Clerk:

```txt
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

For a local preview, the example enables `ALLOW_DEV_AUTH=1`, which works only
under `next dev`. Set it to `0` and configure Clerk when testing actual sign-up.
Supabase with all [`supabase/migrations`](supabase/migrations) applied is required
for the hosted operation journal and durable metrics. The local development
session uses a file-backed configuration store.

Hosted users connect their own model and sandbox credentials in Settings.
Deployment env credentials are available only to the owner identified by an
exact `AGENT_MACHINES_OWNER_USER_ID` (legacy alias: `CLERK_OWNER_USER_ID`), plus
the opt-in local dev session. Leaving that ID unset does not share deployment
keys with new accounts. Supported owner defaults include:

```txt
AGENT_MACHINES_OWNER_USER_ID=user_...
E2B_API_KEY=...
SPRITES_TOKEN=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

Use the full [.env.local.example](.env.local.example) for Vercel Sandbox,
router, scheduler, and optional existing-machine settings. Dedalus is a sandbox
adapter; its model API gateway is no longer supported.

## Scripts

```bash
pnpm --dir web dev               # compile SDK; prepare catalogs; Next on :3210
pnpm --dir web build             # compile SDK; prepare local catalogs; Next build
pnpm --dir web typecheck         # compile SDK; prepare catalogs; tsc --noEmit
pnpm --dir web test              # compile SDK; dashboard unit and route tests
pnpm --dir web sync-data         # regenerate committed web/data from knowledge/
pnpm --dir web refresh-catalog   # explicit remote Cursor marketplace refresh
pnpm check                      # full repository release check
```

Run these from the repository root. Builds and typechecks never fetch marketplace
data; refresh it explicitly and review the resulting snapshot before committing.
See the [launch procedure](../docs/LAUNCH.md) for deployment and new-account proof.

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

A bounded WebSocket Function cannot own durable shell state, so the session is inverted onto the worker and the data plane is tiered:

- **Session on the box:** a persistent `tmux` session (`amconsole`) with `pipe-pane` to `/tmp/am-console.log`.
- **Direct fast path:** `POST /api/dashboard/terminal/direct` launches an origin-locked, ephemeral worker WebSocket attached to `amconsole`; the browser keeps one primary and five failover lanes open, and input IDs make the 12ms retry exactly-once at tmux.
- **Native fallback:** `GET /api/dashboard/terminal/socket` pins an authenticated Vercel WebSocket Function to one provider PTY when direct ingress is unavailable.
- **Portable fallback:** `POST /api/dashboard/terminal/input` runs `tmux send-keys -H <hex>` and `GET /api/dashboard/terminal/stream` tails the pane log over SSE.
- **Attach:** `POST /api/dashboard/terminal/session` ensures tmux, returns a `capture-pane` snapshot + byte offset for instant first paint.
- **Resize:** `POST /api/dashboard/terminal/resize` runs `tmux resize-window`.

`exec` remains the only portability requirement, so the same UI works on E2B, Sprites, Vercel Sandbox, and Dedalus. Production proof (2026-08-14): E2B delivered a 41ms latest acknowledgement and 89ms p95 across 20 human inputs. A location-aware Sprite Service measured 10.8ms p50 across 100 paced inputs, but provider-proxy outliers raised p95 to 75.6ms. The 50ms badge is a target and breach detector, not a false hard guarantee. Full write-up: [`docs/sandbox-terminal-gateway.md`](docs/sandbox-terminal-gateway.md) and [`../knowledge/BROWSER-AGENT-CONSOLE.md`](../knowledge/BROWSER-AGENT-CONSOLE.md).

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
