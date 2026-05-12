# Agent Machines Web

Next.js 15 + Tailwind v4 public site and Clerk-gated dashboard for `agent-machines`.

The web app does three jobs:

- Public marketing/docs: landing page, architecture map, FAQ, terms, privacy.
- Authenticated control plane: setup, machines, chat, loadout, skills, MCPs, sessions, logs, Cursor runs, artifacts.
- Server-side gateway proxy: browser chat calls go through API routes so machine bearers never become `NEXT_PUBLIC_*` values.

## Current status

- Dedalus Machines is the only provider wired end-to-end today.
- Vercel Sandbox and Fly Machines exist in the provider contract and settings UI, but setup keeps them disabled until their provisioners are production-ready.
- `/dashboard/setup` stores provider credentials, creates a Dedalus machine, and runs browser bootstrap.
- Browser-driven agent bootstrap is wired for Dedalus Machines: setup creates the machine, installs Hermes/OpenClaw, starts the gateway, and saves the gateway URL/key.
- Cursor is optional. `cursor-bridge` only activates when a Cursor API key is present.

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

Optional owner fallback env vars:

```txt
DEDALUS_API_KEY=...
HERMES_MACHINE_ID=...
HERMES_API_URL=...
HERMES_API_KEY=...
HERMES_MODEL=anthropic/claude-sonnet-4-6
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
| `/dashboard/sessions` | Hermes session DB inventory |
| `/dashboard/logs` | gateway log tail |
| `/dashboard/cursor` | cursor-bridge run history |
| `/dashboard/artifacts` | machine artifact storage |

## Data boundaries

- Clerk private metadata stores provider keys, Cursor key, gateway bearers, and full `UserConfig`.
- Clerk public metadata only exposes redacted setup and machine state.
- All agent state (runtime, app data, skills, sessions, crons, config) lives under `/home/machine/.agent-machines/`.
- The VM repo checkout lives at `/home/machine/agent-machines/` and is only used for reloads.

## Important files

```txt
app/page.tsx                         public landing
app/faq/page.tsx                     FAQ page
app/terms/page.tsx                   terms page
app/privacy/page.tsx                 privacy page
app/api/chat/route.ts                server-side SSE chat proxy
app/api/dashboard/*                  authenticated dashboard APIs
components/ArchitectureFlow.tsx      interactive architecture map
components/PublicDocPage.tsx         shared public docs shell
components/dashboard/*               dashboard panels
lib/user-config/*                    Clerk-backed user config
lib/providers/*                      MachineProvider implementations
lib/dashboard/loadout.ts             tool/service/task registry
lib/seo/config.ts                    site metadata and FAQ source
```

## Design notes

The UI uses the Reticle/Sigil system: visible rails, hairline borders, hatching, cross marks, Nacelle for UI text, Geist Mono for machine data, and Instrument Serif only for the wordmark. Keep public copy direct and operational. If a provider is shaped but not wired, say that plainly.
