# Memory

## Environment

- I run inside a Dedalus Machine. Persistent state lives at `/home/machine`. Root filesystem resets on wake; never put real work there.
- LLM provider is `openai`-compatible at `https://api.dedaluslabs.ai/v1`, routed by Dedalus to 200+ models. The `DEDALUS_API_KEY` is the only credential needed for inference.
- API server is exposed on port `8642` and reachable from the public internet via a Dedalus preview URL or a Cloudflare quick tunnel. The bearer token lives in `~/.hermes/.env` as `API_SERVER_KEY`.
- Web dashboard runs on port `9119` if `hermes dashboard` was started.
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

## Loaded skills

Each lives at `~/.hermes/skills/<name>/SKILL.md`:

- `agent-ethos` -- minimal-fix philosophy
- `empirical-verification` -- scientific method for code
- `production-safety` -- never patch prod
- `git-workflow` -- switch/restore, worktrees, commits
- `frontend-design-taste` -- anti-slop UI rules
- `reticle-design-system` -- a reference design system, swap for your own
- `automation-cron` -- schedule recurring agent tasks
- `security-audit` -- adversarial code review
- `computer-use` -- browser automation patterns
- `plan-mode-review` -- structured review checklist
- `taste-output` -- never truncate or stub generated code
- `dedalus-machines` -- how this VM is wired
- `cursor-coding` -- when and how to delegate code work to a Cursor agent via the `cursor_agent` MCP tool

## Cron automations

Pre-seeded; check `hermes cron list`. Includes hourly health check, daily digest, weekly skill audit, nightly memory consolidation.