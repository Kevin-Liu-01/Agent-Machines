# Agent Machines — product vision

## The product

**OpenRouter for agents and containers.**

Agent Machines is the **product layer** above sandboxes — not another container SKU, not a chat tab, not a vendor memory blob. A **control plane** that deploys a **persistent agent worker** in one unit:

runtime · skills · MCP · integrations · cron · observation · fleet management

…on any substrate you route to (E2B, Sprites.dev, Dedalus Machines, Vercel Sandbox).

| Analogy | Meaning |
|---------|---------|
| **OpenRouter for agents + containers** | One account routes **which runtime** and **which substrate** — like OpenRouter routes models |
| **Vercel on AWS** | We are the product layer; providers are interchangeable infrastructure |

People don't want a bare sandbox. They want a worker that audits code, runs on a schedule, and gets smarter over time. **That's what we ship.** Substrate vendors get a primary use case; our value stays in the harness and control plane.

**Dedalus** is one of four live providers and currently benchmarks best on boot latency (~250ms) and sleep/wake — a competitive default, **not the product**. Sandboxed environments are exceedingly hard to build; we prefer **routing** over native infra for now.

## Specialist fleet

Design agent · news agent · code agent — provision each from **opinionated presets** (Hermes, OpenClaw, Claude Code, Codex).

Named vendor products (e.g. Anthropic design modes) are **UI + skills + MCPs + system prompts** on the same model. We make that stack **composable**: one click per specialist, **supervise the fleet** from one dashboard.

## Two audiences

1. **Humans** — Route runtime + substrate, provision presets, supervise fleet.
2. **Other agents (endgame)** — MCP + CLI so head agents provision, route, observe, tear down workers.

## Control plane surfaces (dashboard)

| Surface | Role |
|---------|------|
| **Machines** | Provision, bootstrap, Browser Agent Console, gateway chat, fleet supervision |
| **Workers** | One-click specialist presets (runtime + router + Memory bundle) |
| **Memory** | Portable persona/rules/abilities — owned by the account, not the vendor |
| **Registry** | 1,400+ installable tools (MCP registry, skills.sh, npm, bundled catalog) |
| **Loadout** | Active harness on a machine (distinct from registry browse) |
| **Cron + metrics** | Scheduled exec on machines; Supabase-backed usage and activity |

## The harness (registry-driven)

See `web/lib/platform/harness.ts` and dashboard loadout for live counts — skills, service routes, MCP catalog, CLIs, agent-native tools, task routes.

## Defensibility

- Dual routing (runtime + substrate)
- SKILL.md protocol — procedures compound
- Combined harness — one deploy
- Observation — orchestrate what you see
- Programmatic surface (roadmap) — agents provisioning agents

## Runtime paths

- **Product:** Agent Machines (control plane + dashboard + CLI)
- **Runtime root:** `~/.agent-machines/`
- **Repo checkout:** `/home/machine/agent-machines/`
- **Hermes / OpenClaw / Claude Code / Codex** — runtime options, not the product name
