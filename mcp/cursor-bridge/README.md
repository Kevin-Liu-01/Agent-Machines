# cursor-bridge

An MCP server that exposes the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript) as tools Hermes Agent can call. Lets Hermes spawn real Cursor coding agents -- full file access, terminal, repo awareness, the same agent that runs in the Cursor IDE -- from any conversation, using Hermes skills as the operating manual.

## What it exposes

| Tool | What it does |
|------|--------------|
| `cursor_agent` | One-shot: spawn a Cursor agent against a directory, run a prompt, return the result. The agent has full file/terminal access and runs the same model as the Cursor IDE. |
| `cursor_resume` | Continue a previous Cursor agent conversation by ID. Same context, new prompt. |
| `cursor_list_skills` | List the Hermes skills available for injection into Cursor prompts. |
| `cursor_models` | List the Cursor models the API key has access to. |

## How skills are passed

When Hermes calls `cursor_agent` with `load_skills: ["agent-ethos", "git-workflow"]`, the bridge:

1. Reads `~/.hermes/skills/<name>/SKILL.md` for each requested skill.
2. Synthesizes a single `.cursor/rules/from-hermes.mdc` file in the working directory (or under a temp dir we then bind-mount).
3. Spawns the Cursor agent with `local.settingSources: ["project"]` so it reads that rule file.
4. Cleans up the synthetic rule file after the agent disposes.

This means a Cursor agent spawned by Hermes inherits the same coding conventions Hermes uses (no `any`, hard limits, no fallback chains, etc.) without having to be told them in the prompt.

## Auth

Set `CURSOR_API_KEY` in `~/.hermes/.env`. User keys live at [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations); team service-account keys live at Team Settings → Service accounts. Both work for local runs.

## Wire format

Standard MCP over stdio. Hermes spawns the bridge as a subprocess and speaks JSON-RPC over the stdio pipes. Configured in `~/.hermes/config.yaml` like:

```yaml
mcp_servers:
  cursor:
    command: node
    args: ["/home/machine/cursor-bridge/dist/server.js"]
    env:
      CURSOR_API_KEY: cursor_...
```

## Dev

```bash
npm install
npm run build
CURSOR_API_KEY=cursor_... npm run dev   # runs against TypeScript source
```

## Notes

- Local runtime only. Cloud runtime needs a git repo URL; Hermes operates on the VM's local working tree, so local is the only sensible default.
- The bridge requires Node 20+. Hermes installs Node automatically on first deploy.
- Skills are read once per tool call; edit a skill, run again, no restart needed.
