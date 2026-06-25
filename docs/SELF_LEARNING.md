# Self-Learning Loop

Agent Machines learns in two separate loops over one durable observation layer.

## Loop 0: Observe

Cron runs write authoritative JSONL records on the machine at
`~/.agent-machines/cron/runs.jsonl`. The control plane tails that file during
the internal cron tick, normalizes each completed run, and stores it in
`run_traces`.

The trace sink records only operational metadata:

- runtime, substrate, model, and router id
- task class
- loadout hash
- success, exit code, latency, and estimated cost
- hashed tenant context

It does not store prompts, memory text, credentials, transcripts, or artifacts.

## Loop A: Recommend

The hourly recompute job reads recent `run_traces`, builds a global routing
policy, and publishes an active snapshot in `routing_policy`.

The policy uses a small contextual bandit:

- candidate arms are credential-gated runtime/substrate/model/router choices
- success uses Beta posteriors
- cost and latency use Welford running statistics
- per-task-class cells are trusted only after a sample threshold
- sparse task classes fall back to global arm statistics
- substrate priors are seeded from provider benchmarks

The dashboard consumes the policy as a recommendation. Humans still confirm the
pick in `DeployAndTalk`; API callers can opt in with `autoRoute: true` when they
want omitted axes filled from the policy.

## Loop B: Improve

Loop B is not active yet. The intended path is harness curation:

1. cluster repeated failures from `run_traces`
2. propose a loadout, bootstrap, MCP, or skill change
3. validate it in a disposable machine
4. open an inspectable PR
5. promote by merge and reload

Routing intelligence ships first because it has cheap labels: every cron run
already reports success, latency, and cost.

## Current Files

- `web/supabase/migrations/005_self_learning.sql`
- `web/lib/learning/*`
- `web/app/api/internal/learning/recompute/route.ts`
- `web/app/api/dashboard/admin/route-recommendation/route.ts`
- `web/app/api/internal/cron/tick/route.ts`
- `web/lib/crons/service.ts`
- `web/components/dashboard/DeployAndTalk.tsx`

## Verification

Run:

```bash
pnpm --dir web test lib/learning
pnpm --dir web typecheck
```

Then trigger `/api/internal/cron/tick` with a configured cron machine and check
that `run_traces` receives rows. Trigger `/api/internal/learning/recompute` and
check that `routing_policy` receives one active snapshot.
