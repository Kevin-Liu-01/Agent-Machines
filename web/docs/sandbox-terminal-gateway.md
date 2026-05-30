# Sandbox terminal gateway

Agent Machines exposes **three bridges** from the Next.js control plane to remote sandboxes:

| Bridge | Route | Purpose |
|--------|-------|---------|
| **Interactive console** | `POST /terminal/session`, `POST /terminal/input`, `GET /terminal/stream` | **Live PTY** — talk to agent CLIs in the browser (tmux-over-exec) |
| **Machine exec** | `POST /api/dashboard/exec/stream` | Run shell on the VM; stream stdout while the command runs (one-shot) |
| **Bootstrap stream** | `GET /api/dashboard/bootstrap/stream?machineId=` | Phase checklist + live `bootstrap.log` during agent setup |
| **Agent gateway** | `POST /api/chat` | Hermes/OpenClaw HTTP API (LLM tokens — optional; console is primary) |

> **Product narrative:** See [`knowledge/BROWSER-AGENT-CONSOLE.md`](../../knowledge/BROWSER-AGENT-CONSOLE.md) — why the interactive tier is a first-class wedge (CLI-as-a-service for non-terminal users).

---

## Data flow (interactive console — live agent CLI)

```
InteractiveConsole (xterm.js)
  → POST /api/dashboard/terminal/session     ensure tmux + snapshot + byte offset
  → GET  /api/dashboard/terminal/stream      SSE tail of pane log (from offset)
  → POST /api/dashboard/terminal/input       tmux send-keys -H (hex keystrokes)
  → POST /api/dashboard/terminal/resize      tmux resize-window

Server (Clerk auth → resolve MachineRef + provider creds)
  → lib/dashboard/terminal-session.ts
       ensureSessionCommand / sendKeysCommand / streamConsoleOutput
  → provider.exec or provider.streamExec
       native: stdbuf -o0 tail -c +N -f /tmp/am-console.log
       fallback (Dedalus): poll log via exec-stream tailFileStreamOnMachine

Remote VM
  tmux session "amconsole" + pipe-pane → /tmp/am-console.log
  Agent CLI (codex / claude / hermes / openclaw) running inside the pane
```

**Why tmux-over-exec:** Vercel serverless cannot host a long-lived WebSocket PTY. Session state lives on the sandbox; the control plane is stateless HTTP + SSE. Works on all four substrates with only `exec` (streaming where supported).

**Performance notes (May 2026):** Parallel xterm + session attach; paint snapshot on connect; rAF-batched writes; instant flush for control keys; 2.5s config cache + 3s machine-state cache; E2B sandbox connect reuse (45s); tmux pre-installed in bootstrap `system-deps`.

---

## Data flow (one-shot exec terminal)

```
TerminalPanel / BootTranscript
  → Next.js API (Clerk auth, resolve MachineRef + provider creds)
  → execStreamOnMachine (lib/dashboard/exec-stream.ts)
       → streamFromProvider(provider, machineId, command)
            ├─ provider.streamExec  (native streaming — preferred)
            └─ pollLogTailStream    (fallback — poll dd on /tmp/am-stream-*.log)
  → SSE events: started · heartbeat · output · done
  → UI scrollback updates incrementally
```

Streaming is **capability-tiered**. The engine prefers each provider's native
streaming primitive and only falls back to log-tail polling for providers that
physically cannot stream. The SSE event contract (`started · heartbeat ·
output · done · error`) is identical across tiers, so the UI is unchanged.

| Provider | SDK primitive (`streamExec`) | Tier |
|----------|------------------------------|------|
| **E2B** | `commands.run(cmd, { onStdout, onStderr })` (bridged to a generator) | native stream |
| **Sprites** | `sprite.spawn()` → process `stdout`/`stderr` Readables (bridged) | native stream |
| **Vercel** | `Command.logs()` async iterator on a `detached` command | native stream |
| **Dedalus** | *(none — REST exec returns output only after completion)* | poll fallback |

---

## Data flow (bootstrap setup)

```
OnboardingFlow / SetupWizard / DeployAndTalk
  → POST /api/dashboard/admin/bootstrap (phased runner)
       → each phase wrapped with wrapPhaseCommand → bootstrap.log on VM
       → bootstrapState persisted after every phase
  → BootTranscript EventSource
       → GET /api/dashboard/bootstrap/stream
            → SSE phase events (from config poll on server)
            → SSE log events (tail bootstrap.log on VM)
```

---

## Limitations

| Surface | Scope |
|---------|--------|
| **Interactive console** | Built for *agent CLIs* (Codex, Claude Code, Hermes, OpenClaw). Full TUIs supported. Not optimized as a general-purpose vim/htop replacement. |
| **One-shot exec** | Output-only while command runs; no stdin. |
| **Input latency** | Keystroke → HTTP → exec → tmux. ~100–300ms on warm Vercel + E2B; not local-terminal instant. |
| **Stream reconnect** | SSE stream bounded by serverless duration (~110s); client reconnects with byte offset. |
| **Dedalus streaming** | Poll fallback only (~300–450ms chunks). |

---

## Future tiers (not shipped)

- **Native WebSocket PTY data plane** — feasible on E2B/Sprites with a small always-on relay (control plane stays on Vercel). Would reduce input latency further.
- **Persistent Sprites WS session** — `createSession`/`attachSession` instead of per-command WS connect (~5s adapter overhead today).

---

## Key files

**Interactive console**

- `web/components/dashboard/InteractiveConsole.tsx` — xterm.js UI
- `web/components/dashboard/TerminalWorkspace.tsx` — interactive vs one-shot tabs
- `web/components/dashboard/DeployAndTalk.tsx` — provision → bootstrap → `?launch=1`
- `web/lib/dashboard/terminal-session.ts` — tmux session commands + streamConsoleOutput
- `web/app/api/dashboard/terminal/{session,input,resize,stream}/route.ts`

**One-shot exec + bootstrap**

- `web/lib/dashboard/exec-stream.ts` — streaming engine
- `web/lib/providers/stream-util.ts` — `bridgeExecStream` adapter
- `web/lib/providers/{e2b,vercel,sprites}.ts` — native `streamExec`
- `web/lib/bootstrap/bootstrap-log.ts` — bootstrap.log path + phase wrapping
- `web/app/api/dashboard/exec/stream/route.ts` — terminal SSE
- `web/app/api/dashboard/bootstrap/stream/route.ts` — setup SSE
- `web/components/dashboard/TerminalPanel.tsx` — operator shell UI
- `web/components/dashboard/BootTranscript.tsx` — setup transcript UI
