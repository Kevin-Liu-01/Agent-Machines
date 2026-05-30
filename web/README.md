# Agent Machines Web

Next.js public site + Clerk-gated **control plane**. **OpenRouter for agents and containers** — route runtime + substrate, provision specialist presets, supervise the fleet.

Four jobs:

1. **Marketing**: landing, fleet demo, activity grid, FAQ, architecture (primitive-first copy).
2. **Control plane**: setup, fleet, chat, loadout, skills, MCPs, cron, sessions, logs, artifacts.
3. **Browser Agent Console**: a live PTY to the agent CLI over tmux-over-exec + SSE (see below).
4. **Gateway proxy**: browser chat via API routes; machine bearers never become `NEXT_PUBLIC_*`.

## Current status

- **Four substrates:** E2B, Sprites.dev, Dedalus Machines, and Vercel Sandbox (`MachineProvider`). Dedalus benchmarks best on boot/sleep in our harness; all four are first-class.
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
| `/dashboard/machines/[machineId]/terminal` | Browser Agent Console: interactive PTY + one-shot exec |
| `/dashboard/chat` | streaming chat through the active gateway |
| `/dashboard/loadout` | built-ins, service hierarchy, task hierarchy |
| `/dashboard/skills` | synced SKILL.md library |
| `/dashboard/mcps` | MCP servers and tools |
| `/dashboard/sessions` | agent session DB inventory |
| `/dashboard/logs` | gateway log tail from `~/.agent-machines/logs/` |
| `/dashboard/cursor` | cursor-bridge run history |
| `/dashboard/artifacts` | machine artifact storage |

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

## Important files

```txt
lib/platform/runtime.ts              canonical paths + loadout counts (sync with src/)
app/page.tsx                         public landing
app/api/chat/route.ts                server-side SSE chat proxy (degrades to console when no gateway URL)
app/api/dashboard/*                  authenticated dashboard APIs
app/api/dashboard/terminal/*         Browser Agent Console: session, input, resize, stream
lib/dashboard/terminal-session.ts    tmux-over-exec session commands + streamConsoleOutput
components/dashboard/InteractiveConsole.tsx   xterm.js client (snapshot paint, batched writes)
lib/dashboard/exec-stream.ts         capability-tiered exec streaming engine
lib/providers/stream-util.ts         bridgeExecStream callback-to-generator adapter
components/ArchitectureFlow.tsx      interactive architecture map
lib/bootstrap/runner.ts              browser bootstrap (mirrors src/lib/bootstrap.ts)
lib/user-config/*                    Clerk-backed user config (+ request-scoped cache)
lib/providers/*                      MachineProvider implementations
lib/dashboard/loadout.ts             tool/service/task registry
lib/seo/config.ts                    site metadata and FAQ source
public/llms.txt                      AI crawler summary (keep aligned with seo/config)
```

## Design notes

The UI uses the Reticle/Sigil system: visible rails, hairline borders, hatching, cross marks, Nacelle for UI text, Geist Mono for machine data, and Instrument Serif only for the wordmark. Keep public copy direct and operational.
