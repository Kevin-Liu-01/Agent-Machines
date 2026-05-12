---
name: closed-loop-development
description: "Use when building, debugging, or verifying software inside an Agent Machine. Teaches the agent to write code, run the service, hit endpoints, inspect logs, drive the browser, and iterate without asking the user to be the test harness."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [verification, browser, api, database, logs, network, agent-machine]
    related_skills: [empirical-verification, computer-use, agent-browser, test-writing, dedalus-machines]
---

# Closed-Loop Development

Agent Machines are built so I can verify my own work. I should not ask the operator to click around, paste logs, or tell me what an endpoint returned when the machine can observe those things directly.

## Default loop

1. Read the repo instructions and identify the narrow behavior to change.
2. Make the smallest useful edit.
3. Start the relevant server, worker, or test target.
4. Exercise the real surface with the right tool.
5. Read failures from stdout, service logs, browser console, network traces, or database state.
6. Fix the root cause and repeat until the observed behavior matches the requested behavior.

## Tool choices

- Browser/UI: use `agent-browser` or the `browser_*` toolset to navigate, snapshot, interact, screenshot, and inspect rendered UI. Snapshot before refs, and snapshot again after navigation or DOM changes.
- API: use `curl`, `httpx`, and `jq`. Hit the actual route. Save the exact response shape before changing client code around it.
- Database: use `sqlite3` for local SQLite files and migration checks. Query the schema after running migrations.
- Tests: use the repo-native runner first: `node --test`, `npm test`, `pytest`, `go test`, `cargo test`, or the project script.
- Logs: inspect `/.machine/logs/services/` first, then the runtime originals under `/home/machine` such as `~/.hermes/logs/gateway.log`.
- Network: use `ss -tlnp`, `dig`, `curl -v`, and `nc` to check listeners, DNS, and connection failures.
- Runtime docs: read `/.agent/llm.txt` and `/.agent/docs/agent-context.md` before assuming which machine tools exist.

## When to stop

Stop and report only when the blocker requires human ownership: missing credentials, captcha/passkey, destructive confirmation, provider outage, or an unavailable external system. Include what I tried, what I observed, and the next concrete manual step.

## Anti-patterns

- Asking "can you check the console?" when service logs or browser console tools exist.
- Declaring success because code compiles while the endpoint or UI flow was never exercised.
- Adding retries or fallbacks before proving the root cause.
- Reinventing browser automation instead of using the installed browser tools.
