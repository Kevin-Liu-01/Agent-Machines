# Product messaging and claim ledger

Canonical product narrative · September 10, 2026

This page owns current positioning. The [README](../README.md), public site,
[whitepaper](WHITEPAPER.md), and [roadmap](ROADMAP.md) should agree with it.
Older knowledge pages, pitch drafts, and dated reports are context, not current
messaging authority. Implementation claims still require source and scoped
verification.

## The message

**Agent Machines is open-source building blocks for agent harnesses.**

Runtimes, tools, state, and compute are useful on their own and hard to assemble.
Agent Machines gives developers a working starting point: inspect the
implementation, adopt the pieces you need, tune the configuration, and extend
the source.

**Short description:** Modular agent harnesses with real runtimes, tools,
configured workspaces, and remote compute—plus a browser CLI and dashboard for
operating multiple agents.

**Source-first shorthand:** “shadcn for agent harnesses.” Explain it as an
analogy for adopting and editing useful source. Do not imply shadcn registry
compatibility, independently packaged components, or a component-install CLI.

**Primary audience:** developers and technical teams assembling their own agent
setup or product. Lead with a useful foundation and control over the code.

**Primary action:** explore the [building blocks](https://agent-machines.dev/components)
or [clone the repository](https://github.com/Kevin-Liu-01/Agent-Machines), then run
a supported configuration.

## Message order

1. The integration problem: wiring together runtimes, tools, state, and compute.
2. The offer: working, modular, open-source building blocks.
3. The concrete experience: real browser CLI, your configuration and skills,
   several agents in one dashboard.
4. The adoption path: run it, inspect it, tune it, extend it.
5. The architecture: lasting configured workspace state makes the setup reusable.
6. The limits and directions: explicit, next to the relevant claim.

Avoid leading with “persistent digital labor,” a consumer labor operating
system, or a stack of comparisons to routing, app-generation, and chat products.
OpenRouter may still appear as an actual supported upstream in technical docs;
that is different from using it as the product category.

## Working vocabulary

| Term | Meaning here |
|---|---|
| Agent harness | Runtime plus the tools, instructions, working state, compute, and interaction/lifecycle wiring around it |
| Building block / component | An inspectable implementation module; identify whether it is a public SDK export or source inside the app |
| Worker | The dashboard/API name for a configured agent workspace and its lifecycle intent |
| Recipe / template | A preconfigured starting point, not a verified autonomous specialist |
| Memory bundle | Hosted persona/instruction/memory documents and selected ability references |
| Loadout | Selected abilities; selection does not imply installation, connection, or verification |
| Registry | Tool/skill/integration discovery and supported import/install workflows, not a public marketplace for complete Workers |
| Persistent / lasting | Supported configuration and managed state retained across specified lifecycle events, not guaranteed process uptime |

## Current claim ledger

| Claim | Source / evidence | Required qualifier |
|---|---|---|
| Open-source modular starting point | [MIT license](../LICENSE), [source](https://github.com/Kevin-Liu-01/Agent-Machines) | Modules are not all standalone packages or copy-one-file components |
| Four runtimes | [Runtime registry](../src/mux/harnesses/index.ts), [adapters](../src/mux/harnesses) | Claude Code, Codex, Hermes, OpenClaw; capacity, model routes, and behavior differ |
| Four active compute providers | [Provider registry](../src/mux/providers/index.ts) | Daytona, E2B, Sprites, Vercel Sandbox; adapter presence is not a fresh 4×4 live validation |
| Real browser agent CLI | [Terminal session](../web/lib/dashboard/terminal-session.ts), [console UI](../web/components/dashboard/InteractiveConsole.tsx) | Native and fallback transports differ; worker-owned tmux does not survive every provider lifecycle event |
| Bring your configuration | [Memory model](../web/lib/memory/bundle.ts), [installer](../web/lib/memory/install.ts), [mux config](../src/mux/config.ts) | Hosted and direct configuration paths differ; not a universal arbitrary-config importer |
| Bring your skills and tools | [Skills source](../knowledge/skills), [registry](../web/lib/dashboard/registry), [bootstrap](../web/lib/bootstrap/runner.ts) | Installation, credentials, permissions, and runtime wiring still need verification |
| Bundled catalog coverage | [Derived counts](../web/lib/platform/harness.ts), [claim tests](../src/lib/public-claims.test.ts) | Catalog counts are not installed-tool or production-tested counts |
| Multiple-agent dashboard | [Dashboard routes](../web/app/dashboard), [presets](../web/lib/dashboard/presets.ts) | Operating view and editable recipes, not autonomous fleet delegation |
| Public direct SDK | [Mux exports](../src/mux/index.ts) | `createMux`, adapters, runs, lifecycle and PTY with your provider keys; not hosted bootstrap |
| Public hosted SDK | [Client](../src/lib/sdk.ts), [routing](../src/lib/routing.ts) | Launch/run against a configured deployment; no fictitious `tools` or `memory` fields on `create()` |
| Lifecycle kernel | [Exports](../src/control-plane/index.ts), [driver](../src/control-plane/mux-driver.ts) | Consumer runs reconciliation; default mux driver does not apply hosted Memory/loadout/profile fields |
| Portable managed state | [State-move contract](../src/mux/statemove.ts), [migration](../src/mux/live-migration.ts) | Allowlisted files and supported saved state, not RAM, live processes, or every runtime session |
| Dated deployed proof | [Release procedure and reports](LAUNCH.md) | Preserve account, runtime, provider, resources, date, artifact, and cleanup scope |

## Surface boundaries that copy must preserve

- **Hosted model routes:** Claude Code is native-Anthropic-pinned and Codex is
  native-OpenAI-pinned. Hosted Hermes/OpenClaw have supported gateway paths.
- **Direct model routes:** the [mux upstream mapping](../src/mux/upstreams.ts)
  allows supported gateways for Claude Code, Codex, and OpenClaw; Hermes is
  native-only in that adapter.
- **Provider lifecycle:** Daytona stop/start retains files, E2B has manual
  pause/resume, Sprites uses automatic idle suspension with no manual Sleep,
  and Vercel restores filesystem snapshots. They are not equivalent promises.
- **Memory export:** Markdown instructions plus ability labels, not an
  executable harness archive or full skills/configuration export.
- **Unshipped source:** [`src/mux/loadout.ts`](../src/mux/loadout.ts) exists but is
  not integrated into the default router or compiled public package. Do not
  advertise an `agent-machines/mux/loadout` import.
- **Routing:** placement failover is not automatic mid-run replay. Direct mux
  constraints and trace-based ranking do not imply hosted feature parity.

## Direction, never present-tense functionality

Natural-language harness creation; complete harness publishing/sharing; a public
Worker marketplace; authority-scoped autonomous delegation; unified provider
billing. These require implementation and their own proof before promotion.

Do not invent onboarding time, performance guarantees, customer counts,
production-tested tool counts, or a complete current runtime/provider matrix.
Preconfigured recipes and the existing tool registry are not substitutes for
these missing capabilities.

## Publication gate

1. Verify the module or public export exists; compile executable SDK snippets.
2. State the surface: source module, direct SDK, hosted SDK, or dashboard.
3. Name provider/runtime/credential/installation limits where material.
4. Link dated evidence for live claims; local tests are not deployed proof.
5. Run the public-claims and relevant package/documentation tests.
6. Update this ledger when the real boundary changes.

Use [agent-machines.dev](https://agent-machines.dev) for product links and the
[actual repository](https://github.com/Kevin-Liu-01/Agent-Machines) for source.
The currently documented direct API origin is `https://www.agent-machines.dev`;
do not change authentication routing or rely on cross-origin redirects merely
to make copy uniform. Exact deployment behavior belongs in [LAUNCH.md](LAUNCH.md).
