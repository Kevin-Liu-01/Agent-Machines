# Agent Machines -- the end state

> Scope document. What Agent Machines is when it is finished, what exists in
> code today, and the precise distance between the two. Every "exists" claim
> below cites a file. Every gap is stated as a defect, not a feature idea.
>
> Written 2026-08-01 against `feat/sandbox-mux`. The spine is the router
> property table in [YC-APPLICATION-JULY-2026.md](./YC-APPLICATION-JULY-2026.md);
> the measured substrate behavior is [MUX-RESULTS.md](./MUX-RESULTS.md) and
> nothing here contradicts it.

---

## 1. The end state

OpenRouter made model APIs interchangeable: one key, one request shape, and
the gateway picks a provider, fails over when one is down, and sends one
invoice. Agent Machines is that for the computers agents work on. Finished,
it looks like this.

### What a user does

They install one package or point at one hosted endpoint, put one key on
file, and ask for an agent run. They name what the work needs, not where it
runs:

```ts
const mux = createMux();                 // or: new AgentMachines()

const machine = await mux.create({
	agent: "claude-code",
	sandbox: "auto",                     // the router decides
	needs: { pty: "native", persistence: "filesystem-snapshot", maxRuntimeMs: 3_600_000 },
	budget: { maxUsdPerRun: 0.50 },
});

for await (const event of machine.run("fix the failing test")) render(event);
console.log(machine.attempts);           // why it landed where it landed
```

`sandbox: "auto"` is the default and the common case. Pinning a substrate
stays legal forever -- it is the escape hatch, not the product. The same
call works from the SDK, the CLI (`am mux run`), and the dashboard, because
all three drive one router.

### What the router decides

Per request, in this order:

1. **Feasibility.** Drop substrates without credentials, then drop
   substrates that cannot satisfy the declared `needs` (no native PTY, no
   filesystem snapshot, runtime cap below the ask, wrong region, no GPU).
   Fail closed: an unsatisfiable request is an error naming the missing
   capability, never a silent downgrade.
2. **Health.** Drop or de-prioritize substrates currently failing. Health
   is a live rolling window of provisioning outcomes per substrate plus a
   cooldown after a burst of errors, not a static order.
3. **Value.** Among survivors, pick the arm (harness x substrate x model x
   model-route) with the best expected reward on completed agent runs:
   task success first, then total cost to a successful result, then time to
   first useful output. Priors come from the benchmark matrix; posteriors
   come from real runs.
4. **Failover.** On a provisioning error that another substrate could
   avoid, advance to the next candidate and record the attempt. On a
   mid-run failure, replay only when the run is declared idempotent by the
   caller; otherwise surface a truncated result and never double-charge.
5. **Explanation.** Every decision -- skipped, failed, chosen, with reason
   and duration -- is readable on the result and in the dashboard. A route
   that cannot be explained is a bug.

### What they are billed

One invoice from Agent Machines, denominated in successful agent runs and
the sandbox time behind them. Metering is real per-provider rates, not a
single estimate table: sandbox compute at the provider's published price,
model tokens at the upstream's price, plus a platform margin. Users can
still bring their own provider keys (BYOK stays supported forever, and is
how design partners start), but the default is one key and one bill.
Budgets and policies are account-level: a maximum cost per run, an allowed
substrate set, a required region, a required isolation model.

### What it is deliberately not

Not a fifth sandbox vendor. Not mid-run replay by default. Not a daemon --
substrate vendors already persist sandboxes, and the router remembers
placements. Not a wrapper that pretends four vendors are identical; the
capability model is public and lanes differ on purpose.

---

## 2. Promise vs reality

Priority key: **P0** blocks the wedge claim ("OpenRouter for agent
sandboxes"). **P1** is required before charging money. **P2** is expansion.

| # | Pillar | Promised where | Exists today (files) | Precise gap | Priority |
|---|---|---|---|---|---|
| 1 | One API | YC table row "One API" (implemented for create/bootstrap/run); README.md:245-296; docs/MUX.md:106-130 | Two unrelated surfaces. Direct-to-substrate mux: `src/mux/index.ts`, `src/mux/router.ts` (`Mux.create`, `MuxMachine.run/pty/shell`), CLI `src/commands/mux.ts` via `src/cli.ts:45`. Hosted client: `src/lib/sdk.ts:68-191` posting to `web/app/api/dashboard/admin/provision-machine/route.ts` and `web/app/api/agents/run/route.ts`. | There is no single API. The two surfaces do not share a router, a provider contract, or a state store: `src/mux/types.ts` `SandboxProvider` vs `web/lib/providers/types.ts` `MachineProvider`, with four adapters implemented twice (`src/mux/providers/*` and `web/lib/providers/*`). The hosted client cannot route: `src/lib/routing.ts:21-30` makes `agent` and `sandbox` required and `resolveAgentRoute` does no ordering and no failover. | P0 |
| 2 | Multiple providers | YC table "Multiple providers"; VISION.md:11; WHITEPAPER.md:61 | Four substrate adapters in each layer: `src/mux/providers/{e2b,sprites,vercel,dedalus}.ts` (registry `src/mux/providers/index.ts`), `web/lib/providers/{e2b,sprites,vercel,dedalus}.ts` (factory `web/lib/providers/index.ts:22`). | Four vendors are *coded*, two are *proven*. docs/MUX-RESULTS.md measures only e2b and sprites; vercel and dedalus report `skipped` for missing credentials and have no live cell in the mux matrix. Adapter count is not provider coverage. | P1 |
| 3 | Four agent runtimes | YC "How far along"; WHITEPAPER.md:60; README.md:64 | Four harness adapters behind one contract: `src/mux/harnesses/index.ts` -> `claude-code.ts`, `codex.ts`, `openclaw.ts`, `hermes.ts`; `HarnessAdapter` in `src/mux/types.ts:219-253`. | 8 of 16 cells attempted, and the matrix's own 6 "ok" marks overstate it: the later openclaw-on-sprites section of docs/MUX-RESULTS.md supersedes that row and calls the cell unconfirmed, leaving 5 confirmed. hermes/e2b fails (installer exhausts the base sandbox; E2B ignored the `resources` request on the current plan) and hermes/sprites did not finish inside the 40-minute budget -- docs/MUX-RESULTS.md finding 10. Hermes needs a pre-baked template, which does not exist. | P1 |
| 4 | Normalized capabilities | YC table "Normalized capabilities" (next: region, GPU, network policy, snapshot, port, persistence, max-runtime); WHITEPAPER.md:118-134 | `SandboxCapabilities` in `src/mux/types.ts:43-52`: `pty`, `persistence`, `reattach`, `publicUrl`, `streamingExec`. Declared per provider, mirrored for the UI in `web/lib/mux/capabilities.ts` with a drift test (`web/lib/mux/capabilities.test.ts`) that reads the mux sources. | Five axes of the promised twelve. No region, GPU, network policy, snapshot/fork, port count, max runtime, disk size, or concurrency limit. `CreateSandboxOptions` (`src/mux/types.ts:167-185`) carries only name/env/timeoutMs/template/resources. Worse, capabilities do not affect routing at all: `Mux.routeFor` (`src/mux/router.ts:382-405`) filters on credentials only. `nativePtyLanes()` exists (`web/lib/mux/route.ts:98`) and nothing calls it. | P0 |
| 5 | Intelligent selection | YC table "Intelligent selection" (advisory today, automatic next); docs/SELF_LEARNING.md Loop A; YC "Adaptive routing" row | A real contextual bandit, advisory: arms `web/lib/learning/arms.ts`, posteriors/reward `web/lib/learning/{bandit,reward,policy}.ts`, greedy pick `web/lib/learning/recommend.ts`, snapshot recompute `web/app/api/internal/learning/recompute/route.ts`, surfaced at `web/app/api/dashboard/admin/route-recommendation/route.ts` and consumed by `web/components/dashboard/DeployAndTalk.tsx:92`. Opt-in fill of omitted axes via `autoRoute` (`web/app/api/dashboard/admin/provision-machine/route.ts:54,115`). | Selection is not automatic anywhere a user can reach. The mux router has no learned selection at all -- `routeFor` walks a static config order (`src/mux/config.ts:112-115`, default `e2b` then the rest). `autoRoute` exists only on one HTTP route and the published SDK never sends it (`src/lib/sdk.ts:90-109`). And the policy is label-starved: `run_traces` are written only by cron ingest (`web/lib/learning/ingest.ts:103`, called from `web/app/api/internal/cron/tick/route.ts:91`) -- no mux run, no `/api/agents/run` call, and no console run produces a trace. | P0 |
| 6 | Health-aware fallback | YC table "Health-aware fallback" -- explicitly "Not yet safe to claim"; docs/MUX.md:148-158; README.md:294-296; `web/components/StatsRow.tsx:194,241` | Create-time failover in the mux only: `src/mux/router.ts:439-496` walks candidates, `isRoutableError` (`src/mux/types.ts:79-88`) advances on transient/rate_limited/fatal/unknown, a sandbox provisioned before a later failure is torn down, and every attempt lands in `machine.attempts` (`src/mux/router.ts:60-65`). Per-provider error taxonomy in all four adapters (429 -> rate_limited, 5xx -> transient, 4xx -> fatal). Covered by `src/mux/router.test.ts`. | There is no health signal, so nothing is health-*aware*: no outcome window per substrate, no error-rate threshold, no cooldown, no circuit breaker anywhere in `src/mux` or `web/lib`. Failover is blind retry in a static order. The hosted control plane now has CREATE-TIME FAILOVER (`web/lib/mux/failover.ts`, driven by the provisioning route, 2026-08-02): it walks the credential-gated order from `web/lib/mux/route.ts`, aborts after one attempt on `missing_credentials`/`not_supported`, tears down a sandbox provisioned before a later failure, and returns every attempt with its reason. It still has no health signal and no learned selection, so "health-aware" remains unsayable there too. No idempotent replay: a run that dies mid-stream is reported `truncated: true` (`src/mux/router.ts:244-258`) and nothing retries it. | P0 |
| 7 | Price optimization | YC table "Price optimization" (reward accepts cost; next: ingest current prices) | Reward normalizes cost (`web/lib/learning/reward.ts:31-37`) and the bandit tracks it with Welford stats (`web/lib/learning/bandit.ts:56-61`). A per-provider price table with provenance exists at `web/data/benchmarks.json` (`profiles[].pricing`, `basis: published \| unknown`) and renders in `web/components/dashboard/benchmarks/PricingMatrix.tsx`. | The cost the router optimizes is not a price. `web/lib/learning/ingest.ts:70-73` derives it from `estimateCost(machine.spec, latencyMs/1000)`, and `web/lib/metrics/cost.ts:9-11` is one hard-coded rate table written for Dedalus and applied to all four substrates. The real price table is display-only: `web/lib/learning/policy.ts:148-150` reads only `provider_kind, ok` from `provider_benchmarks`, never pricing -- and 2 of 4 providers have `basis: unknown` (sprites, dedalus). Model cost is captured live by the mux (`RunResult.costUsd`, `src/mux/events.ts:35,46`) and persisted nowhere. | P1 |
| 8 | One bill | YC table "One bill" -- "Not implemented; current setup is BYOK"; YC "How do you make money" | Nothing. No metering ledger, no credits, no invoices, no payment integration -- a repo-wide search finds Stripe only as an MCP catalog entry and skills. Usage rollups exist (`web/lib/metrics/collector.ts` -> Supabase, `/dashboard/usage`) and `web/app/pricing/page.tsx:24-26` states BYOK, $0 seats, model costs billed by the selected path. | Not started, and correctly not claimed. Depends on pillar 7 (real rates) and on a metering ledger that does not exist; the current rollups are estimates from one rate table and cover machine compute only, not model tokens. Provider resale needs commercial agreements that do not exist. | P1 |
| 9 | Observability by route | YC table "Observability" (next: report task success, time-to-first-output, total cost, resume reliability by route); WHITEPAPER.md:5.5 | Broad surfaces: metrics collector on cron tick, `/dashboard/usage`, activity/sessions/logs/artifacts, and an 11-metric cross-provider benchmark harness (`web/lib/benchmarks/types.ts:21-31`, engine/probes/stats in the same directory). Route explanation after the fact via `machine.attempts`. | None of the four promised numbers is reported by route. `RunTrace` (`web/lib/learning/types.ts`) has success/latency/cost but no time-to-first-output and no resume outcome, and is cron-only. Time-to-first-event is measured only by the one-shot `scripts/mux-live-test.ts` and lives as prose in docs/MUX-RESULTS.md; nothing stores it. Benchmarks measure empty boxes, not completed agent work. | P1 |
| 10 | Self-learning Loop B | docs/SELF_LEARNING.md:44-52 | Nothing, and the doc says so: "Loop B is not active yet." Loop 0 (observe) and Loop A (recommend) are real per pillar 5. | Not started. Correctly disclosed. Depends on pillar 9 for failure clustering labels. | P2 |
| 11 | Browser Agent Console | WHITEPAPER.md:78-93; README.md:72-133; knowledge/BROWSER-AGENT-CONSOLE.md | Shipped and the strongest thing in the repo: `web/app/api/dashboard/terminal/{session,input,stream,resize}/route.ts`, `web/lib/dashboard/terminal-session.ts`, tmux-over-exec plus SSE with no control-plane PTY. Mux-side PTY contract with native lanes on e2b/sprites and a tmux fallback (`src/mux/pty/tmux.ts`), verified live including named reattach (docs/MUX-RESULTS.md "Interfaces verified live"). | Implemented twice against two provider layers, so a console fix must be made in two places -- same root cause as pillar 1. `PtyHandle.output` is single-consumer by contract (`src/mux/pty/tmux.ts`, regression test in `src/mux/pty/tmux.test.ts`); a multi-viewer console needs a fan-out layer that does not exist. | P1 |
| 12 | Persistence and resume | docs/MUX.md:132-139; WHITEPAPER.md:3.8; VISION.md | Per-substrate persistence models declared and honored (`src/mux/types.ts:37-41`), sleep/wake per adapter, named PTY reattach verified live on both credentialed substrates. Named machine placements remembered in `~/.agent-machines/mux-state.json` (`src/mux/state.ts:31`). | The placement store is a local single-user JSON file -- not shared, not multi-tenant, not durable across hosts, so `mux.connect(name)` only works from the machine that created the machine. No resume-reliability metric exists, which is one of the four numbers pillar 9 owes. | P1 |
| 13 | Agents provisioning agents | WHITEPAPER.md:214 (Q4 2026), VISION.md:31, README.md:54 | Only `mcp/cursor-bridge` (a Cursor bridge MCP server). No provisioning tool surface. | Not started. Already labeled roadmap in the whitepaper, which is honest; keep it that way. Depends on pillar 1. | P2 |
| 14 | Registry-driven counts | WHITEPAPER.md:44 principle "Registry-driven truth"; README.md:163-181 | Genuinely derived: `web/lib/platform/harness.ts:131-137` reads `web/data/skills.json` (161) and `web/data/mcps-catalog.json` (39). Verified by counting both files. | Stale hard-coded copies contradict the registry: README.md:170 and docs/WHITEPAPER.md:72,268 say 35 MCP servers, and `package.json:4` ships "35 MCP servers" in the published npm description. The registry says 39. | P0 (cheap, and it is a public correctness claim) |
| 15 | Memory bundles and SKILL.md | WHITEPAPER.md:3.4, 3.7; VISION.md | Real: `web/lib/memory/*` (bundle, install, export, import, on-machine), skills sync in bootstrap, 161 `SKILL.md` procedures under `knowledge/skills/`. | Bundles install only through the control-plane provider layer; the mux has no memory/loadout concept, so an `agent-machines` SDK user gets a bare harness. Convergence (pillar 1) is the fix. "161 bundled skills" is provable; "161 production-tested skills" is not. | P2 |

### Cross-cutting defect: two implementations of the same product

Pillars 1, 2, 4, 6, 11, 12, and 15 all degrade to one root cause. Four
substrate vendors are implemented twice against two different contracts,
and until 0.3 the routing intelligence sat on the side that had no failover
while the failover sat on the side that had no intelligence. 0.3 closed the
failover half (`web/lib/mux/failover.ts`); the hosted side still has no health,
no constraints and no learned order:

| Concern | `src/mux/*` (direct) | `web/lib/*` (hosted) |
|---|---|---|
| Provider contract | `SandboxProvider` (`src/mux/types.ts:187`) | `MachineProvider` (`web/lib/providers/types.ts`) |
| Route ordering | static primary -> backups (`src/mux/router.ts:382`) | credential filter only (`web/lib/mux/route.ts:75`) |
| Failover | yes, create-time (`src/mux/router.ts:439`) | none (502 on first error) |
| Learned selection | none | advisory bandit (`web/lib/learning/*`) |
| Run traces emitted | none | cron only (`web/lib/learning/ingest.ts`) |
| PTY | native + tmux (`src/mux/pty/tmux.ts`) | tmux-over-exec (`web/lib/dashboard/terminal-session.ts`) |
| Placement state | local JSON (`src/mux/state.ts`) | Clerk `UserConfig` + Supabase |

Nothing in section 3 is worth building twice, so convergence is item 0.

---

## 3. Build order

Dependencies are hard unless marked "parallel". Credential blocks are
called out explicitly: we hold **E2B**, **Sprites**, **Anthropic**,
**OpenAI**, and a **`vck_` AI Gateway** key. We do not hold Vercel Sandbox
auth (`VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`, or
`VERCEL_OIDC_TOKEN`) or `DEDALUS_API_KEY`. A `vck_` key is an AI Gateway
key and is not Sandbox auth -- the provider already fails closed saying so
(docs/MUX-RESULTS.md item 7, `src/mux/providers/vercel.ts:20-23`).

### Phase 0 -- stop paying twice (no new credentials)

0.1 **Fix the false public counts.** README.md:170, docs/WHITEPAPER.md:72
and :268, and `package.json:4` say 35 MCP servers; the registry says 39.
Also fix the README SDK example (README.md:249-253) which pairs
`agent: "codex"` with `model: "anthropic/claude-sonnet-4-6"` while codex
requires a native OpenAI key (`src/mux/harnesses/codex.ts:253`), and
`src/lib/routing.ts:50` which defaults every agent to
`anthropic/claude-opus-4-8`. Hours, not days. Do it first.

0.2 **One provider contract.** Make `web/lib/providers/*` adapt to
`SandboxProvider`, or make the control plane consume `src/mux` directly.
Keep the `MachineProvider` shape as a thin facade during migration so the
dashboard does not break. Blocks: 1.x, 2.x, 4.x, 6.x.

0.3 **One router entry point.** The hosted `provision-machine` route calls
`Mux.create()` instead of `getProvider(...).provision(...)`. This alone
gives the dashboard the failover it does not have today. Depends on 0.2.

0.4 **Durable placement store.** Replace `~/.agent-machines/mux-state.json`
(`src/mux/state.ts`) with a pluggable store: local JSON for the OSS path,
Supabase for the hosted path. Depends on 0.2. Unblocks 12.

### Phase 1 -- labels before intelligence (no new credentials)

1.1 **Emit a trace from every run path.** `MuxMachine.run()`,
`/api/agents/run`, and console runs all write a `RunTrace`. Today only
cron does (`web/lib/learning/ingest.ts`). Add `timeToFirstEventMs` to the
trace -- the mux already knows it, and it is one of the four numbers the
YC table owes.

1.2 **Persist real model cost.** `RunResult.costUsd` (`src/mux/events.ts:46`)
is populated by the harness and thrown away. Store it, and split trace
cost into `sandboxCostMillicents` and `modelCostMillicents` so the two are
never conflated again. Depends on 1.1.

1.3 **Route-outcome reporting.** Dashboard panel and API returning task
success, time-to-first-output, total cost, and resume outcome *by route*.
Depends on 1.1, 1.2. Closes pillar 9.

### Phase 2 -- the capability model (parallel with Phase 1)

2.1 **Extend `SandboxCapabilities`** with region, GPU, network policy,
snapshot/fork, port count, max runtime, disk size, and concurrency limit.
This is a contract change in `src/mux/types.ts` -- describe it, do not
land it unilaterally if another agent owns that file.

2.2 **Declare the new axes per adapter,** verified against vendor docs,
with `null` for unknown rather than a guess (the pattern
`web/lib/mux/capabilities.ts:11-13` already sets). Vercel and Dedalus
values can be *declared* from documentation without credentials, but
cannot be *verified* live until 5.x.

2.3 **Constraint filtering in `routeFor()`.** Accept a `needs` predicate,
drop lanes that cannot satisfy it, and record the skip reason alongside
credential skips. Fail closed when nothing survives. Depends on 2.1, 2.2.
Closes pillar 4.

### Phase 3 -- health, then automatic selection

3.1 **Provider health store.** Rolling window of provisioning outcomes per
substrate (success, transient, rate_limited, fatal) with a cooldown after
a burst. The error taxonomy already exists in all four adapters; nothing
records it. Depends on 0.4 for durability.

3.2 **Health-aware ordering + cooldown skip** in `routeFor()`. Depends on
2.3, 3.1. This is the first moment "health-aware fallback" may be said out
loud.

3.3 **Idempotent replay.** A caller-declared `idempotent: true` lets a
mid-run failure be retried on the next lane; everything else keeps the
current honest `truncated: true`. Depends on 3.2. Do not ship replay
without a dedupe key -- a replayed agent run that writes to a repo twice
is worse than a failed one.

3.4 **Automatic selection in `create()`.** `sandbox: "auto"` consults the
learned policy for the *order*, not just the credential filter, and
`machine.attempts` carries the policy version and score that produced the
choice. Depends on 1.1 (labels), 2.3 (feasibility), 3.2 (health). Closes
pillars 5 and 6.

### Phase 4 -- money

4.1 **Ingest real per-provider prices.** Promote
`web/data/benchmarks.json` pricing from display-only to a routing input,
keep `basis` provenance, and refuse to optimize on `basis: unknown` lanes
(sprites, dedalus today) instead of substituting the Dedalus estimate.
Retire the all-substrate rate table in `web/lib/metrics/cost.ts` as a
routing input. Depends on 1.2.

4.2 **Cost-optimal selection.** Reward switches from estimated to metered
cost per successful run. Depends on 3.4, 4.1. Closes pillar 7.

4.3 **Metering ledger.** Append-only per-run records: sandbox seconds at
provider rate, model tokens at upstream rate, margin. Depends on 4.1.

4.4 **Credits and one bill.** Prepaid credits first, provider resale when
volume justifies the agreements. Depends on 4.3 plus commercial terms we
do not have. Closes pillar 8. Until 4.4 ships, BYOK is the only truthful
description.

### Phase 5 -- coverage (5.1 and 5.2 CLOSED 2026-08-02)

5.1 ~~Close the Vercel Sandbox lane.~~ **CLOSED.** All four harnesses pass with
`VERCEL_OIDC_TOKEN` from `vercel env pull`. No code change was needed, which is
what "blocked on a credential" meant. It is now the fastest lane measured
(create 380-961ms, 826ms to first event).

5.2 ~~Close the Dedalus lane.~~ **CLOSED.** All four harnesses pass. Its create
is the slowest (~3s), consistent with a batch-REST substrate that has no
streaming primitive. Teardown returns a vendor-side 500 from Dedalus's own
metering ledger; nothing leaks, and it exposed a real bug in `Mux.remove()`
(now fixed) that would have made an ambiguous teardown failure hide a
possibly-live machine.

5.3 **Hermes template.** Build a pre-baked image per substrate; a cold
install is a template-build step, not a request-time one (docs/MUX-RESULTS.md
finding 10). Partially plan-blocked on E2B: the `resources` request was
ignored on the current plan, so the base sandbox OOMs regardless of code.
Not credential-blocked on Sprites.

5.4 **openclaw/sprites retry+wake path.** Two real bugs are fixed and the
cell is still unconfirmed; the remaining failures are transport-level
(`sprite not found`, `fetch failed`, `exec timed out`). Add retry and wake
around transport errors on that substrate before trusting the cell either
way. Not blocked -- we hold the Sprites token.

### Phase 6 -- expansion

6.1 Multi-viewer console fan-out over the single-consumer `PtyHandle`
contract. Depends on 0.2.

6.2 Loop B harness curation (cluster failures -> propose loadout change ->
validate in a disposable machine -> inspectable PR). Depends on 1.3.

6.3 MCP + fleet CLI so a head agent can provision, route, observe, and
tear down workers. Depends on 0.3.

6.4 A fifth substrate, when a design partner has a workload the current
four cannot serve. Not before.

---

## 3b. Landed after this document was written (2026-08-01)

Recorded here so the status table above is not read as current. Commit
`07a6300` wired four of the scoped modules into `src/mux/router.ts`, which
changes three "must not claim" entries below:

- **Health is now a real signal.** `src/mux/health.ts` is a rolling-window
  circuit breaker; `Mux.routeFor()` orders lanes by it and `create()` feeds
  outcomes back, counting only transport-class errors so a credential or
  capability failure cannot open a circuit. It persists through
  `src/mux/state.ts` so a failing substrate stays de-prioritized across
  processes. Health only reorders and never removes -- a blip that opened
  every circuit must not make `create()` impossible. Still not true:
  automatic *selection* (see Phase 3) and any dashboard failover.
- **Capabilities now affect routing.** `src/mux/constraints.ts` filters
  candidates against declared needs and names the failed dimension
  structurally on the attempt (`constraint: "pty"`), not just in prose.
  Still only the five declared axes plus size and runtime -- region, GPU
  and network policy remain unimplemented, so a capability claim must still
  not name them.
- **Price is a routing input, not just display data.** `src/mux/cost.ts`
  carries per-substrate published rates with the source and date cited per
  entry, marks two of four `unknown` rather than inventing a number, and
  `optimize: "cost"` orders lanes cheapest-first with unknown-price lanes
  last. Still not true: "we optimize price across providers" as a default
  (it is opt-in), and nothing bills.
- **Runs are observable and replayable.** `src/mux/traces.ts` writes one
  JSONL record per run with the placement attempts, and `runKey` makes a
  turn idempotent so a client crash cannot double-charge an agent run. This
  is the label source Phase 1 asked for -- every mux run now emits one,
  where previously only cron ingest did.

Also corrected in the same commit: the upstream gate was native-key-only,
which was simply wrong. OpenRouter serves an Anthropic-Messages endpoint
(measured, docs/UPSTREAMS.md), so a gateway key drives claude-code. The rule
now lives in `src/mux/upstreams.ts`, per harness and per wire format.

What did NOT change: the cross-cutting defect above. All of this landed in
`src/mux/*` only. 0.3 has since given the hosted plane create-time failover
(`web/lib/mux/failover.ts`), but it still has no health and no constraints, and
at that point the two provider contracts still coexisted. Convergence remained
item 0 until the 0.2 deletion landed (2026-08-03, below).

---

## 3c. The packaging blocker, MEASURED and corrected (2026-08-02)

This section previously blamed `turbopack.root`. **That was wrong**, and the
correction matters because it changes which fix works.

### What is actually true

`turbopack.root` is now the workspace root and the resolver crosses out of
`web/` fine. Measured with a probe route and a real `npx next build`, four
specifiers:

| specifier | result |
| --- | --- |
| `../../../../src/mux/index` (extensionless) | **resolved** |
| `../../../../src/mux/index.ts` | **resolved** |
| `../../../../src/mux/index.js` | Module not found |
| `agent-machines` (bare) | Module not found -- not a declared dep of `web/` |

The real blocker is one line deeper: **Turbopack applies no `.js` -> `.ts`
extension alias anywhere in this project.** Proven by a control that removes the
monorepo from the question entirely -- a `./helper.js` import of a `helper.ts`
sitting in the SAME directory inside `web/` also failed. So every ESM `.js`
specifier in `src/mux` (the house rule, and correct for Node ESM) is
unresolvable from Turbopack, and no amount of root-moving fixes it. `web/` has
only three `.js`-suffixed relative imports and two of those are type-only, which
is why nothing had contradicted the old theory before.

### What DOES work, proven at runtime

The COMPILED output. Both the bare `agent-machines` specifier (via the root
package `exports` -> `dist/index.js`) and a relative path into `dist/` resolve,
once `npm run build:sdk` has run. `npx next start` plus a curl proved it is not
merely a compile: `createMux()` ran inside a route handler, `getProvider("e2b",
config)` constructed a live provider, and `readMuxState()` returned four
remembered machines.

So `dist/` is a build-order dependency of `next build`. The root `build` script
already runs `build:sdk` first; this only bites if Vercel is configured to run
`next build` inside `web/` instead of the root build.

**This is the strongest argument for the published-package boundary** (0.2/0.3):
the compiled package is not one option among several, it is the only import form
that works.

### The exports map, closed 2026-08-02

Measured against a real `npm pack` + `npm install` of the tarball, not read off
the spec. Before: only the bare root specifier resolved, and `require` of even
that failed `ERR_PACKAGE_PATH_NOT_EXPORTED`.

| specifier | before | after |
| --- | --- | --- |
| `import "agent-machines"` | ok | ok |
| `require("agent-machines")` | ERR_PACKAGE_PATH_NOT_EXPORTED | **ok** |
| `agent-machines/mux` | not exported | **ok** |
| `agent-machines/mux/state` | not exported | **ok** |
| `agent-machines/dist/mux/state.js` | not exported | not exported, **on purpose** |

`require` works via the `module-sync` condition rather than a `require` one.
That choice matters: this package is ESM-only, and a `require` condition pointing
at ESM would resolve on any Node and then CRASH with `ERR_REQUIRE_ESM` on
20.0-20.18. `module-sync` is matched only by the Nodes that can actually
`require()` ESM (>= 20.19 / 22.12); older ones skip it and get the clear "not
exported" error instead of a runtime explosion. Safe here because nothing in
`dist/` uses top-level await (checked).

`engines.node` used to say `">=20"`, which admitted exactly the 20.0-20.18 and
22.0-22.11 Nodes where that `require` never resolves -- the package claimed
support it did not have. It is now `"^20.19.0 || >=22.12.0"` (2026-08-02), and
`npm run doctor` checks major AND minor for the same reason; a major-only check
passed on every Node the CommonJS entry fails on.

### ERR_REQUIRE_ESM in the deployed e2b lane, closed 2026-08-02

The Vercel function failed every e2b provision and exec with
`Failed to load external module e2b-f4587dfd9ddf46bd: Error [ERR_REQUIRE_ESM]:
require() of ES Module .../chalk@5.6.2/... from .../e2b/dist/index.js not
supported`. e2b 2.37.0 ships no `exports` map, so `main` (dist/index.js,
CommonJS) is what both `require("e2b")` and `import("e2b")` land on -- Node's ESM
resolver never reads `module`. That CommonJS build `require`s ESM-only chalk 5,
so it loads only on a Node with require(ESM); the deployed one has none.

Reproduced locally by running node v24.13.0 with
`--no-experimental-require-module`, which turns require(ESM) off
(`process.features.require_module === false`) and yields the identical error text
and chalk path. Both e2b adapters now import `e2b/dist/index.mjs` explicitly,
which passes in both modes. Chosen over the two alternatives that were also
measured to work -- bundling e2b instead of externalizing it, and pinning chalk 4
through a root pnpm override -- because neither travels to a consumer of the
published package, where there is no bundler and no workspace override and we do
not pick the Node.

The deep path is the cost, and it is guarded rather than trusted. There is no
fallback to `import("e2b")`: a fallback works on a Node with require(ESM) and
dies on one without, which is how this shipped green in the first place, and
keeping the specifier alone is also what makes `next build` fail closed --
measured 2026-08-02 by renaming the entry, the build exits 1 with "Module not
found: Can't resolve 'e2b/dist/index.mjs'". `scripts/assert-e2b-esm-entry.mjs`
(run by `build:sdk`, which web's `prebuild` calls) fails earlier and covers what
`next build` cannot: both resolution roots, and the `build:sdk`/`prepack` path
that produces the published package without ever running `next build`.
`src/mux/providers/e2b-esm-entry.test.ts` re-runs the two-mode measurement, and
asserts the bare specifier STILL fails so a green run cannot be vacuous.

The raw `dist/` path staying closed is the point of an exports map, not a
leftover gap: `agent-machines/mux/state` is its supported replacement, and the
wildcard covers the mux plane only -- `dist/lib` (the hosted client's internals)
stays private, because MUX.md documents the mux plane module by module and
nothing documents those.

### The boundary is live, 2026-08-02

`web/package.json` now declares `"agent-machines": "workspace:*"` and the first
VALUE import across the boundary is in production code:
`web/lib/providers/mux-facade.ts` imports `MUX_ERROR_NAME` and `isMuxErrorKind`
from `agent-machines/mux/types`, replacing a hand-copied list of the five error
kinds. That copy was a real hazard, not a style problem -- a sixth kind added
upstream would have read as "not a MuxError" and taken the retry-forever path
that function exists to prevent. `MUX_ERROR_KINDS` is now a const array in
`src/mux/types.ts` with the union derived from it, so there is one list.

The error kind is still recovered STRUCTURALLY (`name` + `kind`) rather than with
`instanceof`, and that stays: an error that crossed a package boundary can fail
`instanceof` against a second copy of the class, which is precisely the direction
this facade receives errors from. Importing the class would have been a
regression dressed as convergence.

The rule the facade header now states: **the source path for types, the package
for values, never the reverse.** `lib/mux/failover.ts` and
`lib/mux/placement-store.ts` remain type-only, each with a test asserting it.

Build order is no longer something to remember. `web`'s `prebuild` runs
`build:sdk` itself, so `next build` cannot start without `dist/`, and the root
`build` just delegates to web. Verified by deleting `dist/` and running both
entry points: `pnpm run build` at the root (the deploy's own command) and
`pnpm run build` inside `web/`, each exit 0 with the SDK built by the build.
A bare `npx next build` still bypasses package scripts and would fail on the
missing `dist/` -- that is npx's contract, not a regression.

`exports` itself is guarded by `src/lib/package-exports.test.ts`, which needs no
build: seven assertions, each mutation-verified, covering the module-sync rule,
the types-first ordering, the dist-only rule, and the mux/lib public boundary.

Item 0.2 CLOSED (2026-08-03): the four web vendor halves are deleted.
`web/lib/providers/{e2b,sprites,vercel,dedalus}.ts` are thin bindings over
`agent-machines/mux/providers/*` (value-imported through the compiled package),
and the one shared `toMuxDescription` derivation in `mux-facade.ts` maps the
mux's `SandboxDescription` onto the hosted no-wake read -- absent spec axes stay
absent instead of being backfilled with invented numbers.

### A measurement trap worth knowing

A probe at `web/app/api/__spike03/route.ts` compiled with exit 0 and produced no
route: Next treats `_`-prefixed folders as private and opts them out of routing.
Anyone measuring this with an underscore-prefixed name gets a false green.

### Local-first state, and the read-only filesystem

Measured with a 0500 parent directory: reads succeed, writes throw EACCES. All
three env overrides exist and work -- `AGENT_MACHINES_MUX_STATE` (a file),
`AGENT_MACHINES_MUX_TRACES` and `AGENT_MACHINES_MUX_LEDGER` (directories, kept
separate so retention policies never merge). A serverless caller can therefore
READ from a bundled path and must redirect writes;
`web/lib/mux/placement-store.ts` implements the hosted `PlacementStore` for
placements and health.

**The async installer landed 2026-08-02.** It was the blocker that made that
store dead code: the router called the synchronous state functions inline, and
`Mux`'s constructor read persisted health, which a constructor cannot await. Now
the router drives the store through `readMuxStateAsync` and friends, and health
loads eagerly only when the store reports `synchronous: true` -- so the local
path is unchanged (a `routeFor()` immediately after `createMux()` still sees
persisted health) while an async store gets its breaker filled before the first
operation health can influence. Safe to defer because health never removes a
lane; a placement read is NOT deferrable, and the synchronous functions still
throw under an async store rather than returning a promise something would read
as "no machines remembered".

Proven by 13 tests against a store that resolves on a later macrotask (a
microtask-only fake passes even if nothing is awaited), including an invariant
that no two store operations overlap -- which is what a dropped `await` actually
produces. Ten mutations of the router were checked and all ten fail the suite.
Two branches that had no test before now do: `remove()` forgetting on a
confirmed not-found, and `remove()` REFUSING to forget on any other error.
Live-verified afterwards on e2b (create 758ms, `MUX-OK`, destroyed) with the
health sample persisted at the measured 756ms.

Still needed before the hosted store does anything: **a human must apply
`web/supabase/migrations/006_mux_placements.sql`** (the table does not exist in
any project yet), and something must call `setPlacementStore()` on the hosted
path -- nothing does today.

### Contract gaps 0.2 surfaced

These are the behavioral differences that made "just delete one copy"
impossible. Each one had to become expressible in the contract first, or
converging would have regressed whichever surface lost.

- No no-wake status read -- **CLOSED**, see 3b.
- Disk axis -- **CLOSED 2026-08-02.** `CreateSandboxOptions.resources` carries
  `diskGib`, matching `SandboxDescription.resources` so a request and the
  vendor's report of it are comparable. Dedalus now clamps and forwards all
  three axes instead of hardcoding `storage_gib`; the vcpu/memory clamps had no
  test at all before and now do (6 tests, 4 mutations checked).
- Sprites naming -- **CLOSED 2026-08-02** by making the intent explicit rather
  than picking a winner. `CreateSandboxOptions.onNameConflict` is `"adopt"`
  (default: a name is an IDENTITY, deterministic and adopted on conflict, which
  is what makes `connect(name)` work across processes) or `"unique"` (a name is
  a LABEL, suffixed, never adopted). The hosted sprites adapter already declares
  `"unique"` in its `createOptions`, so the switch to the mux's adapter is now a
  deletion rather than a redesign. 8 tests, 4 mutations checked. A subtlety worth
  keeping: under a unique name the adopt-on-409 recovery still applies, because
  a 409 there can only be our own retried create (the measured vendor 500 that
  provisioned anyway) and never another caller's sandbox.
- Sprites wake timeout -- **ALREADY CLOSED**, and this entry was stale when
  written. `src/mux/providers/sprites.ts` has carried `WAKE_TIMEOUT_MS =
  180_000` since the no-wake work, used both for the wake probe and to escalate
  the caller's exec timeout, with the reasoning stated against the measurement:
  a cold sprite took ~31s to accept its first exec and a wake under load is
  slower than a boot, so the budget outlasts a boot instead of tracking the
  warm-path timeout.

**Every behavioral blocker to 0.2 is now closed.** What remains is the deletion
itself: `web/lib/providers/{e2b,sprites,vercel,dedalus}.ts` (~2,100 lines)
reimplement adapters `src/mux/providers` already has (~4,100 lines, behind a
conformance suite). The boundary is live and proven at runtime (3c),
`MachineProvider` is already a facade over the mux substrate shape, and each
place the two behaviors genuinely differed is now an option on
`CreateSandboxOptions` rather than a fork in the code.

#### One prerequisite found by starting the deletion, and fixed (2026-08-02)

The web e2b adapter cached CONNECTED handles for 45s in a module-level map, and
the mux's adapters cache inside the handle instance instead. Those are not the
same thing: a serverless route builds a fresh provider per request, so a
per-instance cache never survives to a second call and every exec would have paid
another vendor connect. Swapping in the mux provider would have quietly
regressed hosted exec latency.

The cache is a property of the CALLER, not of a substrate, so it now lives at the
facade's single `connect` point (`attach()` in `mux-facade.ts`) and all four
substrates inherit it -- including the three that never had one.

Writing it surfaced a hazard the old code shared: keyed by machine id alone, one
warm serverless instance can serve one tenant a handle authenticated as another,
because an id is only unique inside the account that owns it and a sprite is named
per organization -- two orgs can each have `am-mux-reviewer`. The key is now
`(substrate, credential scope, machine id)`, where the scope is a digest of the
credentials the provider was built with (hashed so a key cannot carry a secret
into a log or a heap dump), and `cacheScope` is a REQUIRED binding field so no
adapter can omit it. The promise is cached rather than the resolved handle, so
concurrent calls share one connect instead of racing; a rejection is never
served; and sleep and destroy invalidate in `finally`, since a failed destroy is
when a stale handle is most dangerous.

Six tests, six mutations checked, all caught. What the e2b deletion still needed:
`MuxDescription.spec` (vcpu/memoryMib/storageGib) had to be derived from the mux's
`SandboxDescription.resources` (vcpu/memoryMib/diskGib). That mapping belongs in
the facade so all four adapters drop their `describe` together, not one each.
(Done 2026-08-03: `toMuxDescription` in `web/lib/providers/mux-facade.ts`, with
the deletion itself -- see the 0.2 closure note in 3c above.)

## 4. Must not claim

Each of these is false today. The file that would have to change before it
becomes true is named.

1. **"Routing is automatic."** It is not. The mux walks a static config
   order (`src/mux/router.ts:382-405`, `src/mux/config.ts:112-115`); the
   learned policy is advisory and reachable only through one HTTP flag the
   published SDK never sets (`src/lib/sdk.ts:90-109`). Say: "the
   recommendation is advisory and the user confirms the route."

2. **"Health-aware fallback."** There is no health signal in the codebase.
   Say: "create-time failover across a configured substrate order, with
   every attempt recorded." True per `src/mux/router.ts:439-496`.

3. **"Automatic failover"** without the words *at machine creation*.
   Failover is placement-time only, by design (docs/MUX.md:180-186). Runs
   are never replayed; a broken run returns `truncated: true`.

4. **"The dashboard fails over between providers *using health or learned
   order*."** As of 2026-08-02 it DOES fail over at create time, walking the
   credentialed order and recording every attempt (`web/lib/mux/failover.ts`).
   What is still unsayable there: health-aware, learned, or constraint-filtered
   ordering. The hosted order is static.

5. **"One bill" / "unified billing" / "no provider onboarding" / "one
   account means you don't need provider accounts."** No billing code
   exists. The product is BYOK, as `web/app/pricing/page.tsx` already
   says.

6. **"We optimize price across providers."** The routing cost input is one
   hard-coded Dedalus-derived rate table applied to all four substrates
   (`web/lib/metrics/cost.ts:9-11` via `web/lib/learning/ingest.ts:70-73`).
   Real per-provider rates exist only as display data and are `unknown`
   for two of four providers.

7. **"Capability-aware selection"** or any claim naming region, GPU,
   network policy, or snapshot constraints. Five capability axes exist
   (`src/mux/types.ts:43-52`) and none of them influence routing.

8. **"Four agents on four sandboxes, verified."** Only two substrates have
   ever been measured, 8 of 16 cells were attempted, and 5 are confirmed.
   Say: "four harnesses and four substrate adapters; five cells verified
   live on E2B and Sprites, hermes needs a pre-baked image, openclaw on
   Sprites is unconfirmed, Vercel and Dedalus are uncredentialed."

9. **"39 MCP servers"** in any file that still says 35, and vice versa.
   The registry is authoritative at 39 (`web/data/mcps-catalog.json` via
   `web/lib/platform/harness.ts:132`); README.md:170,
   docs/WHITEPAPER.md:72,268 and `package.json:4` are stale.

10. **"161 production-tested skills."** 161 skills are bundled. Nothing
    tests them in production.

11. **"The router learns from your runs."** It learns from cron runs only
    (`web/lib/learning/ingest.ts:103` from
    `web/app/api/internal/cron/tick/route.ts:91`). SDK runs, API runs, and
    console runs emit no trace.

12. **"Reconnect to your machines from anywhere."** `mux.connect(name)`
    reads a local file (`src/mux/state.ts:31`); it only works from the host
    that created the machine.

13. **"Resume reliability"** as a reported metric. It is not measured
    anywhere.

14. **"Nobody has built this" / "no competitor is building this."**
    ComputeSDK and TanStack AI Sandbox are direct counterexamples at the
    library layer (YC-APPLICATION-JULY-2026.md:65-71).

15. **"Deploys in 30 seconds."** The only measured create+install numbers
    are in docs/MUX-RESULTS.md and they are bimodal: E2B create 96-328ms
    with a 6.6-28.5s install, Sprites create 401ms warm but 17-31s cold.
    Quote the measured range and the substrate, or say nothing.

16. **"Agents can provision agents"** as a live capability. `mcp/` contains
    only a Cursor bridge. The whitepaper already labels this roadmap.

17. **"244 tests pass"** as a current number. The mux suite alone is 96
    passing tests (`npm run test:mux`, verified 2026-08-01) against 36 web
    test files; the YC draft's 3 + 241 split is stale. Re-count before
    quoting.

---

## 5. The one-sentence test

Before any public claim ships, it must survive this: *would a design
partner who read the code agree?* Today the sentence that survives is:

> Four agent harnesses and four sandbox adapters behind one contract, with
> credential-gated create-time failover across a configured substrate
> order, an advisory learned recommender, and a browser console that drives
> the real CLI on any of them. Automatic capability-aware selection,
> health-aware fallback, and one bill are next.

Everything in section 3 exists to shorten that second sentence.
