# Agent Machines Web

Next.js public site + Clerk-gated **control plane**. **OpenRouter for agents and containers** — route runtime + substrate, provision specialist presets, supervise the fleet.

Three jobs:

1. **Marketing** — landing, fleet demo, activity grid, FAQ, architecture (primitive-first copy).
2. **Control plane** — setup, fleet, chat, loadout, skills, MCPs, cron, sessions, logs, artifacts.
3. **Gateway proxy** — browser chat via API routes; machine bearers never become `NEXT_PUBLIC_*`.

## Current status

- **Three substrates:** E2B, Sprites.dev, Dedalus Machines (`MachineProvider`). Dedalus benchmarks best on boot/sleep in our harness; all three are first-class.
- **Four runtimes:** Hermes, OpenClaw, Claude Code, Codex CLI.
- `/dashboard/setup` — credentials, provision, browser bootstrap into `~/.agent-machines/`.
- Harness counts are **registry-derived** — `lib/platform/harness.ts` (not hard-coded).

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

| Route | Purpose |
|---|---|
| `/dashboard` | overview |
| `/dashboard/setup` | credentials, agent, provider, spec, review |
| `/dashboard/machines` | machine fleet, active machine, gateway credentials |
| `/dashboard/chat` | streaming chat through the active gateway |
| `/dashboard/loadout` | built-ins, service hierarchy, task hierarchy |
| `/dashboard/skills` | synced SKILL.md library |
| `/dashboard/mcps` | MCP servers and tools |
| `/dashboard/sessions` | agent session DB inventory |
| `/dashboard/logs` | gateway log tail from `~/.agent-machines/logs/` |
| `/dashboard/cursor` | cursor-bridge run history |
| `/dashboard/artifacts` | machine artifact storage |

## Data boundaries

- Clerk private metadata stores provider keys, Cursor key, gateway bearers, and full `UserConfig`.
- Clerk public metadata only exposes redacted setup and machine state.
- All agent state (runtime, app data, skills, sessions, crons, config) lives under `/home/machine/.agent-machines/`.
- The VM repo checkout lives at `/home/machine/agent-machines/` and is only used for reloads.

## Important files

```txt
lib/platform/runtime.ts              canonical paths + loadout counts (sync with src/)
app/page.tsx                         public landing
app/api/chat/route.ts                server-side SSE chat proxy
app/api/dashboard/*                  authenticated dashboard APIs
components/ArchitectureFlow.tsx      interactive architecture map
lib/bootstrap/runner.ts              browser bootstrap (mirrors src/lib/bootstrap.ts)
lib/user-config/*                    Clerk-backed user config
lib/providers/*                      MachineProvider implementations
lib/dashboard/loadout.ts             tool/service/task registry
lib/seo/config.ts                    site metadata and FAQ source
public/llms.txt                      AI crawler summary (keep aligned with seo/config)
```

## Design notes

The UI uses the Reticle/Sigil system: visible rails, hairline borders, hatching, cross marks, Nacelle for UI text, Geist Mono for machine data, and Instrument Serif only for the wordmark. Keep public copy direct and operational.
