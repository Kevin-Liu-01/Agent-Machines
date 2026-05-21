# MCP servers

Layout:

```txt
mcp/
  cursor-bridge/     MCP server for Cursor SDK delegation
knowledge/mcps/
  catalog.json       registry (core + bundled + ide)
```

Runtime registration: `~/.agent-machines/config.yaml` -> `mcp_servers`.

Built when `CURSOR_API_KEY` is set. See [cursor-bridge/README.md](./cursor-bridge/README.md).
