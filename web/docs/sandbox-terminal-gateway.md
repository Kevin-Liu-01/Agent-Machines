# Sandbox terminal gateway

Agent Machines exposes **two bridges** from the Next.js control plane to remote sandboxes:

| Bridge | Route | Purpose |
|--------|-------|---------|
| **Machine exec** | `POST /api/dashboard/exec/stream` | Run shell on the VM; stream stdout while the command runs |
| **Bootstrap stream** | `GET /api/dashboard/bootstrap/stream?machineId=` | Phase checklist + live `bootstrap.log` during agent setup |
| **Agent gateway** | `POST /api/chat` | Hermes/OpenClaw HTTP API (LLM tokens — not shell) |

## Data flow (exec terminal)

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

**Native tiers** (E2B / Sprites / Vercel): output is relayed frame-by-frame as
the SDK delivers it — no extra `exec` calls, no `dd` byte-scanning, no fixed
poll latency. The shared callback→generator adapter lives in
`lib/providers/stream-util.ts` (`bridgeExecStream`); Vercel uses its native
iterator directly.

**Poll fallback** (Dedalus only): launch the command in a detached shell on the
VM, tee combined stdout/stderr to a temp log, and poll new bytes from the
control plane until an exit-marker file appears. This is the legacy universal
path, now scoped to the one provider that needs it.

## Data flow (bootstrap setup)

```
OnboardingFlow / SetupWizard
  → POST /api/dashboard/admin/bootstrap (phased runner)
       → each phase wrapped with wrapPhaseCommand → bootstrap.log on VM
       → bootstrapState persisted to Clerk after every phase
  → BootTranscript EventSource
       → GET /api/dashboard/bootstrap/stream
            → SSE phase events (from Clerk poll on server)
            → SSE log events (tail bootstrap.log on VM)
```

## Limitations

- **Output-only, not interactive** — this gateway streams stdout/stderr while a
  command runs over SSE; it does not pipe keystrokes back in. Interactive TTY
  apps (`vim`, `less`, `htop`, REPLs) are out of scope for this surface.
- **Native PTY is available but not wired here** — E2B (`Pty` class) and Sprites
  (`spawn({ tty: true })` + `createSession`/`attachSession` tmux, `resize`)
  expose real bidirectional PTYs. A future interactive terminal would use a
  WebSocket data plane + `xterm.js` (see "Interactive PTY (future tier)" below),
  *not* a Vercel serverless function (which can't host long-lived WS).
- **Dedalus poll latency** — on the fallback path only, output appears in
  ~300–450ms chunks (one provider `exec` per poll). Native tiers are real time.

## Interactive PTY (future tier)

A genuinely interactive terminal is feasible on **E2B** and **Sprites** (both
have full PTY + stdin + resize), partial on **Vercel** (output stream, no
post-start stdin), and impossible on **Dedalus** (no PTY/stream primitive). The
proper architecture keeps the Next.js function as a **control plane** (auth +
mint a scoped token) and runs the **data plane browser↔sandbox** (or via one
small always-on relay) — because Vercel serverless functions cannot hold a
long-lived WebSocket, a naive WS PTY route would only work on localhost.

## Key files

- `web/lib/dashboard/exec-stream.ts` — streaming engine (`streamFromProvider`, poll fallback)
- `web/lib/providers/stream-util.ts` — `bridgeExecStream` callback→generator adapter
- `web/lib/providers/{e2b,vercel,sprites}.ts` — native `streamExec` implementations
- `web/lib/bootstrap/bootstrap-log.ts` — bootstrap.log path + phase wrapping
- `web/app/api/dashboard/exec/stream/route.ts` — terminal SSE
- `web/app/api/dashboard/bootstrap/stream/route.ts` — setup SSE
- `web/components/dashboard/TerminalPanel.tsx` — operator shell UI
- `web/components/dashboard/BootTranscript.tsx` — setup transcript UI
