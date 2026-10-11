-- Per-district counts of accepted enrichment evidence, for map clusters.
--
-- Evidence rows stay private: this function is backend-only and returns counts,
-- never names, URLs, or coordinates of individual claims. The API route that calls
-- it is the public aggregation gateway, as snapshot publication is for zones.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

-- One row per (district, evidence type) under a parent city. A claim is binned to
-- the trusted district boundary its point falls in, and only when it was placed at
-- district precision or finer: a city-level point is never credited to a district.
-- The same claim found by several zones' runs counts once (dedup_hash).
create or replace function public.get_evidence_clusters(
    p_parent_code varchar,
    p_scope_hashes text[],
    p_include_sample boolean default false
)
returns table (
    region_code         varchar(64),
    region_name         varchar(160),
    centroid            jsonb,
    evidence_type       varchar(40),
    evidence_count      integer,
    organization_count  integer,
    latest_retrieved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    with districts as (
        select r.code, r.name, r.geometry,
               extensions.ST_AsGeoJSON(extensions.ST_PointOnSurface(r.geometry), 6)::jsonb as centroid
        from public.regions as r
        join public.regions as parent on parent.id = r.parent_id
        where parent.code = p_parent_code
          and r.region_type = 'district'
          and r.geometry is not null
          and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    ),
    evidence as (
        select c.evidence_type, c.dedup_hash, pg_catalog.lower(c.entity_name) as organization, c.retrieved_at,
               extensions.ST_SetSRID(extensions.ST_MakePoint(c.longitude, c.latitude), 4326) as geom
        from public.zone_evidence_cache as c
        where c.validation_status = 'accepted'
          and c.is_sample = false
          and c.expires_at > pg_catalog.now()
          and c.scope_hash::text = any (p_scope_hashes)
          and c.latitude is not null
          and c.longitude is not null
          and c.geographic_precision in ('building', 'street', 'neighborhood', 'district')
    )
    select d.code, d.name, d.centroid, e.evidence_type,
           count(distinct e.dedup_hash)::integer,
           count(distinct e.organization)::integer,
           max(e.retrieved_at)
    from districts as d
    join evidence as e on extensions.ST_Covers(d.geometry, e.geom)
    group by d.code, d.name, d.centroid, e.evidence_type
    order by d.code, e.evidence_type;
$$;

revoke all on function public.get_evidence_clusters(varchar, text[], boolean) from public, anon, authenticated;
grant execute on function public.get_evidence_clusters(varchar, text[], boolean) to service_role;

commit;
