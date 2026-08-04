-- Migration 008: close the RLS gap across every table in `public`.
--
-- WHY THIS EXISTS AS A MIGRATION and not just a dashboard click: the audit that
-- produced it (2026-08-03) found the repo's migration files did not describe the
-- database. 006 shipped saying "no RLS policy, matching 001-005", which implied
-- the whole schema was policy-less; the live database disagreed in both
-- directions. A schema file that cannot reproduce the database is worse than no
-- file, so the measured state is written down here.
--
-- WHAT THE AUDIT MEASURED, per table in `public`:
--
--   anon and authenticated hold FULL grants on every table --
--   DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER. That is
--   Supabase's default for `public` and it is NOT the thing protecting these
--   tables. RLS is. With RLS on and zero policies, those grants resolve to
--   nothing for anon/authenticated, while the service role bypasses RLS
--   entirely -- and `supabaseAdmin()` (lib/supabase/client.ts, service-role key)
--   is the only reader in the codebase. No app code uses the Supabase anon or
--   publishable key at all; the only NEXT_PUBLIC_*_PUBLISHABLE_KEY in web/ is
--   Clerk's. Verified before enabling anything, precisely because enabling RLS
--   on a table a browser client reads would have broken that reader.
--
--   users, machines, machine_metrics, machine_transitions,
--   machine_usage_daily, machine_cost_estimates  -> RLS was ALREADY on.
--   mux_placements                               -> enabled at create (006).
--   provider_benchmarks                          -> RLS was OFF. The one real
--     exposure: anyone with the publishable key could read or TRUNCATE the
--     fleet's benchmark history. Fixed in 003.
--   run_traces, routing_policy                   -> DID NOT EXIST. 005 had
--     never been applied, so the self-learning loop had been reading absent
--     tables. Created with RLS on; see 005.
--
-- The statements below are idempotent and cover the 001 tables, so a fresh
-- database built from these files lands in the audited state instead of
-- inheriting whatever the dashboard happened to do. `machines` holds an
-- `api_key` column and `users` holds emails, which is why "already on" was
-- worth confirming rather than assuming.
--
-- If a browser client ever needs one of these tables, add an explicit policy
-- for it. Do not disable RLS to make a reader work.

alter table users                  enable row level security;
alter table machines               enable row level security;
alter table machine_metrics        enable row level security;
alter table machine_transitions    enable row level security;
alter table machine_usage_daily    enable row level security;
alter table machine_cost_estimates enable row level security;

-- Belt for the tables their own migrations now also enable, so this file alone
-- describes the audited end state: every table in `public` has RLS on.
alter table provider_benchmarks    enable row level security;
alter table run_traces             enable row level security;
alter table routing_policy         enable row level security;
alter table mux_placements         enable row level security;
