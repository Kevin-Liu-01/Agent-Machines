<p align="center">
  <a href="https://www.agent-machines.dev">
    <img src="web/public/brand/agent-machines-mark.svg" alt="Agent Machines" width="96" />
  </a>
</p>

# agent-machines

> **OpenRouter for agents and containers.**

Agent Machines is the **product layer** above sandboxes — a control plane that deploys a **persistent agent worker** in one unit: runtime, skills, MCP, integrations, cron, observation, and fleet management — on any substrate.

Live site: <https://www.agent-machines.dev>  
Source: <https://github.com/Kevin-Liu-01/agent-machines>

## What it is

**OpenRouter for agents and containers.** One account to route **which agent runtime** (Hermes, OpenClaw, Claude Code, Codex) and **which substrate** (E2B, Sprites.dev, Dedalus Machines) — then get a full persistent worker, not a bare sandbox.

**Vercel on AWS** for substrates: we are the product layer; providers are interchangeable infrastructure underneath. People don't want an empty box — they want a worker that audits code, runs on a schedule, and accumulates skills. Dedalus currently benchmarks best on boot latency and sleep/wake among our providers (strong default, **not the product**). Building sandboxes is hard; we **route** instead of rebuilding infra.

## Specialist fleet

Design agent, news agent, code agent — spin each up from **opinionated presets** (Hermes, OpenClaw, etc.). Named vendor SKUs (e.g. Anthropic design modes) are the same recipe: **UI + skills + MCPs + system prompts**. Here you provision each specialist in **one click** and **supervise the fleet** from one dashboard: activity, chat, cron, logs, cost.

## Where the project is right now

- **Three live substrates.** E2B, Sprites.dev, Dedalus Machines — each implements `MachineProvider`. Dedalus leads our harness on boot (~250ms) and sleep/wake; all three are first-class.
- **Four agent runtimes.** Hermes, OpenClaw, Claude Code, Codex CLI.
- **Browser provisioning.** `/dashboard/setup` — credentials, agent, provider, spec, model, provision.
- **161 skills + MCP catalog.** Registry-driven loadout; syncs to `~/.agent-machines/` on deploy/reload.
- **Optional Cursor bridge.** Playwright MCP on every Hermes machine by default.

## Architecture

```txt
you
  | browser / CLI / API
  v
Next.js control plane ---------------- npm run deploy / chat / reload
  | Clerk UserConfig                                      |
  v                                                       v
MachineProvider ---------------------- E2B | Sprites | Dedalus
  | provision / wake / sleep / exec
  v
/home/machine  (persistent volume)
  |
  |-- :8642 agent gateway
  |-- ~/.agent-machines/         skills, mcps, chats, crons, sessions
  |-- /home/machine/agent-machines/   git checkout for reload
  v
OpenAI-compatible model endpoint (configurable)
```

This repo is the **control plane**, not the Hermes agent package.

## Quick start

```bash
git clone https://github.com/Kevin-Liu-01/agent-machines
cd agent-machines
cp .env.example .env
npm install
npm run deploy   # CLI path; or use /dashboard/setup for any provider
```

## CLI

```bash
npm run deploy             # provision + bootstrap Hermes
npm run deploy:openclaw
npm run chat -- "msg"
npm run status / logs / wake / sleep / destroy -- --yes
npm run reload / doctor
```

## Web app

```bash
cd web && cp .env.local.example .env.local && npm install && npm run dev
```

Open <http://localhost:3210>.

| Route | Purpose |
|---|---|
| `/` | landing — fleet demo, activity, loadout, architecture |
| `/dashboard/setup` | route runtime + substrate, provision |
| `/dashboard/machines` | fleet supervision |
| `/dashboard/chat` | active gateway chat |
| `/dashboard/loadout` | skills, MCP, service routes |

## Repository layout

```txt
agent-machines/
  src/           CLI + bootstrap
  knowledge/     skills, mcps, VISION.md, AGENTS.md
  mcp/           cursor-bridge
  web/           Next.js site + dashboard
```

## License

MIT.
