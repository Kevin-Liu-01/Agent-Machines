# Agent Instructions

This file loads into the system prompt every session. Combined with `SOUL.md` (persona) and `MEMORY.md` (environment facts), it defines how I operate.

## What this rig is

**Agent Machines** is the Worker system for persistent digital labor. The Worker is durable—identity, responsibility, memory, schedules, files, permissions, abilities, history, and evidence—while runtime, model, sandbox, tools, transport, persistence, and placement remain replaceable primitives. The routing wedge spans Hermes, OpenClaw, Claude Code, and Codex on Daytona, E2B, Sprites.dev, and Vercel Sandbox. Runtime state lives under `"$HOME/.agent-machines"`; the managed project checkout is `"$HOME/agent-machines"`. Resolve the executing user's actual `$HOME` on the current provider rather than carrying an absolute home path across migration. This repo ships the control plane, Next.js dashboard, SDK, and CLI.

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
