# Browser Agent Console — why this is a big deal

> **Status:** Shipped (May 2026); native-PTY WebSocket acceleration shipped August 2026. Interactive tier live on `/dashboard/machines/[id]/terminal`.
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

It's not just that nobody ships a browser terminal **for deployed agents**. There are almost **no substrate-neutral browser terminals** on the kind of stack most products actually run today. Vercel WebSocket Functions removed one historical blocker in June 2026, but a bounded Function still cannot be the durable owner of a shell. The worker has to own the session; the socket is only an accelerated courier.

### The architecture everyone tries first (and what still breaks)

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
| Hold one API process for the whole session | A WebSocket Function is pinned but bounded; reconnects land on replacement invocations |
| Preserve the shell and scrollback | Function state disappears; the worker must own durable terminal state |
| Target 50ms input acceptance | A fresh HTTP Function + provider exec per input has too much avoidable tail latency; provider and internet jitter still prevent a hard ceiling |

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

Don't fight serverless. **Stop trying to make the API own the session.**

Invert the problem:

1. **Session lives on the box** — `tmux` + `pipe-pane` log on the worker. The PTY, scrollback, and agent process survive cold starts and function timeouts.
2. **Native fast path:** one authenticated Vercel WebSocket Function pins one provider PTY and attaches it to `amconsole` on E2B/Sprites.
3. **Portable fallback:** `tmux send-keys -H` input plus an unbuffered SSE `tail -f` works anywhere `exec` exists.
4. **Reconnect is cheap:** a replacement socket reattaches to the same worker-owned tmux session.

**Boom — the same UI works across Dedalus, E2B, Sprites, and Vercel.** Exec is the only substrate primitive you need.

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (xterm.js)                                         │
│    input/output/resize ◄─WebSocket─► native PTY             │
│    fallback: POST input + SSE output                        │
└────────────────────────────┬────────────────────────────────┘
                             │  authenticated, bounded data plane
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  VERCEL CONTROL PLANE  — pinned socket, no durable shell     │
└────────────────────────────┬────────────────────────────────┘
                             │  provider.openPty or exec / streamExec
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  SANDBOX (E2B · Sprites · Vercel · Dedalus)                 │
│                                                             │
│   tmux session "amconsole"  ◄── the real interactive session│
│        │                                                    │
│        ├── pipe-pane ──► /tmp/am-console.log  (all output)  │
│        └── pane runs: codex | claude | hermes | openclaw    │
│                                                             │
│   fast: native provider PTY attached to amconsole           │
│   fallback: send-keys + unbuffered log tail                 │
└─────────────────────────────────────────────────────────────┘
```

That's the trick: **a fast socket without putting session truth in the socket.** The browser feels local because the wire is persistent; reconnects are safe because the box owns the real session.

The missing primitive wasn't xterm. It was **"stateless courier, stateful worker."**

### Two products in one (highkey)

What Agent Machines ships as one flow is really **two breakthroughs stacked**:

| Layer | What it is |
|-------|------------|
| **Agent control plane** | Deploy → bootstrap → attach → talk to the **real CLI** on **neutral infra**, with router + credential gates upstream |
| **Serverless browser terminal** | Worker-owned tmux, accelerated by a pinned native PTY socket with a portable exec/SSE fallback |

The second layer **could be a separate product.** Any team building on Vercel with remote workers (CI debug shells, support consoles, internal tools, sandbox SaaS) hits the same wall. We happened to need it because agent CLIs *are* terminals — and almost nobody else solved it without owning relay infra.

### Why that's significant (not incremental)

| Old world | After the inversion |
|-----------|---------------------|
| Browser terminal = API process owns the shell | Browser terminal = tmux owns the shell; socket and HTTP/SSE are replaceable couriers |
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
  │  input/output/resize ◄─WebSocket─► /api/dashboard/terminal/socket
  │  fallback: POST /terminal/input + SSE /terminal/stream
  ▼
Next.js control plane (Vercel — Clerk auth, resolve machine + provider creds)
  ▼
Provider native PTY (E2B/Sprites) or exec/stream (portable fallback)
  ▼
Remote VM: tmux session "amconsole" + pipe-pane → /tmp/am-console.log
  ▼
Agent CLI running *inside* the pane (codex / claude / hermes / openclaw)
```

### Why the architecture is unusual (summary)

The full story: [Why there are almost no browser terminals](#why-there-are-almost-no-browser-terminals--and-how-we-built-one-anyway) above.

**One sentence:** Worker-owned tmux plus an origin-locked direct WebSocket removes the control-plane hot path, while correlated failover lanes and HTTP `send-keys` + SSE preserve exactly-once input and portability.

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

> Serverless-safe browser PTY: worker-owned tmux, one primary plus five preconnected direct worker lanes with a 12ms deduplicated retry, and a hex send-keys + unbuffered SSE fallback on every exec-capable substrate. Production E2B: 41ms latest / 89ms p95 across 20 human inputs; location-aware Sprite: 10.8ms p50 / 75.6ms p95 across 100 paced inputs.

**The "why it didn't exist" pitch:**

> Browser terminals usually make one server own the socket and shell. We split those lifetimes: tmux owns the durable session on the worker; Vercel's pinned socket accelerates native PTY lanes; HTTP/SSE remains the portable fallback. CloudShell did it for AWS; we did it for neutral agent infra.

**Standalone product angle:**

> The worker-owned tmux + replaceable data-plane pattern solves "how do you get a fast terminal without tying shell lifetime to an API process?" — independent of agents. We built it because Codex and Claude Code *are* terminals.

---

## What honest limits remain

- **Direct-lane latency:** Production E2B, 2026-08-14: 41ms latest and 89ms p95 across 20 human inputs. A location-aware Sprite Service reached 10.8ms p50 across 100 paced inputs, but periodic provider-proxy stalls produced 75.6ms p95 and 80.8ms max. The worker PTY write remained sub-millisecond. The rolling UI badge treats 50ms as a target and makes every breach visible.
- **Socket reconnect:** Vercel bounds an invocation; the client reconnects and the new native PTY reattaches to worker-owned tmux.
- **Fallback latency:** Vercel Sandbox and Dedalus still use HTTP → exec → tmux; the native latency SLO is not claimed for those lanes.
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
| Native PTY socket | `web/app/api/dashboard/terminal/socket/route.ts` |
| Input (send-keys) | `web/app/api/dashboard/terminal/input/route.ts` |
| Output (SSE stream) | `web/app/api/dashboard/terminal/stream/route.ts` |
| tmux session logic | `web/lib/dashboard/terminal-session.ts` |
| One-shot exec stream | `web/lib/dashboard/exec-stream.ts` |
| Engineering spec | `web/docs/sandbox-terminal-gateway.md` |

---

## Related docs

- [Four-paragraph explainer (shareable)](./BROWSER-AGENT-CONSOLE-EXPLAINER.md)
- [Technical whitepaper — primitives, patterns, positioning](../docs/WHITEPAPER.md)
- [Fleet dashboard notes](./FLEET-DASHBOARD-2026-05-22.md)
- Demo script in repo root [`memory.md`](../memory.md)

---

## Wiki update (personal)

If syncing to kevin-wiki: add under `wiki/projects/agent-machines.md` or `wiki/architecture/` — **Browser Agent Console** as a first-class architectural decision (May 2026).
