-- Substrate benchmark results.
--
-- One row per provider per suite run (grouped by run_id). Benchmarks are
-- provider-level facts, not user data, so rows are global (no user_id).
-- `metrics` holds the full metricId -> ProbeResult map as JSONB so the
-- schema doesn't need a column per metric as the catalog grows.

create table if not exists provider_benchmarks (
  id bigint generated always as identity primary key,
  run_id text not null,
  provider_kind text not null,
  source text not null default 'measured',   -- 'measured' | 'demo'
  ok boolean not null default true,
  error text,
  region text,
  host text,
  spec jsonb not null,
  metrics jsonb not null default '{}',
  score numeric,
  iterations integer not null default 1,
  duration_ms integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_benchmarks_recent
  on provider_benchmarks (provider_kind, finished_at desc);

create index if not exists idx_provider_benchmarks_run
  on provider_benchmarks (run_id);
