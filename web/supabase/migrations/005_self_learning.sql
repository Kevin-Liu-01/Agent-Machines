-- Migration 005: self-learning loop (Loop 0 traces + Loop A routing policy)
--
-- run_traces: one normalized row per completed headless (cron) run, keyed by
--   the routing arm + a derived task_class + the loadout hash. Privacy: holds
--   no prompt text or memory -- only arm axes and outcomes. tenant_hash is a
--   one-way digest used as a context feature, never a join to content.
-- routing_policy: versioned global policy snapshots (no user_id -- routing
--   priors pool across the fleet, like provider_benchmarks).

create table if not exists run_traces (
  id bigint generated always as identity primary key,
  user_id text not null,
  machine_id text not null,
  run_id text not null unique,
  source text not null default 'cron',
  task_class text not null default 'unknown',
  runtime text not null,
  substrate text not null,
  model text not null,
  router_id text,
  loadout_hash text not null,
  memory_bundle_id text,
  tenant_hash text,
  success boolean,
  exit_code integer,
  cost_millicents bigint,
  latency_ms integer,
  started_at timestamptz,
  finished_at timestamptz,
  recorded_at timestamptz not null default now(),
  extra jsonb
);

create index if not exists idx_run_traces_arm
  on run_traces (task_class, runtime, substrate, model, recorded_at desc);

create index if not exists idx_run_traces_user
  on run_traces (user_id, machine_id, recorded_at desc);

create table if not exists routing_policy (
  id bigint generated always as identity primary key,
  version integer not null,
  computed_at timestamptz not null default now(),
  weights jsonb not null,
  posteriors jsonb not null,
  n_traces integer not null default 0,
  active boolean not null default true
);

create index if not exists idx_routing_policy_active
  on routing_policy (active, version desc);
