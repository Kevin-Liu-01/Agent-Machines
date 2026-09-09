# Agent Machines: The Durable Worker System

**Technical and product whitepaper · Version 2.0 · August 15, 2026**
**Site:** [agent-machines.com](https://www.agent-machines.com) · **Source:** [github.com/Kevin-Liu-01/agent-machines](https://github.com/Kevin-Liu-01/agent-machines)

---

## Abstract

Agent Machines is a system for persistent, long-running software Workers. A
Worker is not a chat session, model, process, runtime, or sandbox. It is the
durable product object that owns a responsibility over time: identity, memory,
instructions, schedules, files, permissions, abilities, history, desired
state, and evidence.

Everything beneath the Worker is replaceable machinery. Agent runtimes, model
paths, sandbox providers, tools, terminal transports, persistence modes,
schedulers, and placement policies may change without requiring the user to
rebuild the Worker or lose its relationship with the work.

The current routing wedge is “OpenRouter for agents and machines.” The larger
product has two additional layers: Lovable/Bolt/v0-shaped composition for
creating a useful Worker from intent, and ChatGPT/Claude-shaped accessibility
for reaching the first useful result without understanding infrastructure.

The system is implemented as a declarative, recoverable control plane above
four agent runtimes and four sandbox adapters. It includes persistent harness
state, application-level provider migration, scheduled execution, a real
browser agent console, operation journals, provider-aware lifecycle controls,
templates, memory, skills, MCP connectors, logs, usage, artifacts, and SDK/API
control.

---

## 1. Thesis

> **The Worker is durable. Everything underneath is replaceable.**

The software industry has several strong primitives for agent execution:
models, terminal-native agent runtimes, sandbox providers, tool protocols,
memory products, workflow frameworks, and browser automation. The primitives
are improving quickly, but the user still has to assemble and operate them.

Agent Machines treats their combination as a new product primitive: a Worker
that owns a responsibility and remains available after the prompt, browser
session, process, model, or cloud machine that first created it.

The user relationship belongs to the Worker. Infrastructure providers supply
replaceable implementations beneath it.

### 1.1 What remains durable

- identity and responsibility;
- role, instructions, and approval boundaries;
- memory and accumulated working context;
- schedules and desired lifecycle state;
- files, artifacts, and output contracts;
- permissions and connected services;
- skills, procedures, and other abilities;
- run history, cost history, and evidence.

### 1.2 What remains replaceable

- agent runtime;
- model and model upstream;
- sandbox provider and machine shape;
- skills, MCP servers, CLIs, and native tool wiring;
- browser console, PTY, streaming, REST, SDK, and CLI transport;
- volume, snapshot, checkpoint, or always-on persistence mode;
- prompt, cron, API, queue, or another Worker as the execution trigger;
- placement policy based on constraints, outcomes, cost, and health.

Replaceable does not mean identical. Each primitive exposes its actual
capabilities. The control plane must preserve portability without erasing real
differences between providers or pretending unsupported operations exist.

---

## 2. Product category

Agent Machines spans three product layers.

| Layer | Analogy | User outcome |
|---|---|---|
| **Route** | OpenRouter for agents + machines | Runtime, model, sandbox, and abilities can change without changing the Worker |
| **Compose** | Lovable / Bolt / v0 for Workers | A responsibility becomes an inspectable Worker specification, or a trusted specialist can be used off the shelf |
| **Access** | ChatGPT/Claude-simple first use | A user signs in, connects services, and reaches useful work before infrastructure becomes part of the conversation |

These analogies describe separate jobs. Routing is the infrastructure wedge.
Composition is the creation environment. Accessible first use is the product
experience.

### 2.1 The intended interaction

1. **Describe or choose.** State the responsibility or select a trusted specialist.
2. **Connect.** Grant only the services and permissions required for that responsibility.
3. **Assign.** Set the schedule, output contract, budget, and approval boundary.
4. **Supervise.** Watch, approve, inspect evidence, and move or reconfigure the Worker.

The target experience is intentionally simpler than the underlying system.
Models, runtimes, sandboxes, terminals, persistence, cron, recovery, and
migration should disappear beneath the interaction while remaining available
for inspection when an operator needs them.

### 2.2 The magic moment

The magic moment is not one impressive response. A Worker comes online with a
job, memory, tools, files, permissions, and schedule; performs real work; the
browser closes; and the Worker is still there tomorrow with its context and
evidence intact.

That moment changes the user’s model of software. The natural next question is
not “what else can this chat answer?” It is “what other responsibilities could
a Worker own?”

---

## 3. User problem

Operating an agent still resembles assembling a computer for every task:

1. select a model;
2. find a runtime;
3. provision a sandbox;
4. install tools and dependencies;
5. connect credentials;
6. reconstruct context;
7. keep the process alive;
8. schedule recurring work;
9. capture files and logs;
10. recover from provider or process failure.

Consumers do not want those pieces. They want to choose a job and have it
begin. Technical teams tolerate the assembly because they need the result;
nontechnical users never reach the result at all.

### 3.1 Incomplete product shapes

| Shape | What it supplies | What remains missing |
|---|---|---|
| Sandbox provider | Isolated compute | Role, runtime, tools, state, schedule, evidence, supervision |
| Agent framework | Logic and orchestration | Durable home, deployment, terminal, provider lifecycle, fleet operations |
| Model chat | Accessible intelligence | Long-running ownership, inspectable filesystem, cron, provider portability |
| Memory product | Recall primitive | Complete Worker lifecycle and execution environment |
| Expert CLI | Powerful agent behavior | Remote durable home, consumer access, scheduling, fleet supervision |

The missing product is the persistent Worker above these layers.

### 3.2 Personal fleets

People do not need one universal chatbot. They can use a small fleet of
accountable specialists:

- a research Worker producing a sourced industry briefing;
- a browser Worker completing allowlisted repetitive web operations;
- a career Worker maintaining application context across months;
- a household operations Worker preparing renewals and decisions for approval;
- a coding Worker retaining ownership of a project;
- a small-business fleet for support, QA, research, and recurring operations.

Persistent memory without supervision is unsafe. Supervision without
persistent memory produces disposable chat windows. The Worker system requires
both.

---

## 4. Worker specification

The primary resource is declarative intent:

```ts
type Worker = {
  id: string;
  spec: {
    name: string;
    responsibility: string;
    runtime: "claude-code" | "codex" | "hermes" | "openclaw";
    sandbox: "daytona" | "e2b" | "sprites" | "vercel";
    model?: string;
    memory?: string;
    abilities: string[];
    schedules: Schedule[];
    migrationPolicy: "live" | "manual";
  };
  desiredState: "running" | "sleeping" | "deleted";
};
```

The operator owns intent. The control plane owns the retryable process of
reaching it: credential validation, placement, provision, bootstrap, runtime
installation, wake, run, schedule dispatch, migration, repair, and teardown.

### 4.1 Creation modes

Agent Machines supports or targets three entry points:

| Mode | Status | Contract |
|---|---|---|
| **Off the shelf** | Live | Twelve specialist templates create a reusable Worker and Memory bundle |
| **Assemble primitives** | Live | Choose runtime and sandbox, then submit one declarative launch intent |
| **Describe the outcome** | Product direction | Natural-language intent produces a proposed, inspectable role, abilities, permissions, schedule, evaluation, and placement before approval |

Natural-language composition must not become a hidden system prompt. It should
compile into a visible Worker specification that the user can edit and approve.

---

## 5. System architecture

```text
Human operator / head Worker
        |
        | describe · choose · apply · run · approve · inspect
        v
Durable Worker intent
  identity · responsibility · memory · schedule · permissions · evidence
        |
        v
AgentMachinesControlPlane
  operation journal · idempotency · leases · reconciliation · recovery
        |
        v
WorkerRuntimeDriver
        |
        +-- runtime: Claude Code | Codex | Hermes | OpenClaw
        +-- model: native | OpenRouter | Vercel AI Gateway | custom
        +-- sandbox: Daytona | E2B | Sprites | Vercel Sandbox
        +-- abilities: skills | MCP | CLI | native tools
        +-- trigger: prompt | cron | API | another Worker
        |
        v
Persistent Worker home
  ~/.agent-machines/
  memory · skills · crons · sessions · logs · artifacts · evidence
```

The control plane is conceptually serverless. No coordinator process must own
the Worker. A request, queue consumer, scheduled function, or recovery job may
claim the next operation and call the reconciler.

### 5.1 Durable operation journal

Operations are recorded before remote work begins. The journal provides:

- stable idempotency keys;
- expiring claims and renewable fenced leases;
- optimistic Worker generation checks;
- retryable, typed terminal states;
- scheduled-run deduplication;
- recovery after a request or function disappears.

The repository includes three store adapters:

1. `InMemoryControlPlaneStore` for deterministic tests and embedded use;
2. `JsonFileControlPlaneStore` for an atomic local journal;
3. `SupabaseControlPlaneStore` for tenant-scoped transactional hosted state.

The Supabase adapter uses atomic intent commits, optimistic writes,
`SKIP LOCKED` claims, renewable fenced leases, and terminal commits. Provider
SDK calls remain behind runtime/provider drivers, not page components.

### 5.2 Reconciliation semantics

| Desired event | Reconciler behavior |
|---|---|
| New Worker → running | validate → place → provision → bootstrap → probe → ready |
| Run on sleeping Worker | inspect without waking → wake → execute once |
| Run on missing Worker | reprovision → bootstrap → execute once |
| Runtime changes | install and probe target harness → persist new runtime placement |
| Sandbox changes | drain → transfer durable state → verify → atomic placement cutover |
| Desired sleeping | park only when the selected provider supports it |
| Desired deleted | provider teardown → clear placement → terminal deleted state |
| Scheduled run | evaluate schedule → deduplicate instant → reconcile running → execute |

---

## 6. Replaceable machinery

### 6.1 Runtime plane

Four harness adapters normalize installation, authentication, interactive
launch, headless run, and streamed events:

- Claude Code;
- Codex CLI;
- Hermes;
- OpenClaw.

Each runtime keeps its real behavior and wire format. Normalization creates a
common lifecycle and event boundary; it does not erase runtime differences.

### 6.2 Sandbox plane

Four provider adapters implement provision, describe, execution, persistence,
reattachment, and teardown, plus PTY, public URLs, and pause/resume where supported:

- E2B;
- Sprites.dev;
- Vercel Sandbox;
- Daytona.

Capabilities are explicit. Unknown capability rejects a constraint that
depends on it. Provider-specific lifecycle controls appear only when supported.
E2B supports manual pause/resume; Vercel restores filesystem snapshots, not live
processes. Daytona stop/start retains the filesystem but restarts processes.
Sprites manages automatic idle suspension and does not provide a manual pause operation. Unsupported pause
requests must fail before a journal claims that compute stopped. Requested
resources remain distinct from provider-reported allocation; E2B resources are
defined by its template rather than create-time sizing fields.

### 6.3 Model plane

Model traffic may use:

- native OpenAI or Anthropic credentials;
- OpenRouter;
- Vercel AI Gateway;
- a compatible custom endpoint.

Runtime wire formats constrain valid model paths. A credential and
compatibility gate rejects unusable combinations before provisioning.
Sandbox credentials provision compute; separate model credentials power inference.

### 6.4 Ability plane

A Worker harness may include:

- versioned `SKILL.md` procedures;
- credential-gated MCP connectors;
- closed-loop CLIs;
- runtime-native tools;
- ranked service routes;
- portable Memory bundles.

The loadout is what is active on a Worker. The registry is what can be
installed. The production registry indexed 2,595 items during the August 14,
2026 audit; the exact count changes as bundled and remote catalogs change.

---

## 7. Live workspace

Terminal-native agent runtimes are powerful because they expose the real tool,
not a reduced chat wrapper. Agent Machines operates those CLIs from a browser
without making the API process the durable session owner.

```text
Browser xterm.js
   | direct authenticated WebSocket when native PTY exists
   | HTTP input + SSE output as portable fallback
   v
Provider PTY / exec primitive
   v
Worker-owned tmux session "amconsole"
   v
Claude Code | Codex | Hermes | OpenClaw
```

The tmux session, process, scrollback, and pane log live on the Worker.
Reconnects attach to existing state. The fast path pins a provider PTY to one
authenticated WebSocket connection; the fallback uses `tmux send-keys` and an
offset-aware log tail.

Measured production evidence from August 14, 2026:

- authenticated E2B dashboard: 41 ms latest acknowledgement and 89 ms p95 over 20 human inputs;
- location-aware Sprite service: 10.8 ms p50 across 100 paced inputs;
- 87/100 Sprite inputs below the 50 ms target;
- provider-proxy stalls: 75.6 ms p95 and 80.8 ms maximum;
- Worker-side PTY write: sub-millisecond.

Fifty milliseconds is a strict target, not a false hard guarantee across the
public internet. The interface reports rolling latency and breaches.

---

## 8. Portability and migration

Application-level live provider migration preserves the Worker while changing
its substrate:

1. acquire migration ownership;
2. drain managed work;
3. provision and bootstrap the target;
4. copy allowlisted durable state;
5. capture and apply a stable final delta;
6. verify transferred files and invariants;
7. atomically cut over placement;
8. preserve or destroy the source according to policy.

A live E2B-to-Sprites proof transferred approximately 575 KB of durable state,
kept the source addressable through verification, and committed the target
placement only after the copy matched.

This is not cross-provider RAM or process transplantation. Processes restart
from durable state. The Worker identity, files, memory, schedules,
configuration, and artifacts persist.

---

## 9. Supervision and trust

A persistent Worker can act after the initiating chat has ended. That power
requires a stronger trust model than a chat transcript.

The operator should be able to inspect:

- current responsibility and desired state;
- connected services and permissions;
- runtime, model, sandbox, and placement rationale;
- schedules and pending operations;
- commands, logs, sessions, and lifecycle transitions;
- files, artifacts, screenshots, and other evidence;
- resource use, estimated cost, and run outcomes;
- approvals requested and decisions made.

Agent Machines therefore treats observation as part of the Worker, not a
separate enterprise add-on.

### 9.1 Credential boundary

Provider and model credentials remain server-side. The browser receives
redacted configuration and scoped machine state. User API keys are shown once
and stored as hashes. Provisioning fails closed when required credentials or
model compatibility are absent.

### 9.2 Authority boundary

Future Worker-to-Worker provisioning must use the same durable operation model
with explicit scope, budgets, approval rules, and audit history. A head Worker
should not gain implicit unrestricted authority by possessing a tool name.

---

## 10. Routing and evaluation flywheel

The routing problem is larger than provider uptime. A lane is the combination
of runtime, model, substrate, abilities, Worker specification, and policy.

The direct multiplexer evaluates:

1. credential readiness;
2. hard workload constraints;
3. published or measured price when explicitly requested;
4. learned outcome ranking for automatic placement;
5. current provider health and circuit-breaker state.

Each run can produce an outcome trace containing the attempted lanes, route
reasoning, latency, result, estimated cost, and health changes. The long-term
evaluation record should also include time to first useful output, resume and
migration reliability, human correction, approval, and satisfaction signals.

The defensible asset is not the adapter. It is the growing evidence about which
combination completes a responsibility successfully under a user’s constraints.

---

## 11. Distribution and marketplace

The first customer is already building this system internally: AI-native
startups, forward-deployed engineering teams, agencies, and individual
developers operating several coding or browser agents. They experience the
fragmentation directly and can evaluate an early product.

Templates are the bridge to a broader market. A consumer chooses a recognizable
job rather than a runtime and provider. Agent Machines currently ships twelve
specialist templates spanning coding, research, data, browser work, support,
operations, QA, knowledge, security, finance, and growth.

The long-term marketplace object is a complete Worker definition:

- role and responsibility;
- versioned procedures;
- tool and service requirements;
- memory schema;
- schedules and output contracts;
- evaluation criteria;
- permissions and data boundaries;
- expected cost and deployment constraints.

Consumers install the Worker like an application while retaining ownership of
its state and the ability to change the implementation beneath it.

---

## 12. Business model

The business can expand in layers:

1. paid control plane for individuals and teams operating persistent Workers;
2. usage-based orchestration and unified billing across model and sandbox providers;
3. team permissions, approvals, audit history, budgets, and fleet supervision;
4. enterprise deployment replacing custom internal agent platforms;
5. marketplace take rate for paid Worker templates and loadouts.

Providers compete on compute and intelligence. Agent Machines owns the Worker
relationship, portable state, routing decision, operational history, and
supervision surface.

---

## 13. Current implementation

The live product includes:

- declarative Worker API and recoverable lifecycle reconciler;
- in-memory, atomic JSON, and transactional Supabase operation stores;
- four runtime adapters and four substrate adapters;
- application-level live migration;
- cold-start wake and missing-machine reprovision before runs;
- deduplicated scheduled dispatch;
- twelve preconfigured specialist Workers;
- Browser Agent Console and command streaming;
- Fleet, machine detail, operation history, and provider-aware controls;
- Memory, loadouts, skills, MCPs, registry, cron, sessions, logs, usage, and artifacts;
- 161 skills and 39 MCP servers in the bundled registry snapshot;
- TypeScript SDK, REST APIs, and CLI;
- nineteen signed-in operational surfaces and twenty-four mapped public capability claims.

### 13.1 Live validation boundary

The archived August 5 strict runtime/provider matrix counted exact output and
clean lifecycle behavior, not exit code alone. It predates Daytona support:

- E2B: four runtime cells green;
- Sprites: four runtime cells green;
- Vercel Sandbox: four runtime cells green;
- Retired fourth provider: failed vendor API and teardown checks.

An earlier exit-code-only run reached 16/16; that archived strict run was 12/16.
Neither result validates Daytona. The current provider set is Daytona, E2B,
Sprites, and Vercel; new validation must identify the provider, runtime, date,
output evidence, and teardown result independently.

---

## 14. Boundaries and non-claims

- There is no unified provider bill yet.
- Migration preserves durable managed state, not RAM or a running process image.
- Natural-language intent-to-Worker composition is product direction; templates and modular assembly are live.
- A bundled skill or MCP catalog entry is not the same as production proof of every item.
- Provider adapters do not imply identical capability or current vendor health.
- The hosted dashboard still contains compatibility projections while the Worker journal becomes the only lifecycle read model.
- Marketplace and paid template economics are not shipped.

---

## 15. Roadmap

### Near term

- five external design partners already spending money on sandboxed agents;
- finish the hosted Worker read-model cutover;
- intent-to-Worker proposal and approval flow;
- fleet-wide operation search;
- schedule time-zone and calendar policy;
- dedicated recovery consumer when fleet scale requires it;
- provider-native migration accelerators behind honest capabilities;
- unified metering and billing.

### Expansion

- versioned Worker publishing and installation;
- permission, cost, and evaluation manifests for templates;
- team approval and budget policies;
- marketplace for trusted Workers and loadouts;
- MCP/CLI surface for authority-scoped Worker-to-Worker orchestration;
- outcome-driven automatic routing across the complete Worker lane.

---

## 16. Design principles

1. **Worker before machinery.** Preserve the responsibility and user relationship.
2. **Intent before procedure.** The operator states the desired Worker; the control plane owns retries and sequencing.
3. **Capabilities before uniformity.** Never claim a provider operation that the lane cannot support.
4. **Evidence before autonomy.** A long-running Worker must produce inspectable work and history.
5. **Approval before authority.** Connected services and subordinate Workers remain explicitly scoped.
6. **Route before rebuild.** Use competitive runtimes, models, and substrates rather than owning every lower layer.
7. **Owned state before closed sessions.** Procedures and context live in portable Worker state.
8. **Outcomes before infrastructure metrics.** Optimize for successful completed responsibilities.
9. **Magic without mystery.** First use should feel immediate; the underlying Worker specification remains inspectable.

---

## 17. References

| Document | Contents |
|---|---|
| [`README.md`](../README.md) | Product overview, SDK, CLI, dashboard, and quick start |
| [`knowledge/VISION.md`](../knowledge/VISION.md) | Canonical product thesis and category framing |
| [`CONTROL-PLANE-V2.md`](./CONTROL-PLANE-V2.md) | Lifecycle kernel and cutover ledger |
| [`MUX.md`](./MUX.md) | Direct multiplexer, capabilities, routing, and migration |
| [`knowledge/BROWSER-AGENT-CONSOLE.md`](../knowledge/BROWSER-AGENT-CONSOLE.md) | Browser terminal architecture and measurements |
| [`sandbox-terminal-gateway.md`](../web/docs/sandbox-terminal-gateway.md) | Terminal transport specification |

---

## License

Agent Machines is open source under the MIT License. Provider and product
trademarks belong to their respective owners. Agent Machines is independent of
the runtimes, model providers, and sandbox vendors it connects.
