-- Migration 006: hosted mux placement store (ROADMAP 0.4, pillar 12).
--
-- Backs `PlacementStore` from src/mux/state.ts -- read / remember / forget /
-- saveHealth -- so a placement outlives the host that created it. The local
-- default writes ~/.agent-machines/mux-state.json, which a serverless caller
-- has no durable version of: a Vercel function's $HOME does not survive the
-- next invocation, so the local store silently forgets every machine it ever
-- created there. Implementation: web/lib/mux/placement-store.ts, whose header
-- carries the full reasoning and the ten guarantees each column keeps.
--
-- ONE table with a `kind` discriminator rather than two, because reading
-- machines and health from the same point in time (guarantee 4) in a single
-- round trip (guarantee 8) rules out both two SELECTs and a PostgREST embed: a
-- parent-first embed returns nothing for a tenant with placements but no health
-- row, and a child-first embed returns nothing for a tenant with health but no
-- placements -- and that second case is exactly when the circuit breaker has
-- something to say.
--
-- No RLS policy, matching 001-005: lib/supabase/client.ts holds the service
-- role key and scope is enforced by filtering every statement on tenant_id.
-- That filter is why it is not optional anywhere in the implementation.

create table if not exists mux_placements (
  tenant_id  text not null,
  kind       text not null,
  name       text not null,
  substrate  text,
  sandbox_id text,
  agent      text,
  health     jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind, name),
  constraint mux_placements_kind check (kind in ('placement', 'health')),
  constraint mux_placements_shape check (
    (kind = 'placement'
      and name <> '' and substrate is not null
      and sandbox_id is not null and agent is not null
      and health is null)
    or (kind = 'health'
      and name = '' and health is not null
      and substrate is null and sandbox_id is null and agent is null)
  )
);

-- No second index: the primary key's leading column is tenant_id, so the one
-- query read() issues is already an index scan on it.

-- updated_at comes from the DATABASE clock (guarantee 10). A column default is
-- not enough: PostgREST's upsert is INSERT .. ON CONFLICT DO UPDATE SET
-- <supplied columns>, and a default does not re-apply on the update path -- so
-- without this trigger a re-remembered name would keep its first-insert
-- timestamp forever. Sending the client's own clock instead is what guarantee
-- 10 forbids: entries written by clock-skewed hosts have to stay comparable.
create or replace function mux_placements_touch() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_mux_placements_touch on mux_placements;
create trigger trg_mux_placements_touch
  before insert or update on mux_placements
  for each row execute function mux_placements_touch();
