# Internal documentation

Engineering specs and product knowledge for the Agent Machines monorepo. Start at the [root README](../../README.md) for positioning and quick start.

## Product

| Doc | Scope |
|-----|--------|
| [WHITEPAPER.md](../../docs/WHITEPAPER.md) | Public technical whitepaper — dual routing, primitives (console, workers, memory, registry), patterns, roadmap |

## Engineering (control plane)

| Doc | Scope |
|-----|--------|
| [sandbox-terminal-gateway.md](./sandbox-terminal-gateway.md) | Browser Agent Console (tmux-over-exec + SSE), one-shot exec streaming, bootstrap tail, capability tiers per provider |

**Key implementation paths**

| Area | Location |
|------|----------|
| Interactive console | `app/api/dashboard/terminal/*`, `lib/dashboard/terminal-session.ts`, `components/dashboard/InteractiveConsole.tsx` |
| Exec streaming | `lib/dashboard/exec-stream.ts`, `lib/providers/stream-util.ts` |
| Providers | `lib/providers/{e2b,sprites,dedalus,vercel}.ts` |
| Bootstrap | `lib/bootstrap/runner.ts`, `app/api/dashboard/bootstrap/stream` |
| Registry adapters | `lib/dashboard/registry/*`, `app/api/dashboard/registry/*` |
| Scheduler | `app/api/internal/cron/tick`, `vercel.json` crons, `lib/metrics/collector.ts` |
| Harness counts | `lib/platform/harness.ts` (registry-derived, not hard-coded marketing) |

## Product knowledge (`knowledge/`)

| Doc | Scope |
|-----|--------|
| [VISION.md](../../knowledge/VISION.md) | Product vision, dual routing, defensibility |
| [BROWSER-AGENT-CONSOLE.md](../../knowledge/BROWSER-AGENT-CONSOLE.md) | Full console architecture and positioning |
| [BROWSER-AGENT-CONSOLE-EXPLAINER.md](../../knowledge/BROWSER-AGENT-CONSOLE-EXPLAINER.md) | Plain-language four-paragraph explainer |
| [AGENT-MACHINES-EXPLAINER.md](../../knowledge/AGENT-MACHINES-EXPLAINER.md) | Three-paragraph whole-product explainer |
| [AGENTS.md](../../knowledge/AGENTS.md) | Operator instructions loaded into agent sessions |
| [MEMORY.md](../../knowledge/MEMORY.md) | Environment facts for agents on a machine |
| [FLEET-DASHBOARD-2026-05-22.md](../../knowledge/FLEET-DASHBOARD-2026-05-22.md) | Fleet UX research, live-fire runs, scoping fixes |

## Web app operator guide

[../README.md](../README.md) — env vars (`/.env.local.example`), dashboard routes, scripts, data boundaries.

## When to update docs

- New primitive or positioning change → `docs/WHITEPAPER.md` + `knowledge/VISION.md`
- New dashboard route or API surface → root README key routes + this index + `web/README.md`
- Streaming or console behavior change → `sandbox-terminal-gateway.md` + `knowledge/BROWSER-AGENT-CONSOLE.md`
- Harness/registry counts change → run `npm run sync-skills` before release; counts auto-derive from JSON in `lib/platform/harness.ts`
- New substrate or runtime → provider matrix in root README, `VISION.md`, `MEMORY.md`, `public/llms.txt`
