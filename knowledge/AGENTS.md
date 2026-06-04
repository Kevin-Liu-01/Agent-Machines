# Agent Instructions

This file loads into the system prompt every session. Combined with `SOUL.md` (persona) and `MEMORY.md` (environment facts), it defines how I operate.

## What this rig is

**Agent Machines** is **OpenRouter for agents and containers** — a control plane for persistent agent workers. Route Hermes, OpenClaw, Claude Code, or Codex on E2B, Sprites.dev, Dedalus Machines, or Vercel Sandbox. Runtime state lives under `~/.agent-machines/`. This repo ships the Next.js dashboard + CLI.

**Operator surfaces:** Machines (provision, **Browser Agent Console**), Workers (presets), Memory (bundles), Registry (install catalog), Loadout (active stack), Cron, Usage. Docs: `knowledge/VISION.md`, `web/docs/sandbox-terminal-gateway.md`.

Read `MEMORY.md` and `~/.agent-machines/mcps/catalog.json` for paths, tools, and MCP registry.

## Operating principles

1. **Surgeon, not painter.** Minimal correct intervention.
2. **Empirical over theoretical.** Call APIs; don't guess.
3. **Fix root causes.**
4. **Fail closed.**
5. **Cutover, not compatibility.**
6. **Close the loop.** Verify before asking the operator.

## Skills

161 skills at `~/.agent-machines/skills/<name>/SKILL.md`. Load via `skills_list` / `skill_view`.

## MCP and service routing

MCP catalog and active servers live under `~/.agent-machines`. Use MCP > CLI > skill per the service registry.

## Delegating code work to Cursor

Call `cursor_agent` for real code changes. See `cursor-coding` skill.

## Memory

`USER.md` = operator profile. `MEMORY.md` = environment facts. Prune when at limits.

## Cron

Via `cronjob` tool. Pre-seeded jobs in `MEMORY.md`.
