# Agent Machines control plane v2

Status: v2 lifecycle cutover shipped in code 2026-08-13. This is the canonical
architecture and cutover ledger; it is intentionally explicit about the
remaining hosted compatibility records and deployment prerequisites.

## Product contract

The product invariant is simple: **the Worker is durable; everything underneath
it is replaceable**. Identity, responsibility, memory, instructions, schedules,
files, permissions, abilities, history, and evidence belong to the Worker.
Runtime, model, sandbox, tools, transport, storage, scheduler, and route are the
machinery the control plane may reconcile beneath it.

An Agent Machine is one declarative Worker resource:

```ts
{
  id: "repo-coder",
  spec: {
    name: "Repo coder",
    runtime: "claude-code",
    sandbox: "e2b",
    model: "claude-opus-4-1",
    migrationPolicy: "live",
    schedules: []
  },
  desiredState: "running"
}
```

The operator owns the responsibility and approval boundary. The control plane
owns how the system reaches that state: provision, bootstrap, wake, sleep,
scheduled run, live provider migration, repair, and delete. Provider SDK calls
never belong in a page component, and changing a provider must not change the
Worker's identity.

## Architecture

```text
Dashboard / SDK / CLI
        |
        | apply Worker intent or enqueue Run
        v
AgentMachinesControlPlane
        |-- desired Worker resource
        |-- durable operation journal
        |-- leases + idempotency keys
        |-- lifecycle reconciler
        |-- cold-start before run
        |-- scheduled dispatch dedupe
        v
WorkerRuntimeDriver
        |-- MuxWorkerRuntimeDriver (public SDK / local journal)
        `-- HostedWorkerRuntimeDriver (dashboard / tenant journal)
                |-- harness: Claude Code | Codex | Hermes | OpenClaw
                `-- sandbox: Daytona | E2B | Sprites | Vercel
```

`src/control-plane` is the new deep module. Its public surface is intent,
operations, and reconciliation. Provider selection, harness installation,
live migration, state transfer, and normalized agent runs stay inside the mux
driver.

## Serverless execution model

The control plane is conceptually serverless: no coordinator process is
required to own a Worker. A request, queue consumer, cron tick, or recovery
job may claim the next journal entry and call `reconcileNext()`.

- Operations are submitted before remote work starts.
- Idempotency keys collapse duplicate applies, runs, and scheduler ticks.
- Claims have expirations. If a function disappears, another reconciler can
  reclaim the operation after its lease.
- Drivers must make remote lifecycle verbs retry-safe for a stable Worker id.
- Worker writes use optimistic concurrency; stale reconcilers cannot silently
  overwrite newer desired state.
- A run always reconciles the Worker to `running` first. Sleeping sandboxes are
  explicitly woken; missing sandboxes are re-provisioned and bootstrapped.

The package/app includes three real store adapters:

1. `InMemoryControlPlaneStore` for deterministic tests and embedded use.
2. `JsonFileControlPlaneStore` for an atomic local journal. Each update writes
   a complete next file and swaps it into place with `rename(2)`.
3. `SupabaseControlPlaneStore` for the hosted, tenant-scoped transactional
   journal. Migration `web/supabase/migrations/009_control_plane_v2.sql`
   installs atomic intent commits, optimistic Worker writes, `SKIP LOCKED`
   claims, renewable fenced leases, and terminal commits. Hosted deployments
   must apply that migration; without Supabase credentials local development
   deliberately uses the JSON adapter.

Clerk `UserConfig` / `MachineRef` remains a compatibility projection for the
existing dashboard pages and provider credentials. It is no longer the
operation journal or the owner of lifecycle sequencing.

## Lifecycle semantics

| Desired state or event | Reconciler behavior |
|---|---|
| New Worker → running | provision → bootstrap/probe → ready |
| Run on sleeping Worker | inspect without wake → wake → run once |
| Run on missing Worker | re-provision → bootstrap → run once |
| Desired sandbox changes | application-level live migrate → verify → atomic placement cutover |
| Desired runtime changes | install/probe target harness → persist harness placement |
| Desired sleeping | park when the selected provider supports it |
| Desired deleted | provider teardown → clear placement → terminal deleted state |
| Scheduled run | scheduler evaluates time; control plane dedupes `(schedule, instant)` and runs |

Live migration means managed-work draining plus a stable final filesystem
delta. Processes restart from durable state. It is not cross-provider RAM
transplantation; `docs/MUX.md` is the detailed migration contract.

## Dashboard contract

The dashboard exposes three creation surfaces:

1. **Take one off the shelf** from a specialist template with a role, memory,
   tools, and runtime already selected. This is live.
2. **Assemble the machinery** by choosing a runtime and sandbox directly. This
   is live.
3. **Describe the outcome** and let the system propose the Worker. This is the
   product direction and is not yet presented as shipped automation.

The direct assembly path is action-first:

1. Open Workers.
2. Click an agent runtime, such as Claude Code.
3. Click a configured sandbox, such as E2B.
4. The sandbox click submits one launch intent, starts bootstrap, primes the
   console, and opens the machine view.

The browser no longer sequences provision and bootstrap as separate user
steps on this path. There is also no page-transition curtain, click
interception, or three-panel wipe; route navigation is native and guarded by
`web/lib/motion-contract.test.ts`.

Worker detail exposes observed generation, lifecycle phase, the latest durable
operations, terminal errors, and explicit retry. Editing runtime, model,
router, memory, or role prompt submits a new reconcile operation; deleting a
deployed Worker journals provider teardown before removing its dashboard
template.

## Live validation (2026-08-13)

- E2B, Sprites, and Vercel completed real provision/readiness/exec/sleep-wake/
  teardown benchmarks with tenant credentials. Sprites also hosted the live
  migration and runtime matrix proofs.
- E2B → Sprites live migration moved about 575 KB of allowlisted durable state,
  kept the source addressable until verification/commit, then cut placement
  over successfully.
- Claude Code, Codex, Hermes, and OpenClaw each returned an exact live sentinel
  through the hosted control-plane run path.
- A real scheduled OpenClaw run returned `AM_V2_CRON_LIVE_OK`, exit 0, and
  appended its runtime/substrate/model/router snapshot to the sandbox's
  `~/.agent-machines/cron/runs.jsonl`.
- The retired fourth provider failed vendor API and teardown checks in that
  historical run. It is no longer an active integration. Daytona replaces it
  as of September 9, 2026; those older results are not Daytona validation.
- Vercel AI Gateway request formatting is verified; the test account correctly
  returned HTTP 402 for zero balance, so runtime proofs used native model keys.

## Cutover ledger

| Area | State | Next boundary |
|---|---|---|
| Declarative Worker API | Shipped in `src/control-plane` and hosted API | Publish stable hosted client package |
| Durable operations | Memory + atomic JSON + transactional Supabase adapters shipped | Apply migration 009 in each hosted environment |
| Reconcile leases/recovery | Shipped, fenced, and tested | Add a dedicated queue consumer when fleet scale warrants it |
| Cold-start before run | Shipped across hosted run and cron paths | Continue provider latency tuning |
| Scheduled-run dedupe | Shipped; hosted CronEntry resolves into Worker schedules | Add richer calendar/time-zone policy |
| Live provider migration | Shipped through mux and hosted driver | Add optional provider-native snapshot accelerators |
| Dashboard two-click launch | Shipped | Continue usability/performance iteration |
| Operation history + retry | Shipped on Worker detail | Add fleet-wide operation search |
| Hosted Worker/Machine bridge | Compatibility projection | Retire `MachineRef` after remaining read surfaces consume Worker status |
| Provider/harness adapters | Preserved | Delete hosted duplicate orchestration after parity |

## Why this is a rebuild, not a repository rewrite

The lifecycle kernel is new and its interface is the new product boundary.
The provider adapters, harness recipes, browser console, migration protocol,
test corpus, and visual tokens remain because they are proven assets, not the
architectural problem. The old route-by-route orchestration is retired behind
adapters as each hosted verb reaches parity.
