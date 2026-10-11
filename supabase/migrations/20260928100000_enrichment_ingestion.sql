-- Backend support for ingesting LF-01 candidates.
--
-- LF-01 never geocodes. The backend geocodes each candidate (Nominatim, cached
-- here), then classify_evidence_points() decides its locality tier against
-- trusted district boundaries before upsert_zone_evidence() accepts it.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

-- LF-01 salary claims need their own cache scope; they are not openings.
insert into public.evidence_cache_policies (
    evidence_type,
    minimum_required_count,
    target_count,
    refresh_after_hours,
    expire_after_hours,
    max_sources_per_run,
    retry_after_minutes
) values
    ('salary_observation', 5, 25, 504, 720, 3, 1440)
on conflict (evidence_type) do nothing;

-- Geocoder responses keyed by a hash of the normalized query. Nominatim's usage
-- policy requires caching; misses are cached too so bad addresses are not retried.
create table if not exists public.geocode_cache (
    query_hash  char(64) primary key,
    query       varchar(500) not null,
    provider    varchar(40) not null,
    status      varchar(20) not null,
    result      jsonb,
    fetched_at  timestamptz not null default pg_catalog.now(),
    expires_at  timestamptz not null,
    constraint geocode_cache_query_hash_ck
        check (query_hash ~ '^[0-9a-f]{64}$'),
    constraint geocode_cache_status_ck
        check (status in ('found', 'not_found')),
    constraint geocode_cache_result_ck
        check ((status = 'found') = (result is not null and pg_catalog.jsonb_typeof(result) = 'object')),
    constraint geocode_cache_expiry_ck
        check (expires_at > fetched_at)
);

create index if not exists geocode_cache_expires_idx
    on public.geocode_cache (expires_at);

alter table public.geocode_cache enable row level security;
revoke all on table public.geocode_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.geocode_cache to service_role;

-- Locality tier of geocoded points relative to one target district:
-- zone (inside it), city (a sibling district), region (same grandparent), or
-- null when no trusted boundary decides it. The caller falls back to geocoder
-- address fields for null and rejects points outside Indonesia.
create or replace function public.classify_evidence_points(
    p_region_id integer,
    p_points jsonb
)
returns table (
    point_index             integer,
    containing_region_code  varchar(64),
    locality_tier           varchar(20)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    target_parent       integer;
    target_grandparent  integer;
begin
    if p_region_id is null
       or p_points is null
       or pg_catalog.jsonb_typeof(p_points) <> 'array'
       or pg_catalog.jsonb_array_length(p_points) > 500 then
        raise exception 'region id and a JSON array of at most 500 points are required';
    end if;

    select r.parent_id, parent.parent_id
    into target_parent, target_grandparent
    from public.regions as r
    left join public.regions as parent on parent.id = r.parent_id
    where r.id = p_region_id;

    if not found then
        raise exception 'region % does not exist', p_region_id;
    end if;

    return query
    with points as (
        select x.point_index,
               extensions.ST_SetSRID(extensions.ST_MakePoint(x.longitude, x.latitude), 4326) as geom
        from pg_catalog.jsonb_to_recordset(p_points) as x(
            point_index integer,
            latitude    double precision,
            longitude   double precision
        )
        where x.point_index is not null
          and x.latitude between -90 and 90
          and x.longitude between -180 and 180
    ),
    containing as (
        select distinct on (p.point_index)
               p.point_index, r.id, r.code, r.parent_id, parent.parent_id as grandparent_id
        from points as p
        join public.regions as r
          on r.region_type = 'district'
         and r.geometry is not null
         and extensions.ST_Covers(r.geometry, p.geom)
        left join public.regions as parent on parent.id = r.parent_id
        order by p.point_index, r.id
    )
    select p.point_index,
           c.code,
           (case
               when c.id is null then null
               when c.id = p_region_id then 'zone'
               when target_parent is not null and c.parent_id = target_parent then 'city'
               when target_grandparent is not null and c.grandparent_id = target_grandparent then 'region'
               else null
           end)::varchar(20)
    from points as p
    left join containing as c on c.point_index = p.point_index
    order by p.point_index;
end;
$$;

revoke all on function public.classify_evidence_points(integer, jsonb) from public, anon, authenticated;
grant execute on function public.classify_evidence_points(integer, jsonb) to service_role;

commit;
