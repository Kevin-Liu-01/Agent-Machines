---
name: dedalus-machines
description: "How Agent Machines work -- providers (Dedalus, E2B, Sprites), agent runtimes (Hermes, OpenClaw, Claude Code, Codex), MCP catalog, bootstrap, and closed-loop verification. Use when asked about the runtime, scaling, sleep/wake, destroy, or inspecting this environment."
version: 2.1.0
author: Kevin Liu
license: MIT
metadata:
  agent-machines:
    tags: [agent-machines, dedalus, e2b, sprites, dcs, runtime, infra, mcp]
---

# Agent Machines Runtime

Persistent Linux rig provisioned by the Agent Machines control plane. **Runtime root: `~/.agent-machines`** (not `~/.hermes`).

## Providers

| Provider | Home path | Notes |
|----------|-----------|-------|
| **dedalus** | `/home/machine` | Firecracker microVM, sleep/wake |
| **e2b** | `/home/user` | Sandbox, public URL per port |
| **sprites** | `/home/sprite` | Sprites.dev compute |

## Agent runtimes (pick one per machine)

| Kind | Gateway | State | Role |
|------|---------|-------|------|
| **hermes** | :8642 | `~/.agent-machines` | Default: memory, cron, MCP, skills |
| **openclaw** | :18789 | `~/.openclaw` | Computer-use runtime |
| **claude-code** | n/a | `~/.claude` | Anthropic API |
| **codex** | n/a | `~/.codex` | OpenAI API |

When Hermes is the runtime, `HERMES_HOME=~/.agent-machines`.

## Layout

```
/home/machine/
├── .agent-machines/       # CANONICAL runtime root
│   ├── skills/            # 161 SKILL.md files
│   ├── mcps/catalog.json
│   ├── config.yaml        # mcp_servers, model
│   ├── scripts/reload-from-git.sh
│   └── logs/
├── .openclaw/             # when OpenClaw runtime selected
├── agent-machines/        # git checkout for Reload
├── cursor-bridge/         # optional MCP build
└── .cache/ms-playwright/
```

Legacy `~/.hermes` is symlinked to `~/.agent-machines` after migration.

## Tools

- **22 built-ins** (terminal, files, browser, search, vision, cron, memory, ...)
- **MCP core:** playwright, cursor-bridge
- **MCP bundled:** see `~/.agent-machines/mcps/catalog.json`
- **CLIs:** agent-browser, playwright, httpx, curl, jq, sqlite3

## Reload

```bash
~/.agent-machines/scripts/reload-from-git.sh
```

## Inspect this VM

1. `/.agent/docs/agent-context.md`
2. `tail ~/.agent-machines/logs/gateway.log`
3. `ss -tlnp`

## Dedalus SDK

```typescript
import Dedalus from "dedalus";
const client = new Dedalus({ xAPIKey: process.env.DEDALUS_API_KEY });
```
