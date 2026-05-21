# MCP catalog

Machine-readable catalog at `catalog.json`. Dashboard detail in `web/lib/dashboard/mcps.ts`.

## Tiers

| Tier | Meaning |
|------|---------|
| `core` | Registered in `~/.agent-machines/config.yaml` at bootstrap. |
| `bundled` | Installable via `npx -y <package>`. Registers when credentials exist in `~/.agent-machines/.env`. |
| `ide` | Cursor IDE only (not VM-spawned by default). |
| `reference` | Built-in agent tools -- not a separate MCP process. |

## Core servers

- **playwright** -- `@playwright/mcp`
- **cursor** -- `mcp/cursor-bridge` when `CURSOR_API_KEY` is set

## Operator workflow

1. Add API keys via `/dashboard/setup` or `~/.agent-machines/.env`.
2. Redeploy or dashboard Reload.
3. Restart gateway to pick up new `mcp_servers`.
