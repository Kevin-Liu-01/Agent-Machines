---
name: dedalus-machines
description: "How Dedalus Machines work and how this Hermes Agent is wired to one. Use when the user asks about the runtime, asks me to inspect my own environment, or asks how to scale, sleep, wake, or destroy the deployment."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [dedalus, machines, dcs, runtime, infra]
---

# Dedalus Machines (DCS)

This Hermes Agent runs inside a Dedalus Machine -- a Firecracker microVM provisioned by Dedalus Cloud Services (DCS). Knowing how the runtime works lets me reason about my own state, costs, and recovery paths.

## Architecture summary

- Each machine is a microVM with isolated kernel, vCPU, memory, and disk. Process model: one Dedalus Hypervisor (DHV) process per machine.
- The host-agent exposes a ConnectRPC API on port 18080 that the controlplane uses to manage VMs.
- vCPU and memory hotplug is supported via ACPI GED + virtio-mem.
- Local migration uses fd passing over Unix sockets -- sub-millisecond.
- Persistent storage is at `/home/machine` (this is what survives sleep/wake). Root filesystem resets on wake.

## Lifecycle phases

Reported in `machine.status.phase`:

| Phase | Meaning |
|-------|---------|
| `accepted` | Request accepted, scheduling. |
| `placement_pending` | Waiting for a host with capacity. |
| `starting` | VM is booting. |
| `running` | VM is up; guest agent is reachable. |
| `stopping` | Sleep in progress. |
| `sleeping` | VM hibernated; persistent volume preserved. |
| `destroying` | Permanent deletion in progress. |
| `destroyed` | Gone for good. |
| `failed` | Unrecoverable error; check `last_error`. |

Sleep ↔ wake is the cheap-mode loop. Sleep keeps state, wake is fast (seconds).

## Billing model

Per-second usage while awake. Storage charged monthly. Sleep stops the per-second charge but keeps the storage. Destroying a machine zeroes both. (Source: `docs/dcs/internals/billing-dedalus-machines.mdx`.)

## What lives where in this VM

```
/home/machine/                  # persistent volume, survives sleep/wake
├── .venv/                      # Python 3.11 venv with Hermes installed
├── .uv-cache/                  # uv package cache
├── .local/bin/                 # uv binary, hermes symlink
├── .hermes/
│   ├── config.yaml             # provider, model, agent settings
│   ├── .env                    # API_SERVER_KEY and other secrets
│   ├── SOUL.md                 # persona (loaded into system prompt)
│   ├── USER.md                 # user profile
│   ├── MEMORY.md               # agent memory
│   ├── AGENTS.md               # workspace instructions
│   ├── skills/                 # SKILL.md per skill, including this one
│   ├── cron/                   # scheduler db + .seeded marker
│   ├── sessions/               # FTS5 session DB
│   └── logs/
│       ├── gateway.log
│       └── dashboard.log
├── start-gateway.sh            # gateway launcher
└── start-dashboard.sh          # dashboard launcher
```

Anything written elsewhere (e.g. `/tmp`, `/etc`) is gone after wake.

## Public surfaces

- **Port 8642**: Hermes API server, OpenAI-compatible. Reachable via Dedalus preview URL. Auth: bearer token = `API_SERVER_KEY` from `~/.hermes/.env`.
- **Port 9119**: Hermes web dashboard (FastAPI + React SPA). Reachable via Dedalus preview URL. `--insecure` because the dashboard does not require auth -- only the API server does.
- **Port 18790** (optional): MCP server, if started.

## SDK touchpoints

If asked to provision a new machine or manage this one programmatically:

```typescript
import Dedalus from "dedalus-labs";

const client = new Dedalus({ xAPIKey: process.env.DEDALUS_API_KEY });

// Create
const m = await client.machines.create({ vcpu: 2, memory_mib: 4096, storage_gib: 20 });

// Run a command
const e = await client.machines.executions.create({
  machine_id: m.machine_id,
  command: ["/bin/bash", "-c", "uname -a"],
});

// Public preview
const p = await client.machines.previews.create({
  machine_id: m.machine_id,
  port: 8642,
  protocol: "http",
});
```

## Common operational issues

- `SSH_GUEST_CONNECT_FAILED` -- guest sshd not yet ready. Retry after ~10s.
- `execution_runner_prepare_failed` -- vsock path; retry. Persistent across machines means degraded environment.
- `ENOSPC` during install -- root fs is small; redirect `HOME`, `UV_CACHE_DIR`, venv to `/home/machine`.
- `EADDRINUSE` on 8642 -- duplicate gateway. `pkill -f 'hermes gateway' && /home/machine/start-gateway.sh`.
- `machine_not_routable` -- sleeping or destroyed. Check phase first.
- `503` on first exec -- wait 5s after `phase=running`.

## When the user asks me about this VM

Run `hermes doctor` first. Then check the gateway log (`tail ~/.hermes/logs/gateway.log`). Then check port bindings (`ss -tlnp`). Don't speculate -- empirics first.
