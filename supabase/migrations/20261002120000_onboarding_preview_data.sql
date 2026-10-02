begin;
set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jejak:schema-migrations', 0));

create function public.get_onboarding_cities(p_include_sample boolean default false)
returns table (
    city_id varchar, city_name varchar, district_count integer, center jsonb, is_sample boolean
)
language sql stable security definer set search_path = '' as $$
    with supported_cities as (
        select parent.id, count(*)::integer as district_count, pg_catalog.bool_and(district.is_sample) as has_sample
        from public.regions district
        join public.regions parent on parent.id = district.parent_id
        where district.region_type = 'district'
            and ((district.is_supported and not district.is_sample) or (p_include_sample and district.is_sample))
        group by parent.id
    )
    select parent.region_code, parent.region_name, cities.district_count,
        coalesce(
            case when parent.geometry is not null then pg_catalog.jsonb_build_array(
                extensions.ST_X(extensions.ST_PointOnSurface(parent.geometry)),
                extensions.ST_Y(extensions.ST_PointOnSurface(parent.geometry))) end,
            (select pg_catalog.jsonb_build_array(pg_catalog.avg(points.longitude), pg_catalog.avg(points.latitude))
             from (
                 select place.longitude, place.latitude
                 from public.public_places place
                 join public.regions district on district.region_code = place.region_code
                 where district.parent_id = parent.id and place.is_active
                     and place.longitude is not null and place.latitude is not null
                 union all
                 select campus.longitude, campus.latitude
                 from public.campuses campus
                 join public.regions district on district.region_code = campus.region_code
                 where district.parent_id = parent.id and campus.is_active
                     and campus.longitude is not null and campus.latitude is not null
             ) points)
        ), cities.has_sample
    from supported_cities cities
    join public.regions parent on parent.id = cities.id
    where parent.region_type in ('city', 'regency')
    order by parent.region_name, parent.region_code
$$;

create function public.get_onboarding_city_preview(
    p_parent_code text,
    p_include_sample boolean default false
)
returns table (
    region_id integer, region_code varchar, region_name varchar,
    parent_code varchar, parent_name varchar, is_sample boolean,
    center jsonb, geometry jsonb, facts jsonb, campuses jsonb, transit_stop_count integer,
    living_cost_monthly_idr numeric, living_cost_source text, living_cost_source_url text,
    living_cost_limitations text, living_cost_is_sample boolean
)
language sql stable security definer set search_path = '' as $$
    select district.id, district.region_code, district.region_name,
        parent.region_code, parent.region_name, district.is_sample,
        coalesce(
            case when district.geometry is not null then pg_catalog.jsonb_build_array(
                extensions.ST_X(extensions.ST_PointOnSurface(district.geometry)),
                extensions.ST_Y(extensions.ST_PointOnSurface(district.geometry))) end,
            (select pg_catalog.jsonb_build_array(pg_catalog.avg(points.longitude), pg_catalog.avg(points.latitude))
             from (
                 select place.longitude, place.latitude
                 from public.public_places place
                 where place.region_code = district.region_code and place.is_active
                     and place.longitude is not null and place.latitude is not null
                 union all
                 select campus.longitude, campus.latitude
                 from public.campuses campus
                 where campus.region_code = district.region_code and campus.is_active
                     and campus.longitude is not null and campus.latitude is not null
             ) points)
        ),
        case when district.geometry is not null then extensions.ST_AsGeoJSON(district.geometry, 6)::jsonb end,
        details.facts,
        coalesce((select pg_catalog.jsonb_agg(place.value order by place.value ->> 'name')
            from pg_catalog.jsonb_array_elements(details.places) place(value)
            where place.value ->> 'category' = 'campus'), '[]'::jsonb),
        (select pg_catalog.count(*)::integer from pg_catalog.jsonb_array_elements(details.places) place(value)
            where place.value ->> 'category' in ('transit_stop', 'station')),
        costs.living_cost_total_monthly_idr, costs.source_name::text, costs.source_url,
        costs.limitations, costs.is_sample
    from public.regions district
    join public.regions parent on parent.id = district.parent_id
    cross join lateral public.get_map_region(district.region_code, p_include_sample, false) details
    left join lateral (
        select rate.living_cost_total_monthly_idr, rate.source_name, rate.source_url, rate.limitations, rate.is_sample
        from public.living_cost_rates rate
        where rate.region_code = parent.region_code and rate.spending_tier = 'standard'
            and (p_include_sample or not rate.is_sample)
        order by rate.as_of desc, rate.method_version desc
        limit 1
    ) costs on true
    where parent.region_code = p_parent_code and district.region_type = 'district'
        and ((district.is_supported and not district.is_sample) or (p_include_sample and district.is_sample))
    order by district.region_name, district.region_code
$$;

revoke all on function public.get_onboarding_cities(boolean),
    public.get_onboarding_city_preview(text, boolean) from public, anon;
grant execute on function public.get_onboarding_cities(boolean),
    public.get_onboarding_city_preview(text, boolean) to authenticated, service_role;

comment on function public.get_onboarding_cities(boolean) is
    'Supported onboarding cities derived from the current district catalogue; center is boundary-backed or a point-feature estimate.';
comment on function public.get_onboarding_city_preview(text, boolean) is
    'Authenticated onboarding data: district evidence, observed campus points, and city-level estimated living costs. No transit duration is inferred.';

commit;
