# Agent Machines: product vision

## The thesis

**Agent Machines is the Worker system for persistent digital labor.**

The Worker is durable. Everything underneath is replaceable.

A Worker owns a responsibility over time. Its identity, memory, instructions,
schedules, files, permissions, abilities, history, and evidence remain stable
while the runtime, model, sandbox, tools, terminal transport, storage mode,
scheduler, and placement policy change beneath it.

This is the product invariant. The rest of the architecture exists to preserve
it honestly.

## The category

“OpenRouter for agents and containers” describes the routing wedge, not the
whole product.

| Layer | Analogy | Product job |
|---|---|---|
| **Route** | OpenRouter for agents + machines | Choose the runtime, model, substrate, and abilities without binding the Worker to one vendor |
| **Compose** | Lovable / Bolt / v0 for long-running Workers | Describe a responsibility and assemble the role, memory, permissions, schedule, tools, and output contract, or start from a trusted specialist |
| **Access** | ChatGPT/Claude-simple first use | Sign in, connect the services the Worker may use, and reach the first useful result before infrastructure enters the conversation |

The intended consumer flow is:

1. Describe the Worker or choose one off the shelf.
2. Connect the services it may use.
3. Assign a responsibility, schedule, output contract, and approval boundary.
4. Watch, approve, inspect, and move the Worker.

Models, runtimes, sandboxes, terminal transports, scheduling, recovery, and
migration should disappear beneath that experience without becoming hidden or
unaccountable.

## The magic moment

The Agent Machines magic moment is not one impressive answer. A Worker comes
online with a job, memory, tools, files, permissions, and schedule; completes
real work; survives a closed browser; and is still there tomorrow with the
context and evidence intact.

People do not need one universal chatbot. They need a small fleet of
accountable specialists:

- a research Worker that follows an industry and produces a sourced briefing;
- a browser Worker that handles repetitive web operations within an allowlist;
- a career Worker that maintains application context across months;
- a household Worker that prepares renewals, comparisons, and decisions for approval;
- a coding Worker that owns a project instead of forgetting it after one prompt;
- a small-business fleet for support, QA, research, and recurring operations.

Persistent memory without supervision is dangerous. Supervision without
persistent memory produces disposable chat windows. Agent Machines must provide
both durability and inspectability.

## Why start with infrastructure

Forward-deployed engineers and AI-native teams already build custom harnesses
around Claude Code, Codex, browser agents, sandboxes, credentials, cron, logs,
persistence, and recovery. The agent demo is quick; operating it as a dependable
Worker becomes the system.

That is the initial customer and technical wedge. Templates and intent-driven
composition expand the same system to people who should never need to know what
E2B, Sprites, tmux, MCP, or a model gateway is.

Agent Machines does not need to become a model company or a sandbox company.
Those layers should improve and compete. The durable value is the Worker’s
identity, state, abilities, lifecycle, evidence, portability, and relationship
with the user.

## Durable Worker, replaceable primitives

| Durable Worker state | Replaceable implementation |
|---|---|
| Identity and responsibility | Claude Code, Codex, Hermes, OpenClaw, or a future runtime |
| Memory and instructions | Native model key, router, gateway, or compatible endpoint |
| Schedules and desired lifecycle | Daytona, E2B, Sprites, Vercel Sandbox, or a future substrate |
| Files and evidence | Volume, checkpoint, snapshot, or always-on disk |
| Permissions and abilities | Skills, MCP servers, CLIs, native tools, and service routes |
| History and output contracts | Browser console, PTY, stream, REST, SDK, CLI, or another Worker |

Replaceable does not mean lowest-common-denominator. Each primitive declares its
real capabilities. Unknown capability rejects a requirement; provider-dependent
controls appear only when supported. The Worker stays stable while differences
remain explicit.

## Creation surfaces

Agent Machines should support three ways to begin:

1. **Off the shelf: live.** Choose a specialist template such as Code Reviewer,
   Researcher, Browser Operator, Support Agent, QA Worker, or Finance Analyst.
2. **Assemble: live.** Choose runtime and sandbox primitives directly, attach
   memory and loadout, then submit one Worker intent.
3. **Describe: direction.** State the outcome in natural language; receive a
   proposed role, memory shape, tools, permissions, schedule, evaluation, and
   placement before approving launch.

The description layer must produce an inspectable Worker specification, not a
hidden prompt. Users approve the responsibility and permissions before the
control plane acts.

## Specialist marketplace

The long-term category can become an application and employment layer for
software Workers. Developers and domain experts publish complete specialists:
role, procedures, tools, memory schema, schedules, evaluation criteria,
permissions, and output contracts. A consumer installs one like an app while
retaining ownership of its state and the ability to change models and compute.

The marketplace is downstream of trust. Templates must declare permissions,
data boundaries, costs, evaluation evidence, and versioned changes. Agent
Machines can earn a marketplace take rate only after the Worker remains
inspectable and portable.

## Routing and evaluation flywheel

Every completed run can teach the system which combination of runtime, model,
provider, tools, memory, and policy works for a specific responsibility.
Routing should optimize for successful outcomes under constraints, not the
cheapest machine minute in isolation.

The compounding asset is the outcome record:

- success and failure classification;
- time to readiness and first useful output;
- total latency and estimated cost;
- provider and model health;
- resume and migration reliability;
- human approval, correction, and satisfaction signals;
- exact Worker specification and implementation lane.

Over time, the system can route each job to the cheapest reliable lane that
satisfies its requirements. This evidence becomes more valuable than any one
provider adapter.

## Two operators

1. **Humans** use the dashboard to choose, compose, supervise, approve, inspect,
   and move Workers.
2. **Other Workers** use the SDK, API, CLI, and future MCP surface to provision,
   route, observe, and tear down subordinate Workers within explicit authority.

The ambitious version is an operations layer for digital labor: Workers own
responsibilities, acquire versioned procedures, operate continuously, request
approval, produce evidence, and can eventually provision subordinate Workers.

## Current product surfaces

| Surface | Role |
|---|---|
| **Agent templates** | Twelve deployable specialists with role, runtime, memory, skills, and MCP loadout |
| **Worker launchpad** | Runtime → sandbox assembly through one declarative launch intent |
| **Fleet** | Runtime, provider, state, loadout, signal, lifecycle, and migration supervision |
| **Console + terminal** | Real agent CLI and PTY attached to Worker-owned tmux |
| **Memory + loadout** | Portable persona, rules, skills, MCPs, CLIs, and tools |
| **Cron + sessions** | Recurring execution and durable runtime history |
| **Logs + usage + artifacts** | Evidence, cost, state transitions, files, and outputs |
| **Registry** | Search and installation surface for abilities |
| **SDK + API + CLI** | Programmatic control of the same Worker lifecycle |

## Business expansion

1. Paid control plane for individuals and teams operating persistent Workers.
2. Usage-based orchestration and unified billing across model and sandbox providers.
3. Team permissions, approvals, audit history, budgets, and fleet supervision.
4. Enterprise deployment for companies replacing custom internal agent platforms.
5. Marketplace take rate for paid Worker templates and loadouts.

Providers compete on compute and intelligence. Agent Machines owns the Worker
relationship, portable state, routing decision, operational history, and
supervision surface.

## Boundaries

- Live provider migration transfers durable managed state; it is not RAM or process transplantation.
- Four provider adapters exist, but provider incidents and capability differences remain visible.
- Intent-driven Worker generation is a product direction; templates and modular assembly are live today.
- Unified billing and the paid marketplace are not shipped.
- Head-Worker provisioning must remain authority-scoped and auditable.

## Runtime paths

- **Product:** Agent Machines, including the Worker system, control plane, dashboard, SDK, and CLI.
- **Runtime root:** `"$HOME/.agent-machines"`.
- **Repo checkout:** `"$HOME/agent-machines"`.
- **Provider-aware home:** Resolve the executing user's actual `$HOME`. The hosted defaults are `/home/daytona` on Daytona, `/home/user` on E2B, `/home/sprite` on Sprites, and `/vercel/sandbox` on Vercel Sandbox. Migration changes these paths; it must not preserve an obsolete absolute home as the new execution location.
- **Hermes / OpenClaw / Claude Code / Codex:** replaceable runtime options, not the product identity.
