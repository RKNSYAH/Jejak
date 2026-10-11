-- Keep source labels intact across the workbook tables and legacy aliases.
begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

drop trigger regions_sync_sheet_columns_trg on public.regions;
drop trigger institutions_sync_sheet_columns_trg on public.institutions;
drop view private.static_region_facts;

alter table public.regions
    alter column source_name type varchar(255),
    alter column source type varchar(255);

alter table public.institutions
    alter column source_name type varchar(255),
    alter column source type varchar(255);

alter table public.places
    alter column source type varchar(255);

alter table public.region_data
    alter column source type varchar(255);

alter table public.institution_data
    alter column source type varchar(255);

create trigger regions_sync_sheet_columns_trg
before insert or update of code, name, source, parent_id, region_code, region_name,
    source_name, parent_region_code on public.regions
for each row execute function private.sync_region_sheet_columns();

create trigger institutions_sync_sheet_columns_trg
before insert or update of code, name, source, institution_code, institution_name, source_name
on public.institutions
for each row execute function private.sync_institution_sheet_columns();

alter table public.campuses alter column source_name type varchar(255);
alter table public.public_places alter column source_name type varchar(255);
alter table public.population alter column source_name type varchar(255);
alter table public.labor_force alter column source_name type varchar(255);
alter table public.sector_employment alter column source_name type varchar(255);
alter table public.wages_income alter column source_name type varchar(255);
alter table public.student_enrollment alter column source_name type varchar(255);
alter table public.education_facilities alter column source_name type varchar(255);
alter table public.healthcare_facilities alter column source_name type varchar(255);
alter table public.transport_infrastructure alter column source_name type varchar(255);
alter table public.housing_statistics alter column source_name type varchar(255);
alter table public.cost_of_living alter column source_name type varchar(255);
alter table public.estimation_parameters alter column source_name type varchar(255);

-- Preserve existing fact shape while appending the full-width source name.
create view private.static_region_facts as
select r.id as region_id, r.region_code, f.metric::varchar(80) as metric,
       f.numeric_value, private.metric_unit(f.metric) as unit,
       p.evidence_type::varchar(20) as evidence_type, p.period_start, p.period_end,
       p.source_name::varchar(100) as source, p.source_url,
       p.published_at::timestamptz as published_at, p.retrieved_at::timestamptz as retrieved_at,
       null::integer as sample_size, p.confidence::numeric(5,4) as confidence,
       p.limitations, p.is_sample, p.id as row_id, p.source_name::text as source_name_full
from public.population p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       p.published_at::timestamptz, p.retrieved_at::timestamptz, p.sample_size::integer,
       p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.labor_force p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, (f.metric || ':kbli_' || p.kbli_2020_code)::varchar(80), f.numeric_value,
       private.metric_unit(f.metric), p.evidence_type, p.period_start, p.period_end,
       p.source_name, p.source_url, p.published_at::timestamptz, p.retrieved_at::timestamptz,
       p.sample_size::integer, p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.sector_employment p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','kbli_2020_code','kbli_2020_name','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       p.published_at::timestamptz, p.retrieved_at::timestamptz, p.sample_size::integer,
       p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.wages_income p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       null::timestamptz, p.retrieved_at::timestamptz, null::integer,
       p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.education_facilities p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       null::timestamptz, p.retrieved_at::timestamptz, null::integer,
       p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.healthcare_facilities p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       null::timestamptz, p.retrieved_at::timestamptz, null::integer,
       p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.transport_infrastructure p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code,
       (f.metric || case when p.housing_type = 'kos' then '' else ':' || pg_catalog.regexp_replace(pg_catalog.lower(p.housing_type), '[^a-z0-9]+', '_', 'g') end)::varchar(80),
       f.numeric_value, private.metric_unit(f.metric), p.evidence_type, p.period_start,
       p.period_end, p.source_name, p.source_url, p.published_at::timestamptz,
       p.retrieved_at::timestamptz, p.observation_count::integer, p.confidence,
       p.limitations, p.is_sample, p.id, p.source_name::text
from public.housing_statistics p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','housing_type','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       p.published_at::timestamptz, p.retrieved_at::timestamptz, p.sample_size::integer,
       p.confidence, p.limitations, p.is_sample, p.id, p.source_name::text
from public.cost_of_living p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f;

create or replace function public.get_map_region(
    p_region_code text,
    p_include_sample boolean default false,
    p_include_geometry boolean default true
)
returns table (region_id integer, region_code varchar, region_name varchar,
               parent_code varchar, parent_name varchar, is_sample boolean,
               geometry jsonb, facts jsonb, places jsonb)
language sql stable security definer set search_path = ''
as $function$
    select r.id, r.region_code, r.region_name, parent.region_code, parent.region_name, r.is_sample,
           case when p_include_geometry then extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb else null::jsonb end,
           coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'metric', d.metric, 'value', d.numeric_value, 'unit', d.unit,
                   'source', d.source_name_full, 'source_url', d.source_url,
                   'period_start', d.period_start, 'period_end', d.period_end,
                   'confidence', d.confidence, 'evidence_type', d.evidence_type,
                   'limitations', d.limitations, 'is_sample', d.is_sample,
                   'dimension_key', private.metric_dimension_key(d.metric),
                   'dimension_value', private.metric_dimension_value(d.metric)
               ) order by d.metric)
               from (
                   select distinct on (f.metric) f.*
                   from (
                       select d.metric, d.numeric_value, d.unit, d.source, d.source::text as source_name_full,
                              d.source_url, d.period_start, d.period_end, d.confidence, d.evidence_type,
                              d.limitations, d.is_sample, d.retrieved_at, d.id
                       from public.region_data d
                       where d.region_id = r.id and d.numeric_value is not null
                       union all
                       select d.metric, d.numeric_value, d.unit, d.source, d.source_name_full,
                              d.source_url, d.period_start, d.period_end, d.confidence, d.evidence_type,
                              d.limitations, d.is_sample, d.retrieved_at, d.row_id
                       from private.static_region_facts d where d.region_id = r.id
                   ) f
                   where p_include_sample or not f.is_sample
                   order by f.metric, f.is_sample, f.period_end desc nulls last,
                            f.retrieved_at desc nulls last, f.id desc
               ) d
           ), '[]'::jsonb),
           coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'id', p.id, 'name', p.name, 'category', p.category,
                   'latitude', p.latitude, 'longitude', p.longitude,
                   'source', p.source, 'observed_at', p.observed_at,
                   'is_sample', p.is_sample, 'address', p.address,
                   'website', p.website, 'phone', p.phone, 'operator', p.operator,
                   'source_url', p.source_url, 'osm_type', p.osm_type,
                   'osm_id', p.osm_id, 'osm_tags', p.osm_tags
               ) order by p.category, p.name, p.id)
               from (
                   select legacy.id, legacy.name, legacy.category, legacy.latitude, legacy.longitude,
                          legacy.source, legacy.observed_at, legacy.is_sample, legacy.address,
                          legacy.website, legacy.phone, legacy.operator, legacy.source_url,
                          legacy.osm_type, legacy.osm_id, legacy.osm_tags
                   from public.places legacy
                   where legacy.region_id = r.id
                     and (legacy.is_active or (p_include_sample and legacy.is_sample))
                     and (p_include_sample or not legacy.is_sample)
                   union all
                   select c.id, c.campus_name, 'campus'::varchar, c.latitude, c.longitude,
                          c.source_name, c.observed_at::timestamptz, false, c.address,
                          c.website, c.phone, c.operator, c.source_url, c.osm_type,
                          c.osm_id, c.osm_tags
                   from public.campuses c where c.region_code = r.region_code and c.is_active
                   union all
                   select p.id, p.place_name, p.category, p.latitude, p.longitude,
                          p.source_name, p.observed_at::timestamptz, false, p.address,
                          p.website, p.phone, p.operator, p.source_url, p.osm_type,
                          p.osm_id, p.osm_tags
                   from public.public_places p where p.region_code = r.region_code and p.is_active
               ) p
           ), '[]'::jsonb)
    from public.regions r
    join public.regions parent on parent.id = r.parent_id
    where r.region_code = p_region_code and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample));
$function$;

create or replace function public.get_region_layer(
    p_parent_id integer,
    p_metric varchar default null,
    p_snapshot_type varchar default null,
    p_scope_hash text default null,
    p_region_type varchar default null
)
returns table (
    region_id integer, region_code varchar(64), region_name varchar(160),
    region_type varchar(30), geometry jsonb, metric_data jsonb, snapshot jsonb,
    coverage varchar(20), generated_at timestamptz, refresh_after timestamptz,
    expires_at timestamptz, is_stale boolean, is_expired boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if p_parent_id is null
       or (p_snapshot_type is null) <> (p_scope_hash is null)
       or (p_scope_hash is not null and p_scope_hash !~ '^[0-9a-f]{64}$') then
        raise exception 'parent id and an optional exact snapshot type/hash are required';
    end if;

    return query
    select r.id, r.code, r.name, r.region_type,
           case when r.geometry is null then null
                else extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb end,
           case when d.metric is null then null else pg_catalog.jsonb_build_object(
               'metric', d.metric, 'numeric_value', d.numeric_value,
               'unit', d.unit, 'evidence_type', d.evidence_type,
               'period_start', d.period_start, 'period_end', d.period_end,
               'source', d.source_name_full, 'sample_size', d.sample_size,
               'confidence', d.confidence, 'limitations', d.limitations,
               'dimension_key', private.metric_dimension_key(d.metric),
               'dimension_value', private.metric_dimension_value(d.metric)
           ) end,
           s.snapshot, s.coverage, s.generated_at, s.refresh_after, s.expires_at,
           case when s.id is null then null else s.refresh_after is null
               or s.refresh_after <= pg_catalog.now()
               or coalesce(s.expires_at <= pg_catalog.now(), false) end,
           case when s.id is null then null else coalesce(s.expires_at <= pg_catalog.now(), false) end
    from public.regions r
    left join lateral (
        select fact.*
        from (
            select d.metric, d.numeric_value, d.unit, d.evidence_type, d.period_start,
                   d.period_end, d.source, d.source::text as source_name_full, d.sample_size,
                   d.confidence, d.limitations, d.is_sample, d.published_at, d.retrieved_at, d.id
            from public.region_data d
            where d.region_id = r.id and d.metric = p_metric and not d.is_sample
            union all
            select d.metric, d.numeric_value, d.unit, d.evidence_type, d.period_start,
                   d.period_end, d.source, d.source_name_full, d.sample_size,
                   d.confidence, d.limitations, d.is_sample, d.published_at, d.retrieved_at, d.row_id
            from private.static_region_facts d
            where d.region_id = r.id and d.metric = p_metric and not d.is_sample
        ) fact
        order by fact.period_end desc nulls last, fact.period_start desc nulls last,
                 fact.published_at desc nulls last, fact.retrieved_at desc nulls last, fact.id desc
        limit 1
    ) d on true
    left join lateral (
        select current_snapshot.* from public.region_snapshots current_snapshot
        where current_snapshot.region_id = r.id
          and current_snapshot.snapshot_type = p_snapshot_type
          and current_snapshot.scope_hash = p_scope_hash::char(64)
          and current_snapshot.is_current = true and current_snapshot.status = 'accepted'
        limit 1
    ) s on true
    where r.parent_id = p_parent_id and r.is_supported = true
      and (p_region_type is null or r.region_type = p_region_type)
    order by r.code;
end;
$$;

drop function public.get_region_data(integer, varchar);
create function public.get_region_data(p_region_id integer, p_metric varchar default null)
returns table (
    id bigint, region_id integer, metric varchar(80), numeric_value numeric,
    text_value text, "json_value" jsonb, unit varchar(30), evidence_type varchar(20),
    period_start date, period_end date, source varchar(255), source_url text,
    published_at timestamptz, retrieved_at timestamptz, sample_size integer,
    confidence numeric(5,4), limitations text, is_sample boolean
)
language sql stable security definer set search_path = ''
as $$
    select d.id, d.region_id, d.metric, d.numeric_value, d.text_value, d.json_value,
           d.unit, d.evidence_type, d.period_start, d.period_end, d.source, d.source_url,
           d.published_at, d.retrieved_at, d.sample_size, d.confidence, d.limitations, d.is_sample
    from (
        select f.id, f.region_id, f.metric, f.numeric_value, f.text_value, f.json_value,
               f.unit, f.evidence_type, f.period_start, f.period_end, f.source, f.source_url,
               f.published_at, f.retrieved_at, f.sample_size, f.confidence, f.limitations, f.is_sample
        from public.region_data f
        union all
        select f.row_id, f.region_id, f.metric, f.numeric_value, null::text, null::jsonb,
               f.unit, f.evidence_type, f.period_start, f.period_end, f.source_name_full::varchar(255), f.source_url,
               f.published_at, f.retrieved_at, f.sample_size, f.confidence, f.limitations, f.is_sample
        from private.static_region_facts f
    ) d
    where d.region_id = p_region_id and not d.is_sample
      and (p_metric is null or d.metric = p_metric)
    order by d.metric, d.period_end desc nulls last, d.retrieved_at desc nulls last;
$$;

drop function public.get_public_places(integer, varchar);
create function public.get_public_places(p_region_id integer, p_category varchar default null)
returns table (
    id bigint, region_id integer, institution_id integer, name text, category varchar(30),
    latitude double precision, longitude double precision, address text, website text,
    phone varchar(40), operator text, source varchar(255), observed_at timestamptz,
    osm_type varchar(10), osm_id bigint, osm_tags jsonb, source_url text
)
language sql stable security definer set search_path = ''
as $$
    select p.id, p.region_id, p.institution_id, p.name, p.category, p.latitude, p.longitude,
           p.address, p.website, p.phone, p.operator, p.source, p.observed_at,
           p.osm_type, p.osm_id, p.osm_tags, p.source_url
    from (
        select old.id, old.region_id, old.institution_id, old.name, old.category,
               old.latitude, old.longitude, old.address, old.website, old.phone, old.operator,
               old.source, old.observed_at, old.osm_type, old.osm_id, old.osm_tags, old.source_url
        from public.places old where old.region_id = p_region_id and old.is_active
        union all
        select c.id, r.id, i.id, c.campus_name, 'campus'::varchar,
               c.latitude, c.longitude, c.address, c.website, c.phone, c.operator,
               c.source_name, c.observed_at::timestamptz, c.osm_type, c.osm_id, c.osm_tags, c.source_url
        from public.campuses c join public.regions r on r.region_code = c.region_code
        left join public.institutions i on i.institution_code = c.institution_code
        where c.is_active
        union all
        select p.id, r.id, i.id, p.place_name, p.category,
               p.latitude, p.longitude, p.address, p.website, p.phone, p.operator,
               p.source_name, p.observed_at::timestamptz, p.osm_type, p.osm_id, p.osm_tags, p.source_url
        from public.public_places p join public.regions r on r.region_code = p.region_code
        left join public.institutions i on i.institution_code = p.institution_code
        where p.is_active
    ) p
    where p.region_id = p_region_id and (p_category is null or p.category = p_category)
    order by p.category, p.name;
$$;

drop function public.get_institution_data(integer, bigint);
create function public.get_institution_data(
    p_institution_id integer default null,
    p_campus_place_id bigint default null
)
returns table (
    institution_id integer, institution_code varchar(80), institution_name varchar(240),
    institution_type varchar(30), website text, campus_place_id bigint, metric varchar(80),
    numeric_value numeric, text_value text, "json_value" jsonb, unit varchar(30),
    data_scope varchar(20), academic_year varchar(20), period_start date, period_end date,
    source varchar(255), source_url text, published_at timestamptz, retrieved_at timestamptz,
    evidence_type varchar(20), confidence numeric(5,4), limitations text,
    program_code varchar(80), program_name text
)
language sql stable security definer set search_path = ''
as $$
    select i.id, i.institution_code, i.institution_name, i.institution_type, i.website,
           d.campus_place_id, d.metric, d.numeric_value, d.text_value, d.json_value, d.unit,
           d.data_scope, d.academic_year, d.period_start, d.period_end, d.source, d.source_url,
           d.published_at, d.retrieved_at, d.evidence_type, d.confidence, d.limitations,
           d.program_code, d.program_name
    from (
        select old.institution_id, old.campus_place_id, old.metric, old.numeric_value,
               old.text_value, old.json_value, old.unit, old.data_scope, old.academic_year,
               old.period_start, old.period_end, old.source, old.source_url, old.published_at,
               old.retrieved_at, old.evidence_type, old.confidence, old.limitations,
               null::varchar(80) as program_code, null::text as program_name, old.is_sample
        from public.institution_data old
        union all
        select i.id, p.id, e.metric, e.student_count::numeric, null::text, null::jsonb,
               'students'::varchar, e.data_scope, e.academic_year, e.period_start, e.period_end,
               e.source_name, e.source_url, e.published_at::timestamptz,
               e.retrieved_at::timestamptz, e.evidence_type, e.confidence, e.limitations,
               e.program_code, e.program_name, e.is_sample
        from public.student_enrollment e
        join public.institutions i on i.institution_code = e.institution_code
        left join public.places p on p.osm_type = e.campus_osm_type and p.osm_id = e.campus_osm_id
    ) d
    join public.institutions i on i.id = d.institution_id
    where not d.is_sample
      and (p_institution_id is null or d.institution_id = p_institution_id)
      and (p_campus_place_id is null or d.campus_place_id = p_campus_place_id)
    order by i.institution_name, d.metric, d.academic_year desc nulls last, d.period_end desc nulls last;
$$;

revoke all on function public.get_region_data(integer, varchar) from public, anon, authenticated;
revoke all on function public.get_public_places(integer, varchar) from public, anon, authenticated;
revoke all on function public.get_institution_data(integer, bigint) from public, anon, authenticated;
grant execute on function public.get_region_data(integer, varchar) to anon, authenticated, service_role;
grant execute on function public.get_public_places(integer, varchar) to anon, authenticated, service_role;
grant execute on function public.get_institution_data(integer, bigint) to anon, authenticated, service_role;

commit;
