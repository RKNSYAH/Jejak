-- Zone evidence cache
--
-- Stores LF-01 enrichment claims per zone with a per-row TTL, so the user-facing
-- path reads prepared evidence from Postgres instead of calling LF-01 + an LLM on
-- every request. This is the ETL-first design the project summary asks for: LF-01
-- is a background enrichment worker that fills this table; requests read it.
--
-- Ownership: the backend (Next.js server route / worker) using the Supabase
-- service role reads and writes this table. The browser must never touch it
-- directly. RLS is enabled with no policies, so only the service role has access.

create extension if not exists pgcrypto;  -- gen_random_uuid (no-op on PG >= 13 cores that already have it)

create table if not exists public.zone_evidence_cache (
    id                    uuid primary key default gen_random_uuid(),

    -- dedup identity (mirrors the LF-01 merge validator's (canonical_url, claim_type, normalized_value) key, scoped per zone)
    zone_id               text        not null,
    -- Open text intentionally: LF-01 may add a separately validated claim such as
    -- kos_rent_summary without changing the backend cache table.
    claim_type            text        not null,
    canonical_url         text        not null,
    normalized_value      jsonb       not null,   -- claim value is a dict OR a string; jsonb holds both, and its ::text is canonical

    -- claim payload
    raw_name              text        not null,
    raw_text              text,
    raw_address           text,
    precision             text,
    scope                 text,
    extractor_confidence  double precision,

    -- provenance
    source                jsonb,                  -- full source block: publisher, retrieved_at, content_hash, source_type
    model_id              text,                   -- dynamic, from LF-01 _runtime_usage.model_id (the model that actually ran)
    run_id                text,
    retrieved_at          timestamptz,

    -- lifecycle
    created_at            timestamptz not null default now(),
    expires_at            timestamptz not null default (now() + interval '7 days'),

    -- stable dedup key; jsonb::text sorts keys, so dict order does not matter
    dedup_key text generated always as (
        md5(zone_id || '|' || claim_type || '|' || canonical_url || '|' || normalized_value::text)
    ) stored
);

-- One live-or-dead row per logical claim; upserts refresh it in place.
create unique index if not exists zone_evidence_cache_dedup
    on public.zone_evidence_cache (dedup_key);

-- Read path: "how many / which live claims for zone R".
create index if not exists zone_evidence_cache_zone_live
    on public.zone_evidence_cache (zone_id, expires_at);

-- Cleanup path.
create index if not exists zone_evidence_cache_expires
    on public.zone_evidence_cache (expires_at);


-- Count live (non-expired) claims for a zone. Drives the cache-hit / top-up decision.
create or replace function public.zone_evidence_live_count(p_zone_id text)
returns int language sql stable as $$
    select count(*)::int
    from public.zone_evidence_cache
    where zone_id = p_zone_id and expires_at > now();
$$;

-- Return the strongest live claims for a zone, newest-and-most-confident first.
create or replace function public.zone_evidence_live(p_zone_id text, p_limit int default 25)
returns setof public.zone_evidence_cache language sql stable as $$
    select *
    from public.zone_evidence_cache
    where zone_id = p_zone_id and expires_at > now()
    order by extractor_confidence desc nulls last, created_at desc
    limit p_limit;
$$;

-- Bulk upsert claims for a zone (call after an LF-01 top-up run). Refreshes
-- expires_at and the mutable payload for rows that already exist. p_claims is a
-- JSON array of objects whose keys match the recordset columns below.
-- Returns the number of rows inserted or updated.
create or replace function public.zone_evidence_upsert(p_claims jsonb, p_ttl_days int default 7)
returns int language plpgsql as $$
declare
    n int;
begin
    insert into public.zone_evidence_cache as c (
        zone_id, claim_type, canonical_url, normalized_value,
        raw_name, raw_text, raw_address, precision, scope, extractor_confidence,
        source, model_id, run_id, retrieved_at, expires_at
    )
    select
        x.zone_id, x.claim_type, x.canonical_url, x.normalized_value,
        x.raw_name, x.raw_text, x.raw_address, x.precision, x.scope, x.extractor_confidence,
        x.source, x.model_id, x.run_id, coalesce(x.retrieved_at, now()),
        now() + make_interval(days => p_ttl_days)
    from jsonb_to_recordset(p_claims) as x(
        zone_id text, claim_type text, canonical_url text, normalized_value jsonb,
        raw_name text, raw_text text, raw_address text, precision text, scope text,
        extractor_confidence double precision, source jsonb, model_id text,
        run_id text, retrieved_at timestamptz
    )
    on conflict (dedup_key) do update set
        expires_at           = excluded.expires_at,
        extractor_confidence = excluded.extractor_confidence,
        raw_text             = excluded.raw_text,
        raw_address          = excluded.raw_address,
        precision            = excluded.precision,
        scope                = excluded.scope,
        source               = excluded.source,
        model_id             = excluded.model_id,
        run_id               = excluded.run_id,
        retrieved_at         = excluded.retrieved_at;

    get diagnostics n = row_count;
    return n;
end $$;

-- Delete expired rows. Safe to call anytime; reads already filter on expires_at.
create or replace function public.zone_evidence_gc()
returns int language plpgsql as $$
declare
    n int;
begin
    delete from public.zone_evidence_cache where expires_at <= now();
    get diagnostics n = row_count;
    return n;
end $$;

-- Optional: schedule hourly cleanup. Requires the pg_cron extension (enable it in
-- the Supabase dashboard first), otherwise leave this commented and rely on the
-- read-time expires_at filter plus an occasional manual zone_evidence_gc().
-- select cron.schedule('zone_evidence_gc_hourly', '0 * * * *', $$ select public.zone_evidence_gc(); $$);

-- Backend-only access.
alter table public.zone_evidence_cache enable row level security;
-- No policies are defined on purpose: anon/authenticated clients get nothing, and
-- the service role (used by the Next.js server route) bypasses RLS. The cache is
-- never exposed to the browser directly.
