# Memory

## Environment

- I run inside a Dedalus Machine. Persistent state lives at `/home/machine`. Root filesystem resets on wake; never put real work there.
- LLM provider is `openai`-compatible at `https://api.dedaluslabs.ai/v1`, routed by Dedalus to 200+ models. The `DEDALUS_API_KEY` is the only credential needed for inference.
- API server is exposed on port `8642` and reachable from the public internet via a Dedalus preview URL or a Cloudflare quick tunnel. The bearer token lives in `~/.agent-machines/.env` as `API_SERVER_KEY`.
- Web dashboard runs on port `9119` when started.
- The `cursor-bridge` MCP server runs as a child process of the gateway and exposes `cursor_*` tools backed by the Cursor TypeScript SDK.

## Conventions I follow (apply to my own outputs)

- ASCII over Unicode lookalikes (`->` not `→`, `>=` not `≥`).
- No emoji in code, comments, docs, commits.
- Conventional Commits (`type(scope): description`); never use "and" in a commit message.
- 70-line functions, 500-line files, 200-LOC PRs.
- `git switch` over `git checkout`. `--force-with-lease` over `--force`.
- Production DBs/infra are sacred. No `DROP INDEX`, `ALTER TABLE`, manual SSM edits, dashboard SQL.

## Tools available

`terminal`, `read_file`, `write_file`, `patch`, `search`, `web_search`, `web_extract`, `browser_*` (Playwright), `vision_analyze`, `image_generate` (FAL), `tts`, `skills_list`/`skill_view`, `memory`, `session_search`, `cronjob`, `delegate_task`, `execute_code` (Python sandbox).

Plus four MCP tools from `mcp_servers.cursor` (the cursor-bridge to the Cursor TypeScript SDK):

- `cursor_agent` -- spawn a Cursor coding agent against a working directory. Full file/terminal access, full codebase semantic search, the same agent that runs in the Cursor IDE. Use when the operator asks for real code work.
- `cursor_resume` -- continue a previous Cursor agent conversation by ID.
- `cursor_list_skills` -- list local skills available for injection into Cursor prompts.
- `cursor_models` -- list Cursor models the API key can use.

## Closed-loop CLIs (installed at bootstrap)

These are installed globally and live under `/home/machine/.npm-global/bin` and `/home/machine/.local/bin`:

- `agent-browser` -- CLI browser automation with snapshots, ref-based actions, screenshots. Session data at `~/.agent-browser/`.
- `playwright` -- Chromium cached at `~/.cache/ms-playwright/`. Use for deterministic browser tests, screenshots, and page inspection.
- `httpx` -- HTTP client for API smoke tests. Installed via `uv tool install`.
- `curl`, `jq` -- always available. Hit endpoints and parse JSON.
- `sqlite3` -- inspect local databases, verify migrations.
- `ss`, `dig`, `nc` -- check listeners (`ss -tlnp`), resolve DNS (`dig`), test connections (`nc`).

Service logs: `/.machine/logs/services/` has symlinks to gateway and dashboard logs. Originals live under `~/.agent-machines/logs/`.
Agent docs: `/.agent/llm.txt` and `/.agent/docs/agent-context.md` describe the full tool inventory.

## Loaded skills

Each lives at `~/.agent-machines/skills/<name>/SKILL.md`:

- `agent-ethos` -- minimal-fix philosophy
- `empirical-verification` -- scientific method for code
- `closed-loop-development` -- use machine tools to verify your own work instead of asking the operator
- `production-safety` -- never patch prod
- `git-workflow` -- switch/restore, worktrees, commits
- `frontend-design-taste` -- anti-slop UI rules
- `reticle-design-system` -- a reference design system, swap for your own
- `automation-cron` -- schedule recurring agent tasks
- `security-audit` -- adversarial code review
- `computer-use` -- browser automation patterns
- `agent-browser` -- CLI browser automation via agent-browser
- `plan-mode-review` -- structured review checklist
- `taste-output` -- never truncate or stub generated code
- `dedalus-machines` -- how this VM is wired, including closed-loop tool paths
- `cursor-coding` -- when and how to delegate code work to a Cursor agent via the `cursor_agent` MCP tool

## Cron automations

Pre-seeded. Includes hourly health check, daily digest, weekly skill audit, nightly memory consolidation.