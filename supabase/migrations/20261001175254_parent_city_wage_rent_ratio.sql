begin;
set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jejak:schema-migrations', 0));

-- Compare a kecamatan's rent with the average wage recorded for its parent city/regency.
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
    select r.id, r.region_code, r.region_name, parent.region_code, parent.region_name, r.is_sample,
           stats.wage, stats.rent, stats.population,
           pg_catalog.round(parent_wage.wage / nullif(stats.rent, 0), 2)
    from public.regions r
    join public.regions parent on parent.id = r.parent_id
    left join lateral (
        select pg_catalog.max(d.numeric_value) filter (where d.metric = 'average_monthly_wage_idr') as wage,
               pg_catalog.max(d.numeric_value) filter (where d.metric = 'median_monthly_rent_idr') as rent,
               pg_catalog.max(d.numeric_value) filter (where d.metric = 'population') as population
        from (
            select distinct on (fact.metric) fact.metric, fact.numeric_value
            from (
                select d.metric, d.numeric_value, d.is_sample, d.period_end, d.retrieved_at, d.id
                from public.region_data d where d.region_id = r.id and d.numeric_value is not null
                union all
                select d.metric, d.numeric_value, d.is_sample, d.period_end, d.retrieved_at, d.row_id
                from private.static_region_facts d where d.region_id = r.id
            ) fact
            where fact.metric in ('average_monthly_wage_idr', 'median_monthly_rent_idr', 'population')
              and (p_include_sample or not fact.is_sample)
            order by fact.metric, fact.is_sample, fact.period_end desc nulls last,
                     fact.retrieved_at desc nulls last, fact.id desc
        ) d
    ) stats on true
    left join lateral (
        select fact.numeric_value as wage
        from (
            select d.numeric_value, d.is_sample, d.period_end, d.retrieved_at, d.id
            from public.region_data d
            where d.region_id = parent.id
              and d.metric = 'average_monthly_wage_idr'
              and d.numeric_value is not null
            union all
            select d.numeric_value, d.is_sample, d.period_end, d.retrieved_at, d.row_id
            from private.static_region_facts d
            where d.region_id = parent.id
              and d.metric = 'average_monthly_wage_idr'
              and d.numeric_value is not null
        ) fact
        where p_include_sample or not fact.is_sample
        order by fact.is_sample, fact.period_end desc nulls last,
                 fact.retrieved_at desc nulls last, fact.id desc
        limit 1
    ) parent_wage on true
    where (p_parent_code is null or parent.region_code = p_parent_code)
      and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    order by parent_wage.wage / nullif(stats.rent, 0) desc nulls last,
             stats.population desc nulls last, r.region_name, r.region_code;
$function$;

commit;
