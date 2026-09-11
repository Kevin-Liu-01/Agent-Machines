# Documentation index

Agent Machines provides open-source building blocks for agent harnesses and a
working app that assembles them. Start with the [root README](../../README.md)
for setup, or [browse the components](https://agent-machines.dev/components).

## Product and adoption

| Document | Purpose |
|---|---|
| [PRODUCT-MESSAGING.md](../../docs/PRODUCT-MESSAGING.md) | Canonical narrative, vocabulary, current claim ledger, and non-claims |
| [WHITEPAPER.md](../../docs/WHITEPAPER.md) | Modular architecture, adoption boundaries, configured workspace state, and current limits |
| [ROADMAP.md](../../docs/ROADMAP.md) | Current adoption priorities and longer-term directions; older engineering audit retained as history |
| [Root README](../../README.md) | Local app, direct SDK, lifecycle kernel, hosted client, and CLI quick starts |
| [LAUNCH.md](../../docs/LAUNCH.md) | Repeatable release gates and dated new-account → completed-task evidence |

## Implementation references

| Document | Purpose |
|---|---|
| [CONTROL-PLANE-V2.md](../../docs/CONTROL-PLANE-V2.md) | Worker intent, operation journals, reconciliation, hosted cutover, and pending boundaries |
| [MUX.md](../../docs/MUX.md) | Direct SDK contracts, capabilities, routing, state transfer, and hosted/direct differences |
| [UPSTREAMS.md](../../docs/UPSTREAMS.md) | Runtime-specific model routing and dated wire-format evidence |
| [sandbox-terminal-gateway.md](sandbox-terminal-gateway.md) | Real browser agent CLI, terminal transports, command streaming, and capability tiers |
| [Web operator guide](../README.md) | Environment configuration, dashboard routes, scripts, and data boundaries |

## Source map

Paths below are relative to the repository root. A source module is not
necessarily an independently installable package.

| Building block | Implementation |
|---|---|
| Public SDK entry points | [`src/index.ts`](../../src/index.ts), [`src/mux/index.ts`](../../src/mux/index.ts), [`src/control-plane/index.ts`](../../src/control-plane/index.ts) |
| Runtime adapters | [`src/mux/harnesses`](../../src/mux/harnesses) |
| Compute adapters | [`src/mux/providers`](../../src/mux/providers); hosted facade in [`web/lib/providers/mux-facade.ts`](../lib/providers/mux-facade.ts) |
| Lifecycle operations | [`src/control-plane`](../../src/control-plane), [hosted store](../lib/control-plane/store.ts) |
| Runtime bootstrap | [`web/lib/bootstrap/runner.ts`](../lib/bootstrap/runner.ts) |
| Browser Agent Console | [terminal routes](../app/api/dashboard/terminal), [session layer](../lib/dashboard/terminal-session.ts), [UI](../components/dashboard/InteractiveConsole.tsx) |
| Instructions and Memory | [`web/lib/memory`](../lib/memory) |
| Skills and tool discovery | [`knowledge/skills`](../../knowledge/skills), [registry adapters](../lib/dashboard/registry) |
| Catalog counts | [`web/lib/platform/harness.ts`](../lib/platform/harness.ts); derived from committed data |
| Scheduler and metrics | [cron tick](../app/api/internal/cron/tick), [collector](../lib/metrics/collector.ts) |

## Dated evidence and background

These pages preserve engineering work and earlier product thinking. Current
positioning comes from [PRODUCT-MESSAGING.md](../../docs/PRODUCT-MESSAGING.md);
current capability claims must still be checked against source and scoped
evidence.

| Document | Scope |
|---|---|
| [MUX-RESULTS.md](../../docs/MUX-RESULTS.md) | Historical provider/runtime measurements; retired-provider results are not Daytona results |
| [Release reports](../../docs/reports) | Dated deployed authentication, task, artifact, terminal, and lifecycle checks |
| [BROWSER-AGENT-CONSOLE.md](../../knowledge/BROWSER-AGENT-CONSOLE.md) | Detailed terminal architecture and measurements; older category comparisons are background |
| [VISION.md](../../knowledge/VISION.md) | Earlier product thesis and exploration; superseded for current positioning |
| [AGENT-MACHINES-EXPLAINER.md](../../knowledge/AGENT-MACHINES-EXPLAINER.md) | Earlier product explainer; use the current README for public copy |
| [BROWSER-AGENT-CONSOLE-EXPLAINER.md](../../knowledge/BROWSER-AGENT-CONSOLE-EXPLAINER.md) | Background console explainer |
| [FLEET-DASHBOARD-2026-05-22.md](../../knowledge/FLEET-DASHBOARD-2026-05-22.md) | Historical dashboard research and live-run notes |

Runtime-loaded [AGENTS.md](../../knowledge/AGENTS.md) and
[MEMORY.md](../../knowledge/MEMORY.md) are workspace instructions, not public
marketing authority.

## Keep the docs aligned

- Positioning change: update `docs/PRODUCT-MESSAGING.md`, README, whitepaper,
  public component catalog, and website copy together.
- Component/API change: name the exact public export or app-local source path;
  compile examples and document dependencies and unsupported combinations.
- Runtime/provider change: update the capability source and affected docs; keep
  historical measurements attached to the providers actually measured.
- Tool/configuration change: distinguish selected, installed, connected, and
  verified. Memory Markdown export is not a complete executable harness export.
- Console change: update the terminal specification and preserve dated
  measurements with their runtime/provider/location scope.
- Registry count change: run `pnpm --dir web sync-data` and public-claims tests.
- External catalog refresh: use `pnpm --dir web refresh-catalog`; review both
  catalog copies. Builds consume committed snapshots and do not refresh them.
- Hosted release: follow [LAUNCH.md](../../docs/LAUNCH.md); a local preview or
  source-backed component entry is not live-provider proof.
