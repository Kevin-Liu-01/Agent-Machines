# Sandbox terminal gateway

Agent Machines exposes **four bridges** from the Next.js control plane to remote sandboxes:

| Bridge | Route | Purpose |
|--------|-------|---------|
| **Interactive console** | `GET /terminal/socket` plus HTTP/SSE fallback routes | **Live PTY** — native PTY on E2B, Sprites, and Daytona; portable tmux-over-exec fallback |
| **Machine exec** | `POST /api/dashboard/exec/stream` | Run shell on the VM; stream stdout while the command runs (one-shot) |
| **Bootstrap stream** | `GET /api/dashboard/bootstrap/stream?machineId=` | Phase checklist + live `bootstrap.log` during agent setup |
| **Agent gateway** | `POST /api/chat` | Hermes/OpenClaw HTTP API (LLM tokens — optional; console is primary) |

> **Product narrative:** See [`knowledge/BROWSER-AGENT-CONSOLE.md`](../../knowledge/BROWSER-AGENT-CONSOLE.md) — why the interactive tier is a first-class wedge (CLI-as-a-service for non-terminal users).

---

## Data flow (interactive console — live agent CLI)

```
InteractiveConsole (xterm.js)
  → POST /api/dashboard/terminal/session     ensure tmux + snapshot + byte offset
  ↔ GET  /api/dashboard/terminal/socket      pinned WebSocket → native provider PTY
  → POST /api/dashboard/terminal/input       fallback: tmux send-keys -H
  → GET  /api/dashboard/terminal/stream      fallback: SSE tail from byte offset
  → POST /api/dashboard/terminal/resize      fallback: tmux resize-window

Server (Clerk auth → resolve MachineRef + provider creds)
  → provider.openPty (native fast path)
  → lib/dashboard/terminal-session.ts (portable fallback)
  → provider.exec or provider.streamExec
       native: stdbuf -o0 tail -c +N -f /tmp/am-console.log
       fallback: poll log via exec-stream tailFileStreamOnMachine

Remote VM
  tmux session "amconsole" + pipe-pane → /tmp/am-console.log
  Agent CLI (codex / claude / hermes / openclaw) running inside the pane
```

**Why tmux still owns the session:** the direct worker relay is ephemeral and the pinned WebSocket function is bounded to one invocation. The sandbox-owned `amconsole` session survives courier reconnects and Function replacement while its process remains alive. Direct E2B/Sprites lanes attach local PTYs to tmux; Daytona uses the native-function PTY courier, with HTTP/SSE as a fallback. A filesystem-only stop/start, such as Daytona's, does not preserve tmux or agent processes: the runtime is relaunched from durable files after wake. Memory/process restoration depends on provider capabilities.

**Performance proof (2026-08-14):** the authenticated production E2B dashboard reported a 41ms latest browser-to-PTY acknowledgement and 89ms p95 across 20 human inputs. A location-aware Sprite managed Service, held active with an expiring Tasks API lease, measured 10.8ms p50 across 100 inputs paced at 100ms; 87/100 were below the 50ms target, with 75.6ms p95 and 80.8ms max from the provider proxy. Kernel PTY writes stayed sub-millisecond. The UI reports the rolling human-input p95 and warns on a breach; 50ms is deliberately not documented as a hard internet guarantee.

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

Streaming is **capability-tiered**. The engine uses each provider adapter's
streaming implementation; Daytona incrementally reads bounded session logs.
The portable fallback polls sandbox log files when an adapter cannot stream.
The SSE event contract (`started · heartbeat ·
output · done · error`) is identical across tiers, so the UI is unchanged.

| Provider | SDK primitive (`streamExec`) | Tier |
|----------|------------------------------|------|
| **E2B** | `commands.run(cmd, { onStdout, onStderr })` (bridged to a generator) | native stream |
| **Sprites** | `sprite.spawn()` → process `stdout`/`stderr` Readables (bridged) | native stream |
| **Vercel** | `Command.logs()` async iterator on a `detached` command | native stream |
| **Daytona** | Async session command + bounded `getSessionCommandLogs()` reads | incremental session-log polling |

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
| **Input latency** | Native lane: browser → pinned WebSocket → provider PTY → tmux, with measured rolling p95. Fallback lane still pays HTTP → exec → tmux. |
| **Stream reconnect** | Native socket reconnects and reattaches to tmux; SSE fallback reconnects from a byte offset. |
| **Daytona streaming** | Incremental session-log polling for one-shot commands; native SDK PTY for interactive input/output. No inherited latency guarantee. |

---

## Provider tiers

- **Native WebSocket PTY:** E2B, Sprites, and Daytona expose `provider.openPty`. The hosted socket route checks the live adapter capability. The separate direct worker relay is currently limited to E2B and Sprites.
- **Exec/SSE fallback:** Vercel Sandbox uses the portable tmux courier. Native lanes can also fall back when a WebSocket connection is unavailable; latency depends on the actual transport and provider.
- **Retired integrations:** Dedalus providers and model gateways are not supported. Historical records are retained without reconnecting to the retired service.

---

## Key files

**Interactive console**

- `web/components/dashboard/InteractiveConsole.tsx` — xterm.js UI
- `web/components/dashboard/TerminalWorkspace.tsx` — interactive vs one-shot tabs
- `web/components/dashboard/DeployAndTalk.tsx` — provision → bootstrap → `?launch=1`
- `web/lib/dashboard/terminal-session.ts` — tmux session commands + streamConsoleOutput
- `web/app/api/dashboard/terminal/socket/route.ts` — authenticated pinned WebSocket/native PTY
- `web/app/api/dashboard/terminal/{session,input,resize,stream}/route.ts` — portable fallback

**One-shot exec + bootstrap**

- `web/lib/dashboard/exec-stream.ts` — streaming engine
- `web/lib/providers/stream-util.ts` — `bridgeExecStream` adapter
- `web/lib/providers/{e2b,vercel,sprites,daytona}.ts` — hosted provider facades
- `src/mux/providers/daytona.ts` — Daytona session streaming and native PTY
- `web/lib/bootstrap/bootstrap-log.ts` — bootstrap.log path + phase wrapping
- `web/app/api/dashboard/exec/stream/route.ts` — terminal SSE
- `web/app/api/dashboard/bootstrap/stream/route.ts` — setup SSE
- `web/components/dashboard/TerminalPanel.tsx` — operator shell UI
- `web/components/dashboard/BootTranscript.tsx` — setup transcript UI
- `web/components/dashboard/CommandPalette.tsx` — ⌘K navigation to terminal/machines/registry
- `web/docs/README.md` — internal doc index

## Related dashboard APIs (not terminal-specific)

| API | Purpose |
|-----|---------|
| `POST /api/internal/cron/tick` | Vercel Cron (every 5 min): user crons + metrics collection |
| `POST /api/dashboard/metrics/collect` | on-demand usage/machine metrics → Supabase |
| `GET /api/dashboard/registry/search` | unified install catalog (MCP registry, skills.sh, npm, bundled) |
