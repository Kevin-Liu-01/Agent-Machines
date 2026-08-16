-- Transactional, tenant-scoped operation journal for control plane v2.
--
-- JSONB holds the public package resources verbatim while typed/indexed
-- columns own concurrency, idempotency, leases, and queue ordering. All
-- mutations that span resources are RPC functions so PostgREST never exposes
-- a half-committed Worker intent.

create table if not exists control_plane_workers (
  tenant_id  text not null,
  id         text not null,
  version    bigint not null,
  generation bigint not null,
  resource   jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  constraint control_plane_workers_resource_id
    check (resource ->> 'id' = id)
);

create table if not exists control_plane_operations (
  tenant_id       text not null,
  id              text not null,
  worker_id       text not null,
  idempotency_key text not null,
  status          text not null,
  attempts        integer not null default 0,
  lease_until     timestamptz,
  lease_token     text,
  resource        jsonb not null,
  created_at      timestamptz not null,
  finished_at     timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, worker_id)
    references control_plane_workers (tenant_id, id) on delete cascade,
  constraint control_plane_operations_status
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint control_plane_operations_resource_id
    check (resource ->> 'id' = id)
);

alter table control_plane_operations
  add column if not exists lease_token text;

create index if not exists idx_control_plane_operation_queue
  on control_plane_operations (tenant_id, status, lease_until, created_at, id);
create index if not exists idx_control_plane_operation_worker
  on control_plane_operations (tenant_id, worker_id, created_at, id);

alter table control_plane_workers enable row level security;
alter table control_plane_operations enable row level security;

create or replace function control_plane_commit_intent(
  p_tenant_id text,
  p_worker jsonb,
  p_operation jsonb,
  p_expected_version bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id text := p_worker ->> 'id';
  v_idempotency_key text := p_operation ->> 'idempotencyKey';
  v_existing_operation jsonb;
  v_existing_worker jsonb;
  v_actual_version bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':' || v_idempotency_key, 0));

  select resource into v_existing_operation
  from control_plane_operations
  where tenant_id = p_tenant_id and idempotency_key = v_idempotency_key;

  if v_existing_operation is not null then
    select resource into v_existing_worker
    from control_plane_workers
    where tenant_id = p_tenant_id
      and id = v_existing_operation ->> 'workerId';
    if v_existing_worker is null then
      raise exception 'operation references missing worker' using errcode = '23503';
    end if;
    return jsonb_build_object(
      'worker', v_existing_worker,
      'operation', v_existing_operation,
      'reused', true
    );
  end if;

  select version into v_actual_version
  from control_plane_workers
  where tenant_id = p_tenant_id and id = v_worker_id
  for update;

  if v_actual_version is distinct from p_expected_version then
    raise exception 'worker version conflict: expected %, found %',
      p_expected_version, v_actual_version using errcode = '40001';
  end if;

  insert into control_plane_workers (
    tenant_id, id, version, generation, resource, created_at, updated_at
  ) values (
    p_tenant_id,
    v_worker_id,
    (p_worker ->> 'version')::bigint,
    (p_worker ->> 'generation')::bigint,
    p_worker,
    (p_worker ->> 'createdAt')::timestamptz,
    (p_worker ->> 'updatedAt')::timestamptz
  )
  on conflict (tenant_id, id) do update set
    version = excluded.version,
    generation = excluded.generation,
    resource = excluded.resource,
    updated_at = excluded.updated_at;

  insert into control_plane_operations (
    tenant_id, id, worker_id, idempotency_key, status, attempts,
    lease_until, resource, created_at, finished_at
  ) values (
    p_tenant_id,
    p_operation ->> 'id',
    p_operation ->> 'workerId',
    v_idempotency_key,
    p_operation ->> 'status',
    (p_operation ->> 'attempts')::integer,
    nullif(p_operation ->> 'leaseUntil', '')::timestamptz,
    p_operation,
    (p_operation ->> 'createdAt')::timestamptz,
    nullif(p_operation ->> 'finishedAt', '')::timestamptz
  );

  return jsonb_build_object(
    'worker', p_worker,
    'operation', p_operation,
    'reused', false
  );
end;
$$;

create or replace function control_plane_save_worker(
  p_tenant_id text,
  p_worker jsonb,
  p_expected_version bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update control_plane_workers set
    version = (p_worker ->> 'version')::bigint,
    generation = (p_worker ->> 'generation')::bigint,
    resource = p_worker,
    updated_at = (p_worker ->> 'updatedAt')::timestamptz
  where tenant_id = p_tenant_id
    and id = p_worker ->> 'id'
    and version = p_expected_version;
  if not found then
    raise exception 'worker version conflict' using errcode = '40001';
  end if;
  return true;
end;
$$;

create or replace function control_plane_enqueue_operation(
  p_tenant_id text,
  p_operation jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency_key text := p_operation ->> 'idempotencyKey';
  v_existing jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':' || v_idempotency_key, 0));
  select resource into v_existing
  from control_plane_operations
  where tenant_id = p_tenant_id and idempotency_key = v_idempotency_key;
  if v_existing is not null then
    return jsonb_build_object('operation', v_existing, 'reused', true);
  end if;
  if not exists (
    select 1 from control_plane_workers
    where tenant_id = p_tenant_id and id = p_operation ->> 'workerId'
  ) then
    raise exception 'worker does not exist' using errcode = '23503';
  end if;
  insert into control_plane_operations (
    tenant_id, id, worker_id, idempotency_key, status, attempts,
    lease_until, resource, created_at, finished_at
  ) values (
    p_tenant_id,
    p_operation ->> 'id',
    p_operation ->> 'workerId',
    v_idempotency_key,
    p_operation ->> 'status',
    (p_operation ->> 'attempts')::integer,
    nullif(p_operation ->> 'leaseUntil', '')::timestamptz,
    p_operation,
    (p_operation ->> 'createdAt')::timestamptz,
    nullif(p_operation ->> 'finishedAt', '')::timestamptz
  );
  return jsonb_build_object('operation', p_operation, 'reused', false);
end;
$$;

drop function if exists control_plane_claim_next_operation(text, text, timestamptz, integer);
create or replace function control_plane_claim_next_operation(
  p_tenant_id text,
  p_worker_id text,
  p_now timestamptz,
  p_lease_ms integer,
  p_lease_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row control_plane_operations%rowtype;
  v_lease_until timestamptz;
  v_resource jsonb;
begin
  select * into v_row
  from control_plane_operations
  where tenant_id = p_tenant_id
    and (p_worker_id is null or worker_id = p_worker_id)
    and (
      status = 'queued'
      or (status = 'running' and lease_until is not null and lease_until <= p_now)
    )
  order by created_at, id
  for update skip locked
  limit 1;

  if not found then return null; end if;
  v_lease_until := p_now + make_interval(secs => p_lease_ms::double precision / 1000.0);
  v_resource := v_row.resource || jsonb_build_object(
    'status', 'running',
    'attempts', v_row.attempts + 1,
    'startedAt', to_jsonb(coalesce(v_row.resource ->> 'startedAt', p_now::text)),
    'leaseUntil', to_jsonb(v_lease_until::text),
    'leaseToken', to_jsonb(p_lease_token)
  );
  update control_plane_operations set
    status = 'running',
    attempts = v_row.attempts + 1,
    lease_until = v_lease_until,
    lease_token = p_lease_token,
    resource = v_resource
  where tenant_id = p_tenant_id and id = v_row.id;
  return v_resource;
end;
$$;

create or replace function control_plane_renew_operation_lease(
  p_tenant_id text,
  p_operation_id text,
  p_lease_token text,
  p_lease_until timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource jsonb;
begin
  update control_plane_operations set
    lease_until = p_lease_until,
    resource = resource || jsonb_build_object(
      'leaseUntil', to_jsonb(p_lease_until::text)
    )
  where tenant_id = p_tenant_id
    and id = p_operation_id
    and status = 'running'
    and lease_token = p_lease_token
  returning resource into v_resource;
  if v_resource is null then
    raise exception 'operation lease was lost' using errcode = '40001';
  end if;
  return v_resource;
end;
$$;

drop function if exists control_plane_finish_operation(text, text, text, jsonb, text, timestamptz);
create or replace function control_plane_finish_operation(
  p_tenant_id text,
  p_operation_id text,
  p_status text,
  p_result jsonb,
  p_error text,
  p_finished_at timestamptz,
  p_lease_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource jsonb;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid terminal operation status';
  end if;
  update control_plane_operations set
    status = p_status,
    lease_until = null,
    lease_token = null,
    finished_at = p_finished_at,
    resource = resource || jsonb_build_object(
      'status', p_status,
      'leaseUntil', null,
      'leaseToken', null,
      'result', coalesce(p_result, 'null'::jsonb),
      'error', to_jsonb(p_error),
      'finishedAt', to_jsonb(p_finished_at::text)
    )
  where tenant_id = p_tenant_id
    and id = p_operation_id
    and status = 'running'
    and lease_token = p_lease_token
  returning resource into v_resource;
  if v_resource is null then
    raise exception 'operation does not exist' using errcode = 'P0002';
  end if;
  return v_resource;
end;
$$;

revoke all on control_plane_workers from anon, authenticated;
revoke all on control_plane_operations from anon, authenticated;
revoke execute on function control_plane_commit_intent(text, jsonb, jsonb, bigint) from public, anon, authenticated;
revoke execute on function control_plane_save_worker(text, jsonb, bigint) from public, anon, authenticated;
revoke execute on function control_plane_enqueue_operation(text, jsonb) from public, anon, authenticated;
revoke execute on function control_plane_claim_next_operation(text, text, timestamptz, integer, text) from public, anon, authenticated;
revoke execute on function control_plane_renew_operation_lease(text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function control_plane_finish_operation(text, text, text, jsonb, text, timestamptz, text) from public, anon, authenticated;

grant execute on function control_plane_commit_intent(text, jsonb, jsonb, bigint) to service_role;
grant execute on function control_plane_save_worker(text, jsonb, bigint) to service_role;
grant execute on function control_plane_enqueue_operation(text, jsonb) to service_role;
grant execute on function control_plane_claim_next_operation(text, text, timestamptz, integer, text) to service_role;
grant execute on function control_plane_renew_operation_lease(text, text, text, timestamptz) to service_role;
grant execute on function control_plane_finish_operation(text, text, text, jsonb, text, timestamptz, text) to service_role;
