-- Batch read for administrative/grid heatmap layers and repeatable fact imports.
-- Remote migration version: 20260925194332.
-- 0001-0009 have already been applied; this is an additive migration.
begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

-- One version of a prepared fact per source and reporting period. Distinct
-- sources/periods remain separate historical observations. NULL periods compare
-- equal so re-imports without a date do not accumulate duplicate rows.
create unique index region_data_import_uq
    on public.region_data (region_id, metric, period_start, period_end, source)
    nulls not distinct;

-- Keep the public aggregate contract explicit. The index scores are calculated
-- from these counts across the batch by the API, never accepted from an LLM.
create or replace function private.is_public_snapshot(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
    item record;
    range_value jsonb;
begin
    if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
        return false;
    end if;
    for item in select * from pg_catalog.jsonb_each(payload) loop
        if item.key in (
            'observed_office_count', 'observed_organizations',
            'offices_with_local_headcount_evidence', 'organizations_without_headcount',
            'sources_monitored', 'opening_count', 'housing_count'
        ) then
            if pg_catalog.jsonb_typeof(item.value) <> 'number'
               or item.value::numeric < 0
               or item.value::numeric <> pg_catalog.trunc(item.value::numeric) then
                return false;
            end if;
        elsif item.key in ('estimated_employment', 'monthly_rent_idr', 'salary_idr') then
            range_value := item.value;
            if pg_catalog.jsonb_typeof(range_value) <> 'object'
               or (range_value - array['minimum', 'maximum', 'status', 'method_version']) <> '{}'::jsonb
               or not (range_value ? 'status')
               or range_value->>'status' not in ('observed', 'estimated', 'unavailable')
               or pg_catalog.jsonb_typeof(range_value->'status') <> 'string' then
                return false;
            end if;
            if range_value ? 'method_version' then
                if item.key <> 'estimated_employment'
                   or pg_catalog.jsonb_typeof(range_value->'method_version') <> 'string'
                   or range_value->>'method_version' !~ '^[a-z0-9][a-z0-9_-]{0,49}$' then
                    return false;
                end if;
            end if;
            if range_value->>'status' = 'unavailable' then
                if range_value ?| array['minimum', 'maximum', 'method_version'] then
                    return false;
                end if;
            else
                if not (range_value ?& array['minimum', 'maximum'])
                   or pg_catalog.jsonb_typeof(range_value->'minimum') <> 'number'
                   or pg_catalog.jsonb_typeof(range_value->'maximum') <> 'number' then
                    return false;
                end if;
                if (range_value->>'minimum')::numeric < 0
                   or (range_value->>'maximum')::numeric < (range_value->>'minimum')::numeric then
                    return false;
                end if;
            end if;
        elsif item.key = 'limitations' then
            if pg_catalog.jsonb_typeof(item.value) <> 'array' then return false; end if;
            if exists (select 1 from pg_catalog.jsonb_array_elements(item.value) as v(value)
                       where pg_catalog.jsonb_typeof(v.value) <> 'string') then
                return false;
            end if;
        elsif item.key = 'coverage' then
            if pg_catalog.jsonb_typeof(item.value) <> 'string'
               or item.value #>> '{}' not in ('complete', 'partial', 'unavailable') then
                return false;
            end if;
        elsif item.key = 'confidence' then
            if pg_catalog.jsonb_typeof(item.value) <> 'number'
               or item.value::numeric not between 0 and 1 then return false; end if;
        elsif item.key in ('as_of', 'oldest_material_evidence') then
            if pg_catalog.jsonb_typeof(item.value) <> 'string'
               or item.value #>> '{}' !~ '^d{4}-d{2}-d{2}$' then return false; end if;
        else
            return false;
        end if;
    end loop;
    return true;
end;
$$;

-- One request lists direct children with trusted geometry and the latest
-- non-sample metric. Dynamic aggregates are included only for an exact scope;
-- omitting snapshot type/hash returns geometry and prepared facts alone.
create function public.get_region_layer(
    p_parent_id integer,
    p_metric varchar default null,
    p_snapshot_type varchar default null,
    p_scope_hash text default null,
    p_region_type varchar default null
)
returns table (
    region_id integer,
    region_code varchar(64),
    region_name varchar(160),
    region_type varchar(30),
    geometry jsonb,
    metric_data jsonb,
    snapshot jsonb,
    coverage varchar(20),
    generated_at timestamptz,
    refresh_after timestamptz,
    expires_at timestamptz,
    is_stale boolean,
    is_expired boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if p_parent_id is null
       or (p_snapshot_type is null) <> (p_scope_hash is null)
       or (p_scope_hash is not null and p_scope_hash !~ '^[0-9a-f]{64}$') then
        raise exception 'parent id and an optional exact snapshot type/hash are required';
    end if;

    return query
    select
        r.id, r.code, r.name, r.region_type,
        case when r.geometry is null then null
             else extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb end,
        case when d.id is null then null else pg_catalog.jsonb_build_object(
            'metric', d.metric, 'numeric_value', d.numeric_value,
            'unit', d.unit, 'evidence_type', d.evidence_type,
            'period_start', d.period_start, 'period_end', d.period_end,
            'source', d.source, 'sample_size', d.sample_size,
            'confidence', d.confidence, 'limitations', d.limitations
        ) end,
        s.snapshot, s.coverage, s.generated_at, s.refresh_after, s.expires_at,
        case when s.id is null then null else
            s.refresh_after is null or s.refresh_after <= pg_catalog.now()
                or coalesce(s.expires_at <= pg_catalog.now(), false) end,
        case when s.id is null then null else
            coalesce(s.expires_at <= pg_catalog.now(), false) end
    from public.regions as r
    left join lateral (
        select fact.* from public.region_data as fact
        where fact.region_id = r.id and fact.metric = p_metric
          and fact.is_sample = false
        order by fact.period_end desc nulls last,
                 fact.period_start desc nulls last,
                 fact.published_at desc nulls last,
                 fact.retrieved_at desc nulls last, fact.id desc
        limit 1
    ) as d on true
    left join lateral (
        select current_snapshot.* from public.region_snapshots as current_snapshot
        where current_snapshot.region_id = r.id
          and current_snapshot.snapshot_type = p_snapshot_type
          and current_snapshot.scope_hash = p_scope_hash::char(64)
          and current_snapshot.is_current = true
          and current_snapshot.status = 'accepted'
        limit 1
    ) as s on true
    where r.parent_id = p_parent_id
      and r.is_supported = true
      and (p_region_type is null or r.region_type = p_region_type)
    order by r.code;
end;
$$;

-- Explicit function privileges: old projects may grant EXECUTE to browser
-- roles by default. This RPC reads only approved facts and aggregates.
revoke all on function public.get_region_layer(integer, varchar, varchar, text, varchar)
    from public, anon, authenticated;
grant execute on function public.get_region_layer(integer, varchar, varchar, text, varchar)
    to anon, authenticated, service_role;

commit;
