-- A null parent requests the full supported district catalogue. A city code
-- still narrows results for city-level explorers.
create or replace function public.get_map_regions(
    p_parent_code text default null,
    p_include_sample boolean default false
)
returns table (region_id integer, region_code varchar, region_name varchar,
               parent_code varchar, parent_name varchar, is_sample boolean,
               average_monthly_wage_idr numeric, median_monthly_rent_idr numeric,
               population numeric, wage_to_rent_ratio numeric)
language sql stable security definer set search_path = ''
as $function$
    select r.id, r.code, r.name, parent.code, parent.name, r.is_sample,
           stats.wage, stats.rent, stats.population,
           pg_catalog.round(stats.wage / nullif(stats.rent, 0), 2)
    from public.regions r
    join public.regions parent on parent.id = r.parent_id
    left join lateral (
        select pg_catalog.max(d.numeric_value) filter (where d.metric = 'average_monthly_wage_idr') as wage,
               pg_catalog.max(d.numeric_value) filter (where d.metric = 'median_monthly_rent_idr') as rent,
               pg_catalog.max(d.numeric_value) filter (where d.metric = 'population') as population
        from (
            select distinct on (fact.metric) fact.metric, fact.numeric_value
            from public.region_data fact
            where fact.region_id = r.id and fact.numeric_value is not null
              and fact.metric in ('average_monthly_wage_idr', 'median_monthly_rent_idr', 'population')
              and (p_include_sample or not fact.is_sample)
            order by fact.metric, fact.is_sample, fact.period_end desc nulls last,
                     fact.retrieved_at desc nulls last, fact.id desc
        ) d
    ) stats on true
    where (p_parent_code is null or parent.code = p_parent_code)
      and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    order by stats.wage / nullif(stats.rent, 0) desc nulls last,
             stats.population desc nulls last, r.name, r.code;
$function$;
