-- Keep the existing read contracts, but skip polygon conversion when the caller
-- only needs region facts or point-based H3 layers. The final arguments default
-- to true so SQL callers using the original arity keep their full geometry.
begin;

drop function public.get_map_region(text, boolean);

create function public.get_map_region(
    p_region_code text,
    p_include_sample boolean default false,
    p_include_geometry boolean default true
)
returns table (region_id integer, region_code varchar, region_name varchar,
               parent_code varchar, parent_name varchar, is_sample boolean,
               geometry jsonb, facts jsonb, places jsonb)
language sql stable security definer set search_path = ''
as $function$
    select r.id, r.code, r.name, parent.code, parent.name, r.is_sample,
           case when p_include_geometry then extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb else null::jsonb end,
           coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'metric', d.metric, 'value', d.numeric_value, 'unit', d.unit,
               'source', d.source, 'source_url', d.source_url,
               'period_start', d.period_start, 'period_end', d.period_end,
               'confidence', d.confidence, 'evidence_type', d.evidence_type, 'limitations', d.limitations,
               'is_sample', d.is_sample) order by d.metric)
               from (select distinct on (d.metric) d.*
                     from public.region_data d
                     where d.region_id = r.id and d.numeric_value is not null
                       and (p_include_sample or not d.is_sample)
                     order by d.metric, d.is_sample, d.period_end desc nulls last,
                              d.retrieved_at desc nulls last, d.id desc) d), '[]'::jsonb),
           coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', p.id, 'name', p.name, 'category', p.category,
               'latitude', p.latitude, 'longitude', p.longitude,
               'source', p.source, 'observed_at', p.observed_at,
               'is_sample', p.is_sample) order by p.id)
               from public.places p
               where p.region_id = r.id
                 and (p.is_active or (p_include_sample and p.is_sample))
                 and (p_include_sample or not p.is_sample)), '[]'::jsonb)
    from public.regions r
    join public.regions parent on parent.id = r.parent_id
    where r.code = p_region_code and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample));
$function$;

revoke all on function public.get_map_region(text, boolean, boolean) from public;
grant execute on function public.get_map_region(text, boolean, boolean) to anon, authenticated;

drop function public.get_map_cells(text, text[], boolean);

create function public.get_map_cells(
    p_parent_code text,
    p_metrics text[],
    p_include_sample boolean default false,
    p_include_geometry boolean default true
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
        case when p_include_geometry then extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb else null::jsonb end,
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

revoke all on function public.get_map_cells(text, text[], boolean, boolean)
    from public, anon, authenticated;
grant execute on function public.get_map_cells(text, text[], boolean, boolean)
    to anon, authenticated, service_role;

commit;
