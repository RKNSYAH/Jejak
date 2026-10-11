-- Store prepared static data in the same wide, sheet-shaped form used by the
-- research workbook. Keep the old application tables/RPC response contracts
-- available while new imports move to these tables.
begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

-- The catalogue keeps its existing internal IDs. Sheet-facing names are the
-- canonical import columns; legacy aliases remain synchronized for old RPCs.
alter table public.regions
    add column region_code varchar(64),
    add column region_name varchar(160),
    add column parent_region_code varchar(64),
    add column kemendagri_code varchar(32),
    add column bps_code varchar(32),
    add column source_name varchar(160);

update public.regions r
set region_code = r.code,
    region_name = r.name,
    parent_region_code = parent.code,
    source_name = r.source
from public.regions parent
where parent.id = r.parent_id;

update public.regions
set region_code = code,
    region_name = name,
    source_name = source
where region_code is null;

alter table public.regions
    alter column source_updated_at type date using source_updated_at::date;

alter table public.regions
    alter column region_code set not null,
    alter column region_name set not null,
    add constraint regions_region_code_uq unique (region_code),
    add constraint regions_parent_region_code_fk
        foreign key (parent_region_code) references public.regions(region_code) on delete restrict;

create index regions_parent_region_code_type_idx
    on public.regions (parent_region_code, region_type);

create function private.sync_region_sheet_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' then
        if new.region_code is distinct from old.region_code and new.code is not distinct from old.code then
            new.code := new.region_code;
        elsif new.code is distinct from old.code and new.region_code is not distinct from old.region_code then
            new.region_code := new.code;
        end if;
        if new.region_name is distinct from old.region_name and new.name is not distinct from old.name then
            new.name := new.region_name;
        elsif new.name is distinct from old.name and new.region_name is not distinct from old.region_name then
            new.region_name := new.name;
        end if;
        if new.source_name is distinct from old.source_name and new.source is not distinct from old.source then
            new.source := new.source_name;
        elsif new.source is distinct from old.source and new.source_name is not distinct from old.source_name then
            new.source_name := new.source;
        end if;
        if new.parent_region_code is distinct from old.parent_region_code and new.parent_id is not distinct from old.parent_id then
            if new.parent_region_code is null then
                new.parent_id := null;
            else
                select parent.id into new.parent_id
                from public.regions parent where parent.region_code = new.parent_region_code;
            end if;
        elsif new.parent_id is distinct from old.parent_id and new.parent_region_code is not distinct from old.parent_region_code then
            if new.parent_id is null then
                new.parent_region_code := null;
            else
                select parent.region_code into new.parent_region_code
                from public.regions parent where parent.id = new.parent_id;
            end if;
        end if;
    end if;

    if new.region_code is null then new.region_code := new.code; end if;
    if new.code is null then new.code := new.region_code; end if;
    if new.region_code <> new.code then raise exception 'code and region_code must match'; end if;

    if new.region_name is null then new.region_name := new.name; end if;
    if new.name is null then new.name := new.region_name; end if;
    if new.region_name <> new.name then raise exception 'name and region_name must match'; end if;

    if new.source_name is null then new.source_name := new.source; end if;
    if new.source is null then new.source := new.source_name; end if;
    if new.source_name is distinct from new.source then raise exception 'source and source_name must match'; end if;

    if new.parent_region_code is null and new.parent_id is not null then
        select parent.region_code into new.parent_region_code
        from public.regions parent where parent.id = new.parent_id;
    elsif new.parent_region_code is not null and new.parent_id is null then
        select parent.id into new.parent_id
        from public.regions parent where parent.region_code = new.parent_region_code;
    elsif new.parent_region_code is distinct from (
        select parent.region_code from public.regions parent where parent.id = new.parent_id
    ) then
        raise exception 'parent_id and parent_region_code must identify the same region';
    end if;
    return new;
end;
$$;

create trigger regions_sync_sheet_columns_trg
before insert or update of code, name, source, parent_id, region_code, region_name,
    source_name, parent_region_code on public.regions
for each row execute function private.sync_region_sheet_columns();

create unique index regions_kemendagri_code_uq
    on public.regions (kemendagri_code) where kemendagri_code is not null;
create unique index regions_bps_code_uq
    on public.regions (bps_code) where bps_code is not null;

alter table public.institutions
    add column institution_code varchar(80),
    add column institution_name varchar(240),
    add column source_name varchar(100);

update public.institutions
set institution_code = code,
    institution_name = name,
    source_name = source;

alter table public.institutions
    alter column institution_code set not null,
    alter column institution_name set not null,
    add constraint institutions_institution_code_uq unique (institution_code);

create function private.sync_institution_sheet_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' then
        if new.institution_code is distinct from old.institution_code and new.code is not distinct from old.code then
            new.code := new.institution_code;
        elsif new.code is distinct from old.code and new.institution_code is not distinct from old.institution_code then
            new.institution_code := new.code;
        end if;
        if new.institution_name is distinct from old.institution_name and new.name is not distinct from old.name then
            new.name := new.institution_name;
        elsif new.name is distinct from old.name and new.institution_name is not distinct from old.institution_name then
            new.institution_name := new.name;
        end if;
        if new.source_name is distinct from old.source_name and new.source is not distinct from old.source then
            new.source := new.source_name;
        elsif new.source is distinct from old.source and new.source_name is not distinct from old.source_name then
            new.source_name := new.source;
        end if;
    end if;
    if new.institution_code is null then new.institution_code := new.code; end if;
    if new.code is null then new.code := new.institution_code; end if;
    if new.institution_code <> new.code then raise exception 'code and institution_code must match'; end if;
    if new.institution_name is null then new.institution_name := new.name; end if;
    if new.name is null then new.name := new.institution_name; end if;
    if new.institution_name <> new.name then raise exception 'name and institution_name must match'; end if;
    if new.source_name is null then new.source_name := new.source; end if;
    if new.source is null then new.source := new.source_name; end if;
    if new.source_name is distinct from new.source then raise exception 'source and source_name must match'; end if;
    return new;
end;
$$;

create trigger institutions_sync_sheet_columns_trg
before insert or update of code, name, source, institution_code, institution_name, source_name
on public.institutions
for each row execute function private.sync_institution_sheet_columns();

-- Place sheets use their stable source identifiers and names. Internal IDs are
-- retained solely for API output and repeatable upserts.
create table public.campuses (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    institution_code varchar(80) not null references public.institutions(institution_code) on delete restrict,
    region_code varchar(64) references public.regions(region_code) on delete restrict,
    campus_name text not null,
    osm_type varchar(10),
    osm_id bigint,
    osm_tags jsonb not null default '{}'::jsonb,
    latitude double precision not null,
    longitude double precision not null,
    address text,
    website text,
    phone varchar(40),
    operator text,
    source_name varchar(100) not null,
    source_url text,
    observed_at date,
    is_active boolean not null default true,
    constraint campuses_osm_type_ck check (osm_type is null or osm_type in ('node', 'way', 'relation')),
    constraint campuses_osm_identity_ck check ((osm_type is null and osm_id is null) or (osm_type is not null and osm_id is not null and osm_id > 0)),
    constraint campuses_latitude_ck check (latitude between -90 and 90),
    constraint campuses_longitude_ck check (longitude between -180 and 180),
    constraint campuses_osm_identity_uq unique (osm_type, osm_id),
    constraint campuses_institution_osm_identity_uq unique (institution_code, osm_type, osm_id),
    constraint campuses_osm_tags_object_ck check (pg_catalog.jsonb_typeof(osm_tags) = 'object'),
    constraint campuses_website_ck check (website is null or website ~ '^https://'),
    constraint campuses_source_url_ck check (source_url is null or source_url ~ '^https://')
);

create index campuses_region_code_idx on public.campuses(region_code);
create index campuses_institution_code_idx on public.campuses(institution_code);

create table public.public_places (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) references public.regions(region_code) on delete restrict,
    institution_code varchar(80) references public.institutions(institution_code) on delete restrict,
    place_name text not null,
    category varchar(30) not null,
    osm_type varchar(10),
    osm_id bigint,
    osm_tags jsonb not null default '{}'::jsonb,
    latitude double precision not null,
    longitude double precision not null,
    address text,
    operator text,
    website text,
    phone varchar(40),
    source_name varchar(100) not null,
    source_url text,
    observed_at date,
    is_active boolean not null default true,
    constraint public_places_category_ck check (category in ('campus', 'transit_stop', 'station', 'hospital', 'public_facility', 'other')),
    constraint public_places_osm_type_ck check (osm_type is null or osm_type in ('node', 'way', 'relation')),
    constraint public_places_osm_identity_ck check ((osm_type is null and osm_id is null) or (osm_type is not null and osm_id is not null and osm_id > 0)),
    constraint public_places_latitude_ck check (latitude between -90 and 90),
    constraint public_places_longitude_ck check (longitude between -180 and 180),
    constraint public_places_osm_tags_object_ck check (pg_catalog.jsonb_typeof(osm_tags) = 'object'),
    constraint public_places_website_ck check (website is null or website ~ '^https://'),
    constraint public_places_source_url_ck check (source_url is null or source_url ~ '^https://')
);

create unique index public_places_osm_identity_uq on public.public_places (osm_type, osm_id)
where osm_type is not null and osm_id is not null;
create index public_places_region_code_idx on public.public_places(region_code);
create index public_places_institution_code_idx on public.public_places(institution_code);

create function private.check_sheet_provenance(
    p_evidence_type varchar,
    p_period_start date,
    p_period_end date,
    p_sample_size bigint,
    p_confidence numeric,
    p_source_url text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select p_evidence_type in ('observed', 'estimated', 'derived', 'unavailable')
       and (p_period_start is null or p_period_end is null or p_period_end >= p_period_start)
       and (p_sample_size is null or p_sample_size >= 0)
       and (p_confidence is null or p_confidence between 0 and 1)
       and (p_source_url is null or p_source_url ~ '^https://')
$$;

create table public.population (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    population bigint,
    male_population bigint,
    female_population bigint,
    working_age_population bigint,
    households bigint,
    population_density numeric,
    urban_population bigint,
    rural_population bigint,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint population_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, null, confidence, source_url)),
    constraint population_source_url_ck check (source_url is null or source_url ~ '^https://')
);
create unique index population_import_uq on public.population(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.labor_force (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    labor_force bigint,
    employed_people bigint,
    unemployed_people bigint,
    unemployment_rate numeric,
    labor_force_participation_rate numeric,
    working_age_population bigint,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    sample_size bigint,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint labor_force_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, sample_size, confidence, source_url)),
    constraint labor_force_rates_ck check ((unemployment_rate is null or unemployment_rate between 0 and 1) and (labor_force_participation_rate is null or labor_force_participation_rate between 0 and 1))
);
create unique index labor_force_import_uq on public.labor_force(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.sector_employment (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    kbli_2020_code varchar(10) not null,
    kbli_2020_name text not null,
    employed_people bigint,
    employment_percentage numeric,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    sample_size bigint,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint sector_employment_kbli_ck check (kbli_2020_code ~ '^[a-u](_[a-u])*$'),
    constraint sector_employment_rate_ck check (employment_percentage is null or employment_percentage between 0 and 1),
    constraint sector_employment_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, sample_size, confidence, source_url))
);
create unique index sector_employment_import_uq on public.sector_employment(region_code, kbli_2020_code, period_start, period_end, source_name) nulls not distinct;

create table public.wages_income (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    average_monthly_wage_idr numeric,
    median_monthly_wage_idr numeric,
    minimum_wage_idr numeric,
    median_household_income_idr numeric,
    average_household_expenditure_idr numeric,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    sample_size bigint,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint wages_income_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, sample_size, confidence, source_url))
);
create unique index wages_income_import_uq on public.wages_income(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.student_enrollment (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    institution_code varchar(80) not null references public.institutions(institution_code) on delete restrict,
    campus_osm_type varchar(10),
    campus_osm_id bigint,
    metric varchar(80) not null,
    student_count bigint,
    data_scope varchar(20) not null,
    program_code varchar(80),
    program_name text,
    academic_year varchar(20),
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint student_enrollment_scope_ck check (data_scope in ('institution', 'campus', 'program', 'unknown')),
    constraint student_enrollment_metric_ck check (metric in ('enrolled_students', 'active_students', 'new_student_intake', 'graduates', 'international_students', 'program_enrollment')),
    constraint student_enrollment_campus_ck check ((campus_osm_type is null and campus_osm_id is null) or (campus_osm_type in ('node', 'way', 'relation') and campus_osm_id is not null and campus_osm_id > 0)),
    constraint student_enrollment_scope_identity_ck check ((data_scope = 'campus' and campus_osm_id is not null) or (data_scope in ('institution', 'unknown') and campus_osm_id is null) or data_scope = 'program'),
    constraint student_enrollment_count_ck check (student_count is null or student_count >= 0),
    constraint student_enrollment_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, null, confidence, source_url)),
    constraint student_enrollment_campus_fk foreign key (institution_code, campus_osm_type, campus_osm_id)
        references public.campuses(institution_code, osm_type, osm_id) on delete restrict
);
create unique index student_enrollment_import_uq on public.student_enrollment(
    institution_code, campus_osm_type, campus_osm_id, metric, data_scope,
    program_code, academic_year, period_start, period_end, source_name
) nulls not distinct;
create index student_enrollment_institution_year_idx on public.student_enrollment(institution_code, academic_year desc);

create table public.education_facilities (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    schools bigint,
    vocational_schools bigint,
    universities bigint,
    polytechnics bigint,
    training_centers bigint,
    public_schools bigint,
    private_schools bigint,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    retrieved_at date,
    evidence_type varchar(20) not null,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint education_facilities_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, null, confidence, source_url))
);
create unique index education_facilities_import_uq on public.education_facilities(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.healthcare_facilities (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    hospitals bigint,
    public_hospitals bigint,
    private_hospitals bigint,
    health_centers bigint,
    clinics bigint,
    pharmacies bigint,
    hospital_beds bigint,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    retrieved_at date,
    evidence_type varchar(20) not null,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint healthcare_facilities_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, null, confidence, source_url))
);
create unique index healthcare_facilities_import_uq on public.healthcare_facilities(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.transport_infrastructure (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    public_transport_stops bigint,
    train_stations bigint,
    bus_stations bigint,
    transit_stations bigint,
    airport_count bigint,
    port_count bigint,
    road_length_km numeric,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    retrieved_at date,
    evidence_type varchar(20) not null,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint transport_infrastructure_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, null, confidence, source_url))
);
create unique index transport_infrastructure_import_uq on public.transport_infrastructure(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.housing_statistics (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    housing_type varchar(30) not null,
    median_monthly_rent_idr numeric,
    average_monthly_rent_idr numeric,
    minimum_monthly_rent_idr numeric,
    maximum_monthly_rent_idr numeric,
    observation_count bigint,
    housing_price_index numeric,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint housing_statistics_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, null, confidence, source_url)),
    constraint housing_statistics_range_ck check (minimum_monthly_rent_idr is null or maximum_monthly_rent_idr is null or maximum_monthly_rent_idr >= minimum_monthly_rent_idr)
);
create unique index housing_statistics_import_uq on public.housing_statistics(region_code, housing_type, period_start, period_end, source_name) nulls not distinct;

create table public.cost_of_living (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_code varchar(64) not null references public.regions(region_code) on delete restrict,
    food_monthly_idr numeric,
    utilities_monthly_idr numeric,
    transport_monthly_idr numeric,
    connectivity_monthly_idr numeric,
    household_expenditure_monthly_idr numeric,
    consumer_price_index numeric,
    inflation_rate numeric,
    period_start date,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    retrieved_at date,
    evidence_type varchar(20) not null,
    sample_size bigint,
    confidence numeric(5,4),
    limitations text,
    is_sample boolean not null default false,
    constraint cost_of_living_provenance_ck check (private.check_sheet_provenance(evidence_type, period_start, period_end, sample_size, confidence, source_url)),
    constraint cost_of_living_inflation_ck check (inflation_rate is null or inflation_rate between -1 and 10)
);
create unique index cost_of_living_import_uq on public.cost_of_living(region_code, period_start, period_end, source_name) nulls not distinct;

create table public.sector_mapping (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    kbli_2020_code varchar(10) not null,
    kbli_2020_name text not null,
    jejak_sector_id varchar(80) not null,
    relationship varchar(20) not null,
    notes text,
    constraint sector_mapping_kbli_ck check (kbli_2020_code ~ '^[a-u](_[a-u])*$'),
    constraint sector_mapping_relationship_ck check (relationship in ('contains', 'equals')),
    constraint sector_mapping_jejak_sector_ck check (jejak_sector_id ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
create unique index sector_mapping_key_uq on public.sector_mapping(kbli_2020_code, jejak_sector_id);

create table public.geospatial_sources (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    dataset_code varchar(100) not null unique,
    layer varchar(80) not null,
    dataset_name text not null,
    provider text not null,
    release text,
    reference_period text,
    spatial_resolution text,
    crs varchar(40),
    file_format varchar(30),
    file_name text,
    coverage text,
    license text,
    source_url text,
    retrieved_at date,
    limitations text,
    constraint geospatial_sources_url_ck check (source_url is null or source_url ~ '^https://')
);

create table public.estimation_parameters (
    id bigint generated always as identity (maxvalue 9007199254740991) primary key,
    parameter varchar(80) not null,
    value_low numeric not null,
    value_high numeric not null,
    unit varchar(40) not null,
    applies_to text not null,
    region_code varchar(64) references public.regions(region_code) on delete restrict,
    period_end date,
    source_name varchar(100) not null,
    source_url text,
    published_at date,
    limitations text,
    is_sample boolean not null default false,
    constraint estimation_parameters_range_ck check (value_low <= value_high),
    constraint estimation_parameters_url_ck check (source_url is null or source_url ~ '^https://')
);
create index estimation_parameters_lookup_idx on public.estimation_parameters(parameter, region_code, period_end desc);
create index estimation_parameters_region_code_idx on public.estimation_parameters(region_code);

-- Denormalized research rows flatten to a read-only metric view for the existing
-- map API. The research tables remain the write/import contract.
create function private.sheet_numeric_metrics(p_row jsonb, p_excluded text[])
returns table(metric text, numeric_value numeric)
language sql immutable set search_path = ''
as $$
    select item.key, item.value::numeric
    from pg_catalog.jsonb_each_text(p_row - p_excluded) as item(key, value)
    where pg_catalog.jsonb_typeof(p_row -> item.key) = 'number'
$$;

-- Units are derived from the stable research column name; workbook values stay numeric.
create function private.metric_unit(p_metric text)
returns text language sql immutable set search_path = ''
as $$
    select case
        when pg_catalog.split_part(p_metric, ':', 1) like '%_idr' then 'IDR'
        when pg_catalog.split_part(p_metric, ':', 1) like '%_rate'
          or pg_catalog.split_part(p_metric, ':', 1) like '%_percentage' then 'share'
        when pg_catalog.split_part(p_metric, ':', 1) = 'population_density' then 'people/km2'
        when pg_catalog.split_part(p_metric, ':', 1) = 'road_length_km' then 'km'
        when pg_catalog.split_part(p_metric, ':', 1) in ('consumer_price_index', 'housing_price_index') then 'index'
        else 'count'
    end
$$;

create view private.static_region_facts as
select r.id as region_id, r.region_code, f.metric::varchar(80) as metric,
       f.numeric_value, private.metric_unit(f.metric) as unit,
       p.evidence_type::varchar(20) as evidence_type, p.period_start, p.period_end,
       p.source_name::varchar(100) as source, p.source_url,
       p.published_at::timestamptz as published_at, p.retrieved_at::timestamptz as retrieved_at,
       null::integer as sample_size, p.confidence::numeric(5,4) as confidence,
       p.limitations, p.is_sample, p.id as row_id
from public.population p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       p.published_at::timestamptz, p.retrieved_at::timestamptz, p.sample_size::integer,
       p.confidence, p.limitations, p.is_sample, p.id
from public.labor_force p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, (f.metric || ':kbli_' || p.kbli_2020_code)::varchar(80), f.numeric_value,
       private.metric_unit(f.metric), p.evidence_type, p.period_start, p.period_end,
       p.source_name, p.source_url, p.published_at::timestamptz, p.retrieved_at::timestamptz,
       p.sample_size::integer, p.confidence, p.limitations, p.is_sample, p.id
from public.sector_employment p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','kbli_2020_code','kbli_2020_name','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       p.published_at::timestamptz, p.retrieved_at::timestamptz, p.sample_size::integer,
       p.confidence, p.limitations, p.is_sample, p.id
from public.wages_income p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       null::timestamptz, p.retrieved_at::timestamptz, null::integer,
       p.confidence, p.limitations, p.is_sample, p.id
from public.education_facilities p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       null::timestamptz, p.retrieved_at::timestamptz, null::integer,
       p.confidence, p.limitations, p.is_sample, p.id
from public.healthcare_facilities p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       null::timestamptz, p.retrieved_at::timestamptz, null::integer,
       p.confidence, p.limitations, p.is_sample, p.id
from public.transport_infrastructure p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code,
       (f.metric || case when p.housing_type = 'kos' then '' else ':' || pg_catalog.regexp_replace(pg_catalog.lower(p.housing_type), '[^a-z0-9]+', '_', 'g') end)::varchar(80),
       f.numeric_value, private.metric_unit(f.metric), p.evidence_type, p.period_start,
       p.period_end, p.source_name, p.source_url, p.published_at::timestamptz,
       p.retrieved_at::timestamptz, p.observation_count::integer, p.confidence,
       p.limitations, p.is_sample, p.id
from public.housing_statistics p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','housing_type','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','confidence','limitations','is_sample']) f
union all
select r.id, r.region_code, f.metric::varchar(80), f.numeric_value, private.metric_unit(f.metric),
       p.evidence_type, p.period_start, p.period_end, p.source_name, p.source_url,
       p.published_at::timestamptz, p.retrieved_at::timestamptz, p.sample_size::integer,
       p.confidence, p.limitations, p.is_sample, p.id
from public.cost_of_living p join public.regions r using(region_code)
cross join lateral private.sheet_numeric_metrics(to_jsonb(p), array['id','region_code','period_start','period_end','source_name','source_url','published_at','retrieved_at','evidence_type','sample_size','confidence','limitations','is_sample']) f;

create function private.metric_dimension_key(p_metric text)
returns text language sql immutable set search_path = ''
as $$
    select case
        when p_metric like '%:kbli_%' then 'kbli_2020_code'
        when p_metric in ('median_monthly_rent_idr', 'average_monthly_rent_idr',
                          'minimum_monthly_rent_idr', 'maximum_monthly_rent_idr',
                          'observation_count', 'housing_price_index')
          or p_metric like 'median_monthly_rent_idr:%'
          or p_metric like 'average_monthly_rent_idr:%'
          or p_metric like 'minimum_monthly_rent_idr:%'
          or p_metric like 'maximum_monthly_rent_idr:%'
          or p_metric like 'observation_count:%'
          or p_metric like 'housing_price_index:%' then 'housing_type'
        else null
    end
$$;

create function private.metric_dimension_value(p_metric text)
returns text language sql immutable set search_path = ''
as $$
    select case
        when p_metric like '%:kbli_%' then pg_catalog.replace(pg_catalog.split_part(p_metric, ':', 2), 'kbli_', '')
        when private.metric_dimension_key(p_metric) = 'housing_type'
             then coalesce(nullif(pg_catalog.split_part(p_metric, ':', 2), ''), 'kos')
        else null
    end
$$;

-- Replace existing RPC bodies while retaining their public JSON field names.
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
           pg_catalog.round(stats.wage / nullif(stats.rent, 0), 2)
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
    where (p_parent_code is null or parent.region_code = p_parent_code)
      and r.region_type = 'district'
      and ((r.is_supported and not r.is_sample) or (p_include_sample and r.is_sample))
    order by stats.wage / nullif(stats.rent, 0) desc nulls last,
             stats.population desc nulls last, r.region_name, r.region_code;
$function$;

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
                   'source', d.source, 'source_url', d.source_url,
                    'period_start', d.period_start, 'period_end', d.period_end,
                    'confidence', d.confidence, 'evidence_type', d.evidence_type,
                    'limitations', d.limitations, 'is_sample', d.is_sample,
                    'dimension_key', private.metric_dimension_key(d.metric),
                    'dimension_value', private.metric_dimension_value(d.metric)
               ) order by d.metric)
               from (
                   select distinct on (f.metric) f.*
                   from (
                       select d.metric, d.numeric_value, d.unit, d.source, d.source_url,
                              d.period_start, d.period_end, d.confidence, d.evidence_type,
                              d.limitations, d.is_sample, d.retrieved_at, d.id
                       from public.region_data d
                       where d.region_id = r.id and d.numeric_value is not null
                       union all
                       select d.metric, d.numeric_value, d.unit, d.source, d.source_url,
                              d.period_start, d.period_end, d.confidence, d.evidence_type,
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
                'source', d.source, 'sample_size', d.sample_size,
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
                   d.period_end, d.source, d.sample_size, d.confidence, d.limitations,
                   d.is_sample, d.published_at, d.retrieved_at, d.id
            from public.region_data d
            where d.region_id = r.id and d.metric = p_metric and not d.is_sample
            union all
            select d.metric, d.numeric_value, d.unit, d.evidence_type, d.period_start,
                   d.period_end, d.source, d.sample_size, d.confidence, d.limitations,
                   d.is_sample, d.published_at, d.retrieved_at, d.row_id
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
    period_start date, period_end date, source varchar(100), source_url text,
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
               f.unit, f.evidence_type, f.period_start, f.period_end, f.source, f.source_url,
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
    phone varchar(40), operator text, source varchar(100), observed_at timestamptz,
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
    source varchar(100), source_url text, published_at timestamptz, retrieved_at timestamptz,
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

-- All workbook tables remain private; read access is through the reviewed RPCs.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'campuses', 'public_places', 'population', 'labor_force', 'sector_employment',
        'wages_income', 'student_enrollment', 'education_facilities',
        'healthcare_facilities', 'transport_infrastructure', 'housing_statistics',
        'cost_of_living', 'sector_mapping', 'geospatial_sources', 'estimation_parameters'
    ] loop
        execute pg_catalog.format('alter table public.%I enable row level security', table_name);
        execute pg_catalog.format('revoke all on table public.%I from public, anon, authenticated', table_name);
        execute pg_catalog.format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    end loop;
    grant usage, select on all sequences in schema public to service_role;
end;
$$;

revoke all on function public.get_region_data(integer, varchar) from public, anon, authenticated;
revoke all on function public.get_public_places(integer, varchar) from public, anon, authenticated;
revoke all on function public.get_institution_data(integer, bigint) from public, anon, authenticated;
grant execute on function public.get_region_data(integer, varchar) to anon, authenticated, service_role;
grant execute on function public.get_public_places(integer, varchar) to anon, authenticated, service_role;
grant execute on function public.get_institution_data(integer, bigint) to anon, authenticated, service_role;
grant execute on function private.check_sheet_provenance(varchar, date, date, bigint, numeric, text) to service_role;

commit;
