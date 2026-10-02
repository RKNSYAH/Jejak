-- Prepare the reviewed workbook contract. No research data is loaded here.
begin;
set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jejak:schema-migrations', 0));

-- Preserve the source's unclassified feature without inventing an administrative
-- identity, official codes, supported map unit, or boundary.
alter table public.regions drop constraint regions_type_ck;
alter table public.regions
    add constraint regions_type_ck check (region_type in (
        'country','province','regency','city','district','neighborhood','grid','metro','unclassified_area')),
    add constraint regions_unclassified_safety_ck check (region_type <> 'unclassified_area' or (
        not is_supported and geometry is null and kemendagri_code is null and bps_code is null));

alter table public.regions
    add column source_url text,
    add column code_source_name varchar(255),
    add column code_source_url text,
    add constraint regions_source_url_ck check (source_url is null or source_url ~ '^https://'),
    add constraint regions_code_source_url_ck check (code_source_url is null or code_source_url ~ '^https://');

-- Unknown is not the same as active. Existing explicit values stay unchanged.
alter table public.institutions alter column is_active drop not null;
alter table public.public_places alter column place_name drop not null;
-- PostgreSQL cannot widen a view-dependent column. Preserve the exact installed
-- read definition rather than change its metrics/provenance contract.
do $$
declare view_definition text;
begin
    view_definition := pg_catalog.pg_get_viewdef('private.static_region_facts'::regclass, true);
    drop view private.static_region_facts;
    alter table public.sector_employment
        alter column kbli_2020_code type varchar(64),
        add column source_sector_code text;
    execute 'create view private.static_region_facts as ' || view_definition;
end;
$$;
revoke all on private.static_region_facts from public, anon, authenticated;
alter table public.sector_mapping alter column kbli_2020_code type varchar(64);

-- Names identify distinct programs only when the source has no official code.
alter table public.student_enrollment
    add column program_identity text generated always as (
        case when program_code is not null then 'code:' || program_code
             when program_name is not null then 'name:' || program_name end
    ) stored,
    add constraint student_enrollment_program_identity_ck check (
        data_scope <> 'program' or nullif(program_code, '') is not null or nullif(program_name, '') is not null
    );
drop index public.student_enrollment_import_uq;
create unique index student_enrollment_import_uq on public.student_enrollment(
    institution_code, campus_osm_type, campus_osm_id, metric, data_scope,
    program_identity, academic_year, period_start, period_end, source_name
) nulls not distinct;
create unique index campuses_non_osm_identity_uq on public.campuses(institution_code, campus_name)
    where osm_type is null and osm_id is null;

-- Scenario dates mean preparation/as-of dates, NOT a common source observation period.
create table public.living_cost_rates (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    spending_tier varchar(20) not null check (spending_tier in ('budget', 'standard', 'comfortable', 'premium')),
    food_monthly_idr numeric not null check (food_monthly_idr >= 0),
    utilities_monthly_idr numeric not null check (utilities_monthly_idr >= 0),
    transport_monthly_idr numeric not null check (transport_monthly_idr >= 0),
    connectivity_monthly_idr numeric not null check (connectivity_monthly_idr >= 0),
    laundry_monthly_idr numeric not null check (laundry_monthly_idr >= 0),
    living_cost_total_monthly_idr numeric not null,
    persons integer not null check (persons > 0),
    source_name varchar(255) not null,
    source_url text not null check (source_url ~ '^https://'),
    retrieved_at date not null,
    evidence_type varchar(20) not null check (evidence_type = 'estimated'),
    assumptions text not null,
    limitations text not null,
    is_sample boolean not null,
    as_of date not null,
    method_version varchar(80) not null,
    constraint living_cost_rates_total_ck check (living_cost_total_monthly_idr =
        food_monthly_idr + utilities_monthly_idr + transport_monthly_idr + connectivity_monthly_idr + laundry_monthly_idr),
    constraint living_cost_rates_import_uq unique (region_code, spending_tier, as_of, method_version)
);
create table public.monthly_budgets (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    spending_tier varchar(20) not null check (spending_tier in ('budget', 'standard', 'comfortable', 'premium')),
    housing_type varchar(30) not null,
    rent_monthly_idr numeric not null check (rent_monthly_idr >= 0),
    living_cost_monthly_idr numeric not null check (living_cost_monthly_idr >= 0),
    total_monthly_idr numeric not null,
    rent_observation_count integer not null check (rent_observation_count > 0),
    rent_percentile numeric not null check (rent_percentile between 0 and 1),
    persons integer not null check (persons > 0),
    source_name varchar(255) not null,
    source_url text not null check (source_url ~ '^https://'),
    retrieved_at date not null,
    evidence_type varchar(20) not null check (evidence_type = 'estimated'),
    limitations text not null,
    is_sample boolean not null,
    as_of date not null,
    method_version varchar(80) not null,
    constraint monthly_budgets_total_ck check (total_monthly_idr = rent_monthly_idr + living_cost_monthly_idr),
    constraint monthly_budgets_living_cost_fk foreign key (region_code, spending_tier, as_of, method_version)
        references public.living_cost_rates(region_code, spending_tier, as_of, method_version) on delete restrict,
    constraint monthly_budgets_import_uq unique (region_code, spending_tier, housing_type, as_of, method_version)
);
create index monthly_budgets_living_cost_idx
    on public.monthly_budgets(region_code, spending_tier, as_of, method_version);

-- Keep every citation, while the existing API's source_url stays one usable URL.
create function private.valid_source_urls(p_urls jsonb)
returns boolean language sql immutable set search_path = '' as $$
    select case when pg_catalog.jsonb_typeof(p_urls) is distinct from 'array' then false else not exists (
        select 1 from pg_catalog.jsonb_array_elements(p_urls) as u(value)
        where pg_catalog.jsonb_typeof(u.value) <> 'string' or u.value #>> '{}' !~ '^https://[^[:space:]]+$'
    ) end
$$;
do $$
declare t text;
begin
    foreach t in array array['regions','institutions','campuses','public_places','population','labor_force',
        'sector_employment','wages_income','student_enrollment','education_facilities','healthcare_facilities',
        'transport_infrastructure','housing_statistics','cost_of_living','living_cost_rates','monthly_budgets'] loop
        execute pg_catalog.format('alter table public.%I add column source_urls jsonb not null default ''[]''::jsonb,
            add constraint %I check (private.valid_source_urls(source_urls))', t, t || '_source_urls_ck');
    end loop;
end;
$$;

create table private.static_import_batches (
    workbook_sha256 text not null check (workbook_sha256 ~ '^[0-9a-f]{64}$'),
    method_version varchar(80) not null,
    source_file text not null,
    report jsonb not null check (pg_catalog.jsonb_typeof(report) = 'object'),
    prepared_at timestamptz not null default pg_catalog.now(),
    primary key (workbook_sha256, method_version)
);
create table private.static_import_rows (
    workbook_sha256 text not null,
    method_version varchar(80) not null,
    sheet text not null,
    row_number integer not null check (row_number >= 2),
    target_table text not null,
    status text not null check (status in ('prepared', 'review', 'baseline')),
    dependency_order integer not null default 0,
    raw_data jsonb not null,
    payload jsonb not null,
    formulas jsonb not null,
    issues jsonb not null,
    transformations jsonb not null,
    primary key (workbook_sha256, method_version, sheet, row_number),
    foreign key (workbook_sha256, method_version)
        references private.static_import_batches(workbook_sha256, method_version) on delete restrict
);
create index static_import_rows_status_idx on private.static_import_rows(workbook_sha256, method_version, target_table, status);
alter table private.static_import_batches enable row level security;
alter table private.static_import_rows enable row level security;
grant usage on schema private to service_role;
revoke all on private.static_import_batches, private.static_import_rows from public, anon, authenticated;
grant select, insert, update on private.static_import_batches, private.static_import_rows to service_role;
alter table public.living_cost_rates enable row level security;
alter table public.monthly_budgets enable row level security;
revoke all on public.living_cost_rates, public.monthly_budgets from public, anon, authenticated;
grant select, insert, update, delete on public.living_cost_rates, public.monthly_budgets to service_role;
revoke all on sequence public.living_cost_rates_id_seq, public.monthly_budgets_id_seq from public, anon, authenticated;
grant usage, select on sequence public.living_cost_rates_id_seq, public.monthly_budgets_id_seq to service_role;

-- A kelurahan feature is visible in its parent kecamatan without relabelling it.
-- City/province-only points are NOT assigned to districts without trusted geometry.
create function private.static_place_rows(p_region_id integer, p_include_sample boolean default false)
returns table (
    id bigint, region_id integer, institution_id integer, name text, category varchar(30),
    latitude double precision, longitude double precision, address text, website text,
    phone varchar(40), operator text, source varchar(255), observed_at timestamptz,
    osm_type varchar(10), osm_id bigint, osm_tags jsonb, source_url text, is_sample boolean
)
language sql stable set search_path = '' as $$
    with recursive allowed_regions(id) as (
        select r.id from public.regions r where r.id = p_region_id and (p_include_sample or not r.is_sample)
        union
        select r.id from public.regions r join allowed_regions a on a.id = r.parent_id
        where p_include_sample or not r.is_sample
    )
    select p.id, p.region_id, p.institution_id, p.name, p.category, p.latitude, p.longitude,
           p.address, p.website, p.phone, p.operator, p.source, p.observed_at,
           p.osm_type, p.osm_id, p.osm_tags, p.source_url, p.is_sample
    from public.places p join allowed_regions a on a.id = p.region_id
    where (p.is_active or (p_include_sample and p.is_sample)) and (p_include_sample or not p.is_sample)
    union all
    select c.id, r.id, i.id, c.campus_name, 'campus'::varchar, c.latitude, c.longitude,
           c.address, c.website, c.phone, c.operator, c.source_name, c.observed_at::timestamptz,
           c.osm_type, c.osm_id, c.osm_tags, c.source_url, false
    from public.campuses c join public.regions r using(region_code) join allowed_regions a on a.id = r.id
    left join public.institutions i using(institution_code) where c.is_active
    union all
    select p.id, r.id, i.id,
           coalesce(nullif(p.place_name, ''), case p.category when 'transit_stop' then 'Halte tanpa nama'
               when 'station' then 'Stasiun tanpa nama' when 'hospital' then 'Rumah sakit tanpa nama'
               else 'Fasilitas tanpa nama' end),
           p.category, p.latitude, p.longitude, p.address, p.website, p.phone, p.operator,
           p.source_name, p.observed_at::timestamptz, p.osm_type, p.osm_id, p.osm_tags, p.source_url, false
    from public.public_places p join public.regions r using(region_code) join allowed_regions a on a.id = r.id
    left join public.institutions i using(institution_code) where p.is_active
$$;

create or replace function public.get_public_places(p_region_id integer, p_category varchar default null)
returns table (
    id bigint, region_id integer, institution_id integer, name text, category varchar(30),
    latitude double precision, longitude double precision, address text, website text,
    phone varchar(40), operator text, source varchar(255), observed_at timestamptz,
    osm_type varchar(10), osm_id bigint, osm_tags jsonb, source_url text
)
language sql stable security definer set search_path = '' as $$
    select p.id, p.region_id, p.institution_id, p.name, p.category, p.latitude, p.longitude,
           p.address, p.website, p.phone, p.operator, p.source, p.observed_at,
           p.osm_type, p.osm_id, p.osm_tags, p.source_url
    from private.static_place_rows(p_region_id, false) p
    where p_category is null or p.category = p_category
    order by p.category, p.name, p.id
$$;

create or replace function public.get_map_region(
    p_region_code text, p_include_sample boolean default false, p_include_geometry boolean default true
)
returns table (region_id integer, region_code varchar, region_name varchar,
    parent_code varchar, parent_name varchar, is_sample boolean, geometry jsonb, facts jsonb, places jsonb)
language sql stable security definer set search_path = '' as $$
    select r.id, r.region_code, r.region_name, parent.region_code, parent.region_name, r.is_sample,
        case when p_include_geometry then extensions.ST_AsGeoJSON(r.geometry, 6)::jsonb else null::jsonb end,
        coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'metric', d.metric, 'value', d.numeric_value, 'unit', d.unit,
            'source', d.source_name_full, 'source_url', d.source_url,
            'period_start', d.period_start, 'period_end', d.period_end,
            'confidence', d.confidence, 'evidence_type', d.evidence_type,
            'limitations', d.limitations, 'is_sample', d.is_sample,
            'dimension_key', private.metric_dimension_key(d.metric),
            'dimension_value', private.metric_dimension_value(d.metric)) order by d.metric)
            from (select distinct on (f.metric) f.* from (
                select d.metric, d.numeric_value, d.unit, d.source::text as source_name_full,
                    d.source_url, d.period_start, d.period_end, d.confidence, d.evidence_type,
                    d.limitations, d.is_sample, d.retrieved_at, d.id
                from public.region_data d where d.region_id = r.id and d.numeric_value is not null
                union all
                select d.metric, d.numeric_value, d.unit, d.source_name_full,
                    d.source_url, d.period_start, d.period_end, d.confidence, d.evidence_type,
                    d.limitations, d.is_sample, d.retrieved_at, d.row_id
                from private.static_region_facts d where d.region_id = r.id
            ) f where p_include_sample or not f.is_sample
            order by f.metric, f.is_sample, f.period_end desc nulls last, f.retrieved_at desc nulls last, f.id desc) d
        ), '[]'::jsonb),
        coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', p.id, 'name', p.name, 'category', p.category, 'latitude', p.latitude, 'longitude', p.longitude,
            'source', p.source, 'observed_at', p.observed_at, 'is_sample', p.is_sample,
            'address', p.address, 'website', p.website, 'phone', p.phone, 'operator', p.operator,
            'source_url', p.source_url, 'osm_type', p.osm_type, 'osm_id', p.osm_id, 'osm_tags', p.osm_tags
        ) order by p.category, p.name, p.id) from private.static_place_rows(r.id, p_include_sample) p), '[]'::jsonb)
    from public.regions r join public.regions parent on parent.id = r.parent_id
    where r.region_code = p_region_code and r.region_type = 'district'
        and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
$$;

revoke all on function private.static_place_rows(integer, boolean), private.valid_source_urls(jsonb) from public, anon, authenticated;
grant execute on function private.static_place_rows(integer, boolean), private.valid_source_urls(jsonb) to service_role;
revoke all on function public.get_map_region(text, boolean, boolean), public.get_public_places(integer, varchar) from public;
grant execute on function public.get_map_region(text, boolean, boolean), public.get_public_places(integer, varchar) to anon, authenticated, service_role;
comment on table public.living_cost_rates is 'Estimated one-person spending scenarios; never observed cost distributions or regional totals.';
comment on table public.monthly_budgets is 'Estimated rent plus spending scenarios, versioned separately from prepared observed statistics.';
comment on table private.static_import_rows is 'Original worksheet rows and deterministic transformations, including unresolved rows not promoted to public datasets.';
commit;
