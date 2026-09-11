# Agent Machines: Building Blocks for Agent Harnesses

Technical and product whitepaper · Version 3.0 · September 10, 2026

[Website](https://agent-machines.dev) ·
[Source](https://github.com/Kevin-Liu-01/Agent-Machines) ·
[Quick start](../README.md) · [Claim ledger](PRODUCT-MESSAGING.md)

## Abstract

Agent Machines is an open-source collection of modular building blocks for
agent harnesses, with a working application showing how the pieces fit
together. It connects agent runtimes, tools, configuration, state, and remote
compute so developers can adopt a useful starting point, tune it to their
workflow, and extend the source.

The repository includes adapters for Claude Code, Codex, Hermes, and OpenClaw;
compute adapters for Daytona, E2B, Sprites, and Vercel Sandbox; runtime bootstrap;
a real browser agent CLI; instruction and memory configuration; skills and
integration discovery; and a dashboard for operating multiple configured agents.

The source-first analogy is **shadcn for agent harnesses**. The value is an
inspectable implementation you can make your own. This does not mean the project
implements the shadcn registry protocol, a component-install CLI, or a public
marketplace for complete harnesses.

A configured workspace is called a Worker in the API and dashboard. Its lasting
configuration and managed state make repeated use practical. They are
architectural foundations, not claims of autonomous digital labor, universal
portability, or a finished natural-language agent builder.

## 1. The problem: assembling the surrounding system

Choosing an agent runtime is only the beginning. A usable harness also needs a
place to run, a compatible model route, credentials, useful tools, instructions,
working state, a way to interact, and a way to inspect what happened.

Each piece may already exist. The integration work remains:

- install and configure a runtime inside the selected compute environment;
- wire tools and skills without confusing catalog entries with working access;
- provide instructions and preserve relevant files between interactions;
- expose the actual runtime through a usable terminal or programmatic interface;
- recover lifecycle work after a request, process, or provider interruption;
- operate several agents without mixing their inputs, outputs, or credentials.

The initial audience is developers and technical teams building this system
already: an internal agent platform, a remote coding setup, or several agents
with different configurations. They need a working foundation and understandable
boundaries, not another promise that infrastructure no longer matters.

## 2. The product: adopt, tune, extend

The repository is both a reference implementation and a usable starting point.

1. **Adopt:** run the application or use the SDK with a supported runtime and
   your own sandbox and model credentials.
2. **Tune:** change instructions, model route, provider, selected abilities,
   environment, and schedules through the supported surfaces.
3. **Extend:** inspect the adapter contracts, alter bootstrap, add integrations,
   or build your own application around the lower-level modules.

The modules are connected in the supplied app. They are not all standalone npm
packages or single-file drop-ins. Public SDK exports and source modules have
different adoption boundaries, and the documentation should identify each.

| Module | Contract or implementation | Adoption boundary |
|---|---|---|
| Runtime adapters | [`HarnessAdapter`](../src/mux/types.ts), [implementations](../src/mux/harnesses) | Shared install, probe, launch, and run boundary; real runtime differences remain |
| Compute adapters | [`SandboxProvider`](../src/mux/types.ts), [implementations](../src/mux/providers) | Provider lifecycle and execution capabilities |
| Direct SDK | [`agent-machines/mux`](../src/mux/index.ts) | Public package entry point; provider keys, no hosted app required |
| Lifecycle kernel | [`agent-machines/control-plane`](../src/control-plane/index.ts) | Public desired-state, operation, store, and driver interfaces |
| Hosted SDK | [`AgentMachines`](../src/lib/sdk.ts) | Client for a configured deployment, not the direct mux |
| Bootstrap | [Phase runner](../web/lib/bootstrap/runner.ts) | Hosted runtime setup; source module |
| Browser terminal | [Session layer](../web/lib/dashboard/terminal-session.ts), [UI](../web/components/dashboard/InteractiveConsole.tsx) | Hosted UI, authenticated routes, and worker-side session machinery |
| Configuration and abilities | [Memory](../web/lib/memory), [registry](../web/lib/dashboard/registry), [skills](../knowledge/skills) | Hosted editing/import and tool discovery, plus editable source files |

## 3. Architecture

```text
Your application                         Supplied web app
  direct SDK / lifecycle kernel           dashboard / hosted SDK / API
           |                                         |
           +----------------+------------------------+
                            |
                  Lifecycle operations
               intent, journal, reconciliation
                            |
             Runtime and compute adapter contracts
                  /                       \
    Claude Code · Codex             Daytona · E2B
    Hermes · OpenClaw               Sprites · Vercel Sandbox
                            |
                 Configured remote workspace
            runtime + tools + instructions + files
                            |
                Browser CLI / streamed runs
```

The hosted provider facade reuses the direct mux adapters; vendor SDK code does
not need a second implementation in the web layer. Hosted authentication,
bootstrap, user configuration, and browser interaction are additional layers,
not capabilities implied by importing the mux.

See [the mux architecture](MUX.md) and
[the lifecycle cutover ledger](CONTROL-PLANE-V2.md) for implementation details.

## 4. Runtime and compute are separate choices

Four runtime adapters and four active provider adapters exist in source. This
is an integration inventory, not proof that every combination works with every
model, account, resource size, or transport.

### Runtime and model compatibility

The hosted route currently selects native Anthropic for Claude Code and native
OpenAI for Codex. Hosted Hermes and OpenClaw have configurable gateway routes
where supported by their bootstrap.

The direct mux has a different upstream matrix: Claude Code and Codex can use
their native route or a compatible supported gateway; OpenClaw supports the
declared gateway choices; the direct Hermes adapter is native-only. A model key
that exists is not necessarily a key the selected runtime can use.

Source: [hosted routing](../src/lib/routing.ts),
[direct mux upstreams](../src/mux/upstreams.ts),
[hosted bootstrap](../web/lib/bootstrap/runner.ts). Dated wire-format evidence
is in [UPSTREAMS.md](UPSTREAMS.md).

### Provider capabilities

| Provider | Lifecycle boundary | Execution boundary |
|---|---|---|
| Daytona | Stop/start retains files, not processes or RAM | Native PTY; command output uses provider session-log polling |
| E2B | Manual pause/resume; resource allocation follows the template | Native PTY and streamed command output |
| Sprites | Provider-managed idle suspension; no manual Sleep | Native PTY and streamed command output |
| Vercel Sandbox | Filesystem snapshot/restore, not process or RAM restore | Streamed commands; interactive terminal uses the portable fallback |

Requested resources and observed allocation remain separate. Runtime readiness
and capacity checks may reject an undersized machine. Unsupported lifecycle
requests must not be recorded as successful.

The direct mux can filter placement using declared capabilities. Unknown
capabilities reject constraints that depend on them. Automatic placement may
try another configured provider after a provisioning error; it does not replay
an interrupted agent run. Hosted and direct routing features differ; the
surface comparison in [MUX.md](MUX.md) is the detailed reference.

## 5. The real agent CLI in a browser

The Browser Agent Console exposes the runtime's terminal interface, including
its full-screen UI where supported. It is not a chat widget impersonating the
CLI.

The remote workspace owns the `tmux` session, agent process, pane log, and
scrollback. The browser connects through an authenticated terminal transport.
Native PTY/WebSocket paths provide interactive input and output; HTTP input
plus SSE output provides a portable fallback. Reconnecting the browser attaches
to worker-owned terminal state.

This separates browser or serverless request lifetime from terminal session
ownership. It does not keep a process alive through provider deletion,
filesystem-only restore, or every provider interruption.

Transport design and dated latency measurements remain in
[the console architecture](../knowledge/BROWSER-AGENT-CONSOLE.md) and
[terminal gateway specification](../web/docs/sandbox-terminal-gateway.md).
A measured latency for one location and provider is not a universal guarantee.

## 6. Bring your own configuration, instructions, and skills

A harness should be understandable enough to change. Agent Machines supplies
configuration and bootstrap implementations, then lets the operator supply
compatible credentials, instructions, documents, selected abilities, and
environment settings.

The hosted Memory model holds persona, agent instructions, working memory, and
operator-profile documents. Runtime-specific adapters place those documents in
the files each runtime reads. Pasted import and Markdown export exist, but
export is instructions plus ability labels—not a complete executable
configuration bundle or a backup of every skill and secret.

The bundled catalog contains **161 skills and 39 MCP servers**. These are
available procedures and catalog entries, not a claim that every connector is
installed, credentialed, and verified for every agent. Loadout selection,
installation attempt, and runtime verification are separate states. Optional
browser-tool installation is best-effort and can fail after core runtime setup
succeeds.

The source can be edited directly, and bundled refresh preserves Worker-authored
memory and modified skills. The dashboard's registry discovers tools, skills,
MCP servers, CLIs, and supported imports. It is not the same thing as a public
harness marketplace or a source-component package manager.

Source: [memory bundle](../web/lib/memory/bundle.ts),
[runtime document installation](../web/lib/memory/install.ts),
[registry adapters](../web/lib/dashboard/registry),
[bootstrap](../web/lib/bootstrap/runner.ts).

## 7. Worker: the configured workspace, not the headline product

A Worker records configured intent and links it to a running workspace. The
actual [`WorkerSpec`](../src/control-plane/types.ts) includes runtime, sandbox,
optional model and environment settings, schedules, and migration policy.
Hosted fields reference Memory and configuration profiles.

The lifecycle kernel journals operations before provider work and reconciles
desired state. It supports idempotent submissions, expiring leases, recovery,
and scheduled dispatch deduplication. Local consumers can use in-memory or
atomic JSON stores; the hosted app adds a tenant-scoped transactional Supabase
store.

An application must run the reconciler. The local library does not independently
operate a background service. The hosted deployment supplies consumers and
requires its database migrations and scheduler configuration.

The default public `MuxWorkerRuntimeDriver` does not install hosted Memory,
loadouts, role prompts, or gateway/environment profiles merely because those
fields exist on `WorkerSpec`. Those behaviors belong to the hosted driver and
bootstrap. Embedders must implement the corresponding driver behavior.

### Managed state and migration

Migration moves supported, allowlisted durable state, verifies transfer, and
cuts over placement. Processes restart. Filesystem portability is not RAM
migration, a native session transplant, or a guarantee that every tool-specific
cache is carried over.

That boundary is useful: a configured workspace can remain useful across
browser sessions and supported lifecycle changes. It is not an assurance that
a specialist can autonomously own a responsibility indefinitely.

## 8. Multiple agents, one operating view

The supplied dashboard brings configured agents into one place. Operators can
launch from a recipe or runtime/provider selection, open the browser terminal,
and inspect files, logs, sessions, loadouts, schedules, usage, and operation
history.

Preconfigured recipes are editable starting configurations. They are not
independently evaluated workers, one-click proof that every listed tool works,
or a public publishing and sharing system.

The dashboard is also an integration example: how authentication, provider
credentials, terminal state, lifecycle history, and observation can fit around
the lower-level adapters. Using its source requires understanding those
dependencies, not copying one UI component and assuming the infrastructure
comes with it.

## 9. Trust and operational boundaries

- Provider and model credentials belong in server-side configuration or the
  remote runtime where required, not public client variables.
- Hosted users supply their own provider and model credentials. Explicit
  owner-only defaults must not fund ordinary accounts silently.
- Scoped SDK keys are displayed once and stored hashed. Local development
  bypass is not production authentication.
- Tool discovery does not grant authority. Review commands and configure only
  the credentials and permissions needed.
- Usage estimates and unknown values are not a consolidated provider invoice.
- Compatibility projections remain during the hosted lifecycle cutover; do not
  describe a completed read-model migration where one is still pending.

These are implementation boundaries, not a claim of a comprehensive security
certification. See [release and cross-account evidence](LAUNCH.md).

## 10. Evidence: source, local tests, and deployed use

The repository distinguishes three kinds of proof:

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| Source and exported contracts | A module and interface are implemented | Every live provider/runtime combination works |
| Local tests, typechecks, build, isolated package verification | Checked contracts and import paths work in the test environment | Hosted auth, live model output, or provider cleanup |
| Dated deployed run with artifacts | The recorded account, runtime, provider, and workflow worked | All combinations or every later release work |

September 9 evidence includes a new-account Codex-on-Daytona task with an
independently inspected artifact. The archived August 5 matrix includes the
retired fourth provider and predates Daytona; it must not be relabeled as a
current 4×4 matrix.

[LAUNCH.md](LAUNCH.md) links exact reports and the repeatable release gate.
[MUX-RESULTS.md](MUX-RESULTS.md) retains historical measurements and failed cells.
This whitepaper update itself does not perform or imply a new live validation.

## 11. Direction, explicitly separate from current functionality

The next product work should make the existing modules easier to adopt:
clearer examples, understandable configuration boundaries, repeatable
per-runtime/provider verification, and documented extension paths.

Longer-term directions include:

- natural-language proposals for harness configuration, inspectable before use;
- versioned publishing and sharing of complete harness or Worker definitions;
- authority-scoped agent-to-agent delegation with approvals and budgets;
- consolidated metering and provider billing;
- broader outcome-based routing informed by verified runs.

These are directions, not present-tense benefits. There is no shipped public
Worker marketplace, universal component-install command, autonomous fleet
delegation system, or unified provider invoice.

## 12. Design principles

1. **Working starting point:** connect the pieces in a usable application.
2. **Inspectable source:** make configuration and implementation available to change.
3. **Modular boundaries:** reuse runtime and provider capabilities without hiding differences.
4. **Honest defaults:** distinguish selected, installed, connected, and verified.
5. **Owned working state:** preserve supported configuration and files with explicit limits.
6. **Evidence before claims:** tie support to source and dated proof.
7. **Adoption before magic:** improve the path from clone to useful run before promising automatic creation.

## References

- [README and quick start](../README.md)
- [Canonical messaging and claim ledger](PRODUCT-MESSAGING.md)
- [Current roadmap and historical engineering record](ROADMAP.md)
- [Direct multiplexer](MUX.md)
- [Lifecycle kernel and hosted cutover](CONTROL-PLANE-V2.md)
- [Release checks and deployed proof](LAUNCH.md)
- [Web engineering index](../web/docs/README.md)

## License

Agent Machines is [MIT-licensed](../LICENSE). Provider and product trademarks
belong to their respective owners. The project is independent of the runtimes,
model providers, and sandbox vendors it connects.
