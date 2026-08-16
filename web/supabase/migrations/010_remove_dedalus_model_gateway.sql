-- Dedalus remains a sandbox substrate. Its historical OpenAI-compatible
-- gateway profile was retired; move every stale durable reference to the
-- canonical Vercel AI Gateway and remove unusable custom profiles.

begin;

update public.machines
set gateway_profile_id = 'vercel-ai-gateway',
    updated_at = now()
where lower(coalesce(gateway_profile_id, '')) like '%dedalus%';

update public.users
set gateway_profiles = coalesce(
  (
    select jsonb_agg(profile order by ordinal)
    from jsonb_array_elements(coalesce(gateway_profiles, '[]'::jsonb))
      with ordinality as profiles(profile, ordinal)
    where lower(coalesce(profile ->> 'id', '')) not like '%dedalus%'
      and lower(coalesce(profile ->> 'kind', '')) not like '%dedalus%'
      and lower(coalesce(profile ->> 'baseUrl', '')) not like '%dedalus%'
  ),
  '[]'::jsonb
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(gateway_profiles, '[]'::jsonb)) as profile
  where lower(coalesce(profile ->> 'id', '')) like '%dedalus%'
     or lower(coalesce(profile ->> 'kind', '')) like '%dedalus%'
     or lower(coalesce(profile ->> 'baseUrl', '')) like '%dedalus%'
);

update public.users
set workers = coalesce(
  (
    select jsonb_agg(
      case
        when lower(coalesce(worker ->> 'gatewayProfileId', '')) like '%dedalus%'
          then jsonb_set(worker, '{gatewayProfileId}', '"vercel-ai-gateway"'::jsonb, true)
        else worker
      end
      order by ordinal
    )
    from jsonb_array_elements(coalesce(workers, '[]'::jsonb))
      with ordinality as worker_rows(worker, ordinal)
  ),
  '[]'::jsonb
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(workers, '[]'::jsonb)) as worker
  where lower(coalesce(worker ->> 'gatewayProfileId', '')) like '%dedalus%'
);

with repaired as (
  select
    tenant_id,
    id,
    version + 1 as next_version,
    generation + 1 as next_generation,
    now() as repaired_at
  from public.control_plane_workers
  where lower(coalesce(resource #>> '{spec,gatewayProfileId}', '')) like '%dedalus%'
)
update public.control_plane_workers as workers
set version = repaired.next_version,
    generation = repaired.next_generation,
    updated_at = repaired.repaired_at,
    resource = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              workers.resource,
              '{spec,gatewayProfileId}',
              '"vercel-ai-gateway"'::jsonb,
              true
            ),
            '{version}',
            to_jsonb(repaired.next_version),
            true
          ),
          '{generation}',
          to_jsonb(repaired.next_generation),
          true
        ),
        '{status,observedGeneration}',
        to_jsonb(repaired.next_generation),
        true
      ),
      '{updatedAt}',
      to_jsonb(repaired.repaired_at::text),
      true
    )
from repaired
where workers.tenant_id = repaired.tenant_id
  and workers.id = repaired.id;

commit;

notify pgrst, 'reload schema';
