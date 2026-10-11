-- Wage-to-rent is a sample ranking aid, not a full living-cost or fit score.
insert into public.region_data
    (region_id, metric, numeric_value, unit, evidence_type, source, limitations, is_sample)
select r.id, 'average_monthly_wage_idr', z.average_wage, 'IDR/month',
       'estimated', 'SAMPLE', 'Illustrative zone_stats value; not verified evidence.', true
from public.zone_stats z
join public.regions r on r.code = z.zone_id
where z.is_sample = true and z.average_wage is not null
on conflict do nothing;

-- The result shape grows to include ranking metadata. Keep the same function
-- name and arguments so existing API callers continue to use one catalogue.
drop function public.get_map_regions(text, boolean);
create function public.get_map_regions(
    p_parent_code text,
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
    where parent.code = p_parent_code and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    order by stats.wage / nullif(stats.rent, 0) desc nulls last,
             stats.population desc nulls last, r.name, r.code;
$function$;

revoke all on function public.get_map_regions(text, boolean) from public;
grant execute on function public.get_map_regions(text, boolean) to anon, authenticated;
