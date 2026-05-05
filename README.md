# hermes-persistent

> A persistent agent with a body and a memory.

A fully-loaded [Hermes Agent](https://github.com/NousResearch/hermes-agent) deployed onto a [Dedalus Machine](https://docs.dedaluslabs.ai/dcs) — exposing an OpenAI-compatible chat API, a web dashboard, a knowledge base of skills lifted from the kevin-wiki, scheduled cron automations, and a polished Next.js chat UI built on the Reticle / Sigil design system.

```
                          [ you @ npm run chat ]
                                    │
                                    ▼  /v1/chat/completions
            ┌──────────────────────────────────────────┐
            │  https://<preview>.dedaluslabs.ai        │  ← public URL
            └──────────────────────────────────────────┘
                                    │
        ╔══════════════════ Dedalus Machine ════════════════════╗
        ║   :8642  hermes gateway   ── OpenAI-compatible API    ║
        ║   :9119  hermes web       ── browser dashboard        ║
        ║                                                        ║
        ║   /home/machine/.hermes/                               ║
        ║     ├─ skills/   ← 13 skills from kevin-wiki           ║
        ║     ├─ cron/     ← 4 scheduled automations             ║
        ║     ├─ MEMORY.md ← agent memory                        ║
        ║     ├─ USER.md   ← Kevin profile                       ║
        ║     └─ SOUL.md   ← persona                             ║
        ╚════════════════════════════════════════════════════════╝
                                    │  inference (200+ models)
                                    ▼
                  https://api.dedaluslabs.ai/v1
```

## What's different from the baselines

[`dedalus-labs/openclaw-demo`](https://github.com/dedalus-labs/openclaw-demo) and [`AgentWings/hermes-agent-ddls`](https://github.com/AgentWings/hermes-agent-ddls) prove the path: provision a machine, install the agent, point it at Dedalus as the OpenAI provider. This repo extends that to a real, opinionated deployment.

| | openclaw-demo | hermes-agent-ddls | **hermes-persistent** |
|---|---|---|---|
| **Surface** | local gateway | local MCP | public OpenAI API + dashboard + Next.js UI |
| **Auth** | none | none | bearer token + DNS rebinding guard |
| **Lifecycle** | destroy on Ctrl-C | manual | full CLI: deploy / chat / status / logs / wake / sleep / destroy / shell / reload |
| **Idempotency** | none | none | every bootstrap phase short-circuits when already done |
| **Knowledge** | none | none | 13 SKILL.md files lifted from kevin-wiki (security, computer-use, design taste, kevin-voice, …) |
| **Memory** | none | default | pre-seeded SOUL/USER/MEMORY/AGENTS files |
| **Automation** | none | none | 4 cron jobs (health check, wiki digest, skill audit, memory consolidation) |
| **UI** | none | none | Reticle/Sigil-styled Next.js chat with starter prompts and streaming |
| **Persistence** | destroy | machine survives | sleep ↔ wake by default; no destruction without `--yes` |

## Quick start

```bash
git clone https://github.com/Kevin-Liu-01/hermes-persistent
cd hermes-persistent
cp .env.example .env
# paste your DEDALUS_API_KEY into .env

npm install
npm run deploy
```

After ~6-10 minutes (most of which is `uv pip install hermes-agent`), you get:

```
  API URL:        https://<preview>.dedaluslabs.ai/v1
  API Key:        hp-<random>
  Dashboard:      https://<preview>.dedaluslabs.ai
  Machine ID:     dm-<id>

  Quick chat:     npm run chat -- "Say hi in one sentence."
```

State is recorded in `.machine-state.json` (gitignored). Subsequent CLI commands reuse the same machine.

## CLI

```bash
npm run deploy             # provision (or wake) and bootstrap
npm run chat -- "msg"      # streaming single-turn chat
npm run status             # machine phase, port bindings, API health
npm run logs               # tail the gateway log (-- -n 200 for more)
npm run wake               # resume a sleeping machine
npm run sleep              # pause to save costs (state preserved)
npm run destroy -- --yes   # permanent delete
npm run shell              # print `dedalus ssh` invocation
npm run reload             # re-upload knowledge/ folder
```

## Web UI (Next.js + Reticle/Sigil)

Optional polished chat frontend. Lives in `web/`. Streams via a server-side proxy so the bearer token never reaches the browser.

```bash
cd web
cp .env.local.example .env.local
# paste HERMES_API_URL and HERMES_API_KEY from `npm run deploy` output
npm install
npm run dev
```

Open [http://localhost:3210](http://localhost:3210). Or deploy to Vercel — same env vars, same surface.

## What ships into the machine

`knowledge/` is tarballed and uploaded into `~/.hermes/` on every deploy.

```
knowledge/
├── SOUL.md          # persona — direct, surgeon-not-painter, no emoji
├── USER.md          # Kevin's profile — preferences, stack, conventions
├── MEMORY.md        # what the agent knows about its environment
├── AGENTS.md        # operating principles (loaded into system prompt)
├── crons/
│   └── seed.json    # 4 cron jobs: health, digest, audit, consolidation
└── skills/
    ├── agent-ethos/SKILL.md
    ├── empirical-verification/SKILL.md
    ├── production-safety/SKILL.md
    ├── git-workflow/SKILL.md
    ├── kevin-voice/SKILL.md
    ├── content-strategy/SKILL.md
    ├── frontend-design-taste/SKILL.md
    ├── reticle-design-system/SKILL.md
    ├── automation-cron/SKILL.md
    ├── security-audit/SKILL.md
    ├── computer-use/SKILL.md
    ├── plan-mode-review/SKILL.md
    ├── taste-output/SKILL.md
    └── dedalus-machines/SKILL.md
```

Edit any of these and run `npm run reload` to push them onto the live machine without re-bootstrapping.

## Tools available to the agent

Hermes is configured with the full toolset. By default the agent can call:

| Tool | What it does |
|------|--------------|
| `terminal` | shell commands inside the VM |
| `read_file`, `write_file`, `patch`, `search` | file ops |
| `web_search`, `web_extract` | search the web, scrape pages |
| `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, … | Playwright automation |
| `vision_analyze` | describe an image |
| `image_generate` | FLUX via FAL (requires `FAL_KEY` if you want this) |
| `tts` | text-to-speech (Edge TTS by default; ElevenLabs if keyed) |
| `execute_code` | sandboxed Python that can call other tools via RPC |
| `delegate_task` | spawn a subagent for parallel work |
| `cronjob` | create/list/edit/remove scheduled tasks |
| `skills_list`, `skill_view` | introspect the loaded skills |
| `memory` | read/update MEMORY.md and USER.md |
| `session_search` | FTS5 search over past sessions |

## Lifecycle

Sleep / wake is the loop. Sleep stops per-second billing while preserving the persistent volume (`/home/machine`). Wake is fast (seconds) and re-runs bootstrap idempotently to repair any transient process drift (gateway, dashboard).

```bash
npm run sleep    # ↓ pause
npm run wake     # ↑ resume — same skills, memory, sessions, port bindings
```

You only `npm run destroy` when you mean it.

## How it works

1. `src/cli.ts` dispatches to `src/commands/*`.
2. `commands/deploy.ts` finds-or-creates a machine via the Dedalus SDK, then runs the bootstrap pipeline.
3. `lib/bootstrap.ts` orchestrates 9 idempotent phases: apt deps, uv, hermes, seed knowledge, configure, seed crons, start gateway, start dashboard, mark version.
4. `lib/upload.ts` tarballs the `knowledge/` folder and base64-pipes it to the VM (heredocs are unreliable through the execution API).
5. `lib/exec.ts` wraps `client.machines.executions.create` with polling, timeouts, and structured errors.
6. `lib/api.ts` streams `/v1/chat/completions` SSE chunks for the CLI's `chat` command.
7. The `web/` Next.js app reads `HERMES_API_URL` + `HERMES_API_KEY` server-side and proxies `/api/chat` → upstream SSE so the bearer token never reaches the browser.

## Constraints discovered (so you don't have to)

- Heredocs (`cat << 'EOF'`) are unreliable through the execution API. Use base64 + `printf` for any multi-line content.
- The root filesystem is small (~2.4 GB, 60-70% used). Pin `HOME`, `UV_CACHE_DIR`, and the venv to `/home/machine` or installs `ENOSPC`.
- Guest agent needs ~5s after `phase=running` before the first exec succeeds (`503` otherwise).
- `hermes-agent` is **not on PyPI**; install via `uv pip install 'hermes-agent[web] @ git+https://github.com/NousResearch/hermes-agent.git@main'`. The `[web]` extra is needed for `hermes dashboard` (FastAPI + uvicorn).
- Hermes config keys: use `model.provider: custom`, `model.base_url`, `model.api_key`, and `model.default` (just the model name). The older `providers.openai.*` keys are silently ignored on current Hermes.
- Model slug for `model.default` must match Dedalus's catalog exactly. List via `curl https://api.dedaluslabs.ai/v1/models`. Use hyphenated slugs (`anthropic/claude-sonnet-4-6`), not dotted (`claude-sonnet-4.6`).
- The gateway only reads config at startup. Always restart it after `hermes config set`. We do this by killing the gateway via `ps + awk + xargs kill` (avoids `pkill -f` matching its own argv).
- `setsid foo & disown` doesn't fully detach inside the execution API. Use `(setsid ${launcher} </dev/null &>/dev/null &)` to push it into a subshell that exits immediately.
- Dedalus public previews require a hostname suffix configured at the org level. When unconfigured, the API returns 503; we fall back to a free Cloudflare quick tunnel (`*.trycloudflare.com`).

## File layout

```
hermes-persistent/
├── README.md                 (this file)
├── package.json              (cli scripts + deps)
├── .env.example
├── tsconfig.json
├── src/
│   ├── cli.ts                command dispatcher
│   ├── commands/             one file per `npm run` script
│   └── lib/                  client, exec, machine, upload, bootstrap, api, env, progress, constants
├── knowledge/                tarballed into the VM on every deploy
│   ├── SOUL.md / USER.md / MEMORY.md / AGENTS.md
│   ├── skills/<name>/SKILL.md
│   └── crons/seed.json
└── web/                      Next.js 15 + Tailwind v4 + Reticle UI
    ├── app/
    ├── components/           Chat + Reticle primitives + page sections
    ├── lib/
    └── public/
```

## License

MIT.
