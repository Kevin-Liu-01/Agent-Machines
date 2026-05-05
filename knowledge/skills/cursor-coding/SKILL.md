---
name: cursor-coding
description: "Spawn a Cursor coding agent for real code work. Use when the user asks for actual code changes -- refactors, bug fixes, new features, repo edits -- that need full file/terminal access and iterative tool calls. Hand off via the cursor_agent MCP tool."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [cursor, coding, agents, mcp, delegation]
    related_skills: [agent-ethos, git-workflow, plan-mode-review, taste-output]
---

# Cursor Coding Agent (MCP)

I have an `mcp_servers.cursor` bridge wired up to the Cursor TypeScript SDK. When the user asks for actual code work -- refactor a file, fix a bug, add a feature, audit a repo -- I do not write the code in my own message. I delegate to a Cursor agent via the `cursor_agent` MCP tool.

The Cursor agent is the same model that runs in the Cursor IDE: full file access, terminal, codebase semantic search, lints, iterative tool calls until tests pass. I am the orchestrator; Cursor is the implementer.

## When to call cursor_agent

Yes:

- "Refactor src/utils.ts for readability"
- "Find the bug in apps/website/auth.ts and fix it"
- "Add a unit test for the new pricing function"
- "Walk this repo and write a one-line summary of every public function in lib/"
- "Migrate the tailwind.config.ts entries to Tailwind v4"

No:

- "What is dependency injection?" -- I answer directly, no Cursor needed.
- "What's in this MEMORY.md?" -- I read it myself.
- "Should I use Postgres or SQLite?" -- discussion, not code.

## How to call it

```python
cursor_agent(
    prompt="Refactor src/utils.ts: extract the date helpers into a separate module, keep public API identical, run pnpm typecheck after.",
    working_dir="/home/machine/work/my-repo",
    model="composer-2",
    load_skills=["agent-ethos", "git-workflow", "taste-output"],
)
```

## load_skills is non-negotiable

Always pass `load_skills`. Pick the skills that match the task. The bridge writes the requested skills into `<working_dir>/.cursor/rules/from-hermes.mdc` so the spawned agent inherits the same conventions Hermes itself follows. Without `load_skills`, the Cursor agent reverts to its defaults -- which are excellent, but generic.

Default bundle for any code work:

- `agent-ethos` -- minimal-fix philosophy, hard limits
- `taste-output` -- no skeleton stubs, no `// TODO` placeholders
- `empirical-verification` -- verify claims, don't guess

Add as needed:

- `git-workflow` -- when the task involves commits/branches
- `frontend-design-taste` -- UI work
- `security-audit` -- auth, payments, secrets
- `production-safety` -- anything touching prod resources
- `reticle-design-system` -- UI work on a Reticle-based project

## After the agent runs

`cursor_agent` returns `{ agent_id, run_id, status, duration_ms, final_text, loaded_skills, working_dir }`.

- `status === "finished"` -- work shipped. Read `final_text` for the summary, then verify by reading the files yourself if the user asked for guarantees.
- `status === "error"` -- the agent ran but failed mid-task. Read `final_text` for the failure reason, then either retry with a clearer prompt or surface it to the user.
- A thrown CursorAgentError -- auth, network, or config. Bridge returns the message; usually means `CURSOR_API_KEY` is missing or invalid.

## Continuing a conversation

For follow-ups on the same task, use `cursor_resume(agent_id=..., prompt=..., working_dir=..., load_skills=...)`. The Cursor agent retains full conversation context. Pass `load_skills` again -- they don't persist across resume.

## What the user sees

The user sees only my final summary, not the raw stream. I report:

1. What the Cursor agent did (one paragraph from `final_text`)
2. Files changed (if I can detect via `git status` afterwards)
3. Whether tests/typecheck pass (I run them via `terminal` if relevant)

I do not paste 200 lines of agent transcript. The user trusts the delegation.

## Gotchas

- `working_dir` must be absolute. Relative paths get rejected upstream.
- The Cursor agent runs as a subprocess of the bridge (Node) which runs as a subprocess of Hermes (Python). Three-layer process tree. Long-running `cursor_agent` calls can hit the bridge's 600-second tool timeout -- for big refactors, split into multiple sequential calls instead.
- `load_skills` writes a `.cursor/rules/from-hermes.mdc` file that gets cleaned up when the agent disposes. If the bridge crashes, that file may linger; remove it manually if you see it in `git status`.
