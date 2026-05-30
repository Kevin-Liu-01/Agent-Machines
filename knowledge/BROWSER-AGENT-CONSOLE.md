# Browser Agent Console — why this is a big deal

> **Status:** Shipped (May 2026). Interactive tier live on `/dashboard/machines/[id]/terminal`.
> **One-liner:** We put Claude Code, Codex, Hermes, and OpenClaw in a browser tab — the *real* CLI, on a remote worker, with no local terminal and no tunnel.
> **Bigger frame:** This isn't just "no browser terminal for agents." It's that **browser terminals in general** don't ship on modern serverless control planes — unless you invert where the session lives.

---

## The insight

The most capable agent tools today ship as **CLIs**, not chat widgets:

| Runtime | Interface | Who it's built for |
|---------|-----------|-------------------|
| Claude Code | `claude` TUI | Developers with a local shell |
| Codex | `codex` TUI | Developers with a local shell |
| Hermes | `hermes chat` REPL | Power users / infra people |
| OpenClaw | `openclaw chat` | Same |

**Most people who would benefit from these tools have never opened a terminal.** They don't have iTerm habits, don't know what `ssh` is, and won't paste API keys into a black box on their laptop.

The industry default is still: *install locally → learn shell → manage keys → pray.*

Agent Machines inverts that: **Deploy → bootstrap → attach → talk to the real CLI in your browser.**

That's not a terminal feature. That's **CLI-as-a-service for non-terminal users** — and a distribution wedge the same shape as ChatGPT (API → usable product) or Vercel (AWS → deploy button).

---

## Why there are almost no browser terminals — and how we built one anyway

It's not just that nobody ships a browser terminal **for deployed agents**. There are almost **no browser terminals in general** on the kind of stack most products actually run today (Next.js on Vercel, serverless API routes, no always-on relay). That's not because xterm.js is hard — it's because the **default design assumes something Vercel cannot be: a long-lived WebSocket PTY server in the middle.**

### The architecture everyone tries first (and why it breaks)

The mental model is SSH-in-a-tab:

```
Browser  ←——WebSocket——→  Your API  ←——WebSocket——→  Remote PTY
                              ↑
                    long-lived connection
                    must stay open for hours
                    must pipe stdin + stdout both ways
```

That works on **localhost**. It breaks the moment your product is a **serverless control plane**:

| Requirement | What Vercel (and most serverless) gives you |
|-------------|---------------------------------------------|
| Hold a WebSocket open for the whole session | Function dies at ~110s; no persistent socket server |
| Stream stdin/stdout with PTY semantics | Request/response or short SSE bursts, not a shell |
| Keep one process bound to one user's keystrokes | Cold starts, concurrency limits, no sticky sessions |

So teams hit one of **three walls** — you've seen all of them:

| Path | What you get | What you lose |
|------|--------------|---------------|
| **Assume local terminal** | Real CLI fidelity (`claude`, `codex` on your laptop) | 99% of users; fleet; observation; deploy-in-a-tab |
| **Wrap agents in chat UI** | Friendly for non-devs | Full TUI/CLI — Codex screen, Claude Code UX, Hermes REPL, tool loops |
| **Sandbox product with *their* terminal** | A shell in *their* dashboard | Lock-in — E2B's box, Modal's box, Replit's box; not neutral infra |
| *(fourth, ugly)* **Tunnels / relays you don't want to own** | WS PTY through Cloudflare / custom gateway | Ops burden, cost, security surface — just to punch a hole |

Agent runtime vendors ship **local CLIs**. Substrate vendors ship **their shell in their UI**. Serverless SaaS dashboards ship **chat or "open iTerm."** Nobody connects: *deploy on neutral infra → attach browser → operate the real runtime* — because PTY wants a persistent wire and the control plane is stateless.

**The closest predecessor is probably AWS CloudShell** — a real browser terminal — but it's locked into the AWS ecosystem. Same class of idea, different moat: theirs is the cloud; ours is **any sandbox + any agent CLI + a serverless dashboard.**

### The inversion (how we got around an odd engineering problem)

Don't fight serverless. **Stop trying to host the session in the API.**

Invert the problem:

1. **Session lives on the box** — `tmux` + `pipe-pane` log on the worker. The PTY, scrollback, and agent process survive cold starts and function timeouts.
2. **Control plane is stateless HTTP + SSE** — no WebSocket server on Vercel; no tunnel required for the console path.
3. **Input:** `tmux send-keys -H` (hex bytes, one quick exec per batch).
4. **Output:** unbuffered `tail -f` on the pane log (streamed back via SSE; native `streamExec` where available).

**Boom — the same UI works across Dedalus, E2B, Sprites, and Vercel.** Exec is the only substrate primitive you need.

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (xterm.js)                                         │
│    keystrokes ──POST──►  input route                        │
│    output     ◄──SSE───  stream route                       │
└────────────────────────────┬────────────────────────────────┘
                             │  stateless HTTP + SSE
                             │  (auth, resolve machine, exec)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  VERCEL CONTROL PLANE  — no long-lived socket, no PTY here  │
└────────────────────────────┬────────────────────────────────┘
                             │  provider.exec / streamExec
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  SANDBOX (E2B · Sprites · Vercel · Dedalus)                 │
│                                                             │
│   tmux session "amconsole"  ◄── the real interactive session│
│        │                                                    │
│        ├── pipe-pane ──► /tmp/am-console.log  (all output)  │
│        └── pane runs: codex | claude | hermes | openclaw    │
│                                                             │
│   input:  tmux send-keys -H <hex bytes>   (one quick exec)  │
│   output: stdbuf -o0 tail -f log         (streamed back)    │
│   resize: tmux resize-window               (one quick exec)  │
└─────────────────────────────────────────────────────────────┘
```

That's the trick: **interactivity without a persistent control-plane socket.** The browser *feels* like a terminal because the *box* holds a real session; the dashboard is a dumb, retryable courier.

The missing primitive wasn't xterm. It was **"stateless courier, stateful worker."**

### Two products in one (highkey)

What Agent Machines ships as one flow is really **two breakthroughs stacked**:

| Layer | What it is |
|-------|------------|
| **Agent control plane** | Deploy → bootstrap → attach → talk to the **real CLI** on **neutral infra**, with router + credential gates upstream |
| **Serverless browser terminal** | How you get a terminal in the browser when your API can't host WebSocket PTY — tmux-over-exec + SSE |

The second layer **could be a separate product.** Any team building on Vercel with remote workers (CI debug shells, support consoles, internal tools, sandbox SaaS) hits the same wall. We happened to need it because agent CLIs *are* terminals — and almost nobody else solved it without owning relay infra.

### Why that's significant (not incremental)

| Old world | After the inversion |
|-----------|---------------------|
| Browser terminal = WS PTY server you host | Browser terminal = tmux on worker + HTTP/SSE courier |
| Agent CLIs = local-only | Agent CLIs = deploy + tab |
| Serverless dashboard = chat shim or "use iTerm" | Serverless dashboard = live operator console |
| Terminal = locked to one cloud (CloudShell → AWS) | Terminal = same UI on four substrates |
| PTY = infrastructure problem | PTY = solved once, reuse everywhere |

We didn't wait for sandboxes to ship terminals or for Anthropic/OpenAI to ship web CLIs. We made **existing CLIs operable from a serverless product surface** — which is the shape every modern control plane wants to be in.

Once you see the inversion, **Deploy → Bootstrap → Attach → Talk** isn't a feature list. It's the obvious consequence.

---

## What we actually built (be precise)

### Not this

- "A terminal in the browser." — Table stakes. xterm.js, CloudShell, Codespaces, Replit, ttyd, etc. have existed for years.
- "Chat with an agent." — We deliberately did *not* fake it. Full-screen TUIs, arrow keys, Ctrl-C, tab completion — the actual runtime.

### This

**A substrate-agnostic, serverless-safe live console that turns deployed agent CLIs into a first-class product surface.**

```
Browser (xterm.js)
  │  keystrokes ──POST──► /api/dashboard/terminal/input  (tmux send-keys -H)
  │  output ◄──SSE────── /api/dashboard/terminal/stream  (tail -f pane log)
  ▼
Next.js control plane (Vercel — Clerk auth, resolve machine + provider creds)
  ▼
Provider exec (E2B · Sprites · Vercel Sandbox · Dedalus)
  ▼
Remote VM: tmux session "amconsole" + pipe-pane → /tmp/am-console.log
  ▼
Agent CLI running *inside* the pane (codex / claude / hermes / openclaw)
```

### Why the architecture is unusual (summary)

The full story: [Why there are almost no browser terminals](#why-there-are-almost-no-browser-terminals--and-how-we-built-one-anyway) above.

**One sentence:** Browser terminals don't ship on serverless because everyone assumes a long-lived WebSocket PTY in the API — Vercel can't be that. We inverted it: tmux + pipe-pane on the worker; stateless HTTP + SSE in the control plane; `send-keys -H` in, unbuffered `tail -f` out. Same UI on Dedalus, E2B, Sprites, Vercel.

Agent Machines stacks **agent deploy on neutral infra** (deploy → bootstrap → attach → real CLI, router/credential gates) on top of **a serverless browser terminal pattern that could be its own product.**

---

## The full user journey (what "cool" feels like)

1. Pick substrate (E2B / Sprites / Vercel / Dedalus) + agent (Codex / Claude Code / Hermes / OpenClaw).
2. Credential gate blocks spin-up if keys/router aren't configured — no silent failures.
3. **Deploy & Talk** — provision → bootstrap → redirect to terminal with `?launch=1`.
4. Browser attaches tmux console, paints existing pane snapshot instantly, streams live output.
5. Agent CLI auto-launches; user types as if local — including full TUIs for Codex/Claude.
6. No Cloudflare tunnel required for console path (exec-first); HTTP chat is optional degradation.

---

## Why competitors don't have this (yet)

| Approach | Gap |
|----------|-----|
| **Local CLI only** | Locks out 99% of potential users; no fleet, no observation, no presets |
| **Chat-only agent UI** | Loses TUI richness, tool loops, muscle memory of the real runtime |
| **Single-substrate sandbox UI** | E2B/Modal/Replit have *a* shell — not neutral routing + harness + bootstrap + agent launch |
| **Raw BYOS SDK** | Engineer swaps Docker for E2B; still no deploy, skills, cron, fleet, or one-click attach |

Our moat is the **integrated stack**: harness composition + neutral routing + observation + **live CLI attach** — not xterm.js itself.

---

## Positioning copy (use anywhere)

**Short:**

> Agent Machines deploys skilled workers to any sandbox and lets you operate them through the real agent CLI in your browser — no local terminal, no tunnel, no "paste your API key into iTerm."

**Medium:**

> The best agent tools are CLIs. Almost nobody uses a terminal. We built the bridge: one-click deploy, bootstrap the runtime on E2B/Sprites/Vercel/Dedalus, attach a live console, and talk to Codex, Claude Code, Hermes, or OpenClaw like you're SSH'd in — from a tab.

**Technical (for engineers):**

> Serverless-safe PTY emulation: tmux-over-exec with hex send-keys input and unbuffered tail -f output over SSE, tiered native streaming per provider, credential-gated provisioning, exec-first gateway (no mandatory Cloudflare tunnel).

**The "why it didn't exist" pitch:**

> There are almost no browser terminals on serverless stacks because everyone designs for a long-lived WebSocket PTY in the middle — and Vercel can't be that. Teams assume local iTerm, fake it with chat, or lock you into their sandbox's shell. We inverted it: tmux on the worker, stateless HTTP + SSE in the API. Same terminal UI on four substrates. CloudShell did it for AWS; we did it for neutral agent infra.

**Standalone product angle:**

> The tmux-over-exec + SSE pattern solves "how do you get a terminal in the browser when your control plane is serverless?" — independent of agents. We built it because Codex and Claude Code *are* terminals. Highkey could spin out.

---

## What honest limits remain

- **Latency:** Each keystroke batch is HTTP → exec → tmux. Warm instances ~100–300ms; not local-terminal instant. E2B connect caching + config caching help on Vercel.
- **Stream reconnect:** Vercel function budget (~110s) forces periodic SSE reconnect; gap is ~100ms.
- **Dedalus:** Poll fallback for streaming (~300–450ms chunks); no native streamExec.
- **Not for vim/htop** as primary UX — built for *agent CLIs*, not general sysadmin.

These are product tradeoffs, not failures. The goal is **operate agent runtimes**, not replace SSH for everything.

---

## Key files

| Layer | Path |
|-------|------|
| Interactive UI | `web/components/dashboard/InteractiveConsole.tsx` |
| Terminal page | `web/app/dashboard/machines/[machineId]/terminal/page.tsx` |
| Deploy & Talk | `web/components/dashboard/DeployAndTalk.tsx` |
| Session attach | `web/app/api/dashboard/terminal/session/route.ts` |
| Input (send-keys) | `web/app/api/dashboard/terminal/input/route.ts` |
| Output (SSE stream) | `web/app/api/dashboard/terminal/stream/route.ts` |
| tmux session logic | `web/lib/dashboard/terminal-session.ts` |
| One-shot exec stream | `web/lib/dashboard/exec-stream.ts` |
| Engineering spec | `web/docs/sandbox-terminal-gateway.md` |

---

## Related docs

- [Four-paragraph explainer (shareable)](./BROWSER-AGENT-CONSOLE-EXPLAINER.md)
- [YC partner prep — runtime risk / substrate copy / who pays](./YC-PARTNER-PREP.md)
- [Fleet dashboard notes](./FLEET-DASHBOARD-2026-05-22.md)
- Demo script in repo root [`memory.md`](../memory.md)

---

## Wiki update (personal)

If syncing to kevin-wiki: add under `wiki/projects/agent-machines.md` or `wiki/architecture/` — **Browser Agent Console** as a first-class architectural decision (May 2026).
