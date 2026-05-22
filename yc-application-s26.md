# YC S26 Application — Agent Machines

> **Read this first**
>
> **OpenRouter for agents and containers.**
>
> Agent Machines is the **product layer** above sandboxes — a control plane that deploys a **persistent agent worker** in one unit: runtime, skills, MCP, integrations, cron, observation, fleet management — on any substrate.
>
> **Analogies:** OpenRouter routes models; we route **runtimes and containers**. Vercel on AWS — we are the product; E2B, Sprites.dev, and Dedalus Machines are infra underneath.
>
> **Fleet:** Design, news, code agents from opinionated presets (Hermes, OpenClaw, …) — same stack as vendor SKUs (UI + skills + MCPs + prompts). One click each; supervise the fleet.
>
> Dedalus = **provider** with best boot/sleep stats in our harness, not the product.

---

## Bay Area landscape (May 2026)

### The stack that's crystallizing

The Bay is building layers. Nobody has shipped the **combined primitive**:

| What people are building | Players | The problem |
|---|---|---|
| **Containers** (bare compute) | E2B, Modal, Fly, Daytona | Nobody wants a bare container. |
| **Frameworks** (agent logic) | LangGraph, CrewAI, OpenClaw | Logic without a persistent home. |
| **Memory** (bolt-on state) | Mem0 ($24M), Letta ($10M) | Band-aid on stateless models. |
| **Models** (raw intelligence) | OpenAI, Anthropic, Google | Commodity. Falling prices. |

Everyone treats containers and agents as separate things — a container you put an agent into, or an agent you give a sandbox to. **The primitive people want is the persistent agent machine:** agent + home + skills + services + scheduling + observation, ready to work.

Agent Machines ships that unit. Containers matter here because people want to **run persistent agents** — we're the layer that gives substrate markets a primary use case.

**Parallel:** Before ChatGPT, you needed API keys and Python to use GPT-3. OpenAI didn't invent the model — they invented the interface. Containers and frameworks exist; the combined "deploy a persistent agent" interface was missing.

### Two audiences — programmatic endgame

**Humans (now):** Pick **specialist presets** — design, news, code, ops — each a persistent worker with the right runtime (Hermes, OpenClaw, Claude Code, Codex), skills, MCPs, and system prompts. Vendor product SKUs (e.g. a design-only chat mode) are the same recipe: UI on top of harness. Provision many specialists in one click, **supervise the fleet** from one dashboard.

**Other agents (endgame):** MCP + CLI so a head agent spins up, routes, observes, and tears down worker machines. Platform self-scales.

**Enterprise gap:** ServiceNow, Microsoft Foundry, Guild.ai published "agent control plane" strategies in 2026 — UI-heavy, 18-month cycles. We start with developers, grow teams, then enterprise. Bottom-up (Datadog, Vercel).

### Why the combined primitive wins

- Bare container → no value until an agent lives on it.
- Memory SaaS → one folder on a real filesystem when you ship the full unit.
- Frameworks → logic without deploy, persist, observe, schedule.

**Primitive = agent + machine, not machine alone.** Runtime, skills, services, scheduling, observation — on any substrate. Value accrues at the interface.

### Defensibility

1. **SKILL.md protocol** — versioned procedures; 161 ship today; compounds every session.
2. **Combined harness** — registry-driven loadout (skills, service routes, MCP catalog, CLIs, agent-native tools); deploys as one unit in ~30s.
3. **Observation layer** — activity, sessions, tool calls, skill invocations, cost. Can't orchestrate what you can't see.
4. **Programmatic surface (roadmap)** — MCP/CLI for head agents to provision fleets. Dashboard is table stakes; agent-callable control plane is the moat.

---

## Application answers

### Company name
Agent Machines

### Describe what your company does in 50 characters or less
OpenRouter for agents and containers.

### Company URL / Product link
https://www.agent-machines.dev

### What is your company going to make?

Agent Machines is **OpenRouter for agents and containers** — the product layer above sandboxes. One account routes **which agent runtime** (Hermes, OpenClaw, Claude Code, Codex) and **which substrate** (E2B, Sprites.dev, Dedalus Machines), then deploys a **persistent worker** in one unit: runtime, skills, MCP, integrations, cron, observation, and fleet management.

**Vercel on AWS** for substrates: interchangeable infra underneath; our value is the harness and control plane. People don't want bare sandboxes — they want workers that audit code, run on schedules, and accumulate skills. Dedalus currently benchmarks best on boot/sleep (strong default, not the product).

**Fleet:** Provision design, news, code specialists from presets — vendor SKUs are UI + skills + MCPs + prompts; we ship that composable, one click per machine, one dashboard to supervise all.

**Origin:** I built this to benchmark agents across E2B, Fly, Modal, and microVM providers — deploy the same harness everywhere, observe behavior, compare substrates. The observation layer became more valuable than the benchmarks. Then lifecycle control, skills, cron, fleet UI. Benchmark tool → observation layer → control plane → product.

**Live today:**

- **Combined primitive:** ~30s deploy. 161 skills, 35 MCP catalog entries, ranked service routes, 10+ closed-loop CLIs, agent-native tools (varies by runtime), browser automation, optional Cursor bridge, cron — one unit, any supported substrate.
- **Visual observation:** Dashboard activity, chat, sessions, logs, artifacts, usage — no SSH archaeology.
- **Templates + insertion layers:** Works out of the box; swap skills, MCPs, providers, models, governance in clicks.
- **Skill accumulation:** Complex tasks become reusable SKILL.md on disk under `~/.agent-machines/` — not trapped in chat history.
- **Programmatic control (roadmap):** MCP/CLI for head agents to provision and coordinate worker machines without the UI.

**Substrates:** E2B, Sprites.dev, and Dedalus Machines are live. Dedalus currently leads our benchmarks on boot latency (~250ms) and sleep/wake; all three are first-class via `MachineProvider`.

### Where do you live / company based after YC?
San Francisco, USA / San Francisco, USA

### Explain location
Princeton sophomore (19), graduating early — one of two in my class. Chose SF in 2026 over campus; shipping faster here. Company stays in SF.

### How far along are you?

Live at agent-machines.dev, open source on GitHub. Control plane operational:

- CLI: `npm run deploy` bootstraps fully-harnessed agent (~30s)
- Dashboard: multi-machine fleet, setup wizard, chat, skills, MCP/loadout, sessions, logs, artifacts, cron, activity overview, usage
- 161 skills (SKILL.md protocol, synced from `knowledge/`)
- 35 MCP catalog entries + ranked service routes (Vercel, Stripe, Supabase, GitHub, Linear, Slack, Figma, PostHog, Sentry, Datadog, …)
- 4 agent runtimes: Hermes, OpenClaw, Claude Code, Codex CLI
- Optional Cursor bridge (4 MCP tools)
- Cron-scheduled autonomous operation
- 3 substrates: E2B, Sprites.dev, Dedalus Machines

Early users; no external paying customers yet.

### How long working on this? Full-time?

~3 months on Agent Machines directly, full-time.

Built harnesses at AWS; applied to YC with Sevenfold; spent 2026 in SF shipping agent infrastructure and learning distribution. Agent Machines came from benchmarking agents across substrates, operating persistent cron agents for months, and hitting the same rebuilt-from-scratch procedures — which became the skill protocol.

### Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind v4, Clerk, R3F
- **Backend/CLI:** Node.js + tsx; provider SDKs behind `MachineProvider`
- **Runtimes:** Hermes, OpenClaw, Claude Code, Codex
- **Substrates:** E2B, Sprites.dev, Dedalus Machines (Dedalus: best boot/sleep stats in our harness)
- **Models:** OpenAI-compatible routing (Claude, GPT, 200+ via configurable `/v1` endpoints)
- **MCP:** Vercel, Stripe, Supabase, GitHub, Linear, Slack, Figma, PostHog, Sentry, Datadog, Firebase, Shopify, ClickHouse, Cloudflare, AWS, Clerk, browser automation

### Are people using your product? Revenue?

Yes — my workflow + early open-source adopters. No revenue yet.

### Why this idea? Domain expertise?

**Distribution beats raw specs.** Best infrastructure loses to infrastructure people can understand. Persistent agent with skills + schedule + observation is imaginable; bare sandbox is not.

**Research:** Agent orchestration with Prof. Danqi Chen (Princeton / Thinking Machines) — routing, multi-agent coherence.

**Vertical experience:**
- Orchestration research (Princeton)
- Agent harnesses (Amazon)
- 161 skills, MCP integrations, multi-substrate benchmarking
- Months operating cron agents on persistent machines

The name *is* the primitive: **agent machines**.

### Competitors — what we understand that they don't

| Layer | Examples | Our position |
|---|---|---|
| Container/VM | E2B, Modal, Fly, Daytona | Substrate; we give it a use case |
| Memory | Mem0, Letta | One feature of a machine with a filesystem |
| Frameworks | LangGraph, CrewAI | Logic without deploy/persist/observe |
| Expert CLIs | Cursor SDK, Claude Code, Hermes CLI | Single-agent; no fleet control plane |

**Insights:**

1. Primitive is **agent + machine**, not container alone.
2. **Distribution wins on imagination** — "agent that audits code on a schedule" > "microVM with 512MB."
3. **Observation beats black box** — low-level VMs + high-level dashboard.
4. **Programmatic surface** — agents provisioning agents (roadmap) → recursive growth.

### How do you make money?

Platform fee + compute margin (Vercel-on-AWS shape).

- **Free:** 1 machine, capped compute-hours, community skills
- **Pro ($29/mo):** multiple machines, cron, full library
- **Team ($99/seat/mo):** fleet, shared skills, audit, SSO
- **Enterprise:** self-host, compliance, private registries

Flywheel: skills → more cron/autonomous work → more compute hours.

TAM: agent infra $47B+ by 2028; control-plane capture 10–30% → $5–15B layer.

### Other ideas considered

1. **Self-evolving skills marketplace** — built at [loooop.dev](https://loooop.dev); Agent Machines ships the execution runtime + SKILL.md protocol.
2. **AI-native CI/CD** — subsumed by cron + skills + substrate management.
3. **Agent-to-agent protocol spec** — too early; we ship MCP/CLI as infrastructure instead.

---

## Moat & roadmap

### Defensibility

- **Skill protocol** — switching cost grows every session
- **Harness** — 6 months of integrated tooling, one deploy
- **Observation** — Datadog-style stickiness for agents
- **Substrate abstraction** — E2B | Sprites | Dedalus interchangeable
- **Programmatic MCP (roadmap)** — head agents scale the platform

### Roadmap

**Q3 2026:** Billing, skill marketplace, more substrates  
**Q4 2026:** Agent Machines MCP server + fleet CLI (`am provision`, head-agent pattern)  
**2027:** Team fleets, cost-based routing, enterprise compliance, self-host

### Three phases

1. **Now:** Humans deploy via dashboard (ChatGPT moment for persistent agents)
2. **Q4 2026:** Agents deploy via MCP/CLI
3. **2027:** Org fleets; humans set policy, head agents orchestrate

```
Human or head agent
        ↓
Agent Machines (dashboard / MCP / CLI)
        ↓
Provision · Observe · Schedule · Skill registry
        ↓
Persistent agent machines (E2B | Sprites | Dedalus | …)
```

---

## Founder video script (~60s)

```
[0:00–0:08]
"Hey, I'm Kevin. I'm 19, a Princeton sophomore — one of two in my class graduating
early. I'm in SF because I've shipped more here in six months than in a year on campus."

[0:08–0:22]
"First time I couldn't sit still until I'd built something end-to-end: cofounded the
largest online high school math competition — 35K raised, 8,000 users, real team,
real mistakes. That taught me I love building systems, not just studying them."

[0:22–0:38]
"Two summers at Bloomberg, then AWS — I built my first agent harness to scrape docs.
Ugly, but it worked. That led to Sevenfold and a YC interview. I wasn't ready to
drop out. I came to SF, shipped across frontend, infra, docs, GTM — and built Agent
Machines because persistent agents kept breaking without a control plane."

[0:38–0:52]
"The lesson: the best product loses to the product people can actually adopt. People
need useful primitives. Agent Machines is the persistent agent machine — one click,
any substrate, skills and cron included."

[0:52–1:00]
"Two cofounder candidates from MIT and Columbia ready to drop out. Live product, not
a slide deck. Thank you."
```

---

## Demo video script (~3 min)

**Audience:** Founder/PM who uses AI daily; engineers who've hit the session/container wall.  
**Run:** `cd web && pnpm dev` → http://localhost:3210 (real Clerk + provider credentials)

```
[0:00–0:15] Cold open — the primitive, not the chatbot.
/dashboard/setup → pick template "Full-stack dev agent" → pick substrate (E2B, Sprites,
or Dedalus — same harness) → Provision ~30s.
"Most products give you a chat window. We give you a computer that stays on — agent
installed, tools wired, gateway live. 161 skills, 35 MCP servers, cron, observation."

[WHY] Chat resets. Cron can't run in a tab. Procedures aren't on disk. One unit:
disk + process + schedule + identity.

[TECH] Hard part is the control plane: bootstrap on any substrate, gateway auth off
the model path, sleep/wake without losing /home/machine, stream tool calls to a
dashboard humans trust.

[0:15–0:40] Observation.
Activity heatmap → tap a day. Chat: "Run a security audit on this repo."
Show skill load, browser, terminal, tokens/cost.
"Flight recorder for non-experts; harness for engineers."

[0:40–1:00] Skill protocol.
"Save this audit pattern as a skill." → SKILL.md → /dashboard/skills.
"Procedures on disk — not exportable to ChatGPT. Intentional."

[1:00–1:20] Insertion layers.
Loadout + MCP cards (Vercel, Stripe, Datadog). Everything is an insertion point.

[1:20–1:45] Cron.
Scheduled jobs — wake, run, sleep. "AI employee, not assistant."

[1:45–2:10] Fleet.
Multiple machines, one pane. Substrate is implementation detail.

[2:10–2:35] Endgame.
"MCP/CLI so a head agent provisions review + deploy workers — same control plane."

[2:35–3:00] Pull back.
"OpenRouter for agents and containers. Persistent workers, supervised fleet. Humans today. Agents tomorrow.
agent-machines.dev."
```

---

## Additional fields

### Who writes code?
Me — CLI, dashboard, website, skill protocol, MCP integrations, provider abstraction, gateway, bootstrap, runtimes.

### Cofounder?
Yes — two candidates (MIT, Columbia), willing to drop out. Ideal: distributed systems / orchestration (K8s, Nomad, Terraform).

### Applied before?
Yes — with Athan Zhang; YC said figure out dropout. Athan → Copperlane (Spring batch). I stayed in SF, shipped, returned with live product and clearer primitive.

### Why YC now?
Summer 2026 RFS: "Software for Agents" + "Dynamic Software Interfaces." Substrates are cheap enough; frameworks stabilized; **interface layer open**. Live product, 3 substrates, 161 skills. Need network + velocity before platforms close the window.

### How did you hear about YC?
[Fill]

### Legal entity / investment / fundraising?
[Fill]

---

## Appendix: Agent Machines vs substrate providers

**Agent Machines ≠ a container company.** We are the **control plane** for persistent agent machines.

| | Substrate provider | Agent Machines |
|---|---|---|
| Sells | Raw compute / microVM | Agent + home + harness + observation |
| Analogy | AWS | Vercel |
| User gets | Empty machine | Worker ready in ~30s |

**Dedalus Machines** is one of three live providers. In our benchmarks it leads on boot latency (~250ms) and sleep/wake — a strong default when those stats matter. **E2B** and **Sprites.dev** are fully supported alternatives. Value stays in our layer regardless of where bits run.

**OpenRouter analogy:** route agents and containers — pick runtime, pick substrate, pick model, one account.

I built Agent Machines independently to compare substrates fairly; it is not a Dedalus product. Substrate vendors benefit when more persistent agents run on their machines.
