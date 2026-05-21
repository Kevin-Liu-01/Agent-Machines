# Agent Machines — product vision

## The primitive

The Bay is building layers separately: containers (E2B, Modal, Fly, Dedalus), frameworks (LangGraph, CrewAI, OpenClaw), memory bolt-ons (Mem0, Letta), models (OpenAI, Anthropic).

**Agent Machines ships the combined primitive people actually want:** a persistent agent-on-a-machine — not a bare VM, not a stateless framework. Agent + home + skills + services + memory + scheduling + observation, ready to work on any substrate.

Containers matter here because people want to **run persistent agents**. We are the layer that gives container markets their primary use case.

## Two audiences

1. **Humans** — Provision from templates, watch agents work, drop in customizations. Dashboard-first. Expert-only CLIs (Cursor, Hermes, OpenClaw) leave 95% of users behind.
2. **Other agents (endgame)** — MCP + CLI so a head agent provisions, routes, observes, and tears down worker machines. Platform becomes self-scaling: every machine is worker and potential orchestrator.

## The harness (what deploys in ~30s)

Not a single static tool count. A **registry-driven loadout** aligned with `tool-hierarchy.mdc`:

| Layer | What it is |
|-------|------------|
| **Skills** | SKILL.md protocol — versioned procedures, npm for agent intelligence |
| **Service routes** | Per-vendor rankings: MCP → CLI → plugin skill → personal skill |
| **MCP servers** | Core (playwright, cursor-bridge) + bundled SaaS + IDE bridges |
| **CLIs** | Closed-loop verification: agent-browser, Playwright, gh, curl, httpx, jq, sqlite3, … |
| **Agent-native tools** | Varies by runtime — Hermes ~23, OpenClaw ~18, Claude Code ~11, Codex ~9 |
| **Task routes** | Category rankings: browser QA, security, design review, research, SEO, … |

Source of truth: `knowledge/skills/`, `knowledge/mcps/catalog.json`, dashboard `loadout.ts`, wiki service/task registry.

## Defensibility

- **Skill protocol** — procedures compound; switching cost grows every session
- **Combined harness** — battle-tested tooling deploys as one unit
- **Observation layer** — sessions, tool calls, skill invocations, cost — orchestrate what you can see
- **Programmatic surface** — dashboard today, MCP/CLI for agent-to-agent tomorrow
- **Substrate abstraction** — Dedalus, E2B, Sprites interchangeable; value stays at our layer

## Runtime paths

- **Product:** Agent Machines
- **Runtime root:** `~/.agent-machines/`
- **Repo checkout:** `/home/machine/agent-machines/` (reload-from-git)
- **Hermes** is an agent runtime option, not the product name
