-- Zone structured statistics (Layer 1: ingested official/third-party data)
--
-- Populated OFFLINE by the ingestion scripts (BPS / Satu Data Jakarta / Kemendagri /
-- transport / housing datasets), NOT by any flow. LF-01 reads this DB-first via the
-- Langflow SQL Database component (a fixed read-only query / the get_zone_data RPC),
-- and only web-enriches categories that are missing or stale. Averages/counts are
-- deterministic here; the LLM never computes or invents these numbers.

create extension if not exists pgcrypto;

create table if not exists public.zone_stats (
    zone_id                 text primary key,
    zone_name               text,
    city_name               text,
    population              integer,
    working_age_population  integer,
    employment_rate         numeric,   -- 0..1
    unemployment_rate       numeric,   -- 0..1
    median_income           numeric,   -- IDR / month
    average_wage            numeric,   -- IDR / month
    number_of_companies     integer,
    number_of_schools       integer,
    universities            integer,
    public_transport_stops  integer,
    housing_price_index      numeric,
    housing_median_rent     numeric,   -- IDR / month
    facilities_count        integer,
    source                  text,
    updated_at              timestamptz not null default now(),
    is_sample               boolean not null default false  -- true = seeded test data, not a real figure
);

-- Narrow read-only accessor LF-01's SQL Database component calls:
--   select * from public.get_zone_data('pancoran');
create or replace function public.get_zone_data(p_zone_id text)
returns setof public.zone_stats language sql stable as $$
    select * from public.zone_stats where zone_id = p_zone_id;
$$;

-- Sample rows (is_sample = true: illustrative, not real statistics).
insert into public.zone_stats
    (zone_id, zone_name, city_name, population, working_age_population, employment_rate,
     unemployment_rate, median_income, average_wage, number_of_companies, number_of_schools,
     universities, public_transport_stops, housing_price_index, housing_median_rent,
     facilities_count, source, is_sample) values
    ('setiabudi','Setiabudi','Jakarta Selatan', 124000, 92000, 0.72, 0.061, 7200000, 7800000,
     3100, 54, 4, 38, 148.2, 3500000, 210, 'SAMPLE', true),
    ('pancoran','Pancoran','Jakarta Selatan', 96000, 71000, 0.69, 0.068, 6100000, 6600000,
     1400, 41, 1, 22, 121.5, 1900000, 130, 'SAMPLE', true)
on conflict (zone_id) do nothing;

-- Least-privilege grants for the Langflow SQL Database component. Create the login
-- role first with your own password (kept OUT of this migration), e.g. in the Supabase
-- SQL editor / dashboard:
--   create role jejak_readonly login password '<set-a-real-password>';
-- This block grants read-only access only if that role already exists.
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'jejak_readonly') then
        grant usage on schema public to jejak_readonly;
        grant select on public.zone_stats, public.housing_observations, public.zone_evidence_cache to jejak_readonly;
        grant execute on function public.get_zone_data(text) to jejak_readonly;
        grant execute on function public.zone_housing_averages(double precision, double precision, double precision, double precision) to jejak_readonly;
        raise notice 'Granted read-only access to jejak_readonly.';
    else
        raise notice 'Role jejak_readonly not found. Create it (create role jejak_readonly login password ''...'';) then re-run this block.';
    end if;
end $$;

-- Test:
--   select * from public.get_zone_data('setiabudi');
-- returns the Setiabudi row (population 124000, employment_rate 0.72, median_income 7200000,
-- public_transport_stops 38, universities 4, housing_median_rent 3500000, ...).
