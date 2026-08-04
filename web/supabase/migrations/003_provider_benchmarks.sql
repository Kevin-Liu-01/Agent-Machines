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

-- RLS enabled 2026-08-03. An audit of the live database that day found this was
-- the ONE table in `public` with row security OFF while anon and authenticated
-- held full grants (DELETE/INSERT/SELECT/UPDATE/TRUNCATE) -- so anyone with the
-- publishable anon key, which ships in the client bundle, could read or truncate
-- the fleet's benchmark history. Every other table already had RLS on. Zero
-- policies is the intended state: the service role bypasses RLS, and
-- supabaseAdmin() is the only reader (lib/benchmarks/store.ts,
-- lib/learning/policy.ts). No app code uses the Supabase anon key at all.
alter table provider_benchmarks enable row level security;

create index if not exists idx_provider_benchmarks_recent
  on provider_benchmarks (provider_kind, finished_at desc);

create index if not exists idx_provider_benchmarks_run
  on provider_benchmarks (run_id);
