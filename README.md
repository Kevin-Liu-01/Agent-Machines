# agent-machines

> A persistent machine for your agent.

`agent-machines` gives each user a resumable Linux machine for agent work. The important object is the machine, not a browser tab and not a vendor memory blob. Chat records, artifacts, skills, cron state, sessions, runtime config, and working files live on `/home/machine` and survive sleep/wake cycles.

Live site: <https://www.agent-machines.dev>  
Source: <https://github.com/Kevin-Liu-01/agent-machines>

## Where the project is right now

- **Dedalus Machines is the live provider.** The CLI can provision/wake/sleep/destroy a Dedalus microVM, bootstrap Hermes, expose the gateway, and reload skills.
- **Vercel Sandbox and Fly are shaped, not live.** They exist in `MachineProvider`, Clerk user config, setup UI, and machine records. Their provider classes currently return explicit `not_supported` errors.
- **Hermes and OpenClaw are the agent choices.** Hermes is the default runtime for memory, cron, sessions, MCP, skills, and the gateway. `npm run deploy:openclaw` installs OpenClaw on a Dedalus machine.
- **Cursor is optional.** `cursor-bridge` is one MCP server for code delegation through `@cursor/sdk`. Without `CURSOR_API_KEY`, the machine still has chat, files, browser automation, tools, skills, cron, logs, artifacts, and provider lifecycle controls.
- **The dashboard is multi-machine.** Clerk private metadata stores provider credentials, machine refs, the active machine id, model choice, and optional Cursor key. Users can keep multiple machines and switch the active one.
- **Browser provisioning creates and bootstraps the Dedalus agent machine.** `/dashboard/setup` can save credentials, create the provider machine, run browser bootstrap, and save the generated gateway URL/key back to the machine record. The CLI deploy path remains useful for local live-fire debugging.
- **Inference defaults to Dedalus, but the gateway is OpenAI-compatible.** The CLI uses `DEDALUS_CHAT_BASE_URL` with `https://api.dedaluslabs.ai/v1` as the default.

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
  |-- ~/.hermes/                 Hermes runtime: skills, crons, sessions, logs
  |-- ~/.openclaw/               OpenClaw runtime when installed
  |-- /home/machine/hermes-machines/
  |     git checkout used by reload-from-git.sh
  |
  |-- built-ins                  terminal, filesystem, browser, vision, cron
  |-- service routes             Vercel, Stripe, Supabase, GitHub, Linear, Slack...
  |-- optional cursor-bridge     cursor_agent / cursor_resume
  |
  v
OpenAI-compatible model endpoint
  default: https://api.dedaluslabs.ai/v1
```

Path names that matter, because yes, the naming goblin is real:

- `/home/machine/.agent-machines/` is product data owned by this app.
- `/home/machine/.hermes/` is Hermes runtime state.
- `/home/machine/.openclaw/` is OpenClaw runtime state.
- `/home/machine/hermes-machines/` is the git checkout used for knowledge reloads.
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
npm run reload             # re-upload knowledge/ into ~/.hermes
npm run reset              # clear Hermes sessions/state, preserve skills/crons/env
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

`knowledge/` is copied into `~/.hermes/` during deploy and reload.

```txt
knowledge/
  AGENTS.md
  SOUL.md
  USER.md
  MEMORY.md
  crons/seed.json
  skills/<name>/SKILL.md
```

The web build also syncs this library into `web/data/skills.json` so `/dashboard/skills` and the landing page can show the same source of truth.

## Tool surface

The loadout has three layers:

- **Built-ins:** terminal, filesystem, search, browser automation, screenshots, vision, image generation, TTS, Python execution, subagent delegation, cron, skills, memory, and session search.
- **MCP/services:** cursor-bridge plus service routes for Vercel, Stripe, Supabase, Clerk, Firebase, Figma, PostHog, Sentry, Datadog, Linear, Slack, Shopify, ClickHouse, GitHub, AWS, Cloudflare, browser automation, and model providers.
- **Skills:** 95 `SKILL.md` files loaded by intent for behavior, workflows, reviews, design, security, provider usage, and automation.

Cursor-specific MCP tools:

| Tool | Purpose |
|---|---|
| `cursor_agent` | spawn a Cursor coding agent against a working directory |
| `cursor_resume` | continue a previous Cursor agent run |
| `cursor_list_skills` | list skills available for `.cursor/rules` injection |
| `cursor_models` | list Cursor models available to the configured key |

## Known constraints

- Browser-driven agent bootstrap is wired for Dedalus Machines. Use the CLI only when you need a lower-level live-fire install/debug path.
- Dedalus is the only live provider implementation today.
- Vercel Sandbox and Fly are schema/UI/provider stubs.
- Dedalus previews may require org hostname configuration. The CLI falls back to Cloudflare quick tunnels.
- `hermes-agent` is installed from GitHub, not PyPI.
- Hermes reads config on gateway start. Restart the gateway after config changes.
- The MCP subprocess needs an absolute Node path on the VM.
- The root filesystem is small. Toolchains and caches must live under `/home/machine`.

## Repository layout

```txt
agent-machines/
  src/                     CLI commands and machine bootstrap
  knowledge/               skills, memory, persona, cron seed
  mcp/cursor-bridge/       Node MCP server wrapping @cursor/sdk
  web/                     Next.js public site and dashboard
```

## License

MIT.
