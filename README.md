<p align="center">
  <a href="https://www.agent-machines.com">
    <img src="web/public/brand/agent-machines-readme.svg" alt="Agent Machines: persistent Workers with replaceable machinery" width="100%" />
  </a>
</p>

# agent-machines

> **Persistent Workers. Replaceable machinery.**

Agent Machines is the **Worker system for persistent digital labor**. Describe a responsibility or choose a trusted specialist, then keep its identity, memory, instructions, schedules, files, permissions, abilities, history, and evidence while runtimes, models, tools, and sandboxes change underneath it.

The routing wedge is “OpenRouter for agents and containers.” The larger product is a creation environment for long-running Workers: Lovable/Bolt/v0-shaped composition with ChatGPT-simple access to the first useful result. People do not want a bare sandbox or another disposable chat. They want a Worker that owns a job, remains inspectable, and is still there tomorrow.

Live site: <https://www.agent-machines.com>
Source: <https://github.com/Kevin-Liu-01/agent-machines>

---

## Table of contents

- [What it is](#what-it-is)
- [The product invariant](#the-product-invariant)
- [The core idea: dual routing](#the-core-idea-dual-routing)
- [Control plane v2](#control-plane-v2-declarative-workers)
- [Browser Agent Console](#browser-agent-console-live-cli-in-the-browser)
- [Deploy → Bootstrap → Attach → Talk](#deploy--bootstrap--attach--talk)
- [The streaming gateway](#the-streaming-gateway-capability-tiered)
- [The harness](#the-harness-registry-driven)
- [Architecture](#architecture)
- [Provider capability matrix](#provider-capability-matrix)
- [Quick start](#quick-start)
- [CLI](#cli)
- [Web app](#web-app)
- [Development and release checks](#development-and-release-checks)
- [Dashboard surfaces](#dashboard-surfaces)
- [Repository layout](#repository-layout)
- [Data boundaries and security](#data-boundaries-and-security)
- [Further reading](#further-reading)

---

## What it is

One account to **route the machinery**, **compose the Worker**, and **access the result**:

| Analogy | Meaning |
|---------|---------|
| **OpenRouter for agents and machines** | Route runtime, model, substrate, and abilities without binding the Worker to one vendor |
| **Lovable / Bolt / v0 for Workers** | Describe a responsibility and assemble a long-running Worker, or start from a trusted template |
| **ChatGPT-simple access** | Sign in, connect the services it may use, and reach the first useful result before infrastructure enters the conversation |

The intended interaction is four steps: **describe or choose → connect → assign → supervise**. Models, runtimes, sandboxes, terminal transports, scheduling, recovery, and migration disappear beneath that experience.

**Two audiences:**

1. **Humans** choose useful specialists or compose them from primitives, then watch, approve, inspect, and move the fleet.
2. **Other agents** drive the same API/CLI surface so a head Worker can provision, route, observe, and tear down subordinate Workers.

## The product invariant

**The Worker is durable. Everything underneath is replaceable.**

| Keep with the Worker | Replace beneath it |
|---|---|
| Identity, responsibility, memory, instructions, schedules | Agent runtime, model path, sandbox provider |
| Files, permissions, abilities, history, evidence | Skills/MCP/CLI wiring, terminal transport, persistence mode |
| Desired state, approval boundaries, output contract | Scheduler, placement policy, cost/health route |

Replaceable does not mean identical. Every provider and runtime declares what it can actually do; the control plane exposes only supported operations. The stable Worker abstraction preserves the user relationship while necessary infrastructure differences remain visible.

---

## The core idea: dual routing

Most products lock you into one runtime *or* one cloud. Agent Machines routes both axes independently. Every substrate implements a single `MachineProvider` interface (`provision` / `state` / `wake` / `sleep` / `destroy` / `exec` / `streamExec`), so the rest of the system is provider-agnostic.

| Axis | Options | Abstraction |
|------|---------|-------------|
| **Agent runtime** | Hermes, OpenClaw, Claude Code, Codex CLI | bootstrap phase recipes + launch commands |
| **Substrate** | E2B, Sprites.dev, Vercel Sandbox, Dedalus Machines | `MachineProvider` (`web/lib/providers/*`) |
| **Model upstream** | Vercel AI Gateway, OpenRouter, native OpenAI / Anthropic keys, custom OpenAI-compatible fallback | router presets + per-machine credential gate |

A **credential gate** blocks provisioning when the chosen runtime has no usable model upstream or the substrate has no key, so spin-up never fails silently downstream.

> **v2 lifecycle cutover.** Hosted `MachineProvider` is now a compatibility
> facade over the mux provider adapters, so vendor SDK code has one home. The
> new control-plane kernel consumes those adapters through public and hosted
> runtime drivers. Every hosted lifecycle mutation now submits a durable
> operation before provider work. `UserConfig` / `MachineRef` remains as the
> dashboard's compatibility projection, while the operation journal uses
> atomic JSON locally or transactional Supabase in hosted deployments. The
> latter requires migration `009_control_plane_v2.sql`. The exact ledger is
> [docs/CONTROL-PLANE-V2.md](docs/CONTROL-PLANE-V2.md).

## Control plane v2: declarative Workers

`src/control-plane` is the new lifecycle kernel. Callers submit desired Worker
state; a leased, idempotent reconciler owns provision, bootstrap, cold-start,
sleep, live provider migration, scheduled dispatch, repair, and teardown.
Requests and cron ticks may disappear without owning the Worker: unfinished
operations remain in the journal and expired leases can be reclaimed.

```ts
import {
  AgentMachinesControlPlane,
  JsonFileControlPlaneStore,
  MuxWorkerRuntimeDriver,
  createMux,
} from "agent-machines";

const plane = new AgentMachinesControlPlane(
  new JsonFileControlPlaneStore(".agent-machines/control-plane.json"),
  new MuxWorkerRuntimeDriver(createMux()),
);

await plane.apply({
  id: "repo-coder",
  spec: {
    name: "Repo coder",
    runtime: "claude-code",
    sandbox: "e2b",
    migrationPolicy: "live",
    schedules: [],
  },
});

await plane.drain(); // a request, queue consumer, or cron reconciler can do this
```

The local package ships in-memory and atomic JSON journal adapters; the hosted
app adds a tenant-scoped Supabase adapter with fenced leases and atomic RPCs.
Worker detail exposes operation history and retry, and the internal cron tick
is also the recovery consumer. See
[`docs/CONTROL-PLANE-V2.md`](docs/CONTROL-PLANE-V2.md) for the exact boundary.

---

## Browser Agent Console (live CLI in the browser)

The headline capability and the hardest engineering problem in the repo: **you operate the real agent CLI (Codex, Claude Code, Hermes, OpenClaw) from a browser tab**, on a remote worker, with no local terminal and no tunnel.

<p align="center">
  <img src="web/public/screenshots/console-hermes.png" alt="Hermes Agent running live in the Browser Agent Console" width="49%" />
  <img src="web/public/screenshots/console-codex.png" alt="OpenAI Codex CLI running live in the Browser Agent Console" width="49%" />
</p>
<p align="center"><sub>One browser console, two runtimes: <b>Hermes Agent</b> (left) and <b>OpenAI Codex CLI</b> (right). Each is the real CLI attached over tmux-over-exec, not a chat reskin.</sub></p>

### The problem

The most capable agent tools ship as **terminal programs (CLIs), not chat widgets**. A live browser terminal normally requires a **long-lived WebSocket PTY server** in the middle, relaying every keystroke. Vercel added WebSocket Functions in June 2026, but a socket invocation is still bounded and cannot own durable terminal state. The session therefore stays on the worker while a pinned Function accelerates the live data plane.

- assume a local terminal (`claude` / `codex` on your laptop), excluding non-terminal users, or
- wrap the agent in a chat UI and lose the full TUI/CLI experience, or
- ship their own terminal locked to their own sandbox infra, or
- bolt on a relay/tunnel they then have to operate.

### The inversion

Stop hosting the session in the API. **Put the session on the worker; keep the control plane stateless.**

- **Session lives on the box.** A persistent `tmux` session (`amconsole`) holds the PTY, the agent process, and scrollback. It survives serverless cold starts and function timeouts.
- **Fast path (native-PTY substrates).** One authenticated Vercel WebSocket Function pins one provider PTY and attaches it to `amconsole`; input, output, and resize stay on that connection.
- **Portable fallback.** HTTP `tmux send-keys` input plus offset-aware SSE `tail -f` output remains available anywhere `exec` exists.
- **Session durability is unchanged.** Socket reconnects reattach to worker-owned tmux; the Function never owns the shell or its scrollback.

`exec` is the only primitive each substrate must provide, so **the same UI works across Dedalus, E2B, Sprites, and Vercel**.

```txt
Browser (xterm.js)
  | input/output/resize <--> /api/dashboard/terminal/socket (pinned WebSocket)
  | fallback keystrokes --> /api/dashboard/terminal/input   (tmux send-keys -H)
  | fallback output    <--  /api/dashboard/terminal/stream  (SSE tail -f)
  v
Next.js control plane (Clerk auth, resolve machine + provider creds)
  v
provider.openPty (native fast path) or provider.exec / streamExec (fallback)
  v
Remote VM: tmux "amconsole" + pipe-pane --> /tmp/am-console.log
  v
Agent CLI running inside the pane (codex | claude | hermes | openclaw)
```

The closest predecessor is **AWS CloudShell**, a real browser terminal, but it is locked to the AWS ecosystem. This is CloudShell-shaped, substrate-agnostic, and wired to agent CLIs. Worker-owned tmux makes both the native-PTY WebSocket lane and the HTTP/SSE fallback reconnectable instead of tying session lifetime to an API process.

### Performance notes

The interactive console is tuned to feel close to local:

- parallel xterm bundle load and `tmux` session attach,
- snapshot paint on connect (`capture-pane`), so the screen is never blank,
- `requestAnimationFrame`-batched writes to xterm,
- immediate flush for control keys and a zero-delay coalesce for raw printable input,
- a direct browser-to-worker WebSocket with one primary lane plus five preconnected failover lanes and deduplicated 12ms retry,
- correlated browser-to-PTY acknowledgements with a rolling 20-sample p95 SLO badge,
- an HTTP/SSE fallback with ordered input coalescing for non-native lanes,
- per-user `getUserConfig` cache (10s) and machine-state cache (3s),
- E2B sandbox connect reuse (45s) within a warm serverless instance,
- `tmux` pre-installed during bootstrap so the first attach never triggers a package install.

Production proof on 2026-08-14: the authenticated E2B dashboard reported a **41ms latest acknowledgement and 89ms p95 across 20 human inputs**. A location-aware Sprite managed Service reached **10.8ms p50 across 100 paced inputs**, with 87/100 below the 50ms target; periodic provider-proxy stalls produced 75.6ms p95 and 80.8ms max. The worker PTY write itself remained sub-millisecond. The UI therefore treats 50ms as a strict target and visibly reports breaches instead of claiming a hard internet latency guarantee.

Full write-up: [`knowledge/BROWSER-AGENT-CONSOLE.md`](knowledge/BROWSER-AGENT-CONSOLE.md). Engineering spec: [`web/docs/sandbox-terminal-gateway.md`](web/docs/sandbox-terminal-gateway.md).

---

## Deploy → Bootstrap → Attach → Talk

The primary dashboard flow is now runtime → sandbox → live console. The
sandbox click submits one `POST /api/dashboard/control-plane/workers` intent;
the hosted compatibility adapter owns these stages:

1. **Declare.** Create the durable Worker recipe: runtime, sandbox intent, model route, memory, and live-migration policy.
2. **Provision + bootstrap.** The adapter creates the provider machine, records its `MachineRef`, and schedules phase-aligned bootstrap (`web/lib/bootstrap/runner.ts`). Each phase tees to `bootstrap.log` and persists `bootstrapState`.
3. **Attach.** The browser opens the terminal page with `?launch=1`, attaches the `tmux` console, and paints the pane snapshot.
4. **Talk.** The agent CLI auto-launches inside the pane and you interact line by line, including full-screen TUIs.

Bootstrap phases are split into `CORE_BOOTSTRAP_PHASES` (must succeed; gateway marked ready) and `POST_GATEWAY_BOOTSTRAP_PHASES` (best-effort, e.g. browser tooling) so a slow optional install can't block the agent from coming online.

---

## The streaming gateway (capability-tiered)

Two output paths reuse the same SSE event contract (`started · output · idle · error`) so the UI is identical regardless of substrate capability.

- **Interactive console** (`/api/dashboard/terminal/*`): live PTY over tmux-over-exec, described above.
- **One-shot exec** (`/api/dashboard/exec/stream`) and **bootstrap tail** (`/api/dashboard/bootstrap/stream`): run a command, stream stdout/stderr while it runs.

Streaming prefers each provider's native primitive and only falls back to log-tail polling for substrates that physically cannot stream. The callback-to-generator adapter lives in `web/lib/providers/stream-util.ts` (`bridgeExecStream`).

The agent's **HTTP chat gateway** (Hermes `:8642` / OpenClaw `:18789`) is now optional. The console path is **exec-first** and needs no public URL or Cloudflare tunnel; `POST /api/chat` degrades gracefully to "use the Terminal console" when a machine has no public gateway URL. Machine bearer tokens never become `NEXT_PUBLIC_*`.

---

## The harness (registry-driven)

A worker is a runtime **plus** a composable harness. The app derives every count at runtime from the registries (`web/lib/platform/harness.ts` reads `web/data/skills.json` and `web/data/mcps-catalog.json`). The numbers written into this table are a snapshot of those registries, kept honest by `src/lib/public-claims.test.ts`, which fails if a published count and the registry disagree.

| Layer | Source | Notes |
|-------|--------|-------|
| **Skills** | `knowledge/skills/<name>/SKILL.md` | 161 skills; synced to `~/.agent-machines/skills/` on deploy/reload |
| **MCP servers** | `knowledge/mcps` catalog | 39 servers; credential-gated (Vercel, Stripe, Supabase, Clerk, Figma, PostHog, Sentry, Datadog, Linear, Slack, GitHub, and more) |
| **Service routes** | loadout registry | MCP → CLI → skill preference per vendor |
| **CLIs** | bootstrap install | agent-browser, Playwright, gh, curl, jq, sqlite3, and more |
| **Agent-native tools** | per runtime | vary by runtime; Hermes is richest (terminal, fs, browser, vision, cron, memory, delegate) |
| **Registry (install)** | `web/lib/dashboard/registry/*` | **2,595** searchable items in the 2026-08-14 production audit: official MCP registry (paginated cache), skills.sh, npm CLIs, bundled loadout catalog, Cursor plugin scan, GitHub/URL manifests |
| **Workers** | preset + Memory bundle | deployable specialist templates (runtime, router, persona), distinct from raw machine provisioning |
| **Memory bundles** | portable harness slice | persona, rules, abilities; install into any runtime or export as a prompt |

Skills follow the **SKILL.md protocol**: procedures saved to the machine compound over time and cannot be exported out of a stateless chat product.

**Loadout vs registry:** **Loadout** describes a Worker's selected abilities, not proof that each tool is installed or connected. **Registry** is the discovery and import catalog: save to your library, review a command, choose a specific Worker, then run or retry installation. Command success is reported separately from runtime verification. MCP servers and plugins can require manual setup, credentials, permissions, and runtime-specific wiring. Offline installs are not silently queued. Bundled knowledge refresh preserves Worker-authored memory and modified skills.

---

## Architecture

```txt
you
  | browser / CLI / API
  v
Declarative Worker API  ---------------  dashboard / SDK / CLI
  | operation journal + lifecycle reconciler
  v
WorkerRuntimeDriver  ------------------  MuxWorkerRuntimeDriver
  | hosted bridge: Clerk UserConfig + MachineRef during cutover
  v
MachineProvider  ----------------  E2B | Sprites | Vercel Sandbox | Dedalus
  | provision / state / wake / sleep / destroy / exec / streamExec
  v
persistent worker (provider home: /home/user | /home/sprite | /vercel/sandbox | /home/machine)
  |
  |-- tmux "amconsole"            interactive browser console (PTY over exec)
  |-- :8642 / :18789 gateway      optional HTTP chat (exec-first; no tunnel required)
  |-- ~/.agent-machines/          skills, mcps, chats, crons, sessions, logs, artifacts
  |-- <home>/agent-machines/      git checkout, used for knowledge reload
  v
model upstream (Vercel AI Gateway | OpenRouter | native OpenAI/Anthropic | custom)
```

---

## Provider capability matrix

Every substrate implements `MachineProvider`; streaming tier depends on the SDK.

| Substrate | `streamExec` primitive | Streaming tier |
|-----------|------------------------|----------------|
| **E2B** | `commands.run(cmd, { onStdout, onStderr })`, bridged to a generator | native stream |
| **Sprites** | `spawn()` process `stdout` / `stderr` Readables, bridged | native stream |
| **Vercel Sandbox** | `Command.logs()` async iterator on a detached command | native stream |
| **Dedalus** | none (REST exec returns output only after completion) | poll fallback |

Native tiers relay output frame by frame with no extra `exec` calls. The poll fallback launches a detached command, tees combined output to a temp log, and polls new bytes until an exit-marker file appears.

**Which lanes are proven, and on which surface.** The multiplexer's adapters
(`src/mux/providers/*`) have run every agent on every substrate live. The archived
strict matrix from 2026-08-05 passed **12 of 16 cells**: all four harnesses on E2B,
Sprites, and Vercel Sandbox. Dedalus failed because of intermittent provider
lookup and teardown errors. An earlier 16-of-16 run checked exit codes alone;
[docs/MUX-RESULTS.md](docs/MUX-RESULTS.md) distinguishes that weaker proof from
the strict sentinel and teardown checks.

The hosted `MachineProvider` bindings now reuse those mux adapters through
`web/lib/providers/mux-facade.ts`; they no longer maintain separate vendor SDK
implementations. Hosted authentication, bootstrap, persistence, and browser
interaction still require their own deployed proof. Follow
[docs/LAUNCH.md](docs/LAUNCH.md) before treating a historical matrix as release
evidence.

---

## Quick start

```bash
git clone https://github.com/Kevin-Liu-01/agent-machines
cd agent-machines
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
pnpm web        # open http://localhost:3210; choose a Worker and connect your keys
```

Requires Node `^20.19` or `>= 22.12`. Not merely ">= 20": `require("agent-machines")`
resolves through the `module-sync` export condition, which only those Nodes match,
and older ones cannot `require()` an ES module at all.

Use pnpm 10.30.0 (pinned in `package.json`): the root SDK and `web/` share one
workspace and lockfile. For the dashboard, configure Clerk and Supabase as
described in [`web/README.md`](web/README.md). For a local-only preview, set
`ALLOW_DEV_AUTH=1`; real sign-up testing requires Clerk. `pnpm deploy` is the
legacy Hermes-on-Dedalus CLI; `pnpm mux` exposes the multi-provider CLI.

### Agent Machines SDK

Create a user-scoped key in **Dashboard → Settings → Developer API**, then use
the same provision → bootstrap → run flow from code:

```bash
export AGENT_MACHINES_URL=https://your-app.vercel.app
export AGENT_MACHINES_API_KEY=am_live_...
```

```ts
import { AgentMachines } from "agent-machines";

const am = new AgentMachines();
const agent = await am.create({
  agent: "codex",
  sandbox: "e2b",
  model: "openai/gpt-5.2",   // codex speaks the OpenAI Responses API
});
const result = await agent.run("Inspect this repository and fix the failing test.");
console.log(result.text);
```

`model` is optional and defaults to the agent's own upstream: `codex` gets an
OpenAI id, `claude-code` an Anthropic one, and the gateway runtimes (`hermes`,
`openclaw`) get the account default. Pairing an agent with a model its upstream
cannot serve -- `agent: "codex"` with `model: "anthropic/..."` -- is refused by
`create()` instead of provisioning a machine that 404s on its first turn. See
[docs/UPSTREAMS.md](docs/UPSTREAMS.md) for the measured per-upstream wire
formats and the model-id namespacing rule.

The key is displayed once and stored only as a SHA-256 hash. Rotating it
invalidates the previous key immediately. Set `bootstrap: false` on the client
only when you intend to bootstrap the machine yourself.

### The multiplexer (no control plane required)

The same package ships a direct-to-substrate multiplexer: it talks to E2B,
Sprites, Vercel Sandbox and Dedalus itself, installs the agent harness, and
streams normalized events. No hosted control plane, no API key of ours -- just
your provider keys. See [docs/MUX.md](docs/MUX.md) for the architecture and
[docs/MUX-RESULTS.md](docs/MUX-RESULTS.md) for measured latencies.

`agent-machines.json` in your project root:

```json
{
  "keys": { "anthropic": "env:ANTHROPIC_API_KEY" },
  "providers": { "e2b": "env:E2B_API_KEY", "sprites": "env:SPRITES_TOKEN" },
  "sandboxes": { "primary": "e2b", "backups": ["sprites"] },
  "agents": { "default": "claude-code" }
}
```

```ts
import { createMux } from "agent-machines";

const mux = createMux();

const machine = await mux.create({
  name: "coder",
  agent: "claude-code",
  sandbox: "auto",                                  // route, don't pin
  constraints: { pty: "native", maxRuntimeMs: 3_600_000 },
  optimize: "cost",                                 // opt-in, off by default
});

for await (const event of machine.run("review this repo", { runKey: "review-42" })) {
  if (event.type === "text") process.stdout.write(event.delta);
}

const pty = await machine.pty();   // real terminal, native PTY where available
console.log(machine.attempts);     // why it landed where it landed

// Application-level live handoff: warm target, drain managed runs, final
// stable state delta, verify, then atomically repoint the name. Processes
// restart from durable state; this is not a cross-provider RAM transplant.
await mux.migrate("coder", { to: "sprites", mode: "live" });
```

`sandbox: "auto"` walks `primary -> backups` through five stages, in this order:

1. **Credentials.** Lanes the config cannot authenticate are dropped, with the
   missing variables named. Fail closed.
2. **Constraints.** Lanes that cannot satisfy `constraints` are dropped, and the
   attempt records the dimension that failed (`constraint: "pty"`). An
   unprovable vendor fact reads as `unknown` and rejects rather than being hoped
   for.
3. **Price**, only with `optimize: "cost"`: cheapest modeled total first, and a
   lane whose vendor publishes no rate sorts **last** rather than being read as
   free.
4. **Learned selection**, only for `auto` with no `optimize`: lanes are ordered
   by a score over this machine's own run traces -- task success first, then
   cost per successful result, then time to first output.
5. **Health.** A rolling window per substrate puts a lane that is failing right
   now at the back.

Only the first two stages ever remove a lane. The last three return
permutations, because an incident that opened every circuit -- or a policy that
has learned to dislike every lane -- must not make `create()` impossible.
Provisioning errors fail over to the next lane, and every decision lands in
`machine.attempts` with its reason, health state, modeled price and learned
score.

What stage 4 is and is not: it is a deterministic scorer over the local JSONL
trace store, shrunk toward a prior by sample count so one lucky run cannot
outrank a long record, and it only ever **reorders** the lanes that survived
stages 1 and 2. It is not a bandit (no exploration), it does not override a
pinned `sandbox` or an explicit `optimize`, its evidence is local to one host,
and the hosted dashboard has none of it.

Failover is **placement-time only**. A run that dies mid-stream comes back with
`truncated: true` and is not replayed. `runKey` is an idempotency key, not a
retry: a second `run()` with the same key returns the stored result instead of
executing the agent twice. Each run also appends one trace record to a day shard
in `~/.agent-machines/traces/` -- placement attempts, time to first event, and
cost kept split into modeled sandbox compute and harness-reported model spend,
with the total present only when both halves are known.

---

## CLI

```bash
npm run deploy             # provision + bootstrap Hermes
npm run deploy:openclaw    # provision + bootstrap OpenClaw
npm run chat -- "message"  # chat with the active machine's gateway
npm run status             # active machine state
npm run logs               # tail gateway logs
npm run shell              # exec a shell command on the machine
npm run wake / sleep / destroy -- --yes
npm run reload             # git-pull the repo on the VM and re-sync knowledge
npm run doctor             # environment + machine health checks
npm run benchmark          # cross-substrate boot/exec/IO benchmarks
```

Multiplexer commands (direct to substrate, no control plane):

```bash
npm run mux -- run --agent claude-code "review my repo"  # streamed one-shot
npm run mux -- term --agent codex --name coder           # interactive agent PTY
npm run mux -- shell --name coder                        # raw PTY on the sandbox
npm run mux -- ls                                        # named machines
npm run mux -- migrate --name coder --to sprites --live  # drain + final delta + cutover
npm run mux -- rm --name coder                           # destroy a named machine
```

Read-only reporting, which works on a fresh install with no keys and no traces:

```bash
npm run mux -- routes                    # the five routing stages, and what each did
npm run mux -- routes --needs '{"pty":"native"}' --agent codex
npm run mux -- routes --optimize cost --json
npm run mux -- stats --since 24h         # task success, time to first output,
                                         # cost per successful result, truncation rate
npm run mux -- health                    # circuit state, samples and cooldown per substrate
```

`stats` reports those four numbers per `harness@substrate` lane; `routes` adds
the learned score and the sample count behind it when the policy ran. A number
nobody measured renders as **unknown** -- never `0`, never a dash -- because
zero is the best possible value for a cost, so a zero-filled unknown would
report the lane nobody can price as the cheapest one available.

Live-test every harness on every credentialed substrate:

```bash
npx tsx scripts/mux-live-test.ts
```

---

## Web app

```bash
# From the repository root:
cp web/.env.local.example web/.env.local
pnpm install --frozen-lockfile
pnpm web
```

Open <http://localhost:3210>.

Configure Clerk for authenticated routes:

```txt
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

> **Production note:** use Clerk **production** keys (`pk_live_…` / `sk_live_…`) on the deployed domain. Development keys carry strict rate limits and store metadata on a separate instance.

Hosted accounts connect their own sandbox and model keys in Settings. Deployment
credentials are opt-in defaults for the exact Clerk user ID in
`AGENT_MACHINES_OWNER_USER_ID`; leaving it unset requires BYOK for every hosted
account. See [`web/.env.local.example`](web/.env.local.example).

### Key routes

| Route | Purpose |
|-------|---------|
| `/` | landing: dual-gear hero (runtime × substrate), capabilities, loadout, architecture |
| `/dashboard` | fleet overview, activity, gateway health, usage summary |
| `/dashboard/setup` | route runtime + substrate, credentials, provision |
| `/dashboard/machines` | fleet supervision, stats/heatmaps, per-machine focus (`?focus=`) |
| `/dashboard/machines/[id]` | machine detail: usage charts, gateway, bootstrap, quick actions |
| `/dashboard/machines/[id]/terminal` | **Browser Agent Console** (interactive + one-shot) |
| `/dashboard/machines/[id]/chat` | gateway chat for a machine |
| `/dashboard/machines/[id]/agents` | per-machine agent/runtime context |
| `/dashboard/workers` | deployable presets (runtime + router + Memory bundle) |
| `/dashboard/memory` | owned Memory bundles (persona, rules, abilities) |
| `/dashboard/registry` | browse/install tools, skills, MCPs, CLIs (2,595 items in the 2026-08-14 production audit) |
| `/dashboard/loadout` | active stack on a machine: skills, MCPs, service/task routes |
| `/dashboard/skills` `/mcps` `/cron` | harness libraries + scheduled jobs |
| `/dashboard/usage` | cost and utilization rollups (Supabase-backed) |
| `/dashboard/benchmarks` | cross-substrate boot/exec matrix |
| `/dashboard/settings` | per-account API keys and router defaults |
| `/dashboard/sessions` `/logs` `/artifacts` `/cursor` | observation surfaces |

Command palette (`⌘K`) jumps across machines, registry, loadout, and console routes.

## Development and release checks

```bash
pnpm test          # mux, lifecycle kernel, SDK, CLI, and dashboard suites
pnpm typecheck     # SDK, CLI, and billable live-test scripts
pnpm --dir web typecheck
pnpm build         # compile the SDK, then the production Next.js app
pnpm verify:sdk    # pack and exercise ESM/CommonJS exports in an isolated consumer
pnpm check         # all of the above, in release order
```

These checks make no billable provider or model calls. A release also needs a
real new-account run using the deployment's authentication, database, and chosen
provider; the operator procedure is [`docs/LAUNCH.md`](docs/LAUNCH.md).

The web dev server, tests, typecheck, and build compile the SDK first, so a new
checkout does not need a pre-existing `dist/` directory. Builds prepare `web/data`
from committed `knowledge/` sources. They never refresh external catalogs. To
intentionally update the Cursor marketplace snapshot, run
`pnpm --dir web refresh-catalog`, review the `knowledge/` and `web/data/` changes,
then commit them together. This keeps the same revision's builds reproducible.

---

## Dashboard surfaces

Beyond provision-and-chat, the control plane is a **fleet operations desk**:

| Surface | What it does |
|---------|----------------|
| **Machines** | Live state, bootstrap phase, gateway probe, split-view chat (`?focus=`), deploy-and-talk entry |
| **Workers** | Two-click runtime → sandbox launch plus reusable recipes with model route and Memory |
| **Memory** | Portable persona + rules + abilities; import/export; referenced by Workers |
| **Registry** | Unified search over MCP registry, skills.sh, npm, bundled catalog, and Cursor plugins; add to loadout |
| **Loadout** | Ranked service routes (MCP → CLI → skill), task routes, trusted add-ons already on the machine |
| **Cron** | User-defined schedules stored in config; **`/api/internal/cron/tick`** (Vercel Cron every 5 min) evaluates and execs on machines |
| **Usage / metrics** | Supabase-backed utilization, activity timeline, per-machine charts; collector runs on cron tick + on-demand |
| **Benchmarks** | Compare E2B, Sprites, Dedalus, Vercel on boot, exec, streaming tier |

**Supabase** is required for durable metrics, usage, and activity. Without it, the app falls back to Clerk metadata only. See `web/.env.local.example`.

---

## Repository layout

```txt
agent-machines/
  src/           SDK + CLI + mux + declarative control plane
    control-plane/*                    intent, operations, stores, reconciler, mux driver
  web/           Next.js control plane (site + dashboard + provider adapters)
    app/api/dashboard/terminal/*     Browser Agent Console
    app/api/dashboard/registry/*     unified install catalog search
    app/api/internal/cron/tick       scheduler + metrics collector (Vercel Cron)
    lib/providers/*                  MachineProvider (e2b | sprites | dedalus | vercel)
    lib/dashboard/registry/*         MCP registry, skills.sh, npm, bundled adapters
    lib/bootstrap/runner.ts          browser bootstrap (phase recipes)
    lib/dashboard/terminal-session.ts  tmux-over-exec session logic
    lib/metrics/collector.ts         usage + machine metrics → Supabase
    docs/WHITEPAPER.md               public technical whitepaper
    docs/sandbox-terminal-gateway.md engineering spec
    docs/README.md                   internal doc index
  knowledge/     skills, mcps, VISION.md, AGENTS.md, BROWSER-AGENT-CONSOLE.md
  mcp/           cursor-bridge MCP server
```

---

## Data boundaries and security

- Clerk **private** metadata stores provider API keys, the Cursor key, gateway bearer tokens, and the full `UserConfig`.
- Clerk **public** metadata only exposes redacted setup state and machine summaries.
- All agent state (runtime, app data, skills, sessions, crons, config) lives under `<provider home>/.agent-machines/`.
- The VM repo checkout (`<provider home>/agent-machines/`) is used only for knowledge reloads.
- Machine gateway bearers are server-only and never shipped to the client as `NEXT_PUBLIC_*`.
- App-Router error boundaries (`app/dashboard/error.tsx`, `app/global-error.tsx`) keep a single component crash from white-screening the dashboard.

---

## Further reading

| Doc | What it covers |
|-----|----------------|
| [`docs/MUX.md`](docs/MUX.md) | the multiplexer architecture: five routing stages, capabilities, price, health, learned selection, traces, idempotency |
| [`docs/MUX-RESULTS.md`](docs/MUX-RESULTS.md) | every measured number, and the findings that changed the implementation |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | what exists vs what is promised, per pillar, with the file that proves each claim |
| [`docs/UPSTREAMS.md`](docs/UPSTREAMS.md) | which model key drives which harness, verified against the live APIs |
| [`docs/WHITEPAPER.md`](docs/WHITEPAPER.md) | technical whitepaper: primitives, patterns, architecture |
| [`knowledge/VISION.md`](knowledge/VISION.md) | product vision and defensibility |
| [`knowledge/BROWSER-AGENT-CONSOLE.md`](knowledge/BROWSER-AGENT-CONSOLE.md) | full Browser Agent Console architecture + positioning |
| [`knowledge/BROWSER-AGENT-CONSOLE-EXPLAINER.md`](knowledge/BROWSER-AGENT-CONSOLE-EXPLAINER.md) | four-paragraph plain-language explainer |
| [`knowledge/AGENT-MACHINES-EXPLAINER.md`](knowledge/AGENT-MACHINES-EXPLAINER.md) | three-paragraph whole-product explainer |
| [`web/docs/sandbox-terminal-gateway.md`](web/docs/sandbox-terminal-gateway.md) | streaming gateway engineering spec |
| [`web/docs/README.md`](web/docs/README.md) | internal doc index (engineering + knowledge) |
| [`web/README.md`](web/README.md) | control-plane app details |
| [`knowledge/FLEET-DASHBOARD-2026-05-22.md`](knowledge/FLEET-DASHBOARD-2026-05-22.md) | fleet UX research + live-fire notes |

---

## License

MIT.
