# Agent Machines — Technical Whitepaper

**Version 1.0 · June 2026**  
**Site:** [agent-machines.dev](https://www.agent-machines.dev) · **Source:** [github.com/Kevin-Liu-01/Agent-Machines](https://github.com/Kevin-Liu-01/Agent-Machines)

---

## Abstract

Agent Machines is a **control plane for persistent agent workers** — the product layer above sandboxes. One account performs **dual routing**: which **agent runtime** (Hermes, OpenClaw, Claude Code, Codex) and which **substrate** (E2B, Sprites.dev, Dedalus Machines, Vercel Sandbox), then deploys a full worker in one unit: runtime, skills, MCP integrations, cron, observation, and fleet supervision.

The headline interaction pattern is the **Browser Agent Console**: operate real agent CLIs from a browser tab on a remote machine without hosting a WebSocket PTY on serverless infrastructure. Session state lives on the worker (`tmux` + log tail); the control plane is stateless HTTP and SSE.

**Analogies:** OpenRouter for agents and containers · Vercel on AWS for substrates.

---

## 1. Problem

The market ships four incomplete layers:

| Layer | Examples | Gap |
|-------|----------|-----|
| **Containers** | E2B, Modal, Sprites, Daytona, Vercel Sandbox | Operators get an empty box, not a worker |
| **Frameworks** | LangGraph, CrewAI, OpenClaw (as library) | Logic without durable home, deploy, or fleet observe |
| **Memory SaaS** | Mem0, Letta | Bolt-on state; real procedures want a filesystem |
| **Expert CLIs** | Claude Code, Codex, Hermes | Single-seat terminals; no substrate-neutral fleet desk |

Most products force a false choice:

- **Chat UI** — loses full TUI/CLI fidelity and durable procedure files
- **Local terminal only** — excludes non-terminal operators and remote substrates
- **Vendor-locked sandbox shell** — one cloud, not routed infra
- **WebSocket PTY relay** — incompatible with serverless control planes (timeouts, no stickiness)

What buyers want is a **persistent agent machine**: agent + home + harness + schedule + observation, ready in one deploy — not a container they still have to wire up.

---

## 2. Design principles

1. **Combined primitive** — Ship **agent + machine** together; value is the worker, not the SKU of raw compute ([`knowledge/VISION.md`](../knowledge/VISION.md)).
2. **Route, don't rebuild** — Sandboxes are hard; four substrates implement one `MachineProvider` interface instead of owning infra.
3. **Registry-driven truth** — Harness counts and loadout come from live registries (`web/lib/platform/harness.ts`), not static marketing numbers.
4. **Fail closed** — Credential gate blocks provision when runtime or substrate keys are missing.
5. **Exec-first console** — Interactive path uses only `exec` / `streamExec`; optional HTTP gateway is not required for primary UX.
6. **Observation before orchestration** — Activity, sessions, tool traces, usage, and logs in one dashboard before agent-to-agent fleet APIs.
7. **Procedures on disk** — SKILL.md compounds on the machine; not trapped in chat history.

---

## 3. Core primitives

### 3.1 Dual routing

Two independent axes, one account — analogous to OpenRouter's model routing applied to **runtimes** and **containers**:

| Axis | Options | Implementation |
|------|---------|----------------|
| **Runtime** | Hermes, OpenClaw, Claude Code, Codex CLI | Bootstrap recipes + launch commands |
| **Substrate** | E2B, Sprites.dev, Dedalus Machines, Vercel Sandbox | `MachineProvider` in `web/lib/providers/*` |
| **Model upstream** | Dedalus, OpenRouter, Vercel AI Gateway, native keys, OpenAI-compatible | Per-machine router + credential gate |

### 3.2 Persistent worker harness

A deployed worker includes:

| Layer | Source | Role |
|-------|--------|------|
| **Skills** | `knowledge/skills/*/SKILL.md` → `~/.agent-machines/skills/` | Versioned procedures (161 today) |
| **Service routes** | Loadout registry | MCP → CLI → skill per vendor |
| **MCP servers** | Catalog + user install | 35 bundled entries; credential-gated SaaS |
| **CLIs** | Bootstrap | Closed-loop verification (gh, Playwright, agent-browser, …) |
| **Agent-native tools** | Per runtime | 9–23 tools (Hermes richest) |
| **Cron** | User config + server tick | Scheduled exec on machines |
| **Observation** | Supabase + dashboard | Usage, activity, sessions, logs |

### 3.3 Browser Agent Console

**Pattern:** tmux-over-exec + SSE (no control-plane PTY).

```
Browser (xterm.js)
  → POST …/terminal/input     (tmux send-keys -H)
  ← GET  …/terminal/stream    (tail -f pane log, byte offset)
  → Clerk-authenticated control plane (stateless)
  → provider.exec / streamExec
  → Worker: tmux "amconsole" + agent CLI in pane
```

**Why it matters:** Next.js on Vercel cannot host a long-lived WebSocket PTY. Inverting session ownership to the worker makes the same UI work on all four substrates.

Full specification: [`sandbox-terminal-gateway.md`](./sandbox-terminal-gateway.md) · narrative: [`knowledge/BROWSER-AGENT-CONSOLE.md`](../knowledge/BROWSER-AGENT-CONSOLE.md).

### 3.4 Memory bundles

**Owned memory** — portable persona, rules, and abilities stored at the account level, installable into any runtime, exportable as prompts. Not a vendor-hosted memory blob; files the operator controls.

Workers reference a Memory bundle; machines inherit the stack on deploy.

### 3.5 Workers (presets)

Deployable templates: **runtime + model/router + Memory bundle**. Encodes specialist roles (code, design, ops, news) as one-click units — the same recipe vendors sell as product SKUs (UI + skills + MCPs + prompts), but composable and substrate-neutral.

### 3.6 Registry vs loadout

| Concept | Meaning |
|---------|---------|
| **Loadout** | What is **active** on a machine — skills, MCPs, service routes, task routes |
| **Registry** | What can be **installed** — 1,400+ items from MCP registry (paginated cache), skills.sh, npm, bundled catalog, Cursor plugins |

Search → add to loadout → sync on deploy/reload.

### 3.7 SKILL.md protocol

Agent procedures as markdown on disk under `~/.agent-machines/skills/`. Each session can load, refine, and reuse; switching cost grows with accumulated skill library. Deliberately not exportable to stateless chat products.

### 3.8 MachineProvider

Every substrate implements:

`provision` · `state` · `wake` · `sleep` · `destroy` · `exec` · `streamExec`

Streaming tier is capability-based:

| Substrate | `streamExec` | Tier |
|-----------|--------------|------|
| E2B | `commands.run` callbacks | Native stream |
| Sprites | `spawn()` stdout/stderr | Native stream |
| Vercel Sandbox | `Command.logs()` iterator | Native stream |
| Dedalus | REST exec (post-hoc output) | Poll fallback on log file |

The SSE contract (`started` · `output` · `idle` · `error` / `done`) is identical across tiers so UI code does not branch on provider.

---

## 4. Architecture

```txt
Operator (human or future head agent)
        │
        ▼
┌───────────────────────────────────────┐
│  Agent Machines control plane         │
│  Next.js · Clerk · Supabase metrics   │
│  Dashboard · Registry · Cron tick     │
└───────────────────────────────────────┘
        │ MachineProvider API
        ▼
┌─────────────┬─────────────┬─────────────┬─────────────┐
│    E2B      │   Sprites   │   Dedalus   │   Vercel    │
│   Sandbox   │   .dev      │  Machines   │   Sandbox   │
└─────────────┴─────────────┴─────────────┴─────────────┘
        │
        ▼
Persistent worker (~/.agent-machines/)
  ├── tmux console (primary interact)
  ├── optional gateway :8642 / :18789
  ├── skills · mcps · crons · sessions · logs
  └── git checkout for knowledge reload
        │
        ▼
Model upstream (router or native API keys)
```

**Deploy → Bootstrap → Attach → Talk**

1. **Provision** — create machine; persist `MachineRef`; run credential gate  
2. **Bootstrap** — phased shell recipes; core phases block until gateway-ready; post-gateway best-effort  
3. **Attach** — browser terminal session; `capture-pane` snapshot; byte offset for SSE tail  
4. **Talk** — agent CLI in pane; full TUIs supported  

---

## 5. Control plane patterns

### 5.1 Credential gate

Before provision: validate substrate API keys and runtime-appropriate model upstream. Prevents silent failure deep in bootstrap.

### 5.2 Phased bootstrap

- **Core phases** — system deps, runtime install, gateway; must succeed  
- **Post-gateway phases** — browser tooling, extras; best-effort so slow installs do not block console  

State persisted after each phase (`bootstrapState`) for resumability.

### 5.3 Scheduler tick

`POST /api/internal/cron/tick` (Vercel Cron every 5 minutes):

- Evaluate user cron definitions → exec on target machines  
- Collect usage/activity metrics → Supabase  

On-demand: `POST /api/dashboard/metrics/collect`.

### 5.4 Gateway optional path

HTTP chat proxies to Hermes/OpenClaw gateway when a public URL exists. Console path does not require tunnel or `NEXT_PUBLIC_*` machine bearers. Chat API degrades gracefully to terminal when no gateway URL.

### 5.5 Fleet supervision

- URL-scoped machines (`?machineId=`, `?focus=`)  
- Command palette navigation  
- Cross-substrate benchmarks for boot/exec/streaming  

---

## 6. Two audiences

| Audience | Surface | Today |
|----------|---------|-------|
| **Humans** | Dashboard, Browser Agent Console, Workers, Registry | Live |
| **Head agents** | MCP + CLI provision/observe/teardown | Roadmap (Q4 2026 target) |

Enterprise control-plane narratives (ServiceNow, Microsoft Foundry, etc.) are UI-heavy and slow. Agent Machines starts developer-down: useful primitive → team fleet → policy layer.

---

## 7. Competitive positioning

| Competitor shape | What they optimize | Agent Machines |
|------------------|-------------------|----------------|
| Substrate vendor | Raw microVM / sandbox | Substrate is interchangeable; we supply the use case |
| Memory SaaS | Vector/session store | One directory tree on a real machine |
| Agent framework | Graph/orchestration logic | Logic **plus** deploy, persist, observe, schedule |
| Single CLI product | One runtime, one seat | Four runtimes, four substrates, fleet desk |

**Insight:** Distribution wins on **imaginable primitives** — "agent that audits the repo on a cron" beats "512MB microVM."

---

## 8. Business model (outline)

Platform economics resemble Vercel-on-AWS:

- **Free** — limited machines / compute for adoption  
- **Pro** — multiple machines, cron, full harness library  
- **Team** — fleet, shared skills, audit, SSO  
- **Enterprise** — self-host, compliance, private registries  

Flywheel: richer skills → more autonomous cron work → more substrate compute hours.

---

## 9. Roadmap

| Phase | Focus |
|-------|--------|
| **Now** | Humans deploy via dashboard; Browser Agent Console; Registry; Workers/Memory |
| **Q3 2026** | Billing, skill marketplace, substrate expansion |
| **Q4 2026** | Agent Machines MCP server + fleet CLI (`am provision`, head-agent orchestration) |
| **2027** | Team fleets, cost-based routing, enterprise compliance, self-host option |

**Optional acceleration:** Native WebSocket PTY data plane on substrates that support always-on relay — reduces input latency; control plane stays serverless.

---

## 10. Live metrics (registry-derived)

Run `npm run sync-skills` before release builds. Representative snapshot:

| Metric | Value |
|--------|-------|
| SKILL.md skills | 161 |
| MCP catalog servers | 35 |
| Service routes | 27 |
| Installable registry items | 1,400+ |
| Agent runtimes | 4 |
| Substrates | 4 |
| Native tools (Hermes) | 23 |

---

## 11. References

| Document | Contents |
|----------|----------|
| [`README.md`](../README.md) | Operator quick start, routes, security boundaries |
| [`knowledge/VISION.md`](../knowledge/VISION.md) | Product vision and defensibility |
| [`knowledge/BROWSER-AGENT-CONSOLE.md`](../knowledge/BROWSER-AGENT-CONSOLE.md) | Console architecture and positioning |
| [`sandbox-terminal-gateway.md`](./sandbox-terminal-gateway.md) | Streaming tiers and API map |
| [`web/README.md`](../web/README.md) | Dashboard env and file index |

---

## License

Agent Machines is open source (MIT). Substrate trademarks belong to their respective owners. Agent Machines is an independent project for fair multi-substrate comparison; it is not a product of any single substrate vendor.
