# Mux live matrix -- measured results

Every number below came from `npx tsx scripts/mux-live-test.ts` against
real provider APIs with real model keys on 2026-07-31. No synthetic or
demo values. Re-run it to refresh; the script exits non-zero if any
credentialed cell fails.

Prompt for every cell: `Reply with exactly the text MUX-OK and nothing
else. Do not use any tools.` A cell is `ok` only when the harness exits 0
and the normalized stream carries the text back.

## Latency (milliseconds)

| Agent | Sandbox | Result | create | install (cold) | first event | run total |
| --- | --- | --- | --- | --- | --- | --- |
| claude-code | e2b | ok | 328 | 9745 | 1294 | 4054 |
| codex | e2b | ok | 133 | 6596 | 362 | 4380 |
| openclaw | e2b | ok | 96 | 28541 | 15475 | 16100 |
| hermes | e2b | fails | 105 | -- | -- | -- |
| claude-code | sprites | ok | 16692 | 252 (warm) | 3678 | 7165 |
| codex | sprites | ok | 31410 | 159 (warm) | 3003 | 5119 |
| openclaw | sprites | ok | 31105 | 18625 | 12747 | 13262 |
| hermes | sprites | see note 10 | 31164 | -- | -- | -- |

Sprites `create` is bimodal: adopting a warm sprite measures ~400ms, while
provisioning a fresh one measures 17-31s. E2B create is consistently
~100-330ms. Hermes is the one red cell and the reason is environmental,
not a routing defect -- see finding 10.

`install` is a one-time per-sandbox cost and is skipped entirely when the
harness is already present (the 154ms figure is that probe-only path).
`first event` is time to the first normalized `MuxAgentEvent`, which is
what a UI can render.

Substrate primitives measured separately:

| Substrate | create | exec (cold) | exec (warm) |
| --- | --- | --- | --- |
| e2b | 265ms | 122ms | -- |
| sprites | 401ms | 296ms | 87ms |

The Sprites warm number is the `execFileHTTP` fast path. The old
WebSocket-per-exec path measured ~5.3s in the May 2026 benchmarks; both
the mux provider and `web/lib/providers/sprites.ts` now prefer HTTP and
fall back to WS only on transport errors.

## Findings that changed the implementation

1. **Sandbox images ship old Node.** E2B base is Node v20.9.0, below
   Claude Code's floor of 22 and OpenClaw's 24.15. Rather than depend on
   the image or sudo, harnesses bootstrap a private Node 24.18.1 into
   `~/.agent-machines/node` and prefix `PATH`
   (`src/mux/harnesses/node-runtime.ts`).
2. **A `PATH=... cmd` prefix does not survive a pipeline.** `PATH=x echo
   | claude` applies the assignment only to `echo`, so the harness died
   with exit 127. Fixed by wrapping in a brace group with `export`.
3. **OpenClaw requires a session target even for `--local` one-shots**
   (`Pass --to, --session-key, --session-id, or --agent`). The adapter
   now always passes `--session-key`, mapping `sessionId` onto it.
4. **OpenClaw `--json` is pretty-printed, not NDJSON.** Line-at-a-time
   parsing never saw a complete object, so the adapter has a per-run
   parser that accumulates lines until brace depth balances (string-aware).
5. **Sprites `create` returns intermittent 500s that still create the
   sprite.** 2 of 3 identical requests failed; a naive retry then hit
   409. The provider retries transients with backoff and adopts an
   existing sprite on conflict, making named creates get-or-create.
6. **`npm -g` is not portable across substrates.** E2B installs to
   `/usr/local` (on PATH), while Sprites routes Node through nvm whose
   global bin is *not* on PATH -- `npm install -g openclaw` reported
   success and left `openclaw` unfindable. Pinning `npm_config_prefix`
   fixes the path but nvm hard-refuses that variable, so harnesses now
   install into `$HOME/.agent-machines/pkgs` with `npm install --prefix`
   and that `node_modules/.bin` is always on the harness PATH.
7. **Long installs must not be held on a connection.** A foreground
   install outlived E2B's sandbox budget and tripped Sprites' WebSocket
   keepalive. Installs now write a script to the sandbox, launch it
   detached, and poll for an exit-code sentinel, so duration is
   independent of any connection limit and re-running is idempotent.
8. **Sprites' HTTP exec waits for the whole process group**, so
   `setsid`/`nohup`/closed-fd detachment does not return early: a
   `sleep 45` payload returned in 45.2s. Background work is now handed to
   the sprite's tmux server (`tmux new-session -d`), which returns in
   ~250ms. Two follow-on gotchas: a detachable *exec session* is not a
   substitute (closing its socket reaps the payload), and the launcher
   must go through the base64-wrapped `exec` path -- passing its own
   quoting as raw argv made tmux report success while running nothing.
9. **Sprites auto-suspends on idle and background work does not keep it
   awake.** A detached payload plus a fully idle client froze before
   finishing; the same payload completed when the client kept touching
   the sprite. The install poll loop (1.5s) is what keeps it warm, so do
   not lengthen that interval without adding an explicit keepalive.
10. **Hermes cannot install on E2B's default template.** The installer
   (curl script, Python venv, Node browser deps) exhausts the base
   sandbox -- 478 MB and 2 vCPU -- and the VM stops answering RPCs after
   ~150s. `CreateSandboxOptions` now carries `template` and `resources`
   so callers can ask for more, but E2B ignored the sizing request on
   this plan: Hermes needs a pre-baked template (or a larger plan), which
   is why the adapter marks it heavy-install.
7. **A `vck_` key is not Vercel Sandbox auth.** The Vercel provider fails
   closed with that exact explanation and asks for
   `VERCEL_TOKEN`+`VERCEL_TEAM_ID`+`VERCEL_PROJECT_ID` or
   `VERCEL_OIDC_TOKEN`.

## Uncredentialed lanes

`vercel` and `dedalus` report `skipped` with the precise missing
variables rather than erroring. That is the fail-closed contract: the
router never routes to a provider it cannot authenticate, and the skip
reason is carried in `machine.attempts` so the UI can explain the route.
