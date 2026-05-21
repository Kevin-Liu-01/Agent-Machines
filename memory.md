# Agent Activity Log

> Persistent memory for AI agents working on this project. Agents must read this
> file at session start and append after every meaningful change.

## Convention

- **Read first.** Before making changes, read this file to understand project history.
- **Append after changes.** Log decisions, state transitions, and open threads.
- **Never delete.** This file is append-only.
- **Skip noise.** Don't log formatting fixes, import reordering, or trivial typos.

---

## Demo video script (3 min) — the conversation movie

**Format:** One continuous story. Provision → empty machine → one chat → watch the dashboard come alive.  
**ICP:** Anyone who's used ChatGPT for work but never trusted it with real tasks.  
**Run:** `cd web && pnpm dev:demo` → http://localhost:3210  
**Hero machine:** Provision a **new** sandbox (best) or use `demo-fullstack` with empty state reset.

**One-line thesis:** You don't get a chatbot. You get a machine — and you can *watch it think*.

---

### Full script (read on camera)

```
[0:00 – 0:20] HOOK — empty machine
Screen: /dashboard/machines → "+ New machine" → Provision (Dedalus, Hermes, any name).

"Everyone's pitching AI agents. Almost nobody shows you what the agent actually *did*.
This is Agent Machines. One click — you get a persistent computer with an agent
already on it. Not a session. A machine."

Land on /dashboard. Point at Activity heatmap — today is empty for this machine.
Fleet card: "no logs yet." Metrics: zero usage.

"A brand-new machine is honest. Nothing happened yet. No fake charts. Just… waiting."

[0:20 – 0:35] WHAT YOU GOT
Quick flash: /dashboard/loadout — 161 skills, 30 MCP servers.
/dashboard/mcps — Vercel, Stripe, Supabase wired.

"You didn't SSH. You didn't configure MCP by hand. The harness is already loaded —
skills, services, browser, cron, gateway. The agent is move-in ready."

[0:35 – 1:25] THE CONVERSATION — watch the dashboard breathe
Split layout: /dashboard/chat on the machine you just made. Overview or Machines
visible on a second monitor, or cut back after each beat.

Type: "Run a security audit on this repo."

"One sentence. Now watch — this is the product."

Narrate live as tools stream in chat:
  → load_skill deepsec
  → browser opens the dashboard
  → terminal runs the scan
  → read_file on the API route

"Every step is visible. Which skill loaded. Which tool ran. Not a black box —
a flight recorder."

Cut to /dashboard — Activity heatmap: TODAY lights up.
Fleet card: log lines appearing.
Observability / metrics: usage starting to fill in.

"The machine was empty sixty seconds ago. One conversation — and the control plane
already knows what happened, when, and what it cost. Non-technical users get trust.
Engineers get a harness they can actually debug."

Chat finishes: 12 findings, report on disk.

[1:25 – 1:45] COMPOUNDING — chat becomes asset
Same chat. Type: "Save this audit pattern as a skill."

Watch write_file → SKILL.md on disk.

Cut to /dashboard/skills — custom procedure added to the library.

"That wasn't a one-off chat. It's now a reusable procedure on /home/machine.
Run it again next week. Cron it at 3am. Hand it to a teammate. ChatGPT can't
export this — and that's the point. Your company's intelligence compounds on the
machine, not in a thread that scrolls away."

[1:45 – 2:05] THE REST OF THE PLANE (quick montage)
/dashboard/cron — "This same machine can work while you sleep." Open one schedule,
show wake → run → sleep, pennies on the meter.

/dashboard — fleet strip. Four specialized agents: review, research, ops.
"One dashboard. Many agents. Swap Dedalus for E2B for Sprites — your procedures
stay."

[2:05 – 2:30] WHY IT'S HARD (10 sec, optional for technical room)
Machine card → gateway row.

"The moat isn't the model. It's the control plane — gateway auth off the model path,
sleep/wake without losing disk, streaming every tool call back. We're building toward
agents provisioning agents through the same surface. Not demo'd today — but that's
where this goes."

[2:30 – 3:00] CLOSE — pull back
/dashboard full view: activity, telemetry, fleet, cron.

"Provision. Converse. Observe. Compound.
161 skills. 30 MCP servers. Any substrate.
A persistent agent machine — for humans who need to see it work.

agent-machines.dev."
```

---

### Shot list (what to click, when)

| Time | Screen | Do this |
|------|--------|---------|
| 0:00 | `/dashboard/machines` | **+ New machine** → Provision |
| 0:10 | `/dashboard` | Show **empty** activity + metrics (today blank) |
| 0:20 | `/dashboard/loadout`, `/dashboard/mcps` | Flash harness (2–3 sec each) |
| 0:35 | `/dashboard/chat` | New machine selected; type **security audit** |
| 0:45 | Chat + `/dashboard` | Alternate: tool stream ↔ heatmap/logs filling |
| 1:25 | `/dashboard/chat` | **Save this audit pattern as a skill** |
| 1:35 | `/dashboard/skills` | Show library / custom skill |
| 1:45 | `/dashboard/cron` | One drill-down (nightly or health check) |
| 1:55 | `/dashboard` | Fleet strip, switch active machine |
| 2:05 | Machine card | Gateway row (vision beat, 10 sec) |
| 2:30 | `/dashboard` | Full instrument panel pullback |

### Exact chat prompts (copy-paste)

1. `Run a security audit on this repo`
2. `Save this audit pattern as a skill`
3. (optional follow-up) `Show usage for this machine`

### Narration cheat sheet (if you blank)

| Moment | Say this |
|--------|----------|
| Empty machine | "Nothing fake. It waits for real work." |
| Tools streaming | "Watch it think — skill, browser, terminal, file." |
| Stats fill in | "Sixty seconds ago this was blank." |
| Save skill | "Chat became a procedure. Forever on disk." |
| Cron | "Same machine. 3am. No human prompt." |
| Close | "Provision. Converse. Observe. Compound." |

### Canonical demo numbers

| On camera | Source |
|-----------|--------|
| 161 skills | Loadout / skills page |
| 30 MCP servers | MCP page |
| 4 seed crons | Cron panel |
| 4 seed fleet machines | Overview fleet strip |
| New machine = empty stats until chat | By design — use fresh provision for hero beat |

---

## Demo video script (3 min) — control plane edition [archived]

<details>
<summary>Previous control-plane-first script (click to expand)</summary>

See git history / prior revision. Superseded by **the conversation movie** above.

</details>

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
**Open:** Auto-bootstrap in demo chat; unify 155/156/161 copy in provision narrative
