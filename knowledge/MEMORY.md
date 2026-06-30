# Memory

## Product (read VISION.md)

Agent Machines = **OpenRouter for agents and containers** — control plane for persistent agent workers (runtime + skills + MCP + cron + observation + fleet). Not Hermes. Not a bare sandbox.

**Browser Agent Console (May 2026):** Deploy → bootstrap → live interactive CLI in the browser (Codex, Claude Code, Hermes, OpenClaw) via tmux-over-exec + SSE — no local terminal, no mandatory tunnel. Full narrative: `knowledge/BROWSER-AGENT-CONSOLE.md`.

Two audiences: humans (dashboard) → agents (MCP/CLI orchestration endgame).

## Environment

- I run on an **Agent Machine** — persistent Linux. Dedalus: `/home/machine`; E2B: `/home/user`; Sprites: `/home/sprite`.
- **Runtime root:** `~/.agent-machines` — skills, config, mcps, crons, sessions, logs, chats, artifacts.
- **Providers:** Dedalus Machines, E2B Sandbox, Sprites.dev, Vercel Sandbox (four `MachineProvider` lanes).
- **Agent runtimes:** Hermes, OpenClaw, Claude Code, Codex CLI (native tool sets differ per runtime).
- **Inference:** OpenAI-compatible `/v1`; default priority is Vercel AI Gateway, then OpenRouter, then configured fallbacks such as native keys or custom gateways. Configurable per machine via `model.base_url`.
- **Gateway:** `:8642` (Hermes) or `:18789` (OpenClaw). Bearer: `API_SERVER_KEY` in `~/.agent-machines/.env`.
- **Control plane:** agent-machines.dev dashboard + CLI + (future) Agent Machines MCP server.
- **Dashboard (May 2026):** Workers (presets), Memory bundles, Registry (1,400+ install catalog), Usage/metrics (Supabase), cron tick via `/api/internal/cron/tick` every 5 min on Vercel.

## Harness (registry-driven — not one static tool count)

Aligned with wiki `tool-hierarchy.mdc`:

1. **Skills** — `~/.agent-machines/skills/<name>/SKILL.md` from `knowledge/skills/`
2. **Service routes** — MCP → CLI → plugin/personal skill per vendor (dashboard loadout)
3. **MCP servers** — `~/.agent-machines/mcps/catalog.json` → `config.yaml` mcp_servers
4. **CLIs** — agent-browser, Playwright, gh, curl, httpx, jq, sqlite3, ss, dig, nc, …
5. **Agent-native tools** — vary by runtime (Hermes richest: terminal, fs, browser, vision, cron, memory, delegate, …)
6. **Task routes** — browser automation, QA, security, design review, research, SEO, …

## MCP

**Core:** playwright, cursor-bridge (when `CURSOR_API_KEY`).

**Bundled (credential-gated):** Vercel, Stripe, Supabase, Clerk, Firebase, Figma, PostHog, Sentry, Datadog, Linear, Slack, GitHub, Cloudflare, AWS, Shopify, ClickHouse, and more in catalog.

## Conventions I follow

- ASCII over Unicode lookalikes; no emoji in code/docs/commits.
- Conventional Commits; `git switch`; production infra is sacred.

## Reload

`~/.agent-machines/scripts/reload-from-git.sh` — git-pulls `agent-machines` repo, syncs knowledge.

## Cron

Pre-seeded from `knowledge/crons/seed.json`.

Logs: `~/.agent-machines/logs/`. Docs: `/.agent/docs/agent-context.md`.
