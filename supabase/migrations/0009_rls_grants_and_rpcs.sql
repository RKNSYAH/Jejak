-- Jejak access control and narrow read RPCs.
--
-- Browser roles never read the active tables directly. Public map responses use
-- only the hardened SECURITY DEFINER functions below; backend writes use the
-- service role and the backend-only functions from 0007/0008.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create or replace function public.get_region_snapshot(
    p_region_id integer,
    p_snapshot_type varchar default null,
    p_scope_hash text default null
)
returns table (
    region_id           integer,
    region_code         varchar(64),
    region_name         varchar(160),
    snapshot_id         bigint,
    snapshot_type       varchar(40),
    scope_key           varchar(200),
    scope_hash          char(64),
    snapshot             jsonb,
    evidence_count      smallint,
    contributor_count   smallint,
    coverage            varchar(20),
    confidence          numeric(5,4),
    generated_at        timestamptz,
    refresh_after       timestamptz,
    expires_at          timestamptz,
    is_stale            boolean,
    is_expired          boolean,
    status              varchar(20)
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        r.id,
        r.code,
        r.name,
        s.id,
        s.snapshot_type,
        s.scope_key,
        s.scope_hash,
        s.snapshot,
        s.evidence_count,
        s.contributor_count,
        s.coverage,
        s.confidence,
        s.generated_at,
        s.refresh_after,
        s.expires_at,
        s.refresh_after is null or s.refresh_after <= pg_catalog.now()
            or coalesce(s.expires_at <= pg_catalog.now(), false),
        coalesce(s.expires_at <= pg_catalog.now(), false),
        s.status
    from public.regions as r
    join public.region_snapshots as s
      on s.region_id = r.id
     and s.is_current = true
     and s.status = 'accepted'
    where r.id = p_region_id
      and (p_snapshot_type is null or s.snapshot_type = p_snapshot_type)
      and (p_scope_hash is null or s.scope_hash = p_scope_hash::char(64))
    order by s.generated_at desc;
$$;

create or replace function public.get_region_data(
    p_region_id integer,
    p_metric varchar default null
)
returns table (
    id                  bigint,
    region_id           integer,
    metric              varchar(80),
    numeric_value       numeric,
    text_value          text,
    "json_value"        jsonb,
    unit                varchar(30),
    evidence_type       varchar(20),
    period_start        date,
    period_end          date,
    source              varchar(100),
    source_url          text,
    published_at        timestamptz,
    retrieved_at        timestamptz,
    sample_size         integer,
    confidence          numeric(5,4),
    limitations         text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        d.id, d.region_id, d.metric, d.numeric_value, d.text_value,
        d.json_value, d.unit, d.evidence_type, d.period_start, d.period_end,
        d.source, d.source_url, d.published_at, d.retrieved_at,
        d.sample_size, d.confidence, d.limitations
    from public.region_data as d
    where d.region_id = p_region_id
      and d.is_sample = false
      and (p_metric is null or d.metric = p_metric)
    order by d.metric, d.period_end desc nulls last, d.retrieved_at desc nulls last;
$$;

create or replace function public.get_public_places(
    p_region_id integer,
    p_category varchar default null
)
returns table (
    id                  bigint,
    region_id           integer,
    institution_id      integer,
    name                text,
    category            varchar(30),
    latitude            double precision,
    longitude           double precision,
    address             text,
    website             text,
    phone               varchar(40),
    operator            text,
    source              varchar(50),
    observed_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id, p.region_id, p.institution_id, p.name, p.category,
        p.latitude, p.longitude, p.address, p.website, p.phone,
        p.operator, p.source, p.observed_at
    from public.places as p
    where p.region_id = p_region_id
      and p.is_active = true
      and (p_category is null or p.category = p_category)
    order by p.category, p.name;
$$;

create or replace function public.get_institution_data(
    p_institution_id integer default null,
    p_campus_place_id bigint default null
)
returns table (
    institution_id      integer,
    institution_code    varchar(80),
    institution_name    varchar(240),
    institution_type    varchar(30),
    website             text,
    campus_place_id     bigint,
    metric              varchar(80),
    numeric_value       numeric,
    text_value          text,
    "json_value"        jsonb,
    unit                varchar(30),
    data_scope          varchar(20),
    academic_year       varchar(20),
    period_start        date,
    period_end          date,
    source              varchar(100),
    source_url          text,
    published_at        timestamptz,
    retrieved_at        timestamptz,
    evidence_type       varchar(20),
    confidence          numeric(5,4),
    limitations         text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        i.id, i.code, i.name, i.institution_type, i.website,
        d.campus_place_id, d.metric, d.numeric_value, d.text_value,
        d.json_value, d.unit, d.data_scope, d.academic_year,
        d.period_start, d.period_end, d.source, d.source_url,
        d.published_at, d.retrieved_at, d.evidence_type,
        d.confidence, d.limitations
    from public.institution_data as d
    join public.institutions as i on i.id = d.institution_id
    where d.is_sample = false
      and (p_institution_id is null or d.institution_id = p_institution_id)
      and (p_campus_place_id is null or d.campus_place_id = p_campus_place_id)
    order by i.name, d.metric, d.academic_year desc nulls last, d.period_end desc nulls last;
$$;

-- All active tables and the two old prototype tables are backend/RPC-only.
do $$
declare
    table_name text;
    role_name text;
    backend_tables text[] := array[
        'regions', 'places', 'region_data', 'institutions', 'institution_data',
        'evidence_cache_policies', 'zone_evidence_cache', 'enrichment_runs',
        'region_snapshots', 'relocation_profiles', 'recommendation_runs',
        'shortlist_items', 'zone_stats', 'housing_observations'
    ];
begin
    foreach table_name in array backend_tables loop
        execute pg_catalog.format(
            'alter table public.%I enable row level security', table_name
        );
        execute pg_catalog.format(
            'revoke all on table public.%I from public', table_name
        );

        foreach role_name in array array['anon', 'authenticated'] loop
            if exists (
                select 1 from pg_catalog.pg_roles where rolname = role_name
            ) then
                execute pg_catalog.format(
                    'revoke all on table public.%I from %I', table_name, role_name
                );
            end if;
        end loop;

        if exists (
            select 1 from pg_catalog.pg_roles where rolname = 'service_role'
        ) then
            execute pg_catalog.format(
                'grant select, insert, update, delete on table public.%I to service_role',
                table_name
            );
        end if;
    end loop;

    if exists (
        select 1 from pg_catalog.pg_roles where rolname = 'service_role'
    ) then
        grant usage, select on all sequences in schema public to service_role;
    end if;

    if exists (
        select 1 from pg_catalog.pg_roles where rolname = 'jejak_readonly'
    ) then
        execute 'revoke all on table public.zone_evidence_cache, public.zone_stats, public.housing_observations from jejak_readonly';
    end if;
end;
$$;

-- User-owned reads. Profile and recommendation writes stay behind the backend
-- so confirmation and deterministic scoring cannot be bypassed by a client.
do $$
begin
    if exists (
        select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
    ) then
        grant select on table public.relocation_profiles to authenticated;
        grant select on table public.recommendation_runs to authenticated;
        grant select, insert, update, delete on table public.shortlist_items to authenticated;
        grant usage on sequence public.shortlist_items_id_seq to authenticated;
    end if;
end;
$$;

create policy relocation_profiles_owner_read
    on public.relocation_profiles for select to authenticated
    using ((select auth.uid()) = user_id);

create policy recommendation_runs_owner_read
    on public.recommendation_runs for select to authenticated
    using ((select auth.uid()) = user_id);

create policy shortlist_items_owner
    on public.shortlist_items for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
-- The composite foreign key also enforces recommendation ownership, including
-- backend writes, so the policy needs no repeated cross-table subqueries.

-- Function privileges are explicit. RLS does not protect function bodies, so
-- every SECURITY DEFINER function is either backend-only or a narrow public read.
revoke all on function public.check_and_claim_zone_enrichment(integer, varchar, varchar, text) from public, anon, authenticated;
revoke all on function public.get_zone_evidence(integer, varchar, text, integer) from public, anon, authenticated;
revoke all on function public.upsert_zone_evidence(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.complete_enrichment_run(bigint, varchar, jsonb, text) from public, anon, authenticated;
revoke all on function public.zone_evidence_gc() from public, anon, authenticated;
revoke all on function public.publish_region_snapshot(bigint) from public, anon, authenticated;
revoke all on function public.calculate_relocation_fit(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- Retire old browser-facing/prototype RPCs and old cache signatures. They remain
-- in the database only as compatibility objects for a controlled cleanup later.
revoke all on function public.get_zone_data(text) from public;
revoke all on function public.zone_evidence_live_count(text) from public;
revoke all on function public.zone_evidence_live(text, integer) from public;
revoke all on function public.zone_evidence_upsert(jsonb, integer) from public;
revoke all on function public.zone_housing_averages(double precision, double precision, double precision, double precision) from public;

revoke all on function public.get_region_snapshot(integer, varchar, text) from public;
revoke all on function public.get_region_data(integer, varchar) from public;
revoke all on function public.get_public_places(integer, varchar) from public;
revoke all on function public.get_institution_data(integer, bigint) from public;

do $$
declare
    role_name text;
begin
    foreach role_name in array array['anon', 'authenticated', 'jejak_readonly'] loop
        if exists (
            select 1 from pg_catalog.pg_roles where rolname = role_name
        ) then
            execute pg_catalog.format(
                'revoke all on function public.get_zone_data(text) from %I', role_name
            );
            execute pg_catalog.format(
                'revoke all on function public.zone_evidence_live_count(text) from %I', role_name
            );
            execute pg_catalog.format(
                'revoke all on function public.zone_evidence_live(text, integer) from %I', role_name
            );
            execute pg_catalog.format(
                'revoke all on function public.zone_evidence_upsert(jsonb, integer) from %I', role_name
            );
            execute pg_catalog.format(
                'revoke all on function public.zone_housing_averages(double precision, double precision, double precision, double precision) from %I', role_name
            );
        end if;
    end loop;
end;
$$;

do $$
begin
    revoke all on all functions in schema private from public, anon, authenticated;

    if exists (
        select 1 from pg_catalog.pg_roles where rolname = 'service_role'
    ) then
        grant usage on schema private to service_role;
        grant execute on function public.check_and_claim_zone_enrichment(integer, varchar, varchar, text) to service_role;
        grant execute on function public.get_zone_evidence(integer, varchar, text, integer) to service_role;
        grant execute on function public.upsert_zone_evidence(bigint, jsonb) to service_role;
        grant execute on function public.complete_enrichment_run(bigint, varchar, jsonb, text) to service_role;
        grant execute on function public.zone_evidence_gc() to service_role;
        grant execute on function public.publish_region_snapshot(bigint) to service_role;
        grant execute on function public.calculate_relocation_fit(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;
        grant execute on function public.get_region_snapshot(integer, varchar, text) to service_role;
        grant execute on function public.get_region_data(integer, varchar) to service_role;
        grant execute on function public.get_public_places(integer, varchar) to service_role;
        grant execute on function public.get_institution_data(integer, bigint) to service_role;
        grant execute on all functions in schema private to service_role;
    end if;
end;
$$;

do $$
declare
    role_name text;
begin
    foreach role_name in array array['anon', 'authenticated'] loop
        if exists (
            select 1 from pg_catalog.pg_roles where rolname = role_name
        ) then
            execute pg_catalog.format(
                'grant execute on function public.get_region_snapshot(integer, varchar, text) to %I',
                role_name
            );
            execute pg_catalog.format(
                'grant execute on function public.get_region_data(integer, varchar) to %I',
                role_name
            );
            execute pg_catalog.format(
                'grant execute on function public.get_public_places(integer, varchar) to %I',
                role_name
            );
            execute pg_catalog.format(
                'grant execute on function public.get_institution_data(integer, bigint) to %I',
                role_name
            );
        end if;
    end loop;
end;
$$;

commit;
