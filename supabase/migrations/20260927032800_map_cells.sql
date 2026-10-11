-- H3 cells replace the synthetic heatmap points. A cell is a `grid` region whose
-- parent is its district, and its values are ordinary region_data facts: the
-- building-based worker estimate (with low/high bounds) and per-cell housing
-- aggregates. One read returns every cell of a district for the requested metrics.
begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

drop function if exists public.get_map_heatmap_points(boolean);
drop table if exists public.map_heatmap_points;

create function public.get_map_cells(
    p_parent_code text,
    p_metrics text[],
    p_include_sample boolean default false
)
returns table (
    cell_code varchar,
    parent_code varchar,
    geometry jsonb,
    centroid jsonb,
    facts jsonb,
    is_sample boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if p_parent_code is null or p_metrics is null
       or pg_catalog.cardinality(p_metrics) not between 1 and 10 then
        raise exception 'a district code and 1 to 10 metrics are required';
    end if;

    return query
    select
        r.code,
        parent.code,
        extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb,
        extensions.ST_AsGeoJSON(extensions.ST_PointOnSurface(r.geometry), 6)::jsonb,
        coalesce((
            select pg_catalog.jsonb_object_agg(d.metric, pg_catalog.jsonb_build_object(
                'value', d.numeric_value, 'unit', d.unit, 'evidence_type', d.evidence_type,
                'period_end', d.period_end, 'source', d.source, 'sample_size', d.sample_size,
                'limitations', d.limitations, 'is_sample', d.is_sample))
            from (
                select distinct on (fact.metric) fact.*
                from public.region_data as fact
                where fact.region_id = r.id
                  and fact.metric = any (p_metrics)
                  and fact.numeric_value is not null
                  and (p_include_sample or not fact.is_sample)
                  -- A worker estimate or median rent built from fewer than three
                  -- buildings or listings could expose one building or listing.
                  and (fact.metric not in (
                           'estimated_office_workers', 'estimated_office_workers_low',
                           'estimated_office_workers_high', 'median_monthly_rent_idr')
                       or coalesce(fact.sample_size, 0) >= 3)
                order by fact.metric, fact.is_sample, fact.period_end desc nulls last,
                         fact.retrieved_at desc nulls last, fact.id desc
            ) as d
        ), '{}'::jsonb),
        r.is_sample
    from public.regions as r
    join public.regions as parent on parent.id = r.parent_id
    where parent.code = p_parent_code
      and r.region_type = 'grid'
      and r.geometry is not null
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    order by r.code;
end;
$$;

revoke all on function public.get_map_cells(text, text[], boolean)
    from public, anon, authenticated;
grant execute on function public.get_map_cells(text, text[], boolean)
    to anon, authenticated, service_role;

commit;
