# agent-machines

> A persistent machine for your agent.

`agent-machines` gives each user a resumable Linux machine for agent work. The important object is the machine, not a browser tab and not a vendor memory blob. Chat records, artifacts, skills, cron state, sessions, runtime config, and working files live on `/home/machine` and survive sleep/wake cycles.

Live site: <https://www.agent-machines.dev>  
Source: <https://github.com/Kevin-Liu-01/agent-machines>

## Where the project is right now

- **Three live VM providers.** Dedalus Machines (microVM), E2B Sandbox, and Sprites.dev each implement `MachineProvider` with provision, exec, wake/sleep (where supported), and public URL exposure.
- **Four agent runtimes.** Hermes (default), OpenClaw, Claude Code, and Codex CLI. Hermes/OpenClaw expose OpenAI-compatible gateways; Claude/Codex use direct API keys.
- **Browser provisioning is live.** `/dashboard/setup` saves credentials, creates the machine, runs bootstrap phases, and stores gateway URL/key on the machine record. CLI deploy remains the live-fire debug path for Dedalus.
- **161 skills + MCP catalog.** `knowledge/skills/` and `knowledge/mcps/catalog.json` sync to `~/.agent-machines/` at deploy/reload. Dashboard loadout mirrors built-ins, 30+ MCP servers, and service routing.
- **Cursor is optional.** `cursor-bridge` registers when `CURSOR_API_KEY` is set. Playwright MCP registers on every Hermes machine.
- **Inference defaults to Dedalus** but supports Anthropic, OpenAI, OpenRouter, Google, Vercel AI Gateway, or any OpenAI-compatible endpoint.

## Architecture

```txt
you
  | browser / CLI / API
  v
Next.js dashboard -------------------- npm run deploy / chat / reload
  | Clerk UserConfig                                      |
  v                                                       v
MachineProvider ------------------------------ Dedalus Machines
  | provision / wake / sleep / exec
  v
/home/machine  (persistent volume)
  |
  |-- :8642 agent gateway        OpenAI-compatible /v1
  |-- ~/.agent-machines/         app data: chats, artifacts, indexes
  |-- ~/.agent-machines/         runtime root: skills, mcps, config, crons, sessions, logs
  |-- /home/machine/agent-machines/
  |     git checkout for reload-from-git.sh
  |
  |-- built-ins                  terminal, filesystem, browser, vision, cron
  |-- closed-loop CLIs           agent-browser, Playwright, curl, jq, httpx, sqlite3, ss, dig
  |-- service routes             Vercel, Stripe, Supabase, GitHub, Linear, Slack...
  |-- optional cursor-bridge     cursor_agent / cursor_resume
  |
  v
OpenAI-compatible model endpoint
  default: https://api.dedaluslabs.ai/v1
```

Path names that matter, because yes, the naming goblin is real:

- `/home/machine/.agent-machines/` is the unified runtime root (skills, config, mcps, logs, chats, artifacts).
- `/home/machine/.openclaw/` is OpenClaw runtime state when that agent is selected.
- `/home/machine/agent-machines/` is the git checkout for knowledge reloads.
- `/home/machine/.agent/` is machine-readable context, also exposed as `/.agent`.
- `/home/machine/.machine/logs/services/` is the stable service-log path, also exposed as `/.machine/logs/services`.
- This repo is the control plane. It is not the Hermes agent package.

## Quick start

```bash
git clone https://github.com/Kevin-Liu-01/agent-machines
cd agent-machines
cp .env.example .env
# set DEDALUS_API_KEY=dsk-live-...

npm install
npm run deploy
```

After bootstrap, the CLI prints:

```txt
API URL:        https://<tunnel-or-preview>/v1
API Key:        hp-<random>
Dashboard:      https://<tunnel-or-preview>
Machine ID:     dm-<id>

Quick chat:     npm run chat -- "Say hi in one sentence."
```

Install OpenClaw instead:

```bash
npm run deploy:openclaw
```

Optional Cursor delegation:

```bash
CURSOR_API_KEY=cursor-...
```

That enables the `cursor_agent` MCP tool. It is not required for the rest of the rig.

## CLI

```bash
npm run deploy             # provision/wake Dedalus and bootstrap Hermes
npm run deploy:openclaw    # install OpenClaw on a Dedalus machine
npm run chat -- "msg"      # streaming single-turn chat
npm run status             # machine phase, ports, API health
npm run logs               # tail gateway logs
npm run wake               # resume a sleeping machine
npm run sleep              # pause compute, preserve disk
npm run destroy -- --yes   # permanent delete
npm run shell              # print the dedalus ssh invocation
npm run reload             # re-upload knowledge/ into ~/.agent-machines
npm run reset              # clear Hermes sessions/state, preserve skills/crons/env
npm run doctor             # health check: machine phase, ports, MCP, skills, crons
npm run gc                 # destroy every machine on the org
```

Local CLI state is stored in `.machine-state.json` and is gitignored.

## Web app

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev
```

Open <http://localhost:3210>.

The public site lives at `/`. The authenticated dashboard lives under `/dashboard/*`.

Public pages:

| Route | Purpose |
|---|---|
| `/` | landing page, capabilities, live runtime visualization, loadout, skills, architecture |
| `/faq` | current product FAQ |
| `/terms` | terms of service |
| `/privacy` | privacy policy and data boundaries |
| `/sign-in` | Clerk sign-in |
| `/onboarding` | first-run guided flow |

Dashboard pages:

| Route | Purpose |
|---|---|
| `/dashboard` | overview cards and live machine status |
| `/dashboard/setup` | save provider keys, choose agent/provider/spec/model |
| `/dashboard/machines` | list machines, set active, save gateway URL/key, archive/destroy |
| `/dashboard/chat` | stream chat through the active machine gateway |
| `/dashboard/loadout` | complete tool/service/task registry |
| `/dashboard/skills` | bundled SKILL.md library |
| `/dashboard/mcps` | MCP server and tool catalog |
| `/dashboard/sessions` | Hermes SQLite session inventory |
| `/dashboard/logs` | live gateway log tail |
| `/dashboard/cursor` | cursor-bridge run history |
| `/dashboard/artifacts` | upload/list/download machine artifacts |

## Required environment

Root CLI:

| Var | Required | Purpose |
|---|---:|---|
| `DEDALUS_API_KEY` | yes | Dedalus Machines API key |
| `DEDALUS_BASE_URL` | no | Machines API base URL, defaults to `https://dcs.dedaluslabs.ai` |
| `DEDALUS_CHAT_BASE_URL` | no | OpenAI-compatible inference URL, defaults to `https://api.dedaluslabs.ai/v1` |
| `HERMES_MODEL` | no | model slug, defaults to `anthropic/claude-sonnet-4-6` |
| `HERMES_VCPU` | no | machine vCPU count |
| `HERMES_MEMORY_MIB` | no | machine memory |
| `HERMES_STORAGE_GIB` | no | machine disk |
| `CURSOR_API_KEY` | no | enables cursor-bridge delegation |
| `AGENT_MACHINES_REPO_URL` | no | override repo cloned onto the machine |
| `AGENT_MACHINES_REPO_BRANCH` | no | override repo branch for reloads |

Web app:

| Var | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | for auth | Clerk client key |
| `CLERK_SECRET_KEY` | for auth | Clerk server key |
| `DEDALUS_API_KEY` | optional | owner fallback provider key |
| `HERMES_MACHINE_ID` | optional | owner fallback active machine |
| `HERMES_API_URL` | optional | owner fallback gateway URL |
| `HERMES_API_KEY` | optional | owner fallback gateway bearer |
| `HERMES_MODEL` | optional | default model shown in setup |

## What ships into the machine

`knowledge/` is copied into `~/.agent-machines/` during deploy and reload.

```txt
knowledge/
  AGENTS.md
  SOUL.md
  USER.md
  MEMORY.md
  crons/seed.json
  mcps/catalog.json      MCP registry (core + bundled + ide tiers)
  skills/<name>/SKILL.md
```

The web build also syncs this library into `web/data/skills.json` so `/dashboard/skills` and the landing page can show the same source of truth.

## Tool surface

The loadout has three layers:

- **Built-ins:** 22 tools -- terminal, filesystem, search, browser, vision, image, TTS, Python execution, subagents, cron, skills, memory, session search.
- **MCP:** playwright + cursor-bridge (core); 26+ bundled SaaS/data servers when credentials exist (Vercel, Stripe, Supabase, Clerk, Firebase, Figma, PostHog, Sentry, Datadog, Linear, Slack, Neon, Upstash, Turso, Resend, Notion, Brave, Exa, Memory, Cloudflare, Grafana, GitHub, filesystem, fetch, git, sqlite). Catalog at `knowledge/mcps/catalog.json`.
- **Closed-loop CLIs:** agent-browser, playwright, @playwright/mcp, curl, jq, httpx, sqlite3, ss, dig, nc.
- **Skills:** 161 `SKILL.md` files loaded on demand.

Cursor-specific MCP tools:

| Tool | Purpose |
|---|---|
| `cursor_agent` | spawn a Cursor coding agent against a working directory |
| `cursor_resume` | continue a previous Cursor agent run |
| `cursor_list_skills` | list skills available for `.cursor/rules` injection |
| `cursor_models` | list Cursor models available to the configured key |

## Known constraints

- Browser bootstrap git-clones knowledge on first run; CLI `deploy` tarballs local `knowledge/` (includes uncommitted edits).
- cursor-bridge full build requires CLI deploy with local `mcp/cursor-bridge` upload; web bootstrap registers MCP when key exists but may need redeploy for bridge binary.
- Dedalus previews may require org hostname configuration. Fallback: Cloudflare quick tunnels.
- `hermes-agent` installs from GitHub, not PyPI.
- Hermes reads config on gateway start. Restart after config/MCP changes.
- MCP subprocesses need absolute node/npx paths under `/home/machine`.
- Root filesystem is small on Dedalus. Toolchains and caches must live under the persistent home volume.

## Repository layout

```txt
agent-machines/
  src/                     CLI commands and machine bootstrap
  knowledge/               skills, mcps catalog, memory, persona, cron seed
  mcp/cursor-bridge/       Node MCP server wrapping @cursor/sdk
  scripts/                 sync-from-wiki, knowledge manifest, machine gc
  web/                     Next.js public site and dashboard
```

## License

MIT.
