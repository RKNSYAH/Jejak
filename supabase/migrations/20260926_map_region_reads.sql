-- Demo rows stay sample/unsupported. The public read functions expose them only
-- when the caller explicitly opts into sample data.
alter table public.regions add column if not exists is_sample boolean not null default false;
alter table public.places add column if not exists is_sample boolean not null default false;

update public.regions
set is_sample = true
where source = 'Jejak fictional test fixture'
   or source like 'H3 resolution 9; h3-js v4.3.0 generated test geometry%';

update public.places
set is_sample = true
where source = 'Jejak fictional test fixture';

insert into public.regions (parent_id, code, name, region_type, source, is_supported, is_sample)
select id, 'setiabudi', 'Setiabudi', 'district', 'SAMPLE', false, true
from public.regions where code = 'jakarta-selatan'
on conflict (code) do nothing;

-- Import the existing zone_stats samples without inferring an opportunity score.
insert into public.region_data
    (region_id, metric, numeric_value, unit, evidence_type, source, limitations, is_sample)
select r.id, v.metric, v.value, v.unit, 'estimated', 'SAMPLE',
       'Illustrative zone_stats value; not verified evidence.', true
from public.zone_stats z
join public.regions r on r.code = z.zone_id
cross join lateral (values
    ('population', z.population::numeric, 'people'),
    ('employment_rate', z.employment_rate, 'share'),
    ('company_count', z.number_of_companies::numeric, 'companies'),
    ('schools', z.number_of_schools::numeric, 'schools'),
    ('universities', z.universities::numeric, 'universities'),
    ('public_transport_stops', z.public_transport_stops::numeric, 'stops'),
    ('median_monthly_rent_idr', z.housing_median_rent, 'IDR/month'),
    ('housing_price_index', z.housing_price_index, 'index')
) as v(metric, value, unit)
where z.is_sample = true and v.value is not null
on conflict do nothing;

create or replace function public.get_map_regions(
    p_parent_code text,
    p_include_sample boolean default false
)
returns table (region_id integer, region_code varchar, region_name varchar,
               parent_code varchar, parent_name varchar, is_sample boolean)
language sql stable security definer set search_path = ''
as $function$
    select r.id, r.code, r.name, parent.code, parent.name, r.is_sample
    from public.regions r
    join public.regions parent on parent.id = r.parent_id
    where parent.code = p_parent_code and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    order by r.name;
$function$;

create or replace function public.get_map_region(
    p_region_code text,
    p_include_sample boolean default false
)
returns table (region_id integer, region_code varchar, region_name varchar,
               parent_code varchar, parent_name varchar, is_sample boolean,
               geometry jsonb, facts jsonb, places jsonb)
language sql stable security definer set search_path = ''
as $function$
    select r.id, r.code, r.name, parent.code, parent.name, r.is_sample,
           case when r.geometry is null then null
                else extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb end,
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

revoke all on function public.get_map_regions(text, boolean) from public;
revoke all on function public.get_map_region(text, boolean) from public;
grant execute on function public.get_map_regions(text, boolean) to anon, authenticated;
grant execute on function public.get_map_region(text, boolean) to anon, authenticated;
