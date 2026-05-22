# Agent Activity Log

> Persistent memory for AI agents working on this project. Agents must read this
> file at session start and append after every meaningful change.

## Convention

- **Read first.** Before making changes, read this file to understand project history.
- **Append after changes.** Log decisions, state transitions, and open threads.
- **Never delete.** This file is append-only.
- **Skip noise.** Don't log formatting fixes, import reordering, or trivial typos.

---

## Demo video script (3 min) — control plane edition

**ICP on camera:** Founder / PM / ops lead who uses AI daily but does not live in a terminal.  
**Technical audience (subtext):** Engineers who've tried raw Docker + Claude Code and felt the gap.  
**Run:** `cd web && pnpm dev` → http://localhost:3210 (Clerk + real provider credentials)

**One-line thesis:** ChatGPT is a session. This is a **machine** — persistent, observable, schedulable, and yours.

---

### Full script (read on camera)

```
[0:00 - 0:15] Cold open — the primitive, not the chatbot.
Screen: agent-machines.dev/dashboard/setup.
"No preamble. Most AI products give you a chat window. We give you a computer
that stays on — with an agent already installed, already wired to your tools."

Pick template: Full-stack dev agent. Substrate: E2B, Sprites, or Dedalus (same harness). Click Provision.
Timer ~30s. Gateway comes online.

"One click. You didn't rent a GPU. You didn't SSH into a box. You got a
persistent agent machine: 161 skills, 30 MCP servers, browser automation,
cron, and a live gateway — deployed on infrastructure that survives when
you close the tab."

[WHY THIS IS OP — plain English]
"Chat resets. Context evaporates. Cron jobs can't run in a browser tab.
Your company's procedures live in Notion, not in the model. A persistent
agent-container fixes all of that: disk, process, schedule, identity —
one unit you can wake, sleep, and audit."

[TECHNICAL CHALLENGE — 10 seconds, for engineers in the room]
"The hard part isn't the LLM. It's the control plane: bootstrapping Hermes
or OpenClaw on arbitrary substrates, keeping gateway auth out of the model
path, reconciling sleep/wake without losing /home/machine, and streaming
every tool call back to a dashboard humans can trust. We built that layer first."

[0:15 - 0:40] Observation — the control plane is the product.
/dashboard → Activity heatmap (week view). Tap a day. Sidebar shows events.
/dashboard/chat on full-stack-dev. Click Bootstrap agent once if cold.

"Run a security audit on this repo."

Split screen energy: chat on the left, dashboard on the right.
Show live: skill loaded (deepsec), browser open, terminal exec, file read,
tokens and cost ticking.

"This is not a black box. Non-technical users get a flight recorder —
what happened, when, how much it cost. Engineers get the harness we used
to benchmark agents across Dedalus, E2B, and Sprites. Observation isn't
a nice-to-have. It's how you trust agents with real work."

[0:40 - 1:00] Compounding — procedures become assets.
Audit finishes. Chat: "Save this audit pattern as a skill."
Show SKILL.md on disk. Cut to /dashboard/skills — library at 161.

"Every complex task becomes a reusable procedure on the machine — not
trapped in chat history. After six months you have hundreds of custom
skills on /home/machine. You can't export that to ChatGPT. That's intentional."

[1:00 - 1:20] Insertion layers — your stack, not ours.
/dashboard/loadout — 161 skills, MCP catalog, tool surface.
/dashboard/mcps — Vercel, Stripe, Supabase, Datadog cards.
Optional: /dashboard/registry → add a skill URL.

"161 skills out of the box — but everything is an insertion point.
Your skills. Your MCP services. Your governance. The control plane doesn't
care which agent runtime or substrate you pick; it wires the same observability
and loadout either way."

[1:20 - 1:45] Cron — agents that work while you sleep.
/dashboard/cron — four schedules.
Open nightly-memory-consolidation (0 3 * * *). Show execution trail:
machine woke at 3:12am, health check, log tail, MEMORY.md diff. Cost: $0.04.

"Nobody prompted this. The control plane woke the machine, ran the job,
wrote the artifact, and put it back to sleep. That's the difference between
'AI assistant' and 'AI employee.'"

[1:45 - 2:10] Fleet — specialized agents, one pane of glass.
/dashboard — fleet strip: full-stack-dev (active), code-review, research, ops.
Set active on code-review. Show machine-scoped chat history and loadout differ.

"Nobody wants one agent that does everything. You want a code-review agent
on GitHub + Linear, a research agent with browser + search, an ops agent
on Vercel + Datadog. The dashboard is the control plane for the fleet.
Dedalus vs E2B vs Sprites is an implementation detail you swap without
rebuilding your procedures."

[2:10 - 2:35] Endgame — agents provisioning agents.
/dashboard/terminal or fleet → Spin up new machine.
Narrate (live or staged): head agent requests code-review + staging deploy
machines; dashboard shows provisioning → running; code-review processes PR;
deploy picks up on pass; both sleep.

"This is where it goes. An MCP surface so agents provision and coordinate
other agents. The platform becomes self-scaling — agents create demand for
more agents. The control plane is the moat, not any single model."

[2:35 - 3:00] Pull back — the full instrument panel.
/dashboard: Activity heatmap, fleet metrics, gateway latency, Telemetry charts,
quick links. All four machines visible.

"OpenRouter for agents and containers. Persistent workers, supervised fleet. Humans today. Agents tomorrow.
161 skills. 30 MCP servers. Any substrate. Full observability.
For humans today — founders, operators, engineers who need trust, not magic.
For agents tomorrow — the coordination layer they run on.

agent-machines.dev."
```

---

### Rehearsal click path

| Time | URL | Action |
|------|-----|--------|
| 0:00 | `/dashboard/setup` | Walk Provision — any substrate (E2B / Sprites / Dedalus) |
| 0:15 | `/dashboard` | Activity heatmap → tap a hot day → show sidebar events |
| 0:20 | `/dashboard/chat` | Bootstrap once if needed → security audit thread or live prompt |
| 0:40 | `/dashboard/chat` → `/dashboard/skills` | Save-skill thread; show 161 count |
| 1:00 | `/dashboard/loadout`, `/dashboard/mcps` | Harness + Datadog card |
| 1:20 | `/dashboard/cron` | Open `nightly-memory-consolidation` drill-down |
| 1:45 | `/dashboard` | Fleet strip; Set active → code-review |
| 2:10 | `/dashboard/terminal` or **+ Spin up new machine** | Provision narrative |
| 2:35 | `/dashboard` | Telemetry section + activity + metrics strip |

### Beat verification (2026-05-21)

| Beat | Status | Notes |
|------|--------|-------|
| Provision + primitive story | ✅ | Setup wizard, ~30s boot copy |
| Activity / control plane | ✅ | `ActivityOverviewPanel`, time-range filters |
| Security audit + observation | ✅ | Chat stream; Bootstrap once on cold load |
| Save skill | ⚠️ | Stream OK; align chat count vs 161 UI |
| Loadout / MCPs | ✅ | 161 skills, 30 MCP servers |
| Cron 3am story | ✅ | 4 crons, drill-down in demo-config |
| Fleet (4 machines) | ✅ | full-stack-dev, code-review, research, ops |
| Terminal / provision | ⚠️ | Manual spin-up; script narrates endgame |
| Telemetry pullback | ✅ | `FleetMetrics`, `ObservabilityPanel`, `MetricsChartPanel` |

### Canonical demo numbers (use on camera)

| Claim | Source |
|-------|--------|
| 161 skills | Skills page, loadout, overview harness |
| 30 MCP servers / 244 tools | MCP page, loadout |
| 4 crons | Cron panel |
| 4 demo machines | demo-config fleet |
| 17 MCP **services** | Marketing shorthand only — prefer "30 MCP servers" on camera |

---

## [2026-05-21 05:06] config | Saved 3-min demo script + walkthrough map

**Changed:** `memory.md` (created), demo client-bundle fix (`demo-types.ts`, `demo-fleet-persist.ts`, `machine-narratives.ts`, `session-store.ts`, `state.ts`, `clerk.ts`, `handlers.ts`, `runtime.ts`)
**Why:** User asked to remember demo script and verify runnable demo on :3210
**Decision:** Split cookie persistence out of `state.ts` so `ChatShell` → starter-prompts does not pull `next/headers` into client bundle
**Open:** Bootstrap click on cold chat load; align skill counts in chat copy vs UI

## [2026-05-21] feat | Activity overview, fleet cards, demo control-plane pass

**Changed:** Activity heatmap panel, fleet machine cards, overview telemetry restore, demo persistence split, starter-prompts client module
**Why:** Dashboard revamp + runnable demo for YC recording
**Decision:** Server returns raw activity days; client builds grid with week/month/all scales
**Open:** Auto-bootstrap polish; keep harness counts registry-derived (161 skills as of last sync)
