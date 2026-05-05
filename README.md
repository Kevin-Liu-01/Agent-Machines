# hermes-machines

> An agent with a body that writes its own code.

A fully-loaded [Hermes Agent](https://github.com/NousResearch/hermes-agent) deployed onto a [Dedalus Machine](https://docs.dedaluslabs.ai/dcs) -- exposing an OpenAI-compatible chat API, a web dashboard, a bundled skill library, scheduled cron automations, a polished Next.js chat UI built on the Reticle / Sigil design system, and the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript) wired in as an MCP tool so the agent can spawn real coding agents that inherit the rig's conventions as `.cursor/rules`. Drop your own skills in to swap any of it for your own opinions.

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
        ║     ├─ skills/   ← 13 bundled skills                   ║
        ║     ├─ cron/     ← 4 scheduled automations             ║
        ║     ├─ MEMORY.md ← agent memory                        ║
        ║     ├─ USER.md   ← operator profile                    ║
        ║     └─ SOUL.md   ← persona                             ║
        ╚════════════════════════════════════════════════════════╝
                                    │  inference (200+ models)
                                    ▼
                  https://api.dedaluslabs.ai/v1
```

## Shoutouts

Huge thanks to [`dedalus-labs/openclaw-demo`](https://github.com/dedalus-labs/openclaw-demo) and [`AgentWings/hermes-agent-ddls`](https://github.com/AgentWings/hermes-agent-ddls) for the inspiration -- both showed the path: provision a machine, install the agent, point it at Dedalus as the OpenAI provider. `hermes-machines` grows that pattern into a fuller deployment with the Cursor SDK as a delegation surface, a bundled skill library as the knowledge base, scheduled cron automations, a Reticle-styled chat UI, and a complete lifecycle CLI.

## Quick start

```bash
git clone https://github.com/Kevin-Liu-01/hermes-machines
cd hermes-machines
cp .env.example .env
# paste your DEDALUS_API_KEY into .env

npm install
npm run deploy
```

After ~6-10 minutes (most of which is `uv pip install hermes-agent`), you get:

```
  API URL:        https://<tunnel>.trycloudflare.com/v1
  API Key:        hp-<random>
  Dashboard:      https://<tunnel>.trycloudflare.com
  Machine ID:     dm-<id>

  Quick chat:     npm run chat -- "Say hi in one sentence."
```

Optional: set `CURSOR_API_KEY` in `.env` (from [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations)) to enable the `cursor_agent` MCP tool -- without it the rest of the agent works fine, only delegating code work to a Cursor agent will fail with a clear error.

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

Open [http://localhost:3210](http://localhost:3210). Or deploy to Vercel -- same env vars, same surface.

## What ships into the machine

`knowledge/` is tarballed and uploaded into `~/.hermes/` on every deploy.

```
knowledge/
├── SOUL.md          # persona -- direct, surgeon-not-painter, no emoji
├── USER.md          # operator profile -- placeholder; the agent fills this in
├── MEMORY.md        # what the agent knows about its environment
├── AGENTS.md        # operating principles (loaded into system prompt)
├── crons/
│   └── seed.json    # 4 cron jobs: health, digest, audit, consolidation
└── skills/
    ├── agent-ethos/SKILL.md
    ├── empirical-verification/SKILL.md
    ├── production-safety/SKILL.md
    ├── git-workflow/SKILL.md
    ├── frontend-design-taste/SKILL.md
    ├── reticle-design-system/SKILL.md
    ├── automation-cron/SKILL.md
    ├── security-audit/SKILL.md
    ├── computer-use/SKILL.md
    ├── plan-mode-review/SKILL.md
    ├── taste-output/SKILL.md
    ├── dedalus-machines/SKILL.md
    └── cursor-coding/SKILL.md
```

Replace these with your own opinions to retune the rig -- every file in `knowledge/` is just markdown.

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

Plus four MCP tools from the bundled `cursor-bridge` (Cursor TypeScript SDK):

| Tool | What it does |
|------|--------------|
| `cursor_agent` | Spawn a Cursor coding agent against a working directory. Same model that runs in the Cursor IDE -- full file/terminal access, codebase semantic search, lints. Pass `load_skills: ["agent-ethos", "git-workflow", ...]` to inject Hermes skills as `.cursor/rules` for the run. |
| `cursor_resume` | Continue a previous Cursor agent by ID. Retains full conversation context. |
| `cursor_list_skills` | List local Hermes skills available for `load_skills` injection. |
| `cursor_models` | Enumerate models the configured `CURSOR_API_KEY` can use. |

The bridge is a Node MCP server at `mcp/cursor-bridge/`. It speaks stdio MCP to Hermes and the Cursor SDK to upstream. Auth via `CURSOR_API_KEY` in `~/.hermes/.env` ([cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations)).

When the user asks for actual code changes (refactor, bug fix, new feature), Hermes delegates: it doesn't write the diff itself, it calls `cursor_agent(prompt, working_dir, load_skills)`. The spawned Cursor agent inherits Hermes's conventions via the synthesized rule file and iterates with full tool access until the work is done.

## Lifecycle

Sleep / wake is the loop. Sleep stops per-second billing while preserving the persistent volume (`/home/machine`). Wake is fast (seconds) and re-runs bootstrap idempotently to repair any transient process drift (gateway, dashboard).

```bash
npm run sleep    # ↓ pause
npm run wake     # ↑ resume -- same skills, memory, sessions, port bindings
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
- `hermes-agent` is **not on PyPI**; install via `uv pip install 'hermes-agent[web,mcp] @ git+https://github.com/NousResearch/hermes-agent.git@main'`. The `[web]` extra is needed for `hermes dashboard` (FastAPI + uvicorn); `[mcp]` is needed for `mcp_servers` to actually load (without it, Hermes silently no-ops MCP support even when `hermes mcp list` shows servers as enabled).
- Hermes config keys: use `model.provider: custom`, `model.base_url`, `model.api_key`, and `model.default` (just the model name). The older `providers.openai.*` keys are silently ignored on current Hermes.
- Model slug for `model.default` must match Dedalus's catalog exactly. List via `curl https://api.dedaluslabs.ai/v1/models`. Use hyphenated slugs (`anthropic/claude-sonnet-4-6`), not dotted (`claude-sonnet-4.6`).
- The gateway only reads config at startup. Always restart it after `hermes config set`. We do this by killing the gateway via `ps + awk + xargs kill` (avoids `pkill -f` matching its own argv).
- `setsid foo & disown` doesn't fully detach inside the execution API. Use `(setsid ${launcher} </dev/null &>/dev/null &)` to push it into a subshell that exits immediately.
- Dedalus public previews require a hostname suffix configured at the org level. When unconfigured, the API returns 503; we fall back to a free Cloudflare quick tunnel (`*.trycloudflare.com`).
- Wake/sleep/admit/purge are gated by HMAC signing in the controlplane. The public Dedalus SDK doesn't sign, so a self-slept machine can't be woken via the SDK -- clear `.machine-state.json` and provision a fresh one (the bootstrap is idempotent and re-seeds knowledge from local files).
- The MCP subprocess inherits a minimal `PATH` from the gateway. Use absolute `/home/machine/node/bin/node` in `mcp_servers.<name>.command`, not bare `node`, or the bridge fails with `No such file or directory` even when the binary exists.

## File layout

```
hermes-machines/
├── README.md                 (this file)
├── package.json              (cli scripts + deps)
├── .env.example
├── tsconfig.json
├── src/
│   ├── cli.ts                command dispatcher
│   ├── commands/             one file per `npm run` script
│   └── lib/                  client, exec, machine, upload, bootstrap, api, env, progress, constants, tunnel
├── knowledge/                tarballed into the VM on every deploy
│   ├── SOUL.md / USER.md / MEMORY.md / AGENTS.md
│   ├── skills/<name>/SKILL.md     (15 skills, including cursor-coding)
│   └── crons/seed.json
├── mcp/
│   └── cursor-bridge/        Node MCP server wrapping @cursor/sdk
│       ├── src/server.ts     stdio MCP server with cursor_agent + 3 sibling tools
│       ├── package.json
│       └── tsconfig.json
└── web/                      Next.js 15 + Tailwind v4 + Reticle UI
    ├── app/
    ├── components/           Chat + Reticle primitives + page sections
    ├── lib/
    └── public/
```

## License

MIT.
