-- Housing observations + deterministic zone averages
--
-- Average kos/apartment rent for a zone is a deterministic aggregate over stored
-- observations, NOT an LLM output (spec section 6.5; the model must never invent a
-- statistic). LF-04 may cite an average as a grounded numeric_claim, but this SQL
-- computes it. Zone membership is by geometry: a bounding box now, a PostGIS polygon
-- once admin boundaries are loaded.
--
-- Ownership: backend / service role, like the evidence cache. RLS on, no policies.

create extension if not exists pgcrypto;

create table if not exists public.housing_observations (
    id               uuid primary key default gen_random_uuid(),
    zone_id          text,                       -- assigned after geocoding; may be null for raw observations
    housing_type     text not null,              -- 'kos' | 'apartment' | 'house' | ...
    monthly_rent_idr numeric not null check (monthly_rent_idr >= 0),
    latitude         double precision,
    longitude        double precision,
    raw_address      text,
    source_url       text,
    observed_at      date,
    is_sample        boolean not null default false,  -- true = seeded test data, not a real observation
    created_at       timestamptz not null default now()
);

create index if not exists housing_observations_geo
    on public.housing_observations (longitude, latitude);
create index if not exists housing_observations_zone
    on public.housing_observations (zone_id);

-- Average / min / max monthly rent per housing_type inside a bounding box [W,S,E,N].
-- Replace the box test with ST_Contains(zone_polygon, point) once PostGIS polygons exist.
create or replace function public.zone_housing_averages(
    p_west double precision, p_south double precision,
    p_east double precision, p_north double precision
)
returns table (
    housing_type text,
    observations bigint,
    avg_rent_idr numeric,
    min_rent_idr numeric,
    max_rent_idr numeric
) language sql stable as $$
    select housing_type,
           count(*)                       as observations,
           round(avg(monthly_rent_idr))   as avg_rent_idr,
           min(monthly_rent_idr)          as min_rent_idr,
           max(monthly_rent_idr)          as max_rent_idr
    from public.housing_observations
    where longitude between p_west and p_east
      and latitude  between p_south and p_north
    group by housing_type
    order by housing_type;
$$;

-- Sample data for Pancoran (bounding box [106.82, -6.27, 106.86, -6.22]).
-- is_sample = true: illustrative rents for testing the aggregation, NOT real listings.
insert into public.housing_observations
    (housing_type, monthly_rent_idr, latitude, longitude, raw_address, observed_at, is_sample) values
    ('kos',        1500000, -6.245, 106.845, 'Kos Pancoran Barat',        '2026-09-01', true),
    ('kos',        1800000, -6.242, 106.843, 'Kos Pengadegan',            '2026-09-01', true),
    ('kos',        1200000, -6.248, 106.851, 'Kos Kalibata (Pancoran)',   '2026-09-01', true),
    ('kos',        2000000, -6.238, 106.842, 'Kos Duren Tiga',            '2026-09-01', true),
    ('apartment',  4500000, -6.246, 106.848, 'Apartemen Kalibata City 1BR','2026-09-01', true),
    ('apartment',  3800000, -6.244, 106.847, 'Apartemen Kalibata City studio','2026-09-01', true),
    ('apartment',  6000000, -6.240, 106.844, 'Apartemen Pancoran 2BR',    '2026-09-01', true),
    -- outside the Pancoran box, should be EXCLUDED by the filter:
    ('kos',        1600000, -6.290, 106.800, 'Kos Cilandak (out of zone)','2026-09-01', true),
    ('apartment',  5000000, -6.210, 106.830, 'Apartemen Setiabudi (out of zone)','2026-09-01', true);

alter table public.housing_observations enable row level security;
-- No policies: backend service role only; the browser reads through the Next.js route.

-- Test query (Pancoran):
--   select * from public.zone_housing_averages(106.82, -6.27, 106.86, -6.22);
-- Expected from the sample data:
--   apartment | 3 | 4766667 | 3800000 | 6000000
--   kos       | 4 | 1625000 | 1200000 | 2000000
-- (the two 'out of zone' rows are excluded)
